"""
Video pipeline preview UI.

Writes a self-contained clickable HTML inspector (``index.html``) next to
the pipeline's ``manifest.json`` and ``clips/`` directory. Each pipeline
run becomes a browseable per-panel preview:

- One tile per raw pre-stitch clip, tile width proportional to duration
- Click a tile → the center <video> element swaps ``src`` to that clip
- Right sidebar shows Video model + Voice model in provider naming

The HTML is static — no templating is done on the Python side. The
template at ``preview_template.html`` fetches ``./manifest.json`` on load
via JS, so the same template file serves every pipeline run as long as
``enrich_manifest`` has been called to add the UI-required fields.

See docs/superpowers/specs/2026-04-10-video-pipeline-ui-design.md.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .parser import parse_storyboard
from .models import ScreenType

# Template lives next to this module. No search path — we want an import
# error or FileNotFoundError immediately if the template is missing.
TEMPLATE_PATH = Path(__file__).parent / "preview_template.html"


# =============================================================================
# Manifest enrichment
# =============================================================================

def build_video_model(
    panel_info: dict[str, Any],
    config_avatar_id: str,
) -> dict[str, str]:
    """Compute ``{label, sublabel}`` for the inspector's Video model row.

    Reads screen-type-specific fields from the ``panel_info`` dict that
    ``pipeline.run_pipeline`` builds per panel:

    - talking_head  → heygen_video_id, heygen_audio_url (label is the
      configured avatar, since the video_id is opaque and changes per run)
    - slides        → template
    - stock_video   → pexels_video_id, pexels_query

    The label is the primary line in the inspector; sublabel is the
    smaller muted line underneath.
    """
    screen_type = panel_info.get("screen_type")

    if screen_type == ScreenType.TALKING_HEAD.value:
        return {
            "label": f"HeyGen · {config_avatar_id}",
            "sublabel": "Photo Avatar · audio-driven",
        }
    if screen_type == ScreenType.SLIDES.value:
        template = panel_info.get("template") or "unknown"
        return {
            "label": f"Remotion · {template}",
            "sublabel": "local react renderer",
        }
    if screen_type == ScreenType.STOCK_VIDEO.value:
        pexels_id = panel_info.get("pexels_video_id") or "unknown"
        query = panel_info.get("pexels_query") or ""
        return {
            "label": f"Pexels · {pexels_id}",
            "sublabel": query,
        }
    return {
        "label": f"Unknown ({screen_type})",
        "sublabel": "",
    }


def build_voice_model(config_voice: str) -> dict[str, str]:
    """Voice model row — same provider for every panel in the current
    pipeline (OpenAI TTS unifies talking-head and slide narration)."""
    return {
        "label": "OpenAI tts-1-hd",
        "sublabel": config_voice,
    }


def enrich_manifest(
    manifest: dict[str, Any],
    storyboard_title: str,
    config_voice: str,
    config_avatar_id: str,
) -> dict[str, Any]:
    """Mutate ``manifest`` in place with UI-required fields.

    Additive only — never renames or drops existing keys, so callers that
    already consume ``manifest.per_panel[i].template`` or ``.pexels_query``
    keep working.

    New top-level keys:
      - ``storyboard_title``     — string from the parsed storyboard
      - ``total_duration_seconds`` — sum of per-panel durations, rounded 0.1s

    New per-panel keys (in each entry of ``manifest["per_panel"]``):
      - ``clip_path``            — relative path like ``"clips/panel_04.mp4"``
      - ``video_model``          — ``{label, sublabel}`` dict
      - ``voice_model``          — ``{label, sublabel}`` dict
      - ``duration_seconds``     — float, copied from the existing
                                   ``duration`` field or 0.0 if missing
    """
    manifest["storyboard_title"] = storyboard_title
    voice_model = build_voice_model(config_voice)

    # The UI loads final.mp4 once and seeks via start_time_seconds — so we
    # compute the running cumulative sum here, which is the sum of durations
    # of all earlier panels. Panel 1 starts at 0.0; Panel 2 at panel_1.duration;
    # etc. Rounded to 2 decimal places to avoid browser seek precision issues.
    running = 0.0
    for panel_info in manifest.get("per_panel", []):
        panel_number = int(panel_info["panel_number"])
        panel_info["clip_path"] = f"clips/panel_{panel_number:02d}.mp4"
        panel_info["video_model"] = build_video_model(panel_info, config_avatar_id)
        panel_info["voice_model"] = voice_model

        panel_info["start_time_seconds"] = round(running, 2)

        duration = panel_info.get("duration")
        if duration is not None:
            duration_float = float(duration)
            panel_info["duration_seconds"] = duration_float
            running += duration_float
        else:
            panel_info["duration_seconds"] = 0.0

    manifest["total_duration_seconds"] = round(running, 1)
    manifest["final_video"] = "final.mp4"
    return manifest


# =============================================================================
# Template copy
# =============================================================================

def write_preview(output_dir: str) -> str:
    """Copy ``preview_template.html`` to ``{output_dir}/index.html``.

    Caller is responsible for having already written a manifest.json with
    enriched fields into ``output_dir``. The template is static — it
    fetches ``./manifest.json`` at browser load time.

    Returns the path to the written file.
    """
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(
            f"preview template not found at {TEMPLATE_PATH}. "
            f"Make sure preview_template.html is committed next to preview.py."
        )
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    dest = Path(output_dir) / "index.html"
    shutil.copyfile(TEMPLATE_PATH, dest)
    return str(dest)


# =============================================================================
# Sample fixture generator — for previewing the UI without paying HeyGen
# =============================================================================

_SAMPLE_SLIDE_TEMPLATES = [
    "DataCard",
    "SplitComparison",
    "PyramidChart",
    "ThreeColumn",
    "Timeline",
]


def _generate_placeholder_mp4(
    dest_path: str,
    duration_seconds: float = 2.0,
    resolution: str = "640x360",
    preset: str = "ultrafast",
) -> None:
    """Generate a dark video + silent audio via ffmpeg.

    Used by ``make_sample`` so the preview's <video> elements have
    something to load instead of 404'ing. 640x360 + ultrafast keeps the
    long (~300s) final-video placeholder generation under 10 seconds on
    a modern Mac, while the browser upscales the output to the player
    area without visible artifacts for a solid-color frame.
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"color=c=0x1C2118:s={resolution}:d={duration_seconds}",
        "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=stereo",
        "-c:v", "libx264",
        "-t", str(duration_seconds),
        "-pix_fmt", "yuv420p",
        "-preset", preset,
        "-c:a", "aac",
        "-shortest",
        str(Path(dest_path).resolve()),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(
            f"ffmpeg placeholder generation failed:\n{result.stderr[-2000:]}"
        )


