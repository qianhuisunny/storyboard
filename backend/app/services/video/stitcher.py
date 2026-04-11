import subprocess
from pathlib import Path


def build_concat_file(clip_paths: list[str], output_path: str) -> str:
    """Build an ffmpeg concat demuxer file listing all clips in order.

    Args:
        clip_paths: Ordered list of clip file paths. Relative paths are
            resolved to absolute form before being written, because ffmpeg's
            concat demuxer interprets relative ``file '...'`` entries
            relative to the concat file's own directory — not the working
            directory the command was invoked from. Passing relative paths
            through verbatim would double-prefix the output path for any
            clip whose directory matches the concat file's directory.
        output_path: Where to write the concat file.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        for path in clip_paths:
            # Resolve to absolute so ffmpeg doesn't reinterpret relative
            # paths against the concat file's parent directory.
            absolute = str(Path(path).resolve())
            # Escape single quotes for ffmpeg concat demuxer format
            escaped = absolute.replace("'", r"'\''")
            f.write(f"file '{escaped}'\n")
    return output_path


def stitch_videos(clip_paths: list[str], output_path: str) -> str:
    """Stitch multiple video clips into a single MP4 using ffmpeg.

    Args:
        clip_paths: Ordered list of clip file paths.
        output_path: Where to save the final video.

    Returns:
        The output_path.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    output_stem = Path(output_path).stem
    concat_file = str(Path(output_path).parent / f"concat_{output_stem}.txt")
    build_concat_file(clip_paths, concat_file)

    cmd = [
        "ffmpeg",
        "-y",                     # overwrite output
        "-f", "concat",           # concat demuxer
        "-safe", "0",             # allow absolute paths
        "-i", concat_file,        # input file list
        "-c", "copy",             # copy streams (no re-encode)
        output_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg stitch failed:\n{result.stderr}")

    print(f"  [Stitch] Final video → {output_path}")
    return output_path
