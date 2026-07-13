import asyncio
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.agents.duration_calculator import DurationCalculator
from app.services.agents.storyboard_writer import StoryboardWriter
from app.services.workflow import (
    GenerationContext,
    _production_outline_generator,
    _production_storyboard_generator,
)


BANNED_PROMPT_TERMS = (
    "point_of_view",
    "point of view",
    "intent_route",
    "intent route",
    "content_mode",
    "content mode",
    "video_type",
    "primary_pattern",
    "secondary_patterns",
    "core_talking_points",
    "core talking points",
    "misconceptions",
    "must_avoid",
    "must avoid",
    "pattern layer",
)


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


def _canonical_intake() -> dict:
    return {
        "prompt": "Show founders how to prepare a useful customer interview.",
        "viewer_outcome": "Draft an interview guide with unbiased questions.",
        "target_audience": "Early-stage founders",
        "audience_level": "Beginner",
        "duration_seconds": 7,
        "platform": "YouTube",
        "aspect_ratio": "16:9",
        "delivery_tone": "Practical and candid",
        "production_formats": ["slides", "talking_head"],
        "source_snapshot": "The source highlights three biased question patterns.",
        "sources": [{"name": "Interview guide", "kind": "url"}],
        "point_of_view": "legacy value",
        "intent_route": "tutorial_demo",
        "content_mode": "educational",
        "video_type": "knowledge_sharing",
        "primary_pattern": "steps",
        "secondary_patterns": ["mistakes"],
        "core_talking_points": ["legacy required spine"],
        "misconceptions": "legacy misconception",
        "must_avoid": ["legacy restriction"],
    }


def _assert_no_banned_terms(text: str) -> None:
    lowered = text.lower()
    for term in BANNED_PROMPT_TERMS:
        assert term not in lowered


def test_writer_context_and_prompt_use_canonical_intake_and_sources_only():
    writer = StoryboardWriter()
    intake = _canonical_intake()
    sections = writer.validate_outline_contract(VALID_OUTLINE)
    allowed_types = writer._get_allowed_screen_types(intake)
    writer._compute_section_budgets(sections, allowed_types)

    context = writer._extract_brief_context(intake)
    prompt = writer._build_full_storyboard_prompt(
        sections=sections,
        all_evidence={},
        full_outline=VALID_OUTLINE,
        brief_context=context,
        allowed_types=allowed_types,
        target_duration=writer._get_target_duration(intake),
    )

    assert set(context) == {
        "prompt",
        "viewer_outcome",
        "target_audience",
        "audience_level",
        "duration_seconds",
        "platform",
        "aspect_ratio",
        "delivery_tone",
        "production_formats",
        "source_snapshot",
        "sources",
    }
    for expected in (
        "Show founders how to prepare a useful customer interview.",
        "Draft an interview guide with unbiased questions.",
        "Early-stage founders",
        "Beginner",
        "7",
        "YouTube",
        "16:9",
        "Practical and candid",
        "slides",
        "talking_head",
        "The source highlights three biased question patterns.",
        "Interview guide",
        VALID_OUTLINE,
    ):
        assert expected in prompt
    _assert_no_banned_terms(prompt)


def test_writer_screen_types_prefer_canonical_formats_with_legacy_fallback():
    writer = StoryboardWriter()

    assert writer._get_allowed_screen_types(
        {
            "production_formats": ["slides"],
            "on_camera_presence": "yes",
        }
    ) == ["slides"]
    assert writer._get_allowed_screen_types(
        {
            "fields": {
                "broll_type": {"value": ["whiteboard", "screen_recording"]},
                "on_camera_presence": {"value": "yes"},
            }
        }
    ) == ["whiteboard_animation", "screen_recording", "talking_head"]
    assert writer._get_allowed_screen_types({}) == [
        "slides",
        "whiteboard_animation",
    ]


def test_writer_update_prompt_preserves_unaffected_screens_and_exact_schema():
    writer = StoryboardWriter()
    intake = _canonical_intake()
    sections = writer.validate_outline_contract(VALID_OUTLINE)
    allowed_types = writer._get_allowed_screen_types(intake)
    writer._compute_section_budgets(sections, allowed_types)
    existing = [_make_screen("Keep this opening exactly as written.")]

    prompt = writer._build_full_storyboard_prompt(
        sections=sections,
        all_evidence={},
        full_outline=VALID_OUTLINE,
        brief_context=writer._extract_brief_context(intake),
        allowed_types=allowed_types,
        target_duration=7,
        revision_instruction="Change only the final action.",
        existing_storyboard=existing,
        quality_feedback="The previous ending was vague.",
    )

    assert "EXISTING STORYBOARD" in prompt
    assert "Keep this opening exactly as written." in prompt
    assert "Change only the final action." in prompt
    assert "preserve unaffected screens" in prompt.lower()
    assert "The previous ending was vague." in prompt
    for field in (
        "screen_number",
        "section_number",
        "section_title",
        "screen_type",
        "voiceover_text",
        "visual_direction",
        "action_notes",
    ):
        assert field in prompt
    _assert_no_banned_terms(prompt)


