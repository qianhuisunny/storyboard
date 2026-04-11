import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from video.stitcher import (
    build_concat_file,
    stitch_videos,
    _normalize_clip,
    CANONICAL_WIDTH,
    CANONICAL_HEIGHT,
    CANONICAL_FPS,
    CANONICAL_PIX_FMT,
)


# ---------- build_concat_file ----------

def test_build_concat_file():
    """Test that the ffmpeg concat file is correctly generated."""
    clips = ["/tmp/clip_01.mp4", "/tmp/clip_02.mp4", "/tmp/clip_03.mp4"]
    with tempfile.TemporaryDirectory() as tmpdir:
        concat_path = os.path.join(tmpdir, "concat.txt")
        build_concat_file(clips, concat_path)

        content = Path(concat_path).read_text()
        # On macOS /tmp is a symlink to /private/tmp; Path.resolve() follows
        # the symlink, so accept either spelling.
        assert ("file '/tmp/clip_01.mp4'" in content
                or "file '/private/tmp/clip_01.mp4'" in content)
        assert ("file '/tmp/clip_03.mp4'" in content
                or "file '/private/tmp/clip_03.mp4'" in content)
        lines = [l for l in content.strip().split("\n") if l.startswith("file ")]
        assert len(lines) == 3


def test_build_concat_file_resolves_relative_paths():
    """Relative clip paths must be resolved to absolute in the concat file.

    Regression: ffmpeg's concat demuxer resolves relative ``file '...'``
    entries against the concat file's own directory, not the CWD. If we
    pass a relative clip path whose directory happens to match the concat
    file's directory, the result is a double-prefixed path that doesn't
    exist. build_concat_file must canonicalize every entry to absolute.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        clip_rel = "relative_clip.mp4"
        clip_abs = os.path.join(tmpdir, clip_rel)
        open(clip_abs, "w").close()

        concat_path = os.path.join(tmpdir, "concat.txt")
        old_cwd = os.getcwd()
        try:
            os.chdir(tmpdir)
            build_concat_file([clip_rel], concat_path)
        finally:
            os.chdir(old_cwd)

        content = Path(concat_path).read_text()
        assert "file 'relative_clip.mp4'" not in content
        expected_abs = str(Path(clip_abs).resolve())
        assert f"file '{expected_abs}'" in content


# ---------- _normalize_clip ----------

@patch("video.stitcher.subprocess.run")
def test_normalize_clip_invokes_libx264_with_canonical_params(mock_run):
    """The normalize pass must re-encode to the canonical format.

    This lock-in test is the reason stitch_videos is safe across
    HeyGen+Remotion input mixes: different pix_fmt, different fps,
    different time_base all get flattened to one canonical format.
    If this test ever drifts away from the constants, the mixed-input
    stitch will silently produce a corrupted file again.
    """
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        src = os.path.join(tmpdir, "src.mp4")
        dst = os.path.join(tmpdir, "dst.mp4")
        open(src, "w").close()

        _normalize_clip(src, dst)

        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        assert cmd[0] == "ffmpeg"
        assert "-y" in cmd

        # Video re-encode
        assert "-c:v" in cmd
        assert "libx264" in cmd
        assert "-profile:v" in cmd
        assert "high" in cmd

        # Canonical pixel format, scale, and fps must all appear in the
        # same -vf filter chain argument
        vf_idx = cmd.index("-vf")
        vf_value = cmd[vf_idx + 1]
        assert f"scale={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}" in vf_value
        assert f"fps={CANONICAL_FPS}" in vf_value
        assert f"format={CANONICAL_PIX_FMT}" in vf_value

        # Audio re-encode
        assert "-c:a" in cmd
        assert "aac" in cmd

        # Faststart for web playback
        assert "-movflags" in cmd
        assert "+faststart" in cmd


@patch("video.stitcher.subprocess.run")
def test_normalize_clip_raises_on_ffmpeg_failure(mock_run):
    mock_run.return_value = MagicMock(returncode=1, stderr="bad input")

    with tempfile.TemporaryDirectory() as tmpdir:
        src = os.path.join(tmpdir, "src.mp4")
        dst = os.path.join(tmpdir, "dst.mp4")
        open(src, "w").close()

        with pytest.raises(RuntimeError, match="ffmpeg normalize failed"):
            _normalize_clip(src, dst)


# ---------- stitch_videos ----------

@patch("video.stitcher.subprocess.run")
def test_stitch_videos_runs_normalize_then_concat(mock_run):
    """stitch_videos must (a) normalize each clip via one ffmpeg call per
    clip, then (b) run a single final concat-copy ffmpeg call."""
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        clips = []
        for i in range(3):
            path = os.path.join(tmpdir, f"clip_{i:02d}.mp4")
            open(path, "w").close()
            clips.append(path)

        output = os.path.join(tmpdir, "final.mp4")
        stitch_videos(clips, output)

        # 3 normalize calls + 1 final concat = 4 total
        assert mock_run.call_count == 4

        # Last call is the final concat — must use -f concat and -c copy
        final_cmd = mock_run.call_args_list[-1][0][0]
        assert final_cmd[0] == "ffmpeg"
        assert "-f" in final_cmd
        assert "concat" in final_cmd
        assert "-safe" in final_cmd
        assert "-c" in final_cmd
        assert "copy" in final_cmd
        assert "-y" in final_cmd

        # Every earlier call is a normalize — must use libx264
        for i in range(3):
            norm_cmd = mock_run.call_args_list[i][0][0]
            assert norm_cmd[0] == "ffmpeg"
            assert "libx264" in norm_cmd


@patch("video.stitcher.subprocess.run")
def test_stitch_videos_scratch_dir_is_cleaned_up(mock_run):
    """The _stitch_work_* scratch dir must not linger after stitch_videos."""
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        clip = os.path.join(tmpdir, "clip_01.mp4")
        open(clip, "w").close()
        output = os.path.join(tmpdir, "my_final.mp4")

        stitch_videos([clip], output)

        # Scratch dir derived from output stem must be gone
        scratch = os.path.join(tmpdir, "_stitch_work_my_final")
        assert not os.path.exists(scratch), (
            f"scratch dir {scratch} was not cleaned up after stitch_videos"
        )


@patch("video.stitcher.subprocess.run")
def test_stitch_videos_raises_on_empty_input(mock_run):
    with tempfile.TemporaryDirectory() as tmpdir:
        output = os.path.join(tmpdir, "final.mp4")
        with pytest.raises(ValueError, match="clip_paths must be non-empty"):
            stitch_videos([], output)
