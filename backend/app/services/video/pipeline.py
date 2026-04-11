"""
Video generation pipeline orchestrator.

Talking-head panels are rendered via HeyGen's Photo Avatar API (see
heygen.py). HeyGen does TTS internally using voice_id, so we do NOT
run OpenAI TTS for talking-head panels — that would be wasted cost and
introduces a voice-consistency problem we aren't ready to solve yet.
Slides panels still use OpenAI TTS + Remotion as before.

Replaces the earlier Runware/Kling implementation. Kling Avatar 2.0 at
~$0.044/sec put a 5-min video at ~$5 — about 3x over our $1.50/5min
target. HeyGen Photo Avatar at ~$0.50/min Scale tier brings the talking
-head portion to ~$0.23 for the trimmed 28s of talking head in the
current fixture.

Known caveat to revisit later: slides use OpenAI alloy voice and
talking-head uses HeyGen's voice, so there's a voice change mid-video.
Acceptable for smoke tests, needs a solution before real production
(either match voices or switch slides to HeyGen TTS as well, or
upload the alloy audio to HeyGen as a custom audio asset).
"""
import os
import json
import time
from pathlib import Path

from .models import PipelineConfig, ScreenType
from .parser import parse_storyboard
from .tts import generate_all_audio
from .heygen import generate_avatar_video as heygen_generate_avatar_video
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

    if config.only_panels:
        panels = [p for p in panels if p.panel_number in config.only_panels]
        print(f"  Filtered to panels: {[p.panel_number for p in panels]}")

    slides_panels = [p for p in panels if p.screen_type == ScreenType.SLIDES]
    talking_head_panels = [p for p in panels if p.screen_type == ScreenType.TALKING_HEAD]
    print(
        f"  {len(panels)} panels: "
        f"{len(talking_head_panels)} talking head, {len(slides_panels)} slides"
    )

    # 2. Generate TTS audio for SLIDES ONLY. Talking-head panels use
    # HeyGen's built-in TTS (triggered by voice.type=text in the create-
    # video request), so they don't need a local mp3 file.
    if slides_panels and not config.skip_tts:
        print(f"\n[2/4] Generating TTS audio for {len(slides_panels)} slide panels...")
        generate_all_audio(slides_panels, config.output_dir, voice=config.voice)
    elif slides_panels and config.skip_tts:
        print(f"\n[2/4] Skipping TTS (reusing existing audio)")
        audio_dir = os.path.join(config.output_dir, "audio")
        for panel in slides_panels:
            panel.audio_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")
    else:
        print(f"\n[2/4] No slide panels to TTS")

    # 3. Generate video clips per panel
    print(f"\n[3/4] Generating video clips...")
    clips_dir = os.path.join(config.output_dir, "clips")
    slides_artifacts_dir = os.path.join(config.output_dir, "slides")
    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(slides_artifacts_dir, exist_ok=True)

    for panel in panels:
        clip_path = os.path.join(clips_dir, f"panel_{panel.panel_number:02d}.mp4")

        if panel.screen_type == ScreenType.TALKING_HEAD:
            if config.skip_avatar:
                print(f"  [Panel {panel.panel_number:02d}] Skipping avatar (reusing)")
                panel.clip_path = clip_path
                continue

            print(f"  [Panel {panel.panel_number:02d}] TALKING HEAD → HeyGen ({config.heygen_avatar_id})")
            result = heygen_generate_avatar_video(
                input_text=panel.voiceover_script,
                output_path=clip_path,
                avatar_id=config.heygen_avatar_id,
                voice_id=config.heygen_voice_id,
                avatar_style=config.heygen_avatar_style,
            )
            panel.clip_path = clip_path
            # Store the duration HeyGen reports, useful for manifest/debug
            if result.get("duration"):
                panel.duration_seconds = float(result["duration"])

        elif panel.screen_type == ScreenType.SLIDES:
            print(f"  [Panel {panel.panel_number:02d}] SLIDES → LLM + Remotion")

            # Step 3a: LLM maps visual direction to template + props
            slide_plan = map_visual_direction_to_props(panel.visual_direction)
            props_path = os.path.join(
                slides_artifacts_dir, f"panel_{panel.panel_number:02d}.json"
            )
            Path(props_path).write_text(json.dumps(slide_plan, indent=2))
            print(f"    Template: {slide_plan['template']}")

            # Step 3b: Remotion renders the slide with the panel's TTS audio
            render_slide(
                template=slide_plan["template"],
                props=slide_plan["props"],
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
            "heygen_voice_id": config.heygen_voice_id,
            "heygen_avatar_style": config.heygen_avatar_style,
        },
    }
    manifest_path = os.path.join(config.output_dir, "manifest.json")
    Path(manifest_path).write_text(json.dumps(manifest, indent=2))

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    return final_path