def test_writer_active_system_prompt_excludes_legacy_taxonomy():
    writer = StoryboardWriter()
    prompt_path = Path(__file__).parents[3] / "prompts" / writer.prompt_file
    prompt = prompt_path.read_text(encoding="utf-8")

    _assert_no_banned_terms(prompt)


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


@pytest.mark.asyncio
async def test_production_revision_prompt_includes_existing_storyboard_and_instruction(
    monkeypatch,
):
    from app.services.orchestrator import orchestrator

    captured_prompts = []
    existing = [_make_screen("Preserve this existing screen")]
    instruction = "Keep the opening and make the final action more specific."

    def fake_storyboard_call(_writer, prompt, _project_id=None):
        captured_prompts.append(prompt)
        return [_make_screen("Updated final action")]

    evaluation = SimpleNamespace(
        passed=True,
        composite_score=10.0,
        attempt=0,
        total_attempts=0,
        to_dict=lambda: {"passed": True, "composite_score": 10.0},
    )

    async def fake_evaluate(*_args, **_kwargs):
        return evaluation

    monkeypatch.setattr(
        StoryboardWriter, "_call_storyboard_llm", fake_storyboard_call
    )
    monkeypatch.setattr(orchestrator.quality_gate, "evaluate", fake_evaluate)
    monkeypatch.setattr(
        orchestrator, "_raise_if_quality_gate_failed", lambda *_args: None
    )

    await _production_storyboard_generator(
        GenerationContext(
            project_id="writer-revision-project",
            kind="storyboard",
            input_version_id="outline-v2",
            intake={"duration": 0, "broll_type": ["slides"]},
            outline=VALID_OUTLINE,
            storyboard=existing,
            current_content=existing,
            instruction=instruction,
        )
    )

    assert captured_prompts
    assert instruction in captured_prompts[0]
    assert "Preserve this existing screen" in captured_prompts[0]


@pytest.mark.asyncio
async def test_production_adapters_use_fresh_agents_for_concurrent_jobs(monkeypatch):
    from app.services.agents.storyboard_director import StoryboardDirector
    from app.services.orchestrator import orchestrator

    agent_ids = {"outline": [], "storyboard": []}

    async def fake_run_with_gate(
        agent, _state, stage, outline_for_cross_stage=None
    ):
        agent_ids[stage].append(id(agent))
        output = (
            VALID_OUTLINE
            if isinstance(agent, StoryboardDirector)
            else [_make_screen("Concurrent storyboard")]
        )
        result = SimpleNamespace(
            passed=True,
            composite_score=10.0,
            to_dict=lambda: {"passed": True, "composite_score": 10.0},
        )
        return output, result

    monkeypatch.setattr(
        orchestrator.quality_gate, "run_with_gate", fake_run_with_gate
    )

    outline_context = GenerationContext(
        project_id="concurrent-outline",
        kind="outline",
        input_version_id="intake-v1",
        intake={"prompt": "Concurrent"},
    )
    storyboard_context = GenerationContext(
        project_id="concurrent-storyboard",
        kind="storyboard",
        input_version_id="outline-v1",
        intake={"duration": 0, "broll_type": ["slides"]},
        outline=VALID_OUTLINE,
    )

    await asyncio.gather(
        _production_outline_generator(outline_context),
        _production_outline_generator(outline_context),
        _production_storyboard_generator(storyboard_context),
        _production_storyboard_generator(storyboard_context),
    )

    assert len(set(agent_ids["outline"])) == 2
    assert len(set(agent_ids["storyboard"])) == 2


def test_duration_retry_keeps_revision_and_existing_screen_context(monkeypatch):
    writer = StoryboardWriter()
    overlong_voiceover = " ".join(
        ["The current draft needs focused revision." for _ in range(12)]
    )
    existing = [_make_screen("Distinct existing screen to preserve")]
    instruction = "Keep the original example and sharpen only the closing action."
    quality_feedback = "The previous draft did not land a specific next step."
    retry_prompts = []

    monkeypatch.setattr(
        writer,
        "_call_storyboard_llm",
        lambda _prompt, _project_id=None: [_make_screen(overlong_voiceover)],
    )

    def fake_retry(prompt, **_kwargs):
        retry_prompts.append(prompt)
        return "not valid json"

    monkeypatch.setattr(writer, "call_llm", fake_retry)
    monkeypatch.setattr(writer, "_extract_json", lambda _response: None)

    state = SimpleNamespace(
        screen_outline=VALID_OUTLINE,
        story_brief={
            "fields": {
                "duration": {
                    "value": "10",
                    "source": "extracted",
                    "confirmed": True,
                }
            }
        },
        evidence_research=None,
        project_id="duration-retry-revision",
        storyboard=existing,
    )

    writer.run(
        state,
        revision_instruction=instruction,
        existing_storyboard=existing,
        quality_feedback=quality_feedback,
    )

    assert retry_prompts
    assert instruction in retry_prompts[0]
    assert quality_feedback in retry_prompts[0]
    assert "Distinct existing screen to preserve" in retry_prompts[0]
    assert "The current draft needs focused revision" in retry_prompts[0]
    _assert_no_banned_terms(retry_prompts[0])
