"""
Video generation pipeline orchestrator.

Panels now route by ``screen_type`` to get a base layer, then every
scene is finalized through one shared Remotion composition driven by:

  - screen_type
  - composition
  - canvas_mode
  - overlay_elements
"""
import json
import os
import subprocess
import time
from pathlib import Path

from .heygen import generate_avatar_video as heygen_generate_avatar_video
from .keyframe_generator import generate_overlay_elements
from .models import PipelineConfig, ScreenType
from .overlay import render_scene_composition
from .parser import parse_storyboard
from .preview import enrich_manifest, write_preview
from .public_upload import upload_file
from .stitcher import stitch_videos
from .stock_video import create_stock_video_panel
from .tts import generate_all_audio


def _probe_audio_duration(audio_path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(Path(audio_path).resolve()),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed for {audio_path}: {result.stderr[-500:]}")
    return float(result.stdout.strip())


def _overlay_text_strings(overlay_elements: list[dict]) -> list[str]:
    text_values: list[str] = []
    for element in overlay_elements:
        for key in ("text", "title", "value"):
            value = element.get(key)
            if isinstance(value, str) and value.strip():
                text_values.append(value.strip())
        for item in element.get("items") or []:
            if isinstance(item, str) and item.strip():
                text_values.append(item.strip())
    return text_values


def _stock_text_overlays(overlay_elements: list[dict]) -> tuple[str | None, str | None]:
    headline = None
    subhead = None
    for element in overlay_elements:
        if headline is None and element.get("kind") in {"headline", "stat", "stat_pill"}:
            headline = element.get("text") or element.get("value") or element.get("title")
        elif subhead is None and element.get("kind") in {"subhead", "label", "badge"}:
            subhead = element.get("text") or element.get("title")
    return headline, subhead


def run_pipeline(config: PipelineConfig) -> str:
    start = time.time()
    print("=== Video Generation Pipeline ===")

    print("\n[1/4] Parsing storyboard...")
    storyboard = parse_storyboard(config.storyboard_path)
    panels = storyboard.panels

    if config.only_panels:
        panels = [panel for panel in panels if panel.panel_number in config.only_panels]
        print(f"  Filtered to panels: {[panel.panel_number for panel in panels]}")

    talking_head_panels = [panel for panel in panels if panel.screen_type == ScreenType.TALKING_HEAD]
    stock_video_panels = [panel for panel in panels if panel.screen_type == ScreenType.STOCK_VIDEO]
    product_demo_panels = [panel for panel in panels if panel.screen_type == ScreenType.PRODUCT_DEMO]
    solid_bg_panels = [panel for panel in panels if panel.screen_type == ScreenType.SOLID_BG]
    print(
        f"  {len(panels)} panels: "
        f"{len(talking_head_panels)} talking head, "
        f"{len(stock_video_panels)} stock video, "
        f"{len(product_demo_panels)} product demo, "
        f"{len(solid_bg_panels)} solid bg"
    )

    if panels and not config.skip_tts:
        print(f"\n[2/4] Generating TTS audio for all {len(panels)} panels...")
        generate_all_audio(panels, config.output_dir, voice=config.voice)
    elif panels:
        print("\n[2/4] Skipping TTS (reusing existing audio)")
        audio_dir = os.path.join(config.output_dir, "audio")
        for panel in panels:
            panel.audio_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")
    else:
        print("\n[2/4] No panels to TTS")

    if config.enable_overlay:
        generated_count = 0
        for panel in panels:
            if panel.overlay_elements or config.skip_overlay_gen:
                continue
            real_duration = _probe_audio_duration(panel.audio_path)
            print(f"  [Panel {panel.panel_number:02d}] Generating overlay elements...")
            panel.overlay_elements = generate_overlay_elements(
                voiceover_script=panel.voiceover_script,
                design_brief=panel.design_brief,
                duration_seconds=real_duration,
                screen_type=panel.screen_type.value,
                composition=panel.composition.value,
            )
            generated_count += 1
            print(f"    → {len(panel.overlay_elements)} overlay elements")
        print(f"  Overlay generation: {generated_count} panels auto-filled")

    print("\n[3/4] Generating video clips...")
    clips_dir = os.path.join(config.output_dir, "clips")
    stock_artifacts_dir = os.path.join(config.output_dir, "stock_video")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(stock_artifacts_dir, exist_ok=True)

    panel_manifests: list[dict] = []

    for panel in panels:
        clip_path = os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")
        real_audio_duration = _probe_audio_duration(panel.audio_path)
        panel.duration_seconds = real_audio_duration

        panel_info: dict = {
            "panel_number": panel.panel_number,
            "screen_type": panel.screen_type.value,
            "composition": panel.composition.value,
            "canvas_mode": panel.canvas_mode.value,
            "voiceover_script": panel.voiceover_script,
            "design_brief": list(panel.design_brief),
            "visual_direction": list(panel.design_brief),
            "voiceover_words": len(panel.voiceover_script.split()),
            "duration": real_audio_duration,
        }

        base_video_path = None
        if panel.screen_type == ScreenType.TALKING_HEAD:
            if config.skip_avatar:
                print(f"  [Panel {panel.panel_number:02d}] Reusing talking-head base clip")
                base_video_path = clip_path
            elif config.talking_head_provider == "seedance":
                from .seedance import generate_seedance_video

                print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → Seedance")
                audio_url = upload_file(panel.audio_path, expiry="12h")
                result = generate_seedance_video(
                    output_path=clip_path,
                    prompt="@Image1 is speaking to camera, medium close-up, direct eye contact, natural head movement",
                    duration=min(15, int(real_audio_duration) + 1),
                    image_path=config.seedance_ref_image,
                    audio_url=audio_url,
                )
                base_video_path = clip_path
                panel_info.update(
                    {
                        "provider": "seedance",
                        "seedance_task_id": result.get("task_id"),
                    }
                )
            else:
                print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → HeyGen")
                audio_url = upload_file(panel.audio_path, expiry="12h")
                result = heygen_generate_avatar_video(
                    output_path=clip_path,
                    audio_url=audio_url,
                    avatar_id=config.heygen_avatar_id,
                    avatar_style=config.heygen_avatar_style,
                )
                base_video_path = clip_path
                panel_info.update(
                    {
                        "provider": "heygen",
                        "heygen_video_id": result.get("video_id"),
                    }
                )

        elif panel.screen_type == ScreenType.STOCK_VIDEO:
            print(f"  [Panel {panel.panel_number:02d}] STOCK VIDEO → Pexels + scene composition")
            title, subtitle = _stock_text_overlays(panel.overlay_elements)
            stock_result = create_stock_video_panel(
                visual_direction=panel.design_brief,
                audio_path=panel.audio_path,
                output_path=clip_path,
                target_duration=real_audio_duration,
                title=title,
                subtitle=subtitle,
            )
            meta_path = os.path.join(stock_artifacts_dir, f"panel_{panel.panel_number:02d}.json")
            Path(meta_path).write_text(json.dumps(stock_result, indent=2))
            base_video_path = clip_path
            panel_info.update(
                {
                    "pexels_query": stock_result["query"],
                    "pexels_video_id": stock_result["pexels_video_id"],
                    "pexels_page_url": stock_result["pexels_page_url"],
                    "pexels_variant_size": stock_result["variant_size"],
                }
            )

        elif panel.screen_type in {ScreenType.PRODUCT_DEMO, ScreenType.SOLID_BG}:
            print(f"  [Panel {panel.panel_number:02d}] {panel.screen_type.value.upper()} → scene composition")
            base_video_path = panel.base_media_path
        else:
            raise ValueError(f"Unknown screen_type for panel {panel.panel_number}: {panel.screen_type!r}")

        render_scene_composition(
            screen_type=panel.screen_type.value,
            composition=panel.composition.value,
            canvas_mode=panel.canvas_mode.value,
            overlay_elements=panel.overlay_elements,
            duration_seconds=real_audio_duration,
            output_path=clip_path,
            base_video_path=base_video_path,
            audio_path=panel.audio_path,
        )
        panel.clip_path = clip_path
        panel_info["overlay_elements"] = panel.overlay_elements
        panel_info["overlay_count"] = len(panel.overlay_elements)
        panel_info["on_screen_text"] = _overlay_text_strings(panel.overlay_elements)
        panel_manifests.append(panel_info)

    print("\n[4/4] Stitching final video...")
    ordered_clips = [
        os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")
        for panel in sorted(panels, key=lambda panel: panel.panel_number)
    ]
    final_path = os.path.join(config.output_dir, "final.mp4")
    stitch_videos(ordered_clips, final_path)

    elapsed = time.time() - start
    manifest = {
        "storyboard": config.storyboard_path,
        "panels": len(panels),
        "output": final_path,
        "elapsed_seconds": round(elapsed, 1),
        "config": {
            "voice": config.voice,
            "heygen_avatar_id": config.heygen_avatar_id,
            "heygen_avatar_style": config.heygen_avatar_style,
        },
        "per_panel": panel_manifests,
    }

    enrich_manifest(
        manifest,
        storyboard_title=storyboard.title,
        config_voice=config.voice,
        config_avatar_id=config.heygen_avatar_id,
    )

    manifest_path = os.path.join(config.output_dir, "manifest.json")
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))
    index_path = write_preview(config.output_dir)

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    print(f"Preview UI:  {index_path}")
    return final_path
