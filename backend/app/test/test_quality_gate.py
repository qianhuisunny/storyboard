from pathlib import Path
from types import SimpleNamespace

import pytest

from app.services.orchestrator import StoryboardOrchestrator
from app.services.quality_gate import QualityGate


VALID_OUTLINE = """Section 1 — Set up

Purpose
Frame the problem with a concrete example.

Entry assumption
None — cold open.

Exit state
The viewer recognizes the failure mode.

Duration
4

Talking points
- Show the failed handoff.

Section 2 — Act

Purpose
Give the viewer one usable next step.

Entry assumption
The viewer recognizes the failure mode.

Exit state
The viewer can run the check today.

Duration
6 seconds

Talking points
- Run the handoff check before launch.
"""


def _screen(number: int = 1, **updates) -> dict:
    screen = {
        "screen_number": number,
        "section_number": 1,
        "section_title": "Set up",
        "screen_type": "slides",
        "voiceover_text": "Here is the failed handoff and why it matters.",
        "visual_direction": ["Two-column handoff diagram"],
        "action_notes": "Reveal the missing owner.",
    }
    screen.update(updates)
    return screen


class SequenceAgent:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []
        self.system_prompt = "UNCHANGED SYSTEM PROMPT"

    def run(self, state, **kwargs):
        self.calls.append(kwargs)
        index = min(len(self.calls) - 1, len(self.outputs) - 1)
        return self.outputs[index]


def test_outline_deterministic_validation_covers_contract_and_exact_duration():
    gate = QualityGate()

    assert gate.validate_structure(
        "outline", {"duration_seconds": 10}, VALID_OUTLINE
    ) == []
    assert gate.validate_structure(
        "outline", {"duration_seconds": 11}, VALID_OUTLINE
    ) == ["Outline section durations total 10 seconds; expected exactly 11 seconds"]
    assert gate.validate_structure("outline", {}, "not an outline")
    assert gate.validate_structure(
        "outline", {}, VALID_OUTLINE.replace("Frame the problem with a concrete example.", "")
    )
    assert gate.validate_structure(
        "outline", {}, VALID_OUTLINE.replace("4", "0", 1)
    )
    assert gate.validate_structure(
        "outline", {}, VALID_OUTLINE.replace("Duration\n4", "Duration\n4.0")
    )
    assert gate.validate_structure(
        "outline", {}, VALID_OUTLINE.replace("- Show the failed handoff.", "")
    )
    assert gate.validate_structure(
        "outline",
        {},
        VALID_OUTLINE.replace("None — cold open.", ""),
    ) == ["Section 1 is missing Entry assumption"]
    assert gate.validate_structure(
        "outline",
        {},
        VALID_OUTLINE.replace("The viewer can run the check today.", ""),
    ) == ["Section 2 is missing Exit state"]


@pytest.mark.parametrize(
    "outline",
    [
        VALID_OUTLINE.replace("Section 2", "Section 3"),
        VALID_OUTLINE.replace("Section 2", "Section 1"),
    ],
)
def test_outline_sections_must_be_unique_and_sequential(outline):
    issues = QualityGate().validate_structure("outline", {}, outline)

    assert any("sequential" in issue.lower() for issue in issues)


@pytest.mark.parametrize(
    "storyboard",
    [
        [],
        ["not a screen"],
        [{key: value for key, value in _screen().items() if key != "action_notes"}],
        [_screen(screen_number=2)],
        [_screen(screen_type="unsupported_format")],
        [_screen(visual_direction="not a list")],
        [_screen(duration=0)],
    ],
)
def test_storyboard_deterministic_validation_rejects_structural_errors(storyboard):
    assert QualityGate().validate_structure("storyboard", {}, storyboard)


def test_storyboard_deterministic_validation_accepts_server_computed_fields_as_optional():
    gate = QualityGate()

    assert gate.validate_structure("storyboard", {}, [_screen()]) == []
    assert gate.validate_structure(
        "storyboard",
        {},
        [_screen(duration=3.5, on_screen_visual="/placeholder.png")],
    ) == []


