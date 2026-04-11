import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
from video.stitcher import build_concat_file, stitch_videos


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
        # Create a real clip file so .resolve() produces a real path
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
        # The entry must be an absolute path, not the bare relative one.
        assert "file 'relative_clip.mp4'" not in content
        expected_abs = str(Path(clip_abs).resolve())
        assert f"file '{expected_abs}'" in content


@patch("video.stitcher.subprocess.run")
def test_stitch_calls_ffmpeg(mock_run):
    """Test that stitch_videos calls ffmpeg with correct args."""
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        # Create dummy clip files
        clips = []
        for i in range(3):
            path = os.path.join(tmpdir, f"clip_{i:02d}.mp4")
            open(path, "w").close()
            clips.append(path)

        output = os.path.join(tmpdir, "final.mp4")
        stitch_videos(clips, output)

        mock_run.assert_called_once()
        call_args = mock_run.call_args[0][0]
        assert call_args[0] == "ffmpeg"
        assert "-f" in call_args
        assert "concat" in call_args
        assert output in call_args
        assert "-safe" in call_args
        assert "0" in call_args  # -safe 0 value
        assert "-c" in call_args
        assert "copy" in call_args  # -c copy value
        assert "-y" in call_args  # overwrite flag


@patch("video.stitcher.subprocess.run")
def test_stitch_uses_unique_concat_file_name(mock_run):
    """Test that concat file name is derived from output stem to avoid collisions."""
    mock_run.return_value = MagicMock(returncode=0, stderr="")

    with tempfile.TemporaryDirectory() as tmpdir:
        clips = [os.path.join(tmpdir, "clip_01.mp4")]
        open(clips[0], "w").close()

        output_a = os.path.join(tmpdir, "video_a.mp4")
        output_b = os.path.join(tmpdir, "video_b.mp4")

        stitch_videos(clips, output_a)
        stitch_videos(clips, output_b)

        # Both concat files should exist with unique names
        assert os.path.exists(os.path.join(tmpdir, "concat_video_a.txt"))
        assert os.path.exists(os.path.join(tmpdir, "concat_video_b.txt"))
