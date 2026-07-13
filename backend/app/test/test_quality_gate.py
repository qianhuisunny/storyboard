import pytest

from app.services.quality_gate import DimensionScore, GutScore, QualityEvalResult, QualityGate
from app.services.state import StateManager


class DummyAgent:
    def __init__(self):
        self.system_prompt = "SYSTEM"
        self.calls = 0

    def run(self, state):
        self.calls += 1
        return "outline text"


def _failed_grade(score: float = 6.2) -> QualityEvalResult:
    return QualityEvalResult(
        passed=False,
        gut=GutScore(score=score, feedback="The outline feels unfinished."),
        dimensions=[
            DimensionScore(
                dimension="narrative_completeness",
                score=5.0,
                feedback="The ending feels cut off before the final takeaway lands.",
            )
        ],
        composite_score=score,
        attempt=0,
        total_attempts=0,
    )


class FailingQualityGate:
    async def run_with_gate(self, agent, state, stage, **kwargs):
        output = agent.run(state)
        return output, _failed_grade()


def test_outline_dimensions_include_narrative_completeness():
    from app.services.quality_gate import OUTLINE_DIMENSIONS

    assert any(name == "narrative_completeness" for name, _desc in OUTLINE_DIMENSIONS)


def test_brief_context_includes_duration_and_ordered_talking_points():
    gate = QualityGate()
    brief = {
        "fields": {
            "viewer_outcome": {"value": "Help PMs explain the strategy", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Product managers", "source": "extracted", "confirmed": True},
            "audience_level": {"value": "intermediate", "source": "extracted", "confirmed": True},
            "point_of_view": {"value": "Use narrative examples, not feature lists", "source": "generated", "confirmed": True},
            "duration": {"value": "180", "source": "extracted", "confirmed": True},
            "misconceptions": {"value": "A conclusion can just restate the body", "source": "generated", "confirmed": True},
            "must_avoid": {"value": ["generic inspiration"], "source": "generated", "confirmed": True},
            "core_talking_points": {
                "value": ["Open with a painful failure mode", "Show the decision framework", "Close with one concrete next step"],
                "source": "generated",
                "confirmed": True,
            },
        }
    }

    context = gate._build_brief_context(brief)

    assert "Target duration (seconds): 180" in context
    assert "Core talking points in order:" in context
    assert "1. Open with a painful failure mode" in context
    assert "3. Close with one concrete next step" in context
    assert "Must avoid:\n- generic inspiration" in context


@pytest.mark.asyncio
async def test_run_with_gate_retries_failed_output():
    gate = QualityGate(max_attempts=2)
    agent = DummyAgent()

    async def fake_evaluate(stage, brief, output, outline=None):
        return _failed_grade()

    gate.evaluate = fake_evaluate

    output, result = await gate.run_with_gate(agent=agent, state=type("State", (), {"story_brief": {}})(), stage="outline")

    assert output == "outline text"
    assert result.passed is False
    assert result.total_attempts == 2
    assert agent.calls == 2


@pytest.mark.asyncio
async def test_run_with_gate_restores_prompt_when_retry_agent_raises():
    gate = QualityGate(max_attempts=2)

    class ExplodingRetryAgent(DummyAgent):
        def run(self, state):
            self.calls += 1
            if self.calls == 2:
                raise RuntimeError("retry generation failed")
            return "first outline"

    agent = ExplodingRetryAgent()

    async def fake_evaluate(stage, brief, output, outline=None):
        return _failed_grade()

    gate.evaluate = fake_evaluate

    with pytest.raises(RuntimeError, match="retry generation failed"):
        await gate.run_with_gate(
            agent=agent,
            state=type("State", (), {"story_brief": {}})(),
            stage="outline",
        )

    assert agent.system_prompt == "SYSTEM"


@pytest.mark.asyncio
async def test_orchestrator_stops_when_outline_quality_gate_fails(make_orchestrator, make_state, patch_state_manager):
    orch = make_orchestrator()
    orch.quality_gate = FailingQualityGate()

    manager = StateManager("test-project")
    state = make_state(
        phase="gate1",
        story_brief={"fields": {
            "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            "core_talking_points": {"value": ["Hook", "Body", "Closing"], "source": "generated", "confirmed": True},
        }},
        brief_locked=True,
    )
    await manager.save(state)

    result = await orch.process_event("test-project", "approve", {})
    reloaded = await manager.load()

    assert result["success"] is False
    assert "quality gate failed" in result["error"].lower()
    assert reloaded.phase == "gate1"
    assert reloaded.screen_outline is None
