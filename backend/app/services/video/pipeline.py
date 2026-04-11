"""
Video generation pipeline orchestrator.

Each panel routes to one of three render paths based on ``screen_type``:

  - TALKING_HEAD → HeyGen Photo Avatar, lip-synced to OpenAI TTS audio
                    (audio-driven mode via voice.type=audio + audio_url)
  - SLIDES       → LLM-picked Remotion template + OpenAI TTS overlay
  - STOCK_VIDEO  → Pexels video search + ffmpeg audio overlay with
                    OpenAI TTS

Every panel is narrated with the **same** OpenAI TTS voice (``config.voice``,
default ``alloy``), so the final stitched video has a single consistent
narration voice throughout. An earlier version of this pipeline used
HeyGen's built-in TTS for talking-head panels, which produced a jarring
voice change at every avatar cut; that's fixed here by generating TTS
for ALL panels in step 2 and uploading the talking-head mp3s to
litterbox.catbox.moe so HeyGen can fetch them as a URL.

Cost model at the current HeyGen + Pexels rates:

  - OpenAI TTS tts-1-hd: ~$0.01-0.02 per panel
  - GPT-4o slide template pick: ~$0.01 per slide panel
  - GPT-4o Pexels keyword gen: ~$0.005 per stock_video panel
  - HeyGen audio-driven (Photo Avatar Lisa_public): ~$1 per minute
    of generated video, measured by HeyGen's remaining_quota field
    which is literally in seconds of video budget ($5 top-up = 300s)
  - Pexels video search + download: free (25k req/hour)
  - Remotion render: free
  - ffmpeg normalize + concat: free

For the current 16-panel fixture (3 talking-head at ~28s, 13
slides/stock_video): ~$0.55 total per run.
"""
import os
import json
import subprocess
import time
from pathlib import Path

from .models import PipelineConfig, ScreenType
from .parser import parse_storyboard
from .tts import generate_all_audio
from .heygen import generate_avatar_video as heygen_generate_avatar_video
from .slides import map_visual_direction_to_props, render_slide
from .stitcher import stitch_videos
from .stock_video import create_stock_video_panel
from .public_upload import upload_file


