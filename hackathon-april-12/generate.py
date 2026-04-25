#!/usr/bin/env python3
"""
Seedance 2.0 E2E storyboard video generator.

Usage:
    python generate.py                          # full 16-panel run
    python generate.py --only-panels 15         # test single panel
    python generate.py --only-panels 1,5,15     # test talking heads
    python generate.py --skip-tts               # reuse existing audio
    python generate.py --skip-seedance          # reuse existing video clips
"""
import argparse
import json
import math
import os
import subprocess
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

# Add backend to path so we can reuse the video service modules
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend" / "app" / "services"))

from openai import OpenAI

from video.parser import parse_storyboard
from video.tts import generate_all_audio
from video.stitcher import stitch_videos
from video.stock_video import create_stock_video_panel

import seedance_client
import slide_renderer
import prompts
import diagram_animator

SCRIPT_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = SCRIPT_DIR / "output"
REMOTION_DIR = REPO_ROOT / "backend" / "app" / "services" / "video" / "remotion"


def probe_audio_duration(audio_path: str) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(Path(audio_path).resolve())],
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr[-500:]}")
    return float(result.stdout.strip())


def upload_audio_public(audio_path: str) -> str:
    """Upload audio to litterbox for Seedance to fetch as URL."""
    sys.path.insert(0, str(REPO_ROOT / "backend" / "app" / "services" / "video"))
    from public_upload import upload_file
    url = upload_file(audio_path, expiry="12h")
    print(f"  [Upload] {Path(audio_path).name} → {url}")
    return url


def overlay_audio(video_path: str, audio_path: str, output_path: str, mix_seedance: bool = False):
    """Replace or mix audio on a Seedance video clip."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    if mix_seedance:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-filter_complex",
            "[0:a]volume=0.15[bg];[1:a]volume=1.0[vo];[bg][vo]amix=inputs=2:duration=longest[out]",
            "-map", "0:v", "-map", "[out]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(output_path),
        ]
    else:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", audio_path,
            "-map", "0:v", "-map", "1:a",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            str(output_path),
        ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg overlay failed: {result.stderr[-1000:]}")
    return output_path


def concat_clips(clip_paths: list[str], output_path: str):
    """Concat multiple short clips into one longer clip."""
    if len(clip_paths) == 1:
        import shutil
        shutil.copy2(clip_paths[0], output_path)
        return output_path

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    concat_file = Path(output_path).with_suffix(".txt")
    with open(concat_file, "w") as f:
        for p in clip_paths:
            f.write(f"file '{Path(p).resolve()}'\n")

    cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", str(concat_file),
        "-c", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    concat_file.unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg concat failed: {result.stderr[-1000:]}")
    return output_path


def trim_to_duration(video_path: str, duration: float, output_path: str):
    """Trim video to exact duration."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-t", str(duration),
        "-c", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg trim failed: {result.stderr[-1000:]}")
    return output_path


def render_talking_head(panel, audio_path: str, output_path: str, ref_image: str):
    """Generate talking head via Seedance reference-to-video with lip sync."""
    real_dur = probe_audio_duration(audio_path)
    print(f"  [P{panel.panel_number:02d}] TALKING HEAD — {real_dur:.1f}s, ref image + audio lip sync")

    audio_url = upload_audio_public(audio_path)

    max_clip = 15
    n_clips = max(1, math.ceil(real_dur / max_clip))
    clip_dur = min(max_clip, math.ceil(real_dur / n_clips))

    raw_dir = OUTPUT_DIR / "seedance_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    raw_clips = []

    for i in range(n_clips):
        clip_path = raw_dir / f"panel_{panel.panel_number:02d}_clip{i}.mp4"
        prompt = prompts.build_talking_head_prompt(
            visual_direction=panel.visual_direction,
            clip_index=i,
            total_clips=n_clips,
        )
        seedance_client.generate_video(
            output_path=str(clip_path),
            prompt=prompt,
            duration=clip_dur,
            image_path=ref_image,
            audio_url=audio_url,
        )
        raw_clips.append(str(clip_path))

    if len(raw_clips) > 1:
        concat_path = raw_dir / f"panel_{panel.panel_number:02d}_concat.mp4"
        concat_clips(raw_clips, str(concat_path))
    else:
        concat_path = Path(raw_clips[0])

    trimmed = raw_dir / f"panel_{panel.panel_number:02d}_trimmed.mp4"
    trim_to_duration(str(concat_path), real_dur, str(trimmed))

    overlay_audio(str(trimmed), audio_path, output_path, mix_seedance=False)
    return {"duration": real_dur, "clips": n_clips}


