import os
import tempfile
from unittest.mock import MagicMock
from video.tts import generate_audio, generate_all_audio


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


def test_generate_all_audio_sets_audio_path_on_panels():
    """Test that generate_all_audio processes panels and sets audio_path."""
    from video.models import Panel, ScreenType

    mock_response = MagicMock()
    mock_response.write_to_file = MagicMock()

    mock_client = MagicMock()
    mock_client.audio.speech.create.return_value = mock_response

    panels = [
        Panel(
            panel_number=1,
            screen_type=ScreenType.TALKING_HEAD,
            duration_seconds=18.5,
            voiceover_script="First panel script",
            visual_direction=["test"],
        ),
        Panel(
            panel_number=2,
            screen_type=ScreenType.SLIDES,
            duration_seconds=17.5,
            voiceover_script="Second panel script",
            visual_direction=["test"],
        ),
    ]

    with tempfile.TemporaryDirectory() as tmpdir:
        result = generate_all_audio(panels, tmpdir, client=mock_client)

        assert mock_client.audio.speech.create.call_count == 2
        assert result[0].audio_path == os.path.join(tmpdir, "audio", "panel_01.mp3")
        assert result[1].audio_path == os.path.join(tmpdir, "audio", "panel_02.mp3")
        assert result is panels  # Same list reference
