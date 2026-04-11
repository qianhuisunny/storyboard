"""
Tests for the video pipeline preview UI.

The preview module has three main responsibilities we care about:
  1. Computing provider-named ``{label, sublabel}`` dicts from a raw
     per_panel manifest entry (``build_video_model``, ``build_voice_model``).
  2. Enriching a full manifest dict with UI fields additively, without
     dropping or renaming existing keys (``enrich_manifest``).
  3. Copying the static HTML template next to the manifest
     (``write_preview``) and generating a sample fixture without any real
     pipeline run (``make_sample``).
"""
import json
import os
import shutil
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from video.preview import (
    build_video_model,
    build_voice_model,
    enrich_manifest,
    write_preview,
    make_sample,
    TEMPLATE_PATH,
)


# ---------------------------------------------------------------------------
# build_video_model — per screen type
# ---------------------------------------------------------------------------


def test_build_video_model_talking_head_uses_configured_avatar_id():
    panel_info = {
        "screen_type": "talking_head",
        "heygen_video_id": "abc123",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "HeyGen · Lisa_public"
    assert "Photo Avatar" in result["sublabel"]
    # The sublabel should NOT leak the opaque heygen_video_id — that's
    # audit data, not something the inspector should present as the
    # "model name".
    assert "abc123" not in result["label"]
    assert "abc123" not in result["sublabel"]


def test_build_video_model_slides_uses_remotion_template():
    panel_info = {
        "screen_type": "slides",
        "template": "SplitComparison",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "Remotion · SplitComparison"
    assert "react" in result["sublabel"].lower()


def test_build_video_model_slides_missing_template_falls_back():
    """If the pipeline entry is missing ``template`` for some reason,
    the label must still render — not KeyError."""
    panel_info = {"screen_type": "slides"}
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert "Remotion" in result["label"]
    assert "unknown" in result["label"].lower()


def test_build_video_model_stock_video_uses_pexels_fields():
    panel_info = {
        "screen_type": "stock_video",
        "pexels_video_id": 7890123,
        "pexels_query": "woman whiteboard presenting",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "Pexels · 7890123"
    assert result["sublabel"] == "woman whiteboard presenting"


def test_build_video_model_unknown_screen_type_does_not_crash():
    panel_info = {"screen_type": "mystery"}
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    # Should return SOMETHING with the required keys, not KeyError.
    assert "label" in result
    assert "sublabel" in result


# ---------------------------------------------------------------------------
# build_voice_model — always OpenAI tts-1-hd
# ---------------------------------------------------------------------------


def test_build_voice_model_uses_openai_provider_name():
    result = build_voice_model("alloy")
    assert result["label"] == "OpenAI tts-1-hd"
    assert result["sublabel"] == "alloy"


def test_build_voice_model_passes_through_any_voice_variant():
    result = build_voice_model("nova")
    assert result["sublabel"] == "nova"


# ---------------------------------------------------------------------------
# enrich_manifest — additive, idempotent, computes totals
# ---------------------------------------------------------------------------


def _sample_raw_manifest() -> dict:
    """Manifest shaped exactly like what pipeline.run_pipeline produces."""
    return {
        "storyboard": "/some/path/storyboard.json",
        "panels": 3,
        "output": "/out/final.mp4",
        "elapsed_seconds": 42.3,
        "config": {
            "voice": "alloy",
            "heygen_avatar_id": "Lisa_public",
            "heygen_avatar_style": "normal",
        },
        "per_panel": [
            {
                "panel_number": 1,
                "screen_type": "talking_head",
                "voiceover_words": 25,
                "heygen_video_id": "sample-1",
                "duration": 13.0,
            },
            {
                "panel_number": 2,
                "screen_type": "slides",
                "voiceover_words": 40,
                "template": "PyramidChart",
                "duration": 17.5,
            },
            {
                "panel_number": 3,
                "screen_type": "stock_video",
                "voiceover_words": 30,
                "pexels_video_id": 9876543,
                "pexels_query": "coworkers whiteboard",
                "duration": 12.0,
            },
        ],
    }


def test_enrich_manifest_is_additive_does_not_drop_existing_fields():
    manifest = _sample_raw_manifest()
    original_config = manifest["config"]
    enrich_manifest(
        manifest,
        storyboard_title="The Only Woman",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    # Original top-level keys still there
    assert manifest["storyboard"] == "/some/path/storyboard.json"
    assert manifest["output"] == "/out/final.mp4"
    assert manifest["config"] is original_config
    # Original per-panel keys still there
    assert manifest["per_panel"][0]["heygen_video_id"] == "sample-1"
    assert manifest["per_panel"][1]["template"] == "PyramidChart"
    assert manifest["per_panel"][2]["pexels_video_id"] == 9876543


def test_enrich_manifest_adds_top_level_fields():
    manifest = _sample_raw_manifest()
    enrich_manifest(
        manifest,
        storyboard_title="The Only Woman",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    assert manifest["storyboard_title"] == "The Only Woman"
    # Total duration = 13.0 + 17.5 + 12.0 = 42.5
    assert manifest["total_duration_seconds"] == 42.5
    # UI default: the full-video player loads ./final.mp4
    assert manifest["final_video"] == "final.mp4"


def test_enrich_manifest_computes_running_start_time_seconds():
    """Each panel must know where it starts inside final.mp4 so clicking
    a tile can seek the full-video player to that panel's beginning.
    Panel 1 starts at 0.0; each subsequent panel's start is the cumulative
    sum of the preceding panels' durations."""
    manifest = _sample_raw_manifest()
    enrich_manifest(
        manifest,
        storyboard_title="x",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    p1, p2, p3 = manifest["per_panel"]
    assert p1["start_time_seconds"] == 0.0
    # p2 starts after p1 (13.0s)
    assert p2["start_time_seconds"] == 13.0
    # p3 starts after p1 + p2 (13.0 + 17.5 = 30.5)
    assert p3["start_time_seconds"] == 30.5


def test_enrich_manifest_adds_clip_path_video_voice_to_each_panel():
    manifest = _sample_raw_manifest()
    enrich_manifest(
        manifest,
        storyboard_title="x",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    p1, p2, p3 = manifest["per_panel"]

    # Clip paths are relative and zero-padded to 2 digits
    assert p1["clip_path"] == "clips/panel_01.mp4"
    assert p2["clip_path"] == "clips/panel_02.mp4"
    assert p3["clip_path"] == "clips/panel_03.mp4"

    # Video model reflects provider + screen-type-specific naming
    assert p1["video_model"]["label"] == "HeyGen · Lisa_public"
    assert p2["video_model"]["label"] == "Remotion · PyramidChart"
    assert p3["video_model"]["label"] == "Pexels · 9876543"

    # Voice model is always OpenAI + configured voice variant
    for panel in manifest["per_panel"]:
        assert panel["voice_model"] == {
            "label": "OpenAI tts-1-hd",
            "sublabel": "alloy",
        }

    # Duration_seconds is a numeric float copy of the existing ``duration``
    assert p1["duration_seconds"] == 13.0
    assert p2["duration_seconds"] == 17.5
    assert p3["duration_seconds"] == 12.0


def test_enrich_manifest_tolerates_panel_with_missing_duration():
    """Talking-head panels with ``skipped: true`` skip the HeyGen call and
    never get a ``duration`` field. enrich_manifest must not crash — it
    should record 0.0 for duration_seconds, keep the running start time
    stable (so later panels still line up), and move on."""
    manifest = _sample_raw_manifest()
    manifest["per_panel"][0] = {
        "panel_number": 1,
        "screen_type": "talking_head",
        "voiceover_words": 25,
        "skipped": True,
        # no 'duration' key
    }
    enrich_manifest(
        manifest,
        storyboard_title="x",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    p1, p2, p3 = manifest["per_panel"]
    assert p1["duration_seconds"] == 0.0
    assert p1["start_time_seconds"] == 0.0
    # Panel 2 still starts at 0 since p1 contributed no duration
    assert p2["start_time_seconds"] == 0.0
    # Panel 3 starts after p2 (17.5s)
    assert p3["start_time_seconds"] == 17.5
    # Total is 0 + 17.5 + 12.0
    assert manifest["total_duration_seconds"] == 29.5


# ---------------------------------------------------------------------------
# write_preview — template copy
# ---------------------------------------------------------------------------


def test_template_file_exists_and_has_required_hooks():
    """The HTML template file must ship with the preview module and
    contain the DOM hooks the JS depends on. This guards against someone
    renaming an element ID without updating the handlers below."""
    assert TEMPLATE_PATH.exists(), (
        f"preview_template.html missing at {TEMPLATE_PATH}"
    )
    content = TEMPLATE_PATH.read_text()
    # JS fetches manifest.json relative to the HTML location
    assert "./manifest.json" in content
    # Key element IDs the init() script targets
    for element_id in [
        "tiles",
        "video-player",
        "insp-title",
        "insp-video-label",
        "insp-voice-label",
        "timeline-meta",
        "crumb-title",
        "play-all",
    ]:
        assert f'id="{element_id}"' in content, f"missing element id={element_id!r}"
    # Sage tokens from the Plotline design system must be present inline
    assert "--sage-8" in content
    assert "Fraunces" in content
    # The full/clip mode toggle needs both the default fallback src AND
    # the timeupdate handler that auto-advances the active tile in full mode.
    assert "./final.mp4" in content
    assert "timeupdate" in content
    assert "start_time_seconds" in content


def test_write_preview_copies_template_into_output_dir():
    with tempfile.TemporaryDirectory() as tmp:
        dest = write_preview(tmp)
        assert Path(dest) == Path(tmp) / "index.html"
        assert Path(dest).exists()
        # Byte-for-byte equal to the template
        assert Path(dest).read_bytes() == TEMPLATE_PATH.read_bytes()


def test_write_preview_creates_output_dir_if_missing():
    with tempfile.TemporaryDirectory() as tmp:
        nested = os.path.join(tmp, "a", "b", "c")
        assert not os.path.exists(nested)
        dest = write_preview(nested)
        assert Path(dest).exists()


def test_write_preview_raises_when_template_missing(monkeypatch):
    """Guards against a refactor that moves or deletes the template."""
    bogus = Path("/nonexistent/does/not/exist.html")
    monkeypatch.setattr("video.preview.TEMPLATE_PATH", bogus)
    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(FileNotFoundError, match="preview template not found"):
            write_preview(tmp)


# ---------------------------------------------------------------------------
# make_sample — end-to-end fixture generator (with ffmpeg mocked out)
# ---------------------------------------------------------------------------


@patch("video.preview._generate_placeholder_mp4")
def test_make_sample_produces_all_expected_files(mock_gen_mp4):
    """The whole sample should be inspectable without calling ffmpeg:
    manifest, index.html, final.mp4, placeholder.mp4, and
    clips/panel_01.mp4..panel_16.mp4."""

    def fake_placeholder(path, duration_seconds=2.0, **_kwargs):
        # Write a non-empty placeholder file so the symlinks have a target
        Path(path).write_bytes(b"\x00")

    mock_gen_mp4.side_effect = fake_placeholder

    with tempfile.TemporaryDirectory() as tmp:
        index_path = make_sample(tmp)

        # 1. index.html exists and equals the template
        assert Path(index_path).name == "index.html"
        assert Path(index_path).read_bytes() == TEMPLATE_PATH.read_bytes()

        # 2. manifest.json parses and has enriched fields
        manifest = json.loads((Path(tmp) / "manifest.json").read_text())
        assert manifest["storyboard_title"]
        assert "total_duration_seconds" in manifest
        assert manifest["final_video"] == "final.mp4"
        per_panel = manifest["per_panel"]
        assert len(per_panel) == 16
        for panel in per_panel:
            assert "clip_path" in panel
            assert "video_model" in panel
            assert "voice_model" in panel
            assert "start_time_seconds" in panel
            assert panel["voice_model"]["label"] == "OpenAI tts-1-hd"

        # 3. Every panel has a clip file reachable at the clip_path the
        # manifest claims. The path is relative to the fixture dir.
        for panel in per_panel:
            full = Path(tmp) / panel["clip_path"]
            # Either a real file or a symlink that resolves to one
            assert full.exists() or full.is_symlink(), (
                f"missing clip file {full}"
            )

        # 4. Both the clip placeholder AND the long final.mp4 exist.
        assert (Path(tmp) / "placeholder.mp4").exists()
        assert (Path(tmp) / "final.mp4").exists()

        # 5. ffmpeg was called twice — once for the clip placeholder and
        # once for the long final.mp4 stitched-video stand-in.
        assert mock_gen_mp4.call_count == 2


@patch("video.preview._generate_placeholder_mp4")
def test_make_sample_is_idempotent(mock_gen_mp4):
    """Running sample twice into the same dir must not error on existing
    symlinks/files. The user may regenerate the fixture after a template
    change."""

    def fake_placeholder(path, duration_seconds=2.0, **_kwargs):
        Path(path).write_bytes(b"\x00")

    mock_gen_mp4.side_effect = fake_placeholder

    with tempfile.TemporaryDirectory() as tmp:
        make_sample(tmp)
        make_sample(tmp)  # second run must not raise
        # Everything is still in place
        assert (Path(tmp) / "index.html").exists()
        assert (Path(tmp) / "manifest.json").exists()
        assert (Path(tmp) / "final.mp4").exists()
        assert (Path(tmp) / "clips" / "panel_01.mp4").exists() or (
            Path(tmp) / "clips" / "panel_01.mp4"
        ).is_symlink()