def test_storyboard_rejects_screen_type_outside_selected_formats():
    gate = QualityGate()

    issues = gate.validate_structure(
        "storyboard",
        {"production_formats": ["slides"]},
        [_screen(screen_type="stock_footage")],
    )

    assert any("selected production formats" in issue for issue in issues)


def test_storyboard_normalizes_legacy_production_format_aliases():
    gate = QualityGate()

    assert gate.validate_structure(
        "storyboard",
        {"production_formats": ["whiteboard"]},
        [_screen(screen_type="whiteboard_animation")],
    ) == []


def test_explicit_empty_canonical_formats_share_writer_fallback_with_gate():
    from app.services.agents.storyboard_writer import StoryboardWriter

    brief = {"production_formats": []}
    writer_types = StoryboardWriter()._get_allowed_screen_types(brief)
    formats_provided, gate_types = QualityGate()._selected_production_formats(brief)

    assert formats_provided is True
    assert writer_types == gate_types == ["slides", "whiteboard_animation"]
    assert QualityGate().validate_structure(
        "storyboard", brief, [_screen(screen_type="slides")]
    ) == []
    assert QualityGate().validate_structure(
        "storyboard", brief, [_screen(screen_type="stock_footage")]
    )


@pytest.mark.parametrize(
    ("screens", "expected"),
    [
        ([_screen()], "missing outline section 2"),
        (
            [
                _screen(),
                _screen(
                    2,
                    section_number=3,
                    section_title="Unknown",
                ),
            ],
            "unknown outline section 3",
        ),
        (
            [
                _screen(),
                _screen(
                    2,
                    section_number=2,
                    section_title="Wrong title",
                ),
            ],
            "must match outline title",
        ),
    ],
)
def test_storyboard_cross_stage_structure_matches_every_outline_section(
    screens, expected
):
    issues = QualityGate().validate_structure(
        "storyboard", {}, screens, outline=VALID_OUTLINE
    )

    assert any(expected in issue.lower() for issue in issues)


@pytest.mark.asyncio
async def test_evaluate_runs_one_holistic_review_without_dimensions_and_includes_outline(monkeypatch):
    gate = QualityGate()
    calls = []

    async def fake_call(stage, prompt, label="holistic"):
        calls.append((stage, prompt, label))
        return {
            "score": 8.5,
            "passed": True,
            "feedback": "The storyboard is clear and faithful.",
            "strengths": ["Concrete visual progression"],
            "issues": [],
        }

    monkeypatch.setattr(gate, "_async_call_eval", fake_call)
    result = await gate.evaluate(
        "storyboard",
        {"prompt": "Explain handoffs", "duration_seconds": 10},
        [
            _screen(),
            _screen(2, section_number=2, section_title="Act"),
        ],
        outline=VALID_OUTLINE,
    )

    assert len(calls) == 1
    assert VALID_OUTLINE in calls[0][1]
    assert "Here is the failed handoff" in calls[0][1]
    assert "Mode:" not in calls[0][1]
    assert result.passed is True
    assert result.review_passed is True
    assert result.advisory is False
    assert result.dimensions is None
    assert result.strengths == ["Concrete visual progression"]
    assert result.issues == []
    assert result.to_dict()["review_passed"] is True
    assert result.attempt == 1
    assert result.total_attempts == 1


