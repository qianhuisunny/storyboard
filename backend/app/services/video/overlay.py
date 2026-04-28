"""
Scene composition rendering via Remotion.

Every non-raw panel is rendered through a single Remotion composition:
``SceneComposition``. The scene receives:

  - screen_type
  - composition
  - canvas_mode
  - overlay_elements
  - optional base_video_path
  - optional audio track
"""
import json
import shutil
import subprocess
from pathlib import Path
from typing import Optional

REMOTION_DIR = Path(__file__).parent / "remotion"
FPS = 25


def render_scene_composition(
    screen_type: str,
    composition: str,
    overlay_elements: list[dict],
    duration_seconds: float,
    output_path: str,
    canvas_mode: str = "none",
    base_video_path: Optional[str] = None,
    audio_path: Optional[str] = None,
) -> str:
    """Render a scene composition and optionally merge narration audio."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    staged_video_name: Optional[str] = None
    staged_audio_name: Optional[str] = None
    staged_video_path: Optional[Path] = None
    staged_audio_path: Optional[Path] = None

    if base_video_path:
        staged_video_name = f"{Path(output_path).stem}_base{Path(base_video_path).suffix}"
        staged_video_path = public_dir / staged_video_name
        shutil.copyfile(base_video_path, staged_video_path)

    if audio_path:
        staged_audio_name = f"{Path(output_path).stem}_audio{Path(audio_path).suffix}"
        staged_audio_path = public_dir / staged_audio_name
        shutil.copyfile(audio_path, staged_audio_path)

    video_only_output = output_path if audio_path is None else str(
        Path(output_path).parent / f"_scene_{Path(output_path).stem}.mp4"
    )

    try:
        props = {
            "screenType": screen_type,
            "composition": composition,
            "canvasMode": canvas_mode,
            "durationSeconds": duration_seconds,
            "overlayElements": overlay_elements,
            "baseVideoPath": staged_video_name,
            "audioSrc": staged_audio_name,
        }
        props_json = json.dumps(props)
        total_frames = max(1, int(duration_seconds * FPS))

        cmd = [
            "npx",
            "remotion",
            "render",
            "src/index.ts",
            "SceneComposition",
            f"--props={props_json}",
            f"--output={str(Path(video_only_output).resolve())}",
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
            raise RuntimeError(
                f"Remotion scene render failed:\n{result.stderr[-2000:]}"
            )

        if audio_path:
            _merge_audio(video_only_output, audio_path, output_path)

        return output_path
    finally:
        if staged_video_path:
            staged_video_path.unlink(missing_ok=True)
        if staged_audio_path:
            staged_audio_path.unlink(missing_ok=True)
        if audio_path:
            Path(video_only_output).unlink(missing_ok=True)


def _merge_audio(video_path: str, audio_path: str, output_path: str) -> str:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        video_path,
        "-i",
        audio_path,
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        str(Path(output_path).resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg audio merge failed:\n{result.stderr[-2000:]}")
    return output_path
