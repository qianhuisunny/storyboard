from pathlib import Path
from video.models import ScreenType
from video.parser import parse_storyboard

FIXTURES = Path(__file__).parent / "fixtures"


def test_parse_storyboard_loads_panels():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    assert sb.title == "Video Storyboard"
    assert len(sb.panels) == 16
    # Fixture was restructured 2026-04-10 for unit economics: panels are now
    # numbered sequentially 1-16 (previously 1-6, 9-16 to mirror the source
    # PDF's gaps — that's no longer useful since panels got split/merged).
    panel_numbers = [p.panel_number for p in sb.panels]
    assert panel_numbers == list(range(1, 17))


def test_parse_storyboard_splits_by_type():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    # Three short talking-head moments — opening hook, emphasis beat,
    # CTA hook — total ~28s. Four stock_video panels: #4 and #6 from
    # the original PDF "Stock video" labels, plus #7 (career decisions
    # timeline) and #11 (networks+access synthesis) which got converted
    # from slides to stock_video+text_overlay for visual variety.
    # Everything else is slides. Mix is chosen to fit the $1.50/5min
    # unit-economics target.
    assert len(sb.talking_head_panels) == 3
    assert len(sb.slides_panels) == 9
    assert len(sb.stock_video_panels) == 4
    assert [p.panel_number for p in sb.talking_head_panels] == [1, 5, 15]
    assert [p.panel_number for p in sb.stock_video_panels] == [4, 6, 7, 11]
    # Full coverage: every panel should be in exactly one category
    assert (
        len(sb.talking_head_panels)
        + len(sb.slides_panels)
        + len(sb.stock_video_panels)
        == len(sb.panels)
    )


def test_panel_fields_populated():
    sb = parse_storyboard(str(FIXTURES / "sample_storyboard.json"))
    panel = sb.panels[0]
    assert panel.screen_type == ScreenType.TALKING_HEAD
    assert panel.duration_seconds == 13.0
    assert "VP of Engineering" in panel.voiceover_script
    # New Panel 1 ends at "you're the only woman" — the stat ("38% of
    # senior-level women...") moved to slides in Panel 2.
    assert "the only woman" in panel.voiceover_script
    assert "38%" not in panel.voiceover_script
    assert len(panel.visual_direction) == 4
    assert panel.audio_path is None
    assert panel.clip_path is None
