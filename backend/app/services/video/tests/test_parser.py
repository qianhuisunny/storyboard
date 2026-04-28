from pathlib import Path

from video.models import CanvasMode, Composition, ScreenType
from video.parser import parse_storyboard

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_storyboard_loads_composition_panels():
    sb = parse_storyboard(str(FIXTURES / "sample_composition_storyboard.json"))
    assert sb.title == "Composition Storyboard"
    assert len(sb.panels) == 5
    assert [panel.panel_number for panel in sb.panels] == [1, 2, 3, 4, 5]


def test_parse_storyboard_splits_by_new_screen_types():
    sb = parse_storyboard(str(FIXTURES / "sample_composition_storyboard.json"))
    assert len(sb.talking_head_panels) == 1
    assert len(sb.stock_video_panels) == 1
    assert len(sb.product_demo_panels) == 1
    assert len(sb.solid_bg_panels) == 2


def test_panel_fields_populated():
    sb = parse_storyboard(str(FIXTURES / "sample_composition_storyboard.json"))
    panel = sb.panels[0]
    assert panel.screen_type == ScreenType.TALKING_HEAD
    assert panel.composition == Composition.FREE_OVERLAY
    assert panel.canvas_mode == CanvasMode.FULL_BLEED
    assert panel.duration_seconds == 8.0
    assert "employees" in panel.voiceover_script
    assert panel.overlay_elements[0]["kind"] == "stat"
    assert len(panel.design_brief) == 3
    assert panel.audio_path is None
    assert panel.clip_path is None
