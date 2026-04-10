import json
from unittest.mock import patch, MagicMock
from video.slides import map_visual_direction_to_props, VALID_TEMPLATES


def test_map_returns_valid_template():
    """Test that the LLM response is parsed and validated."""
    mock_llm_response = json.dumps({
        "template": "PyramidChart",
        "props": {
            "title": "Women in Tech Leadership",
            "levels": [
                {"label": "Entry Level", "percentage": 45},
                {"label": "C-Suite", "percentage": 22},
            ],
        },
        "animation": "stagger_fade_in",
    })

    with patch("video.slides.call_llm", return_value=mock_llm_response):
        result = map_visual_direction_to_props([
            "Pyramid diagram showing leadership levels",
            "Entry level 45% women",
            "C-suite 22% women",
        ])
        assert result["template"] == "PyramidChart"
        assert result["props"]["title"] == "Women in Tech Leadership"
        assert len(result["props"]["levels"]) == 2


def test_map_falls_back_to_datacard_on_invalid_template():
    """Test fallback when LLM returns unknown template."""
    mock_llm_response = json.dumps({
        "template": "NonExistentTemplate",
        "props": {"title": "Test"},
        "animation": "fade_in",
    })

    with patch("video.slides.call_llm", return_value=mock_llm_response):
        result = map_visual_direction_to_props(["Some visual direction"])
        assert result["template"] == "DataCard"


def test_valid_templates_list():
    assert "PyramidChart" in VALID_TEMPLATES
    assert "SplitComparison" in VALID_TEMPLATES
    assert "Timeline" in VALID_TEMPLATES
    assert "ThreeColumn" in VALID_TEMPLATES
    assert "DataCard" in VALID_TEMPLATES
    assert len(VALID_TEMPLATES) == 5
