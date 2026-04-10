import os
import tempfile
from unittest.mock import patch, MagicMock
from video.stitcher import build_concat_file, stitch_videos


def test_build_concat_file():
    """Test that the ffmpeg concat file is correctly generated."""
    clips = ["/tmp/clip_01.mp4", "/tmp/clip_02.mp4", "/tmp/clip_03.mp4"]
    with tempfile.TemporaryDirectory() as tmpdir:
        concat_path = os.path.join(tmpdir, "concat.txt")
        build_concat_file(clips, concat_path)

        content = open(concat_path).read()
        assert "file '/tmp/clip_01.mp4'" in content
        assert "file '/tmp/clip_02.mp4'" in content
        assert "file '/tmp/clip_03.mp4'" in content
        lines = [l for l in content.strip().split("\n") if l.startswith("file ")]
        assert len(lines) == 3


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
