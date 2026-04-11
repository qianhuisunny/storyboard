"""
Word-level audio transcription via OpenAI ``whisper-1``.

We transcribe the same mp3 files we just generated with OpenAI tts-1-hd,
which is a small round trip but the only way to get word-level
timestamps from OpenAI's API for audio we generated — the TTS endpoint
does not return timing data alongside the audio. Whisper billing is
~$0.006/minute of audio, so 13 slides * ~30s each ≈ 6.5 minutes ≈ $0.04
per full run.

The timestamps are consumed by slides.align_elements_to_audio to map
visual elements (e.g. "level_3" in a PyramidChart) to the moment in
the audio when that element is first mentioned, so the Remotion
component can fade the element in at exactly that frame.
"""
import os
from pathlib import Path
from typing import Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()


def transcribe_with_word_timestamps(
    audio_path: str,
    client: Optional[OpenAI] = None,
) -> list[dict]:
    """Transcribe an audio file and return per-word timestamps.

    Uses the ``whisper-1`` model with ``verbose_json`` and
    ``timestamp_granularities=["word"]`` so the response includes a
    ``words`` array where each entry has ``{word, start, end}`` in
    seconds.

    Args:
        audio_path: Local path to the mp3/wav/m4a file.
        client: Optional OpenAI client for testing.

    Returns:
        List of dicts: ``[{"word": "Only", "start": 0.32, "end": 0.54}, ...]``
        Empty list if the API returned no words field (shouldn't happen
        for non-empty audio but we guard anyway).
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    audio_file_path = Path(audio_path).resolve()
    if not audio_file_path.is_file():
        raise FileNotFoundError(f"transcribe: no such file: {audio_path}")

    with audio_file_path.open("rb") as f:
        response = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
            timestamp_granularities=["word"],
        )

    # The openai SDK returns a VerboseTranscription with a .words attribute.
    # Each word is a TranscriptionWord dataclass with .word, .start, .end.
    words = getattr(response, "words", None) or []

    result: list[dict] = []
    for w in words:
        # Support both attribute-style and dict-style access defensively
        if isinstance(w, dict):
            result.append({
                "word": w.get("word", ""),
                "start": float(w.get("start", 0.0)),
                "end": float(w.get("end", 0.0)),
            })
        else:
            result.append({
                "word": getattr(w, "word", ""),
                "start": float(getattr(w, "start", 0.0)),
                "end": float(getattr(w, "end", 0.0)),
            })
    return result