def _build_sample_panel_info(panel, slide_idx_counter: list[int]) -> dict[str, Any]:
    """Build a faked-up per_panel entry for a single storyboard Panel.

    We don't hit any external API — the goal is a manifest that looks
    plausible enough that the preview UI renders all field types. Slides
    panels rotate through the 5 Remotion templates; stock_video panels get
    fake Pexels IDs; talking_head panels get a fake HeyGen video_id.
    """
    base = {
        "panel_number": panel.panel_number,
        "screen_type": panel.screen_type.value,
        "voiceover_words": len(panel.voiceover_script.split()),
        "duration": panel.duration_seconds,
    }

    if panel.screen_type == ScreenType.TALKING_HEAD:
        base.update({
            "heygen_video_id": f"sample-heygen-{panel.panel_number:02d}",
            "heygen_audio_url": "https://example.invalid/sample-audio.mp3",
        })
    elif panel.screen_type == ScreenType.SLIDES:
        template = _SAMPLE_SLIDE_TEMPLATES[slide_idx_counter[0] % len(_SAMPLE_SLIDE_TEMPLATES)]
        slide_idx_counter[0] += 1
        base.update({"template": template})
    elif panel.screen_type == ScreenType.STOCK_VIDEO:
        base.update({
            "pexels_query": "sample footage placeholder",
            "pexels_video_id": 12345000 + panel.panel_number,
            "pexels_page_url": f"https://www.pexels.com/video/{12345000 + panel.panel_number}/",
            "pexels_variant_size": "1920x1080",
        })
    return base


