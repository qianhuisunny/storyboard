import pytest
from typing import Optional
from app.services.orchestrator import StoryboardOrchestrator
from app.services.state import StateManager, StoryboardState
from app.services.quality_gate import QualityEvalResult, GutScore, DimensionScore


MOCK_OUTLINE = """## Section 1: Introduction
### Screen 1.1: Hook
- voiceover: "Welcome to this knowledge share."
- screen_type: talking_head
- duration: 30

### Screen 1.2: Overview
- voiceover: "Today we'll cover three key topics."
- screen_type: slides
- duration: 25

## Section 2: Main Content
### Screen 2.1: Key Concept
- voiceover: "Let's dive into the first concept."
- screen_type: slides
- duration: 45

## Section 3: Conclusion
### Screen 3.1: Takeaway
- voiceover: "Here's what you should remember."
- screen_type: talking_head
- duration: 30
"""

MOCK_STORYBOARD = [
    {"screen_number": 1, "voiceover": "Welcome to this knowledge share.", "duration": 30, "screen_type": "talking_head"},
    {"screen_number": 2, "voiceover": "Today we'll cover three key topics.", "duration": 25, "screen_type": "slides"},
    {"screen_number": 3, "voiceover": "Let's dive into the first concept.", "duration": 45, "screen_type": "slides"},
    {"screen_number": 4, "voiceover": "Here's what you should remember.", "duration": 30, "screen_type": "talking_head"},
]

MOCK_INTAKE_FORM = {
    "topic": "Machine Learning Basics",
    "video_type": "knowledge_sharing",
    "target_audience": "Engineering team",
    "duration_minutes": 5,
}

MOCK_ROUND1_FIELDS = {
    "topic": {"value": "Machine Learning Basics", "source": "extracted", "confirmed": False},
    "viewer_outcome": {"value": "Understand ML fundamentals", "source": "inferred", "confirmed": False},
    "target_audience": {"value": "Engineering team", "source": "extracted", "confirmed": False},
}

MOCK_ROUND2_FIELDS = {
    "format_style": {"value": "Tutorial walkthrough", "source": "inferred", "confirmed": False},
    "duration_minutes": {"value": 5, "source": "extracted", "confirmed": False},
}

MOCK_ROUND3_FIELDS = {
    "core_talking_points": {
        "value": ["What is ML", "Types of ML", "Getting started"],
        "source": "generated",
        "confirmed": False,
    },
    "viewer_outcome": {"value": "Understand ML fundamentals", "source": "generated", "confirmed": False},
}


class MockBriefBuilder:
    def run(self, state, round=1, confirmed_fields=None, revision_feedback=None, **kwargs):
        if round == 1:
            return {"round": 1, "fields": dict(MOCK_ROUND1_FIELDS)}
        elif round == 2:
            return {"round": 2, "fields": dict(MOCK_ROUND2_FIELDS)}
        elif round == 3:
            return {"round": 3, "fields": dict(MOCK_ROUND3_FIELDS)}
        return {"round": round, "fields": {}}


class MockDirector:
    def run(self, state, **kwargs):
        return MOCK_OUTLINE

    def regenerate_section(self, current_outline, section_number, instruction, story_brief, **kwargs):
        return f"## Section {section_number}: Regenerated\n### Screen {section_number}.1: New content\n- voiceover: Regenerated.\n- duration: 30"

    def refine_outline(self, current_outline, instruction, story_brief, **kwargs):
        return "## Refined Outline\n### Screen 1: Refined content\n- voiceover: Refined.\n- duration: 30"


class MockWriter:
    def run(self, state, **kwargs):
        return list(MOCK_STORYBOARD)

    def validate_outline_contract(self, outline_text):
        return True


def _make_passing_grade():
    return QualityEvalResult(
        passed=True,
        gut=GutScore(score=8.0, feedback="Good"),
        dimensions=[DimensionScore(dimension="clarity", score=8.0, feedback="Clear")],
        composite_score=8.0,
        attempt=1,
        total_attempts=1,
    )


class MockQualityGate:
    async def run_with_gate(self, agent, state, stage, **kwargs):
        output = agent.run(state)
        return output, _make_passing_grade()

    async def evaluate(self, stage, brief, output, outline=None, **kwargs):
        grade = _make_passing_grade()
        return grade


@pytest.fixture
def tmp_data_dir(tmp_path):
    """Temporary SQLite data directory for StateManager tests."""
    return tmp_path


@pytest.fixture
def make_orchestrator(tmp_data_dir):
    """Factory: create orchestrator with mocked agents and quality gate."""
    def _make():
        orch = StoryboardOrchestrator()
        orch.agents = {
            "brief_builder": MockBriefBuilder(),
            "director": MockDirector(),
            "writer": MockWriter(),
        }
        orch.quality_gate = MockQualityGate()
        return orch
    return _make


@pytest.fixture
def make_state(tmp_data_dir):
    """Factory: create StoryboardState at any phase with optional data."""
    def _make(
        phase="intake",
        story_brief=None,
        screen_outline=None,
        storyboard=None,
        intake_form=None,
        confirmed_fields=None,
        brief_locked=False,
        outline_locked=False,
    ):
        return StoryboardState(
            project_id="test-project",
            phase=phase,
            story_brief=story_brief,
            screen_outline=screen_outline,
            storyboard=storyboard,
            intake_form=intake_form or dict(MOCK_INTAKE_FORM),
            confirmed_fields=confirmed_fields or {},
            brief_locked=brief_locked,
            outline_locked=outline_locked,
        )
    return _make


@pytest.fixture
def patch_state_manager(tmp_data_dir, monkeypatch):
    """Patch StateManager to use a temp SQLite file instead of the repo DB."""
    _original_init = StateManager.__init__

    def _patched_init(self, project_id, data_dir=None):
        _original_init(self, project_id, data_dir=tmp_data_dir)

    monkeypatch.setattr(
        "app.services.state.StateManager.__init__",
        _patched_init,
    )
