"""
ffmpeg-based video stitcher.

The obvious approach is ``ffmpeg -f concat -i list.txt -c copy output.mp4``,
which is what the earlier version of this module did. That works only when
every input clip has identical codec parameters — pix_fmt, frame rate,
time_base, profile, level — otherwise the concat demuxer silently produces
a broken file. We hit this the hard way when mixing HeyGen talking-head
output (yuv420p, 25 fps, time_base 1/12800) with Remotion slide output
(yuvj420p, 30 fps, time_base 1/90000): the stitched file reported
200 seconds of duration but only had ~32 seconds of real playable
content, because Remotion's pts values were interpreted against HeyGen's
time_base and blew up by ~7x.

Fix: normalize every input to a single canonical format first, then
concat the normalized clips with ``-c copy``. The normalize pass costs
one libx264 re-encode per input clip (~real-time to 2x real-time on a
modern Mac), which is fine for a 5-minute video at stitch time.

Canonical format (chosen to match HeyGen Photo Avatar output so its
native video passes through with minimal re-encode impact):
    - container: MP4
    - video: h264 High profile, yuv420p (limited range, not yuvj420p),
      1920x1080, 25 fps
    - audio: AAC LC, 48 kHz, stereo, 192 kbps
    - faststart moov atom for web playback
"""
import shutil
import subprocess
from pathlib import Path

CANONICAL_WIDTH = 1920
CANONICAL_HEIGHT = 1080
CANONICAL_FPS = 25
CANONICAL_PIX_FMT = "yuv420p"
CANONICAL_AUDIO_SAMPLE_RATE = "48000"
CANONICAL_AUDIO_BITRATE = "192k"


def build_concat_file(clip_paths: list[str], output_path: str) -> str:
    """Build an ffmpeg concat demuxer file listing all clips in order.

    Resolves every clip path to absolute form (``Path.resolve()``) before
    writing, because ffmpeg's concat demuxer interprets relative
    ``file '...'`` entries against the concat file's own directory, not
    the working directory the command was invoked from. See the
    regression test in test_stitcher.py.

    Args:
        clip_paths: Ordered list of clip file paths.
        output_path: Where to write the concat file.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        for path in clip_paths:
            absolute = str(Path(path).resolve())
            escaped = absolute.replace("'", r"'\''")
            f.write(f"file '{escaped}'\n")
    return output_path


def _normalize_clip(src_path: str, dst_path: str, timeout: int = 300) -> str:
    """Re-encode a single clip to the canonical format.

    Runs libx264 at preset=veryfast crf=20 which is near-lossless for
    footage that's already h264. Scales to 1920x1080, forces 25 fps,
    sets yuv420p pixel format, and normalizes audio to AAC 48k stereo.
    """
    Path(dst_path).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i", str(Path(src_path).resolve()),
        # Video: scale, fps, pix_fmt, libx264 encode
        "-vf", (
            f"scale={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:white,"
            f"fps={CANONICAL_FPS},format={CANONICAL_PIX_FMT}"
        ),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-profile:v", "high",
        "-level", "4.0",
        # Audio: AAC 48k stereo 192k
        "-c:a", "aac",
        "-ar", CANONICAL_AUDIO_SAMPLE_RATE,
        "-ac", "2",
        "-b:a", CANONICAL_AUDIO_BITRATE,
        # Container: faststart for web playback
        "-movflags", "+faststart",
        str(Path(dst_path).resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg normalize failed for {src_path}:\n{result.stderr[-2000:]}"
        )
    return dst_path


def stitch_videos(clip_paths: list[str], output_path: str) -> str:
    """Stitch multiple video clips into a single MP4.

    Two-stage approach:
      1. Normalize every input clip to the canonical format (libx264
         re-encode). Necessary because mixing HeyGen (25 fps yuv420p) and
         Remotion (30 fps yuvj420p) clips with ``-c copy`` produces a
         broken file with corrupted pts.
      2. Concat the normalized clips with ``-c copy``. This is fast
         because all normalized clips share identical codec params.

    Args:
        clip_paths: Ordered list of clip file paths to stitch.
        output_path: Where to save the final MP4.

    Returns:
        The output_path.
    """
    if not clip_paths:
        raise ValueError("stitch_videos: clip_paths must be non-empty")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    output_stem = Path(output_path).stem

    # Stage 1: normalize each input into a scratch dir next to the output.
    work_dir = Path(output_path).parent / f"_stitch_work_{output_stem}"
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        normalized_paths: list[str] = []
        for idx, clip in enumerate(clip_paths):
            norm_path = work_dir / f"norm_{idx:03d}.mp4"
            print(f"  [Stitch] Normalizing clip {idx + 1}/{len(clip_paths)}: {Path(clip).name}")
            _normalize_clip(clip, str(norm_path))
            normalized_paths.append(str(norm_path))

        # Stage 2: concat with -c copy now that all clips share codec params
        concat_file = work_dir / f"concat_{output_stem}.txt"
        build_concat_file(normalized_paths, str(concat_file))

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            "-movflags", "+faststart",
            str(Path(output_path).resolve()),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg final concat failed:\n{result.stderr[-2000:]}"
            )

        print(f"  [Stitch] Final video → {output_path}")
        return output_path

    finally:
        # Always clean up the scratch directory so data/video_output/
        # doesn't accumulate _stitch_work_* dirs between runs.
        shutil.rmtree(work_dir, ignore_errors=True)