def render_stock_video(panel, audio_path: str, output_path: str):
    """Fetch Pexels stock footage, overlay TTS audio, return manifest info."""
    real_dur = probe_audio_duration(audio_path)
    print(f"  [P{panel.panel_number:02d}] STOCK VIDEO — {real_dur:.1f}s, Pexels B-roll")

    client = OpenAI()
    result = create_stock_video_panel(
        visual_direction=panel.visual_direction,
        audio_path=audio_path,
        output_path=output_path,
        target_duration=real_dur,
        llm_client=client,
    )
    return result


def remotion_render(seedance_video: str, keyframes: list[dict], duration: float, output_path: str):
    """Render keyframe overlay on Seedance video using Remotion."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    public_dir = REMOTION_DIR / "public"
    public_dir.mkdir(parents=True, exist_ok=True)

    import shutil
    video_name = Path(seedance_video).name
    staged_path = public_dir / video_name
    shutil.copyfile(seedance_video, staged_path)

    try:
        props = {
            "seedanceVideoPath": video_name,
            "durationSeconds": duration,
            "keyframes": keyframes,
        }
        props_json = json.dumps(props)

        cmd = [
            "npx", "remotion", "render",
            "src/index.ts", "KeyframeOverlay",
            f"--props={props_json}",
            f"--output={str(Path(output_path).resolve())}",
        ]
        result = subprocess.run(
            cmd, cwd=str(REMOTION_DIR),
            capture_output=True, text=True, timeout=300,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Remotion render failed: {result.stderr[-1000:]}")
        print(f"    Remotion render → {output_path}")
    finally:
        staged_path.unlink(missing_ok=True)

    return output_path


def render_text_overlay_png(overlays: list[dict], width: int = 1280, height: int = 720) -> str:
    """Render text overlays as a transparent PNG using Pillow."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    for ov in overlays:
        size = ov.get("size", 24)
        bold = ov.get("bold", False)
        color_str = ov.get("color", "0x222222")
        text = ov["text"]

        if color_str.startswith("0x"):
            r = int(color_str[2:4], 16)
            g = int(color_str[4:6], 16)
            b = int(color_str[6:8], 16)
            color = (r, g, b, 255)
        else:
            color = (34, 34, 34, 255)

        try:
            if bold:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=1)
            else:
                font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size, index=0)
        except (OSError, IndexError):
            font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        x_expr = ov.get("x", "0")
        y_expr = ov.get("y", "0")
        x = _eval_pos(x_expr, width, height, text_w, text_h)
        y = _eval_pos(y_expr, width, height, text_w, text_h)

        draw.text((x, y), text, fill=color, font=font)

    png_path = str(OUTPUT_DIR / "text_overlay_tmp.png")
    img.save(png_path)
    return png_path


def _eval_pos(expr: str, w: int, h: int, text_w: int, text_h: int) -> int:
    """Evaluate position expression like '(w-text_w)/2' or 'w*0.70'."""
    try:
        return int(eval(expr, {"__builtins__": {}}, {"w": w, "h": h, "text_w": text_w, "text_h": text_h}))
    except Exception:
        return 0


