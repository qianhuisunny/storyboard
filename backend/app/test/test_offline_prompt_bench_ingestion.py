"""Tests for gold set ingestion helpers."""
import pytest


def test_strip_sponsor_sections():
    from app.services.offline_prompt_bench_gold import _strip_sponsor_sections

    outline = [
        {"section_number": 1, "purpose": "Introduce topic", "duration_sec": 60},
        {"section_number": 2, "purpose": "Main content", "duration_sec": 120},
        {"section_number": 3, "purpose": "Sponsor integration and pitch", "duration_sec": 45},
        {"section_number": 4, "purpose": "Conclusion", "duration_sec": 30},
    ]
    storyboard = [
        {"screen_number": 1, "section_number": 1, "voiceover_text": "hello"},
        {"screen_number": 2, "section_number": 2, "voiceover_text": "content"},
        {"screen_number": 3, "section_number": 3, "voiceover_text": "sponsor"},
        {"screen_number": 4, "section_number": 4, "voiceover_text": "bye"},
    ]
    new_outline, new_sb = _strip_sponsor_sections(outline, storyboard)
    assert len(new_outline) == 3
    assert all(s["purpose"] != "Sponsor integration and pitch" for s in new_outline)
    assert len(new_sb) == 3
    # Check renumbered
    assert [s["section_number"] for s in new_outline] == [1, 2, 3]
    assert [s["screen_number"] for s in new_sb] == [1, 2, 3]


def test_strip_sponsor_cta_keywords():
    from app.services.offline_prompt_bench_gold import _strip_sponsor_sections

    cases = [
        {"section_number": 1, "purpose": "CTA and call to action", "duration_sec": 20},
        {"section_number": 2, "purpose": "Ad placement for NordVPN", "duration_sec": 30},
        {"section_number": 3, "purpose": "Real content here", "duration_sec": 60},
    ]
    result, _ = _strip_sponsor_sections(cases, [])
    assert len(result) == 1
    assert result[0]["purpose"] == "Real content here"


def test_auto_compute_meta_short_linear_story():
    from app.services.offline_prompt_bench_gold import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "The Max Planck Story",
            "purpose": "Introduce through a narrative anecdote",
            "entry_assumption": "Viewer wants tips",
            "exit_state": "Viewer curious",
        },
        {
            "section_number": 2,
            "section_title": "The Technique",
            "purpose": "Explain method",
            "entry_assumption": "Viewer curious from story",
            "exit_state": "Viewer knows steps",
        },
    ]
    meta = auto_compute_meta(outline, 300)
    assert meta["duration_bucket"] == "short"
    assert meta["narrative_opening"] == "story_hook"


def test_auto_compute_meta_medium_problem():
    from app.services.offline_prompt_bench_gold import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "The Problem with SEO",
            "purpose": "Present the challenge most beginners face",
            "entry_assumption": "...",
            "exit_state": "...",
        },
    ]
    meta = auto_compute_meta(outline, 800)
    assert meta["duration_bucket"] == "medium"
    assert meta["narrative_opening"] == "problem_statement"


def test_auto_compute_meta_long_direct():
    from app.services.offline_prompt_bench_gold import auto_compute_meta

    outline = [
        {
            "section_number": 1,
            "section_title": "Introduction to Productivity Systems",
            "purpose": "Framework overview",
            "entry_assumption": "...",
            "exit_state": "...",
        },
    ]
    meta = auto_compute_meta(outline, 1500)
    assert meta["duration_bucket"] == "long"
    assert meta["narrative_opening"] == "direct_framework"


def test_slugify():
    from app.services.offline_prompt_bench_gold import _slugify

    assert _slugify("How to Study Way More Effectively | The Feynman Technique") == "how_to_study_way_more_effectively_the_feynman_technique"
    assert _slugify("Ali Abdaal's Top 10 Tips!") == "ali_abdaals_top_10_tips"
    assert _slugify("  spaces  and---dashes  ") == "spaces_and_dashes"
