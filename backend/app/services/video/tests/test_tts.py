import os
import tempfile
from unittest.mock import patch, MagicMock
from pathlib import Path
from video.tts import generate_audio


def test_generate_audio_creates_mp3():
    """Test that generate_audio calls OpenAI TTS and writes an mp3 file."""
    mock_response = MagicMock()
    mock_response.write_to_file = MagicMock()

    mock_client = MagicMock()
    mock_client.audio.speech.create.return_value = mock_response

    with tempfile.TemporaryDirectory() as tmpdir:
        output_path = os.path.join(tmpdir, "panel_01.mp3")
        generate_audio(
            text="Hello world",
            output_path=output_path,
            voice="alloy",
            client=mock_client,
        )

        mock_client.audio.speech.create.assert_called_once_with(
            model="tts-1-hd",
            voice="alloy",
            input="Hello world",
        )
        mock_response.write_to_file.assert_called_once_with(output_path)
