import os
import json
import time
from pathlib import Path
from .models import PipelineConfig, Storyboard, ScreenType
from .parser import parse_storyboard
from .tts import generate_all_audio
from .avatar import generate_avatar_video, RunwareAvatarClient
from .slides import map_visual_direction_to_props, render_slide
from .stitcher import stitch_videos


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

    # Filter to specific panels if requested
    if config.only_panels:
        panels = [p for p in panels if p.panel_number in config.only_panels]
        print(f"  Filtered to panels: {[p.panel_number for p in panels]}")

    print(f"  {len(panels)} panels: {len([p for p in panels if p.screen_type == ScreenType.TALKING_HEAD])} talking head, {len([p for p in panels if p.screen_type == ScreenType.SLIDES])} slides")

    # 2. Generate TTS audio for all panels
    if not config.skip_tts:
        print(f"\n[2/4] Generating TTS audio...")
        generate_all_audio(panels, config.output_dir, voice=config.voice)
    else:
        print(f"\n[2/4] Skipping TTS (reusing existing audio)")
        audio_dir = os.path.join(config.output_dir, "audio")
        for panel in panels:
            panel.audio_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")

    # 3. Generate video clips per panel
    print(f"\n[3/4] Generating video clips...")
    clips_dir = os.path.join(config.output_dir, "clips")
    slides_dir = os.path.join(config.output_dir, "slides")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(slides_dir, exist_ok=True)

    for panel in panels:
        clip_path = os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")

        if panel.screen_type == ScreenType.TALKING_HEAD:
            if config.skip_avatar:
                print(f"  [Panel {panel.panel_number:02d}] Skipping avatar (reusing)")
                panel.clip_path = clip_path
                continue

            print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → Kling Avatar")
            # Note: Runware needs URLs, not local files.
            # For v1, the avatar image and audio must be publicly accessible URLs.
            # TODO: Add file upload to Runware or use a temp hosting service.
            generate_avatar_video(
                image_url=config.avatar_image_path,
                audio_url=panel.audio_path,
                output_path=clip_path,
                model=config.kling_model,
            )
            panel.clip_path = clip_path

        elif panel.screen_type == ScreenType.SLIDES:
            print(f"  [Panel {panel.panel_number:02d}] SLIDES → LLM + Remotion")

            # Step 3a: LLM maps visual direction to template + props
            result = map_visual_direction_to_props(panel.visual_direction)
            props_path = os.path.join(slides_dir, f"panel_{panel.panel_number:02d}.json")
            Path(props_path).write_text(json.dumps(result, indent=2))
            print(f"    Template: {result['template']}")

            # Step 3b: Remotion renders the slide
            render_slide(
                template=result["template"],
                props=result["props"],
                audio_path=panel.audio_path,
                output_path=clip_path,
                duration_seconds=panel.duration_seconds,
            )
            panel.clip_path = clip_path

    # 4. Stitch all clips
    print(f"\n[4/4] Stitching final video...")
    ordered_clips = [
        os.path.join(clips_dir, f"panel_{p.panel_number:02d}.mp4")
        for p in sorted(panels, key=lambda p: p.panel_number)
    ]
    final_path = os.path.join(config.output_dir, "final.mp4")
    stitch_videos(ordered_clips, final_path)

    # Write manifest
    elapsed = time.time() - start
    manifest = {
        "storyboard": config.storyboard_path,
        "panels": len(panels),
        "output": final_path,
        "elapsed_seconds": round(elapsed, 1),
        "config": {
            "voice": config.voice,
            "kling_model": config.kling_model,
        },
    }
    manifest_path = os.path.join(config.output_dir, "manifest.json")
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    return final_path
