from types import SimpleNamespace

import pytest

from app.services.agents.duration_calculator import DurationCalculator
from app.services.agents.storyboard_writer import StoryboardWriter


VALID_OUTLINE = """Section 1 — Closing

Purpose
Land the ending with one concrete next step.

Entry assumption
Viewer understands the core idea.

Exit state
Viewer knows exactly what to try next.

Duration
7

Talking points
- Apply the framework once today.
"""


def _make_screen(voiceover_text: str) -> dict:
    return {
        "screen_number": 1,
        "section_number": 1,
        "section_title": "Closing",
        "screen_type": "slides",
        "voiceover_text": voiceover_text,
        "visual_direction": ["Checklist", "One highlighted next step"],
        "action_notes": "Wrap with a practical action.",
    }


def test_validate_outline_contract_rejects_invalid_duration():
    writer = StoryboardWriter()
    invalid_outline = VALID_OUTLINE.replace("7", "roughly a minute or so")

    with pytest.raises(ValueError, match="invalid Duration value"):
        writer.validate_outline_contract(invalid_outline)


def test_validate_outline_contract_parses_target_seconds():
    writer = StoryboardWriter()
    sections = writer.validate_outline_contract(VALID_OUTLINE)
    assert sections[0]["target_seconds"] == 7


def test_validate_outline_contract_handles_legacy_range():
    writer = StoryboardWriter()
    legacy_outline = VALID_OUTLINE.replace("7", "0:05–0:08")
    sections = writer.validate_outline_contract(legacy_outline)
    assert sections[0]["target_seconds"] == 6  # midpoint of 5-8


def test_post_process_splits_overlong_voiceover_into_multiple_screens():
    writer = StoryboardWriter()
    long_voiceover = " ".join(
        ["This sentence explains the concept clearly." for _ in range(8)]
    )

    processed = writer._post_process_screens([_make_screen(long_voiceover)], ["slides"])

    assert len(processed) > 1
    assert all(
        screen["duration"] <= DurationCalculator.MAX_DURATION for screen in processed
    )
    assert sum(len(screen["voiceover_text"].split()) for screen in processed) == len(long_voiceover.split())
    assert all("Auto-split" in screen["action_notes"] for screen in processed)


def test_overlong_section_gets_warning_instead_of_crash(monkeypatch):
    """When a section exceeds ±20% and retry also fails, pipeline succeeds with warning."""
    writer = StoryboardWriter()
    overlong_voiceover = " ".join(["Explain the mechanism in careful detail." for _ in range(12)])

    def fake_call_llm(_prompt, _project_id=None):
        return [_make_screen(overlong_voiceover)]

    def fake_retry_call(_prompt, **kwargs):
        return overlong_voiceover

    monkeypatch.setattr(writer, "_call_storyboard_llm", fake_call_llm)
    monkeypatch.setattr(writer, "call_llm", fake_retry_call)
    monkeypatch.setattr(writer, "_extract_json", lambda _resp: [_make_screen(overlong_voiceover)])

    state = SimpleNamespace(
        screen_outline=VALID_OUTLINE,
        story_brief={
            "fields": {
                "duration": {"value": "10", "source": "extracted", "confirmed": True},
                "viewer_outcome": {"value": "Take one next step", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "PMs", "source": "extracted", "confirmed": True},
                "point_of_view": {"value": "Endings must be concrete", "source": "generated", "confirmed": True},
            }
        },
        evidence_research=None,
        project_id="test-project",
    )

    result = writer.run(state)
    assert isinstance(result, list)
    assert len(result) > 0
    warned = [s for s in result if "Duration warning" in s.get("action_notes", "")]
    assert len(warned) > 0


def test_compute_word_budget_round_trip():
    calc = DurationCalculator()
    for target_sec in [10, 30, 60, 90]:
        for screen_type in ["slides", "talking_head", "screen_recording"]:
            budget = calc.compute_word_budget(target_sec, screen_type)
            text = " ".join(f"word{i}" for i in range(budget))
            result = calc.calculate(text, screen_type)
            assert abs(result["duration"] - target_sec) <= 1.5, (
                f"Round-trip failed: {target_sec}s {screen_type} -> {budget} words -> {result['duration']}s"
            )