def _probe_audio_duration(audio_path: str) -> float:
    """Return the real playable duration of an audio file in seconds.

    We call ffprobe instead of trusting the fixture's ``duration_seconds``
    because the fixture's value is a planning estimate (word count / 130
    wpm) which is consistently shorter than real OpenAI TTS output — often
    30-50% shorter on long paragraphs. Passing the fixture estimate to
    Remotion as the render duration meant Remotion rendered a clip that
    was too short and cut off the voiceover mid-sentence. Probing the
    real mp3 length fixes that: the rendered clip is exactly as long as
    the audio needs, no more, no less.
    """
    result = subprocess.run(
        [
            "ffprobe",
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=nw=1:nk=1",
            str(Path(audio_path).resolve()),
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"ffprobe failed for {audio_path}: {result.stderr[-500:]}"
        )
    try:
        return float(result.stdout.strip())
    except ValueError as e:
        raise RuntimeError(
            f"ffprobe returned non-numeric duration for {audio_path}: "
            f"{result.stdout!r}"
        ) from e


def run_pipeline(config: PipelineConfig) -> str:
    """Run the full video generation pipeline.

    Args:
        config: Pipeline configuration.

    Returns:
        Path to the final video file.
    """
    start = time.time()
    print(f"=== Video Generation Pipeline ===")

    # 1. Parse storyboard
    print(f"\n[1/4] Parsing storyboard...")
    storyboard = parse_storyboard(config.storyboard_path)
    panels = storyboard.panels

    if config.only_panels:
        panels = [p for p in panels if p.panel_number in config.only_panels]
        print(f"  Filtered to panels: {[p.panel_number for p in panels]}")

    slides_panels = [p for p in panels if p.screen_type == ScreenType.SLIDES]
    talking_head_panels = [p for p in panels if p.screen_type == ScreenType.TALKING_HEAD]
    stock_video_panels = [p for p in panels if p.screen_type == ScreenType.STOCK_VIDEO]
    print(
        f"  {len(panels)} panels: "
        f"{len(talking_head_panels)} talking head, "
        f"{len(slides_panels)} slides, "
        f"{len(stock_video_panels)} stock video"
    )

    # 2. Generate TTS audio for ALL panels. We no longer skip talking-head
    # panels (the earlier version did, because HeyGen had its own TTS) —
    # now every panel is narrated with the same OpenAI voice so the final
    # video has a consistent voice across all three render paths. The
    # talking-head mp3s get uploaded to litterbox in step 3 so HeyGen can
    # fetch them as URLs.
    if panels and not config.skip_tts:
        print(f"\n[2/4] Generating TTS audio for all {len(panels)} panels...")
        generate_all_audio(panels, config.output_dir, voice=config.voice)
    elif panels and config.skip_tts:
        print(f"\n[2/4] Skipping TTS (reusing existing audio)")
        audio_dir = os.path.join(config.output_dir, "audio")
        for panel in panels:
            panel.audio_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")
    else:
        print(f"\n[2/4] No panels to TTS")

    # 3. Generate video clips per panel
    print(f"\n[3/4] Generating video clips...")
    clips_dir = os.path.join(config.output_dir, "clips")
    slides_artifacts_dir = os.path.join(config.output_dir, "slides")
    stock_artifacts_dir = os.path.join(config.output_dir, "stock_video")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(slides_artifacts_dir, exist_ok=True)
    os.makedirs(stock_artifacts_dir, exist_ok=True)

    # Manifest collects per-panel metadata as we go (HeyGen video IDs,
    # Pexels video IDs, chosen templates, probed durations) so the final
    # JSON is a useful audit trail of what actually happened.
    panel_manifests: list[dict] = []

    for panel in panels:
        clip_path = os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")
        panel_info: dict = {
            "panel_number": panel.panel_number,
            "screen_type": panel.screen_type.value,
            "voiceover_words": len(panel.voiceover_script.split()),
        }

        if panel.screen_type == ScreenType.TALKING_HEAD:
            if config.skip_avatar:
                print(f"  [Panel {panel.panel_number:02d}] Skipping avatar (reusing)")
                panel.clip_path = clip_path
                panel_info["skipped"] = True
                panel_manifests.append(panel_info)
                continue

            print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → HeyGen ({config.heygen_avatar_id})")
            # Step 3a: upload the TTS audio to litterbox so HeyGen can
            # fetch it via audio_url. This is the voice-unification
            # mechanism — HeyGen lip-syncs the avatar to OUR alloy audio
            # instead of generating its own voice.
            print(f"    uploading audio to public host for HeyGen fetch...")
            audio_url = upload_file(panel.audio_path, expiry="12h")
            print(f"    audio URL: {audio_url}")

            result = heygen_generate_avatar_video(
                output_path=clip_path,
                audio_url=audio_url,
                avatar_id=config.heygen_avatar_id,
                avatar_style=config.heygen_avatar_style,
            )
            panel.clip_path = clip_path
            if result.get("duration"):
                panel.duration_seconds = float(result["duration"])
            panel_info.update({
                "heygen_video_id": result.get("video_id"),
                "heygen_audio_url": audio_url,
                "duration": result.get("duration"),
            })

        elif panel.screen_type == ScreenType.SLIDES:
            print(f"  [Panel {panel.panel_number:02d}] SLIDES → LLM + Remotion")

            # Step 3a: LLM maps visual direction to template + props
            slide_plan = map_visual_direction_to_props(panel.visual_direction)
            props_path = os.path.join(
                slides_artifacts_dir, f"panel_{panel.panel_number:02d}.json"
            )
            Path(props_path).write_text(json.dumps(slide_plan, indent=2))
            print(f"    Template: {slide_plan['template']}")

            # Step 3b: probe the REAL audio length and use it as the clip
            # duration. Using panel.duration_seconds (the fixture planning
            # estimate) causes Remotion to cut clips short because real
            # OpenAI TTS runs noticeably slower than the 130wpm estimate
            # for most content — up to 50% longer on long paragraphs.
            real_audio_duration = _probe_audio_duration(panel.audio_path)
            if abs(real_audio_duration - panel.duration_seconds) > 0.1:
                print(
                    f"    Audio duration: {real_audio_duration:.2f}s "
                    f"(fixture estimate was {panel.duration_seconds}s)"
                )
            panel.duration_seconds = real_audio_duration

            # Step 3c: Remotion renders the slide with the panel's TTS audio
            render_slide(
                template=slide_plan["template"],
                props=slide_plan["props"],
                audio_path=panel.audio_path,
                output_path=clip_path,
                duration_seconds=real_audio_duration,
            )
            panel.clip_path = clip_path
            panel_info.update({
                "template": slide_plan["template"],
                "duration": real_audio_duration,
            })

        elif panel.screen_type == ScreenType.STOCK_VIDEO:
            print(f"  [Panel {panel.panel_number:02d}] STOCK VIDEO → Pexels + ffmpeg overlay")

            # Step 3a: probe the real audio length (same reasoning as slides)
            real_audio_duration = _probe_audio_duration(panel.audio_path)
            if abs(real_audio_duration - panel.duration_seconds) > 0.1:
                print(
                    f"    Audio duration: {real_audio_duration:.2f}s "
                    f"(fixture estimate was {panel.duration_seconds}s)"
                )
            panel.duration_seconds = real_audio_duration

            # Step 3b: keyword → Pexels search → download → audio overlay
            stock_result = create_stock_video_panel(
                visual_direction=panel.visual_direction,
                audio_path=panel.audio_path,
                output_path=clip_path,
                target_duration=real_audio_duration,
            )
            # Dump the search metadata next to the clip for auditability
            meta_path = os.path.join(
                stock_artifacts_dir, f"panel_{panel.panel_number:02d}.json"
            )
            Path(meta_path).write_text(json.dumps(stock_result, indent=2))
            panel.clip_path = clip_path
            panel_info.update({
                "pexels_query": stock_result["query"],
                "pexels_video_id": stock_result["pexels_video_id"],
                "pexels_page_url": stock_result["pexels_page_url"],
                "pexels_variant_size": stock_result["variant_size"],
                "duration": real_audio_duration,
            })

        else:
            raise ValueError(
                f"Unknown screen_type for panel {panel.panel_number}: "
                f"{panel.screen_type!r}"
            )

        panel_manifests.append(panel_info)

    # 4. Stitch all clips
    print(f"\n[4/4] Stitching final video...")
    ordered_clips = [
        os.path.join(clips_dir, f"panel_{p.panel_number:02d}.mp4")
        for p in sorted(panels, key=lambda p: p.panel_number)
    ]
    final_path = os.path.join(config.output_dir, "final.mp4")
    stitch_videos(ordered_clips, final_path)

    # Manifest
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
    manifest_path = os.path.join(config.output_dir, "manifest.json")
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    return final_path
