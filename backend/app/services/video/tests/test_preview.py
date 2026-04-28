"""
Tests for the composition-first video preview UI.
"""
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from video.preview import (
    TEMPLATE_PATH,
    build_video_model,
    build_voice_model,
    enrich_manifest,
    make_sample,
    write_preview,
)


def test_build_video_model_talking_head_uses_configured_avatar_id():
    panel_info = {
        "screen_type": "talking_head",
        "heygen_video_id": "abc123",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "HeyGen · Lisa_public"
    assert "Photo Avatar" in result["sublabel"]


def test_build_video_model_scene_screen_types_use_composition():
    panel_info = {
        "screen_type": "solid_bg",
        "composition": "single_center",
        "canvas_mode": "none",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "Remotion · single_center"
    assert result["sublabel"] == "none"


def test_build_video_model_stock_video_uses_pexels_fields():
    panel_info = {
        "screen_type": "stock_video",
        "pexels_video_id": 7890123,
        "pexels_query": "woman whiteboard presenting",
    }
    result = build_video_model(panel_info, config_avatar_id="Lisa_public")
    assert result["label"] == "Pexels · 7890123"
    assert result["sublabel"] == "woman whiteboard presenting"


def test_build_voice_model_uses_openai_provider_name():
    result = build_voice_model("alloy")
    assert result["label"] == "OpenAI tts-1-hd"
    assert result["sublabel"] == "alloy"


def _sample_raw_manifest() -> dict:
    return {
        "storyboard": "/some/path/storyboard.json",
        "panels": 4,
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
                "composition": "free_overlay",
                "canvas_mode": "full_bleed",
                "voiceover_words": 25,
                "heygen_video_id": "sample-1",
                "duration": 13.0,
            },
            {
                "panel_number": 2,
                "screen_type": "solid_bg",
                "composition": "single_center",
                "canvas_mode": "none",
                "voiceover_words": 10,
                "duration": 6.0,
            },
            {
                "panel_number": 3,
                "screen_type": "product_demo",
                "composition": "mosaic",
                "canvas_mode": "bounded",
                "voiceover_words": 18,
                "duration": 9.0,
            },
            {
                "panel_number": 4,
                "screen_type": "stock_video",
                "composition": "primary_with_sidecar",
                "canvas_mode": "floating",
                "voiceover_words": 30,
                "pexels_video_id": 9876543,
                "pexels_query": "coworkers whiteboard",
                "duration": 12.0,
            },
        ],
    }


def test_enrich_manifest_adds_top_level_and_panel_fields():
    manifest = _sample_raw_manifest()
    enrich_manifest(
        manifest,
        storyboard_title="Composition Storyboard",
        config_voice="alloy",
        config_avatar_id="Lisa_public",
    )
    assert manifest["storyboard_title"] == "Composition Storyboard"
    assert manifest["total_duration_seconds"] == 40.0
    assert manifest["final_video"] == "final.mp4"

    p1, p2, p3, p4 = manifest["per_panel"]
    assert p1["clip_path"] == "clips/panel_01.mp4"
    assert p2["video_model"]["label"] == "Remotion · single_center"
    assert p3["video_model"]["label"] == "Remotion · mosaic"
    assert p4["video_model"]["label"] == "Pexels · 9876543"
    assert p4["start_time_seconds"] == 28.0
    for panel in manifest["per_panel"]:
        assert panel["voice_model"] == {
            "label": "OpenAI tts-1-hd",
            "sublabel": "alloy",
        }


def test_template_file_exists_and_has_required_hooks():
    assert TEMPLATE_PATH.exists(), f"preview_template.html missing at {TEMPLATE_PATH}"
    content = TEMPLATE_PATH.read_text()
    assert "./manifest.json" in content
    for element_id in [
        "tiles",
        "video-player",
        "insp-title",
        "insp-video-label",
        "insp-voice-label",
        "insp-voiceover",
        "insp-on-screen",
        "timeline-meta",
        "page-title",
        "play-all",
    ]:
        assert f'id="{element_id}"' in content


def test_write_preview_copies_template_into_output_dir():
    with tempfile.TemporaryDirectory() as tmp:
        dest = write_preview(tmp)
        assert Path(dest) == Path(tmp) / "index.html"
        assert Path(dest).read_bytes() == TEMPLATE_PATH.read_bytes()


@patch("video.preview._generate_placeholder_mp4")
def test_make_sample_produces_expected_fixture(mock_gen_mp4):
    def fake_placeholder(path, duration_seconds=2.0, **_kwargs):
        Path(path).write_bytes(b"\x00")

    mock_gen_mp4.side_effect = fake_placeholder

    with tempfile.TemporaryDirectory() as tmp:
        index_path = make_sample(tmp)
        manifest = json.loads((Path(tmp) / "manifest.json").read_text())
        assert Path(index_path).name == "index.html"
        assert manifest["storyboard_title"] == "Composition Storyboard"
        assert len(manifest["per_panel"]) == 5
        screen_types = [panel["screen_type"] for panel in manifest["per_panel"]]
        assert screen_types == [
            "talking_head",
            "solid_bg",
            "stock_video",
            "product_demo",
            "solid_bg",
        ]
        assert (Path(tmp) / "placeholder.mp4").exists()
        assert (Path(tmp) / "final.mp4").exists()
        assert mock_gen_mp4.call_count == 2


def test_write_preview_raises_when_template_missing(monkeypatch):
    bogus = Path("/nonexistent/does/not/exist.html")
    monkeypatch.setattr("video.preview.TEMPLATE_PATH", bogus)
    with tempfile.TemporaryDirectory() as tmp:
        with pytest.raises(FileNotFoundError, match="preview template not found"):
            write_preview(tmp)
