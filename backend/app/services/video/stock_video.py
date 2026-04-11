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

def _normalize_overlay_text(s: str) -> str:
    """Replace smart quotes / em-dashes with ASCII equivalents so they
    render cleanly in any font we fall back to. Pillow handles unicode
    directly but Helvetica.ttc on macOS doesn't always have glyphs for
    curly apostrophes or en/em-dashes, producing tofu boxes.
    """
    if s is None:
        return ""
    replacements = {
        "\u2018": "'",   # left single quote
        "\u2019": "'",   # right single quote
        "\u201C": '"',   # left double quote
        "\u201D": '"',   # right double quote
        "\u2013": "-",   # en dash
        "\u2014": "-",   # em dash
        "\u2026": "...", # ellipsis
    }
    for k, v in replacements.items():
        s = s.replace(k, v)
    return s


def _render_title_bar_png(
    title: str,
    subtitle: Optional[str],
    output_path: str,
    width: int = CANONICAL_WIDTH,
    bar_height: int = 160,
) -> str:
    """Render the title bar as a transparent PNG (black bar at 65%
    opacity + white title + optional muted subtitle), suitable for
    use as an ffmpeg overlay input.

    Why this instead of ffmpeg drawtext: the Homebrew ffmpeg build on
    this machine was compiled without ``--enable-libfreetype`` and has
    no drawtext filter. Pillow is already in the venv (rembg
    dependency) and supports full unicode + any system TTF font. The
    generated PNG composites cleanly via ffmpeg's ``overlay`` filter
    which IS available.
    """
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new(
        "RGBA",
        (width, bar_height),
        (0, 0, 0, int(255 * 0.65)),  # 65% opaque black bar
    )
    draw = ImageDraw.Draw(img)

    # Try a few likely system font paths. macOS ships Helvetica.ttc
    # at the first path on every machine I've tested. TTC files are
    # font collections — index=0 is Regular, index=1 is Bold on
    # Helvetica.ttc. We deliberately pick Bold for the title so it
    # has similar visual weight to the Remotion slide titles (56px
    # bold) and dominates the overlay bar. The subtitle stays regular.
    title_font = None
    subtitle_font = None
    for font_path in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/HelveticaNeue.ttc",
        "/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ):
        try:
            # index=1 is usually Bold for Helvetica.ttc / .ttf lookup
            # just uses the single face and ignores index.
            try:
                title_font = ImageFont.truetype(font_path, 52, index=1)
            except Exception:
                title_font = ImageFont.truetype(font_path, 52)
            subtitle_font = ImageFont.truetype(font_path, 26)
            break
        except Exception:
            continue
    if title_font is None:
        title_font = ImageFont.load_default()
        subtitle_font = ImageFont.load_default()

    title_clean = _normalize_overlay_text(title)
    # Center horizontally, 38 px from the top
    bbox = draw.textbbox((0, 0), title_clean, font=title_font)
    title_w = bbox[2] - bbox[0]
    draw.text(
        ((width - title_w) // 2, 34),
        title_clean,
        fill=(255, 255, 255, 255),
        font=title_font,
    )

    if subtitle:
        sub_clean = _normalize_overlay_text(subtitle)
        bbox = draw.textbbox((0, 0), sub_clean, font=subtitle_font)
        sub_w = bbox[2] - bbox[0]
        draw.text(
            ((width - sub_w) // 2, 100),
            sub_clean,
            fill=(221, 221, 221, 255),
            font=subtitle_font,
        )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(output_path, "PNG")
    return output_path


def overlay_audio_on_video(
    video_path: str,
    audio_path: str,
    output_path: str,
    target_duration: float,
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    timeout: int = 240,
) -> str:
    """Loop the stock video as needed, trim to target_duration, replace
    its audio track with the TTS file, optionally composite a title +
    subtitle overlay on top, and write the canonical-format result.

    Two code paths:
      - **No title**: simple ``-vf`` chain with scale + pad + fps +
        format. Single video input, single audio input, -map 0:v / 1:a.
      - **With title**: renders a transparent PNG title bar via Pillow
        (``_render_title_bar_png``), adds it as a third ffmpeg input,
        uses ``-filter_complex`` with an ``overlay`` filter to
        composite the PNG over the scaled video. We don't use
        ffmpeg's ``drawtext`` filter because the Homebrew ffmpeg
        build on this machine is missing ``--enable-libfreetype``.

    Key ffmpeg args:
      - ``-stream_loop -1 -i video``: loop the video indefinitely so
        short Pexels clips cover long panels.
      - ``-i audio``: the OpenAI TTS mp3 (drives the panel's duration).
      - ``-t target_duration``: hard cut at audio length.
      - ``libx264 veryfast crf 20`` + ``aac 48k 192k`` to match the
        canonical format the stitcher wants.
    """
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    title_png: Optional[Path] = None
    if title:
        # Stage the title PNG next to the output, clean up in finally
        title_png = (
            Path(output_path).parent / f"_title_{Path(output_path).stem}.png"
        )
        _render_title_bar_png(title, subtitle, str(title_png))

    # Build the command incrementally so the two code paths stay readable
    cmd: list[str] = [
        "ffmpeg",
        "-y",
        "-stream_loop", "-1",
        "-i", str(Path(video_path).resolve()),
        "-i", str(Path(audio_path).resolve()),
    ]

    if title_png is not None:
        cmd.extend(["-i", str(title_png.resolve())])
        # Scale/pad/fps/format, then overlay the title PNG at (0, 0)
        filter_complex = (
            f"[0:v]scale={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:"
            f"force_original_aspect_ratio=decrease,"
            f"pad={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,"
            f"fps={CANONICAL_FPS},format=yuv420p[scaled];"
            f"[scaled][2:v]overlay=0:0:format=auto,format=yuv420p[outv]"
        )
        cmd.extend([
            "-filter_complex", filter_complex,
            "-map", "[outv]",
            "-map", "1:a:0",
        ])
    else:
        # No overlay — plain scale/pad/fps/format and direct stream maps
        cmd.extend([
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-vf", (
                f"scale={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:"
                f"force_original_aspect_ratio=decrease,"
                f"pad={CANONICAL_WIDTH}:{CANONICAL_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,"
                f"fps={CANONICAL_FPS},format=yuv420p"
            ),
        ])

    cmd.extend([
        "-t", f"{target_duration:.3f}",
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
    ])

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg stock-video overlay failed:\n{result.stderr[-2000:]}"
            )
    finally:
        # Always clean up the title PNG so clips/ stays tidy between runs
        if title_png is not None:
            try:
                title_png.unlink(missing_ok=True)
            except Exception:
                pass

    return output_path


# =============================================================================
# End-to-end entry point
# =============================================================================

def create_stock_video_panel(
    visual_direction: list[str],
    audio_path: str,
    output_path: str,
    target_duration: float,
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    llm_client: Optional[OpenAI] = None,
) -> dict:
    """End-to-end: visual direction → Pexels query → search → pick → download → overlay.

    Args:
        title: Optional title text to draw onto the stock footage as a
            framing overlay (e.g. "Career decisions no male mentor has
            navigated"). Drawn in a semi-transparent black bar at the
            top of the frame.
        subtitle: Optional smaller subtitle line under the title.

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
    if title:
        print(f"    [stock] overlay title: {title!r}")

    # Download to a scratch path next to the final output
    scratch = Path(output_path).parent / f"_stock_source_{Path(output_path).stem}.mp4"
    download_video(chosen_variant["link"], str(scratch))

    try:
        overlay_audio_on_video(
            video_path=str(scratch),
            audio_path=audio_path,
            output_path=output_path,
            target_duration=target_duration,
            title=title,
            subtitle=subtitle,
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
        "title_overlay": title,
        "subtitle_overlay": subtitle,
    }
