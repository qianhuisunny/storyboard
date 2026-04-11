"""
Stock video support via Pexels Videos API.

The original storyboard PDF labeled a few panels as "Stock video" rather
than "Slides" — they were meant to be real B-roll footage (a close-up of
hands reviewing paperwork, two people at a whiteboard, etc.) rather than
LLM-generated slide layouts. The earlier pipeline silently mapped these
to slides because no stock-footage branch existed. This module fills
that gap by pulling real footage from Pexels Videos (free, ~25k req/hour,
CC0-ish Pexels license, native 25 fps / 1920x1080 is common).

End-to-end flow per stock_video panel:

  1. LLM reads panel.visual_direction and generates a short Pexels
     search query (3-5 words, no adjectives that hurt search recall).
  2. Hit Pexels Videos /search for landscape 1920x1080 candidates.
  3. Pick the best match — prefer clips whose duration is close to the
     panel's needed duration without being too short. Prefer native
     1920x1080; fall back to 1280x720 upscaled by the stitcher.
  4. Download the chosen video to a scratch path.
  5. ffmpeg: loop the video if shorter than the audio, trim to the
     audio length, overlay the OpenAI TTS audio (discarding any audio
     on the Pexels clip), re-encode to the canonical format the
     stitcher consumes downstream (1920x1080 yuv420p 25 fps AAC 48k).

If Pexels returns zero results for a query, we raise and let the
pipeline fall back to a plain slide render for that panel rather than
silently producing a blank clip.
"""
import os
import json
import subprocess
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

PEXELS_API_BASE = "https://api.pexels.com/videos"
PEXELS_SEARCH_PATH = "/search"

# Canonical output dimensions — must match stitcher.py constants so the
# stitcher's normalize pass is a near-identity operation for stock video
# clips produced here.
CANONICAL_WIDTH = 1920
CANONICAL_HEIGHT = 1080
CANONICAL_FPS = 25


# =============================================================================
# Keyword generation
# =============================================================================

_KEYWORD_SYSTEM_PROMPT = """\
You generate short Pexels Videos search queries from visual direction bullets.

RULES:
- Output 3-5 lowercase words, no punctuation, no quotes.
- Describe WHAT is in the frame (subject + action + setting), not style
  adjectives like "cinematic" or "professional" that hurt search recall.
- Prefer concrete nouns and physical actions — "woman whiteboard
  presenting" beats "confident professional explaining strategy".
- Never output plurals of "people" — use "woman", "man", "executives",
  "coworkers", "hands", etc.
- Do not include the word "video", "footage", "stock", "pexels".
"""


def generate_pexels_query(
    visual_direction: list[str],
    client: Optional[OpenAI] = None,
) -> str:
    """Turn a panel's visual_direction bullets into a short Pexels query.

    Uses GPT-4o with a tightly constrained system prompt so the output is
    a few concrete search-friendly words. The LLM is far better than a
    regex here because visual_direction bullets often contain abstract
    adjectives and per-panel context that would otherwise need to be
    hand-filtered.
    """
    if client is None:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    user_prompt = (
        "Visual direction bullets:\n"
        + "\n".join(f"- {line}" for line in visual_direction)
        + "\n\nReturn the search query only, no explanation."
    )

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": _KEYWORD_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.2,
        max_tokens=30,
    )
    query = response.choices[0].message.content.strip().strip('"').strip("'").lower()
    # Defensive cleanup in case the model ignored the no-punctuation rule
    for ch in (".", ",", ";", ":", "!", "?"):
        query = query.replace(ch, "")
    return " ".join(query.split())


# =============================================================================
# Pexels search + selection + download
# =============================================================================

class PexelsError(RuntimeError):
    """Raised when Pexels search returns no usable results."""