def overlay_text(video_path: str, overlays: list[dict], output_path: str):
    """Add text overlays to video: render PNG with Pillow, composite with ffmpeg."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    if not overlays:
        import shutil
        shutil.copy2(video_path, output_path)
        return output_path

    png_path = render_text_overlay_png(overlays)

    cmd = [
        "ffmpeg", "-y",
        "-i", video_path,
        "-i", png_path,
        "-filter_complex", "[1:v]format=rgba[ovr];[0:v][ovr]overlay=0:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "18",
        "-c:a", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    Path(png_path).unlink(missing_ok=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg text overlay failed: {result.stderr[-1000:]}")
    return output_path


def render_slide(panel, audio_path: str, output_path: str):
    """Seedance cinematic background for slides. Keyframe overlay is applied later in the pipeline."""
    real_dur = probe_audio_duration(audio_path)
    print(f"  [P{panel.panel_number:02d}] SLIDE — {real_dur:.1f}s, Seedance cinematic bg")

    raw_dir = OUTPUT_DIR / "seedance_raw"
    raw_dir.mkdir(parents=True, exist_ok=True)

    bg_prompt = (
        "Slow cinematic abstract background, dark gradient with soft light "
        "rays and gentle bokeh particles drifting. Deep navy blue to black "
        "color palette, shallow depth of field, subtle camera drift. "
        "No text, no objects, no people. Pure atmospheric mood."
    )
    max_clip = 15
    n_clips = max(1, math.ceil(real_dur / max_clip))
    clip_dur = min(max_clip, math.ceil(real_dur / n_clips))
    raw_clips = []

    for i in range(n_clips):
        clip_path = raw_dir / f"panel_{panel.panel_number:02d}_bg{i}.mp4"
        seedance_client.generate_video(
            output_path=str(clip_path),
            prompt=bg_prompt,
            duration=clip_dur,
        )
        raw_clips.append(str(clip_path))

    if len(raw_clips) > 1:
        concat_path = raw_dir / f"panel_{panel.panel_number:02d}_bgconcat.mp4"
        concat_clips(raw_clips, str(concat_path))
    else:
        concat_path = Path(raw_clips[0])

    bg_trimmed = raw_dir / f"panel_{panel.panel_number:02d}_bg.mp4"
    trim_to_duration(str(concat_path), real_dur, str(bg_trimmed))

    overlay_audio(str(bg_trimmed), audio_path, output_path, mix_seedance=False)
    return {"duration": real_dur, "clips": n_clips}


def run_pipeline(args):
    start = time.time()
    print("=== Seedance 2.0 E2E Pipeline ===\n")

    storyboard_path = str(SCRIPT_DIR / "storyboard.json")
    storyboard = parse_storyboard(storyboard_path)
    panels = storyboard.panels

    if args.only_panels:
        only = [int(x) for x in args.only_panels.split(",")]
        panels = [p for p in panels if p.panel_number in only]
        print(f"[Filter] Panels: {[p.panel_number for p in panels]}")

    from video.models import ScreenType
    th = [p for p in panels if p.screen_type == ScreenType.TALKING_HEAD]
    sv = [p for p in panels if p.screen_type == ScreenType.STOCK_VIDEO]
    sl = [p for p in panels if p.screen_type == ScreenType.SLIDES]
    print(f"[1/5] {len(panels)} panels: {len(th)} talking_head, {len(sv)} stock_video, {len(sl)} slides\n")

    # Step 2: TTS
    if not args.skip_tts:
        print(f"[2/5] Generating TTS for {len(panels)} panels...")
        generate_all_audio(panels, str(OUTPUT_DIR), voice=args.voice)
    else:
        print("[2/5] Skipping TTS (reusing existing audio)")
        audio_dir = OUTPUT_DIR / "audio"
        for p in panels:
            p.audio_path = str(audio_dir / f"panel_{p.panel_number:02d}.mp3")

    # Step 3: Render
    print(f"\n[3/5] Rendering {len(panels)} panels via Seedance 2.0...")
    clips_dir = OUTPUT_DIR / "clips"
    clips_dir.mkdir(parents=True, exist_ok=True)

    ref_image = os.environ.get("CHARACTER_REF_IMAGE", str(SCRIPT_DIR / "ref.png"))
    if not Path(ref_image).exists() and th:
        print(f"  WARNING: Character reference image not found at {ref_image}")
        print(f"  Talking head panels will use text-to-video fallback")
        ref_image = None

    manifest_panels = []

    for panel in panels:
        clip_path = str(clips_dir / f"panel_{panel.panel_number:02d}.mp4")

        if args.skip_seedance and Path(clip_path).exists():
            print(f"  [P{panel.panel_number:02d}] Skipping (reusing existing clip)")
            panel.clip_path = clip_path
            manifest_panels.append({"panel_number": panel.panel_number, "skipped": True})
            continue

        if panel.screen_type == ScreenType.TALKING_HEAD:
            if ref_image:
                info = render_talking_head(panel, panel.audio_path, clip_path, ref_image)
            else:
                info = render_stock_video(panel, panel.audio_path, clip_path)
        elif panel.screen_type == ScreenType.STOCK_VIDEO:
            info = render_stock_video(panel, panel.audio_path, clip_path)
        elif panel.screen_type == ScreenType.SLIDES:
            info = render_slide(panel, panel.audio_path, clip_path)
        else:
            raise ValueError(f"Unknown screen_type: {panel.screen_type}")

        if panel.keyframes and not args.skip_remotion:
            seedance_raw = str(clips_dir / f"panel_{panel.panel_number:02d}_seedance.mp4")
            os.rename(clip_path, seedance_raw)
            remotion_output = str(clips_dir / f"panel_{panel.panel_number:02d}_overlay.mp4")
            remotion_render(
                seedance_video=seedance_raw,
                keyframes=panel.keyframes,
                duration=info["duration"],
                output_path=remotion_output,
            )
            overlay_audio(remotion_output, panel.audio_path, clip_path, mix_seedance=False)

        panel.clip_path = clip_path
        manifest_panels.append({
            "panel_number": panel.panel_number,
            "screen_type": panel.screen_type.value,
            **info,
        })
        print(f"  [P{panel.panel_number:02d}] Done ✓\n")

    # Step 4: Stitch
    print(f"[4/5] Stitching {len(panels)} clips...")
    ordered = sorted(panels, key=lambda p: p.panel_number)
    clip_paths = [str(clips_dir / f"panel_{p.panel_number:02d}.mp4") for p in ordered]
    final_path = str(OUTPUT_DIR / "final.mp4")
    stitch_videos(clip_paths, final_path)

    # Step 5: Manifest
    elapsed = time.time() - start
    manifest = {
        "generator": "seedance-2.0-e2e",
        "model": os.environ.get("SEEDANCE_MODEL_ID", "unknown"),
        "storyboard": storyboard_path,
        "panels": len(panels),
        "elapsed_seconds": round(elapsed, 1),
        "voice": args.voice,
        "per_panel": manifest_panels,
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"\n=== Done in {elapsed:.1f}s ===")
    print(f"Final video: {final_path}")
    print(f"Manifest:    {manifest_path}")
    return final_path


def main():
    parser = argparse.ArgumentParser(description="Seedance 2.0 E2E storyboard generator")
    parser.add_argument("--only-panels", help="Comma-separated panel numbers to render")
    parser.add_argument("--skip-tts", action="store_true", help="Reuse existing TTS audio")
    parser.add_argument("--skip-seedance", action="store_true", help="Reuse existing Seedance clips")
    parser.add_argument("--skip-remotion", action="store_true", help="Skip Remotion overlay (use Seedance video directly)")
    parser.add_argument("--voice", default="alloy", help="OpenAI TTS voice (default: alloy)")
    args = parser.parse_args()
    run_pipeline(args)


if __name__ == "__main__":
    main()
