import os
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def generate_audio(
    text: str,
    output_path: str,
    voice: str = "alloy",
    client: OpenAI | None = None,
) -> str:
    """Generate TTS audio for a single panel's voiceover script.

    Args:
        text: The voiceover script text.
        output_path: Where to save the .mp3 file.
        voice: OpenAI TTS voice name (alloy/echo/nova/onyx/shimmer).
        client: Optional OpenAI client (for testing).

    Returns:
        The output_path.
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    response = client.audio.speech.create(
        model="tts-1-hd",
        voice=voice,
        input=text,
    )
    response.write_to_file(output_path)
    return output_path


def generate_all_audio(
    panels: list,
    output_dir: str,
    voice: str = "alloy",
    client: OpenAI | None = None,
) -> list:
    """Generate TTS audio for all panels.

    Args:
        panels: List of Panel objects.
        output_dir: Directory to save audio files.
        voice: OpenAI TTS voice name.
        client: Optional OpenAI client.

    Returns:
        List of panels with audio_path populated.
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    audio_dir = os.path.join(output_dir, "audio")
    os.makedirs(audio_dir, exist_ok=True)

    for panel in panels:
        output_path = os.path.join(audio_dir, f"panel_{panel.panel_number:02d}.mp3")
        generate_audio(
            text=panel.voiceover_script,
            output_path=output_path,
            voice=voice,
            client=client,
        )
        panel.audio_path = output_path
        print(f"  [TTS] Panel {panel.panel_number:02d} → {output_path}")

    return panels