@pytest.mark.asyncio
async def test_review_prompt_includes_bounded_revision_instruction_and_prior_artifact(
    monkeypatch,
):
    gate = QualityGate()
    prompts = []

    async def fake_call(_stage, prompt, label="holistic"):
        prompts.append(prompt)
        return {
            "score": 9,
            "passed": True,
            "feedback": "Instruction followed.",
            "strengths": [],
            "issues": [],
        }

    monkeypatch.setattr(gate, "_async_call_eval", fake_call)
    prior = "Prior opening that must stay." + ("x" * 30000)
    instruction = "Change only the final action and preserve the opening."

    await gate.evaluate(
        "outline",
        {"duration_seconds": 10},
        VALID_OUTLINE,
        revision_artifact=prior,
        revision_instruction=instruction,
    )

    assert instruction in prompts[0]
    assert "Prior opening that must stay." in prompts[0]
    assert "[truncated]" in prompts[0]
    assert len(prompts[0]) < len(prior)


@pytest.mark.asyncio
async def test_runner_logs_final_per_attempt_metadata_including_advisory(
    monkeypatch,
):
    gate = QualityGate()
    logged_scores = []
    fake_qlog = SimpleNamespace(
        log_eval=lambda **kwargs: logged_scores.append(kwargs["scores"])
    )
    monkeypatch.setattr("app.infra.quality_log.qlog", fake_qlog)

    async def low_review(*_args, **_kwargs):
        return {
            "score": 5,
            "passed": False,
            "feedback": "Still generic.",
            "strengths": [],
            "issues": ["Generic opening"],
        }

    monkeypatch.setattr(gate, "_async_call_eval", low_review)
    _output, result = await gate.run_generator_with_gate(
        lambda _feedback: VALID_OUTLINE,
        {"project_id": "qlog-contract", "duration_seconds": 10},
        "outline",
    )

    assert len(logged_scores) == 2
    assert logged_scores[0]["attempt"] == 1
    assert logged_scores[0]["total_attempts"] == 2
    assert logged_scores[0]["passed"] is False
    assert logged_scores[0]["advisory"] is False
    assert logged_scores[1] == result.to_dict()
    assert logged_scores[1]["attempt"] == 2
    assert logged_scores[1]["total_attempts"] == 2
    assert logged_scores[1]["passed"] is True
    assert logged_scores[1]["advisory"] is True


@pytest.mark.asyncio
async def test_structural_failure_retries_once_without_calling_reviewer(monkeypatch):
    gate = QualityGate(max_attempts=9)
    agent = SequenceAgent(["invalid", VALID_OUTLINE])
    review_calls = []

    async def fake_call(*args, **kwargs):
        review_calls.append((args, kwargs))
        return {
            "score": 9,
            "passed": True,
            "feedback": "Ready.",
            "strengths": [],
            "issues": [],
        }

    monkeypatch.setattr(gate, "_async_call_eval", fake_call)
    state = type("State", (), {"story_brief": {"duration_seconds": 10}})()

    output, result = await gate.run_with_gate(agent, state, "outline")

    assert gate.max_attempts == 2
    assert output == VALID_OUTLINE
    assert result.passed is True
    assert len(agent.calls) == 2
    assert "quality_feedback" in agent.calls[1]
    assert "structural" in agent.calls[1]["quality_feedback"].lower()
    assert len(review_calls) == 1
    assert agent.system_prompt == "UNCHANGED SYSTEM PROMPT"


@pytest.mark.asyncio
async def test_second_structural_failure_remains_blocking_and_skips_review(monkeypatch):
    gate = QualityGate()
    agent = SequenceAgent(["invalid one", "invalid two"])
    review_calls = []
    monkeypatch.setattr(
        gate,
        "_async_call_eval",
        lambda *args, **kwargs: review_calls.append((args, kwargs)),
    )
    state = type("State", (), {"story_brief": {"duration_seconds": 10}})()

    output, result = await gate.run_with_gate(agent, state, "outline")

    assert output == "invalid two"
    assert result.passed is False
    assert result.review_passed is False
    assert result.advisory is False
    assert result.deterministic_issues
    assert result.attempt == 2
    assert result.total_attempts == 2
    assert len(review_calls) == 0


