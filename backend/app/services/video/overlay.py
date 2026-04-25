"""
Keyframe overlay rendering via Remotion.

Takes a base video (from any render path — Seedance, Pexels, HeyGen)
and composites timed text/icon overlays on top using the Remotion
KeyframeOverlay composition. The overlay types (stat, callout, quote,
label, divider) are defined in remotion/src/components/overlays/.

Two-step process:
  1. Remotion renders video-only overlay (no audio track)
  2. ffmpeg merges the original audio back onto the overlaid video
"""
import json
import shutil
import subprocess
from pathlib import Path
from typing import Optional

REMOTION_DIR = Path(__file__).parent / "remotion"
FPS = 25


def render_keyframe_overlay(
    base_video_path: str,
    keyframes: list[dict],
    duration_seconds: float,
    output_path: str,
    audio_path: Optional[str] = None,
) -> str:
    """Composite keyframe overlays onto a base video.

    Args:
        base_video_path: Path to the source video (any panel type).
        keyframes: List of keyframe dicts with t, type, text, etc.
        duration_seconds: Duration in seconds (drives frame count).
        output_path: Where to write the final composited MP4.
        audio_path: If provided, merge this audio track onto the
            output. If None, the output is video-only.

    Returns:
        The output_path.
    """
    if not keyframes:
        shutil.copyfile(base_video_path, output_path)
        return output_path

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    video_name = Path(base_video_path).name
    staged_path = public_dir / video_name

    shutil.copyfile(base_video_path, staged_path)

    overlay_output = output_path if audio_path is None else str(
        Path(output_path).parent / f"_overlay_{Path(output_path).stem}.mp4"
    )

    try:
        props = {
            "seedanceVideoPath": video_name,
            "durationSeconds": duration_seconds,
            "keyframes": keyframes,
        }
        props_json = json.dumps(props)
        total_frames = max(1, int(duration_seconds * FPS))

        cmd = [
            "npx", "remotion", "render",
            "src/index.ts", "KeyframeOverlay",
            f"--props={props_json}",
            f"--output={str(Path(overlay_output).resolve())}",
            f"--frames=0-{total_frames - 1}",
        ]

        result = subprocess.run(
            cmd,
            cwd=str(REMOTION_DIR),
            capture_output=True,
            text=True,
            timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Remotion overlay render failed:\n{result.stderr[-2000:]}")

        if audio_path:
            _merge_audio(overlay_output, audio_path, output_path)

        return output_path
    finally:
        staged_path.unlink(missing_ok=True)
        if audio_path:
            Path(overlay_output).unlink(missing_ok=True)


def _merge_audio(video_path: str, audio_path: str, output_path: str) -> str:
    """Replace audio track on a video with the given audio file."""
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", audio_path,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        str(Path(output_path).resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio merge failed:\n{result.stderr[-2000:]}")
    return output_path