def search_pexels(
    query: str,
    per_page: int = 15,
    orientation: str = "landscape",
    api_key: Optional[str] = None,
) -> list[dict]:
    """Search Pexels Videos and return the raw video records.

    Args:
        query: Search terms (produced by generate_pexels_query).
        per_page: How many candidates to fetch (1-80). 15 is a good
            balance between getting enough options and staying small.
        orientation: "landscape" | "portrait" | "square". Our videos
            are 16:9 so landscape is what we want.
        api_key: Override the env var (for testing).

    Returns:
        The raw list of video records from Pexels. Each record has
        fields like ``id``, ``duration``, ``width``, ``height``,
        ``url`` (page URL), and ``video_files`` (list of resolution
        variants with direct mp4 links).

    Raises:
        PexelsError: On non-200 responses or zero results.
    """
    key = api_key or os.getenv("PEXEL_API_KEY")
    if not key:
        raise PexelsError(
            "PEXEL_API_KEY is required (pass api_key or set PEXEL_API_KEY env var)"
        )

    r = httpx.get(
        f"{PEXELS_API_BASE}{PEXELS_SEARCH_PATH}",
        params={"query": query, "per_page": per_page, "orientation": orientation},
        headers={"Authorization": key},
        timeout=30,
    )
    if r.status_code >= 400:
        raise PexelsError(
            f"Pexels search failed ({r.status_code}) for query {query!r}: "
            f"{r.text[:300]}"
        )
    body = r.json()
    videos = body.get("videos") or []
    if not videos:
        raise PexelsError(f"Pexels returned zero videos for query {query!r}")
    return videos


def _pick_best_variant(video: dict) -> Optional[dict]:
    """From a Pexels video's ``video_files`` list, pick the best quality
    variant we can use: prefer 1920x1080 mp4 first, then 1280x720 mp4,
    then fall back to the largest mp4 available.
    """
    files = [
        vf for vf in video.get("video_files", [])
        if vf.get("file_type") == "video/mp4"
    ]
    if not files:
        return None

    def score(vf: dict) -> tuple:
        w, h = vf.get("width", 0), vf.get("height", 0)
        # Exact 1920x1080 wins. Then 1280x720. Then largest area.
        exact_1080 = 1 if (w == 1920 and h == 1080) else 0
        exact_720 = 1 if (w == 1280 and h == 720) else 0
        return (exact_1080, exact_720, w * h)

    return max(files, key=score)


def pick_best_video(
    videos: list[dict],
    target_duration: float,
) -> tuple[dict, dict]:
    """Choose the best video + variant from a Pexels search result list.

    Scoring priority:
      1. Duration ≥ target_duration (avoid needing to loop). We still
         accept short clips, but we'd rather not.
      2. Prefer 1920x1080 mp4 file variants over smaller.
      3. Prefer closer duration match (less wasted footage).

    Args:
        videos: raw result list from search_pexels.
        target_duration: how long the output clip needs to be.

    Returns:
        (video_record, best_variant) tuple. The variant has the direct
        mp4 ``link`` field we download.
    """
    if not videos:
        raise PexelsError("pick_best_video called with empty list")

    best = None
    best_score = None
    for v in videos:
        variant = _pick_best_variant(v)
        if variant is None:
            continue
        dur = float(v.get("duration", 0))
        long_enough = 1 if dur >= target_duration else 0
        # Distance penalty: want duration close to target from above
        if long_enough:
            dur_penalty = dur - target_duration
        else:
            dur_penalty = (target_duration - dur) * 2  # heavier penalty for too-short
        res_score = (variant.get("width", 0) * variant.get("height", 0)) / 1_000_000
        # Score: prefer long_enough, then smaller dur_penalty, then higher res
        score = (long_enough, -dur_penalty, res_score)
        if best_score is None or score > best_score:
            best = (v, variant)
            best_score = score

    if best is None:
        raise PexelsError(
            f"No usable mp4 variants in any of the {len(videos)} candidate videos"
        )
    return best