@pytest.mark.asyncio
async def test_second_subjective_failure_is_advisory_and_nonblocking(monkeypatch):
    gate = QualityGate()
    agent = SequenceAgent([VALID_OUTLINE, VALID_OUTLINE])
    review_calls = []

    async def low_review(stage, prompt, label="holistic"):
        review_calls.append((stage, prompt, label))
        return {
            "score": 5.5,
            "passed": False,
            "feedback": "The opening still feels generic.",
            "strengths": ["Clear ending"],
            "issues": ["Opening lacks tension"],
        }

    monkeypatch.setattr(gate, "_async_call_eval", low_review)
    state = type("State", (), {"story_brief": {"duration_seconds": 10}})()

    output, result = await gate.run_with_gate(agent, state, "outline")

    assert output == VALID_OUTLINE
    assert len(review_calls) == 2
    assert len(agent.calls) == 2
    assert agent.calls[0] == {}
    assert "The opening still feels generic." in agent.calls[1]["quality_feedback"]
    assert result.passed is True
    assert result.review_passed is False
    assert result.advisory is True
    assert result.composite_score == 5.5
    assert result.feedback == "The opening still feels generic."
    assert result.dimensions is None
    assert agent.system_prompt == "UNCHANGED SYSTEM PROMPT"


@pytest.mark.asyncio
async def test_callback_runner_retries_subjective_miss_with_quality_feedback(monkeypatch):
    gate = QualityGate()
    feedback_calls = []
    review_calls = []

    def generate(feedback):
        feedback_calls.append(feedback)
        return VALID_OUTLINE

    async def reviews(_stage, _prompt, label="holistic"):
        review_calls.append(label)
        if len(review_calls) == 1:
            return {
                "score": 6,
                "passed": False,
                "feedback": "Make the opening more specific.",
                "strengths": [],
                "issues": ["Generic opening"],
            }
        return {
            "score": 8,
            "passed": True,
            "feedback": "Ready.",
            "strengths": [],
            "issues": [],
        }

    monkeypatch.setattr(gate, "_async_call_eval", reviews)
    output, result = await gate.run_generator_with_gate(
        generate, {"duration_seconds": 10}, "outline"
    )

    assert output == VALID_OUTLINE
    assert result.passed is True
    assert feedback_calls[0] is None
    assert "Make the opening more specific." in feedback_calls[1]
    assert len(review_calls) == 2


@pytest.mark.asyncio
async def test_direct_evaluate_subjective_miss_remains_failed(monkeypatch):
    gate = QualityGate()

    async def low_review(*_args, **_kwargs):
        return {
            "score": 6,
            "passed": False,
            "feedback": "Could be sharper.",
            "strengths": [],
            "issues": ["Generic opening"],
        }

    monkeypatch.setattr(gate, "_async_call_eval", low_review)
    result = await gate.evaluate(
        "outline", {"duration_seconds": 10}, VALID_OUTLINE
    )

    assert result.passed is False
    assert result.review_passed is False
    assert result.advisory is False
    with pytest.raises(ValueError, match="quality gate failed"):
        StoryboardOrchestrator()._raise_if_quality_gate_failed("Outline", result)


def test_orchestrator_blocks_structural_failure():
    gate = QualityGate()
    result = gate._structural_failure_result(
        ["Could not parse any Section blocks"], attempt=2
    )

    with pytest.raises(ValueError, match="quality gate failed"):
        StoryboardOrchestrator()._raise_if_quality_gate_failed("Outline", result)


def test_quality_prompts_are_holistic_and_exclude_legacy_taxonomy():
    gate = QualityGate()
    root = Path(__file__).parents[3]
    banned = (
        "mode:",
        "dimension",
        "point_of_view",
        "point of view",
        "intent route",
        "content mode",
        "primary_pattern",
        "secondary_patterns",
        "core_talking_points",
        "core talking points",
        "pattern layer",
    )

    for filename in gate.stage_prompts.values():
        prompt = (root / "prompts" / filename).read_text(encoding="utf-8").lower()
        for term in banned:
            assert term not in prompt