def make_sample(target_dir: str) -> str:
    """Build a hand-crafted preview fixture at ``target_dir``.

    Creates::

        target_dir/
        ├── manifest.json          (enriched, ready for the UI to fetch)
        ├── index.html             (copy of preview_template.html)
        ├── placeholder.mp4        (dark clip — target_dir/clips/* symlink to this)
        ├── final.mp4              (~300s dark clip — the "stitched" full video)
        └── clips/
            ├── panel_01.mp4       (symlink to ../placeholder.mp4)
            ├── ...
            └── panel_16.mp4

    Two placeholders are generated so the preview UI's two playback modes
    both work in the sample:
      - Full-video mode (default on page load): plays ``final.mp4``, a
        long enough placeholder (~301s) that seeks through the timeline
        resolve to real video data.
      - Single-clip mode (on tile click): swaps to ``clips/panel_XX.mp4``,
        which all symlink to a ~21s placeholder (longer than any real
        panel in the fixture, so clip playback works for any tile).

    Uses the fixture storyboard at
    ``tests/fixtures/sample_storyboard.json``. Zero API calls.

    Returns the path to the written index.html.
    """
    fixture_path = Path(__file__).parent / "tests" / "fixtures" / "sample_storyboard.json"
    if not fixture_path.exists():
        raise FileNotFoundError(f"sample fixture missing: {fixture_path}")

    storyboard = parse_storyboard(str(fixture_path))

    target = Path(target_dir)
    clips_dir = target / "clips"
    target.mkdir(parents=True, exist_ok=True)
    clips_dir.mkdir(parents=True, exist_ok=True)

    # Total running duration of the storyboard — we make final.mp4 slightly
    # longer so seeks at the very end still land inside the video.
    total_duration = sum(p.duration_seconds for p in storyboard.panels)
    final_duration = round(total_duration + 2.0, 0)

    # Longest single-panel duration — clips/ placeholder must be >= this so
    # single-clip playback has enough frames for any tile the user clicks.
    max_panel_duration = max((p.duration_seconds for p in storyboard.panels), default=2.0)
    clip_placeholder_duration = round(max_panel_duration + 2.0, 0)

    # 1a. Short placeholder (for clips/* symlinks) — matches the longest
    # single panel + a 2s safety margin.
    placeholder_path = target / "placeholder.mp4"
    _generate_placeholder_mp4(
        str(placeholder_path),
        duration_seconds=clip_placeholder_duration,
    )

    # 1b. Long placeholder as final.mp4 — the full "stitched" video for
    # default playback mode. Regenerated from scratch each run (idempotent:
    # ffmpeg -y overwrites the existing file).
    final_path = target / "final.mp4"
    # Drop any symlink/file left over from a previous sample so ffmpeg
    # writes a fresh real file.
    if final_path.is_symlink() or final_path.exists():
        final_path.unlink()
    _generate_placeholder_mp4(
        str(final_path),
        duration_seconds=final_duration,
    )

    # 2. One symlink (or copy on fallback) per panel pointing at the clip
    # placeholder. Relative symlinks keep the fixture dir portable.
    for panel in storyboard.panels:
        link_path = clips_dir / f"panel_{panel.panel_number:02d}.mp4"
        if link_path.exists() or link_path.is_symlink():
            link_path.unlink()
        try:
            link_path.symlink_to(Path("..") / "placeholder.mp4")
        except OSError:
            shutil.copyfile(placeholder_path, link_path)

    # 3. Build a fake per_panel list and wrap it in a manifest dict that
    # mirrors what pipeline.run_pipeline produces.
    slide_idx_counter = [0]  # mutable box so _build_sample_panel_info can bump it
    per_panel = [_build_sample_panel_info(p, slide_idx_counter) for p in storyboard.panels]

    manifest: dict[str, Any] = {
        "storyboard": str(fixture_path),
        "panels": len(storyboard.panels),
        "output": "final.mp4",
        "elapsed_seconds": 0.0,
        "config": {
            "voice": "alloy",
            "heygen_avatar_id": "Lisa_public",
            "heygen_avatar_style": "normal",
        },
        "per_panel": per_panel,
    }

    enrich_manifest(
        manifest,
        storyboard_title=storyboard.title,
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )

    manifest_path = target / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    # 4. Copy the HTML template in
    index_path = write_preview(str(target))
    return index_path