def download_video(url: str, output_path: str, timeout: int = 120) -> str:
    """Download a video file to a local path with streaming."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with httpx.stream("GET", url, timeout=timeout, follow_redirects=True) as r:
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=16384):
                f.write(chunk)
    return output_path


# =============================================================================
# ffmpeg: loop stock video + overlay TTS audio → panel clip
# =============================================================================

def overlay_audio_on_video(
    video_path: str,
    audio_path: str,
    output_path: str,
    target_duration: float,
    timeout: int = 240,
) -> str:
    """Loop the stock video as needed, trim to target_duration, replace
    its audio track with the TTS file, and write the canonical-format
    result. The stitcher's normalize pass will see an already-canonical
    clip and do a near-identity re-encode, which is still cheap.

    Key ffmpeg args:
      - ``-stream_loop -1 -i video``: loop the video indefinitely on
        read; the output ``-t target_duration`` cuts it at the right
        length without requiring keyframe alignment.
      - ``-i audio``: the OpenAI TTS mp3 (drives the panel's duration).
      - ``-map 0:v -map 1:a``: keep the video stream from input 0 and
        the audio stream from input 1 (discard the Pexels clip's own
        audio — most of them are silent anyway but some have ambient
        noise we don't want under our voiceover).
      - ``-vf scale+pad+fps+format``: force 1920x1080 yuv420p 25fps
        with aspect-preserving pad-to-fit. Any Pexels clip that's not
        native 16:9 gets pillarboxed with a black fill.
      - ``libx264 veryfast crf 20`` + ``aac 48k 192k`` to match the
        canonical format the stitcher wants.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-stream_loop", "-1",
        "-i", str(Path(video_path).resolve()),
        "-i", str(Path(audio_path).resolve()),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-t", f"{target_duration:.3f}",
        "-vf", (
            f"scale={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,"
            f"fps={CANONICAL_FPS},format=yuv420p"
        ),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-profile:v", "high",
        "-level", "4.0",
        "-c:a", "aac",
        "-ar", "48000",
        "-ac", "2",
        "-b:a", "192k",
        "-movflags", "+faststart",
        str(Path(output_path).resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg stock-video overlay failed:\n{result.stderr[-2000:]}"
        )
    return output_path


# =============================================================================
# End-to-end entry point
# =============================================================================

def create_stock_video_panel(
    visual_direction: list[str],
    audio_path: str,
    output_path: str,
    target_duration: float,
    llm_client: Optional[OpenAI] = None,
) -> dict:
    """End-to-end: visual direction → Pexels query → search → pick → download → overlay.

    Returns a dict with the chosen query, Pexels video id/url, and
    output path — useful to dump into the pipeline manifest.
    """
    query = generate_pexels_query(visual_direction, client=llm_client)
    print(f"    [stock] query: {query!r}")

    videos = search_pexels(query)
    chosen_video, chosen_variant = pick_best_video(videos, target_duration)
    print(
        f"    [stock] chose video id={chosen_video['id']} "
        f"duration={chosen_video['duration']}s "
        f"variant={chosen_variant['width']}x{chosen_variant['height']}"
    )

    # Download to a scratch path next to the final output
    scratch = Path(output_path).parent / f"_stock_source_{Path(output_path).stem}.mp4"
    download_video(chosen_variant["link"], str(scratch))

    try:
        overlay_audio_on_video(
            video_path=str(scratch),
            audio_path=audio_path,
            output_path=output_path,
            target_duration=target_duration,
        )
    finally:
        # Clean up the raw Pexels source so clips/ doesn't accumulate them
        try:
            scratch.unlink(missing_ok=True)
        except Exception:
            pass

    return {
        "query": query,
        "pexels_video_id": chosen_video["id"],
        "pexels_page_url": chosen_video.get("url"),
        "output_path": output_path,
        "duration": target_duration,
        "variant_size": f"{chosen_variant['width']}x{chosen_variant['height']}",
    }
