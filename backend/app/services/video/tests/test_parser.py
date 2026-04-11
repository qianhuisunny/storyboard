from pathlib import Path
from video.models import ScreenType
from video.parser import parse_storyboard

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_storyboard_loads_panels():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    assert sb.title == "Video Storyboard"
    assert len(sb.panels) == 14
    # PDF revision dropped panels 7 and 8, so numbering is 1-6, 9-16
    panel_numbers = [p.panel_number for p in sb.panels]
    assert panel_numbers == [1, 2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16]


def test_parse_storyboard_splits_by_type():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    assert len(sb.talking_head_panels) == 5
    assert len(sb.slides_panels) == 9


def test_panel_fields_populated():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    panel = sb.panels[0]
    assert panel.screen_type == ScreenType.TALKING_HEAD
    assert panel.duration_seconds == 18.5
    assert "VP of Engineering" in panel.voiceover_script
    assert len(panel.visual_direction) == 4
    assert panel.audio_path is None
    assert panel.clip_path is None
