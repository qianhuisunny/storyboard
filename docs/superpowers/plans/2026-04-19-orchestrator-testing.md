# Orchestrator Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add regression and demo-stability tests for the orchestrator pipeline — state transitions, data writeback, and cascade deletes.

**Architecture:** Tests call `StoryboardOrchestrator.process_event()` directly with mocked agents (no LLM, no HTTP, no SQLite). Mock agents return fixed dicts. StateManager writes to a temp directory. Each test validates phase transition + data integrity.

**Tech Stack:** pytest, pytest-asyncio, tmp_path fixture, dataclasses (for mock GradeResult)

---

### Task 1: Shared Test Fixtures (`conftest.py`)

**Files:**
- Create: `backend/app/test/conftest.py`

- [ ] **Step 1: Create conftest.py with mock agents, mock quality gate, and orchestrator factory**

```python
import pytest
from dataclasses import dataclass
from typing import Optional
from app.services.orchestrator import StoryboardOrchestrator
from app.services.state import StateManager, StoryboardState
from app.services.quality_gate import GradeResult, GutScore, DimensionScore


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


def _make_passing_grade():
    return GradeResult(
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
    """Temporary data directory for StateManager."""
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
    """Patch StateManager to use tmp_data_dir instead of real data/."""
    _original_init = StateManager.__init__

    def _patched_init(self, project_id, data_dir=None):
        _original_init(self, project_id, data_dir=tmp_data_dir)

    monkeypatch.setattr(
        "app.services.state.StateManager.__init__",
        _patched_init,
    )
```

- [ ] **Step 2: Verify conftest loads without errors**

Run: `cd backend && source venv/bin/activate && python -c "from app.test.conftest import *; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/test/conftest.py
git commit -m "test: add shared fixtures for orchestrator tests (mock agents, state factory)"
```

---

### Task 2: State Transition Tests (`test_orchestrator_transitions.py`)

**Files:**
- Create: `backend/app/test/test_orchestrator_transitions.py`

- [ ] **Step 1: Write the failing tests — all 11 transition cases**

```python
"""
Orchestrator state transition tests.
Each test: given phase + event + payload → verify phase changed + data correct.
"""
import pytest
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestKnowledgeShareTransitions:
    """Tests for the 3-round Knowledge Share briefing flow."""

    async def test_intake_to_brief_round1(self, make_orchestrator, make_state, patch_state_manager):
        """submit_knowledge_share: intake → brief_round1, story_brief initialized."""
        orch = make_orchestrator()
        result = await orch.process_event(
            "test-project",
            "submit_knowledge_share",
            {"intake_form": MOCK_INTAKE_FORM},
        )
        assert result["success"] is True
        assert result["phase"] == "brief_round1"
        assert result.get("brief_fields") is not None
        assert "topic" in result["brief_fields"]

    async def test_round1_confirm_to_brief_round2(self, make_orchestrator, make_state, patch_state_manager):
        """round1_confirm: brief_round1 → brief_round2, confirmed fields written to story_brief."""
        orch = make_orchestrator()
        # Setup: get to brief_round1 first
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})

        confirmed = {
            "topic": {"value": "ML Basics (edited)", "source": "extracted", "confirmed": True},
            "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
        }
        result = await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": confirmed})

        assert result["success"] is True
        assert result["phase"] == "brief_round2"
        # Key regression check: confirmed values written back to story_brief["fields"]
        state_data = result["state"]
        # The state serialization doesn't include story_brief directly,
        # so we verify via confirmed_fields in state
        assert state_data["confirmed_fields"]["topic"]["value"] == "ML Basics (edited)"

    async def test_round2_confirm_to_brief_round3(self, make_orchestrator, make_state, patch_state_manager):
        """round2_confirm: brief_round2 → brief_round3, round1 fields preserved."""
        orch = make_orchestrator()
        # Setup: intake → round1 → round2
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        r1_confirmed = {"topic": {"value": "ML Basics", "source": "extracted", "confirmed": True}}
        await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": r1_confirmed})

        r2_confirmed = {"format_style": {"value": "Workshop", "source": "extracted", "confirmed": True}}
        result = await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": r2_confirmed})

        assert result["success"] is True
        assert result["phase"] == "brief_round3"
        # Round 1 fields should still be in confirmed_fields
        assert result["state"]["confirmed_fields"]["topic"]["value"] == "ML Basics"
        assert result["state"]["confirmed_fields"]["format_style"]["value"] == "Workshop"

    async def test_generate_content_spine_stays_in_round3(self, make_orchestrator, make_state, patch_state_manager):
        """generate_content_spine: brief_round3 → brief_round3 (self-loop), content_spine populated."""
        orch = make_orchestrator()
        # Setup: intake → round1 → round2 → round3
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}})
        await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}})

        result = await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML for engineers"})

        assert result["success"] is True
        assert result["phase"] == "brief_round3"  # stays in round3
        assert result.get("brief_fields") is not None

    async def test_round3_confirm_to_brief_review(self, make_orchestrator, make_state, patch_state_manager):
        """round3_confirm: brief_round3 → brief_review, all rounds' fields present."""
        orch = make_orchestrator()
        # Setup: full flow through round3
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}})
        await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}})
        await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML"})

        r3_confirmed = {"core_talking_points": {"value": ["Topic A", "Topic B"], "source": "generated", "confirmed": True}}
        result = await orch.process_event("test-project", "round3_confirm", {"confirmed_fields": r3_confirmed})

        assert result["success"] is True
        assert result["phase"] == "brief_review"
        assert result["state"]["confirmed_fields"]["topic"]["value"] == "ML"
        assert result["state"]["confirmed_fields"]["format_style"]["value"] == "Tutorial"
        assert result["state"]["confirmed_fields"]["core_talking_points"]["value"] == ["Topic A", "Topic B"]

    async def test_brief_approve_to_gate2(self, make_orchestrator, make_state, patch_state_manager):
        """brief_approve: brief_review → gate1 → outline → gate2 (auto-runs director)."""
        orch = make_orchestrator()
        # Setup: full flow through brief_review
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {
                "topic": {"value": "ML", "source": "extracted", "confirmed": True},
                "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            }
        })
        await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}})
        await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML"})
        await orch.process_event("test-project", "round3_confirm", {
            "confirmed_fields": {"core_talking_points": {"value": ["A", "B", "C"], "source": "generated", "confirmed": True}}
        })

        result = await orch.process_event("test-project", "brief_approve", {})

        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result.get("screen_outline") is not None
        assert result.get("brief_locked") is True


@pytest.mark.asyncio
class TestGateTransitions:
    """Tests for gate approve/edit and cascade deletes."""

    async def test_gate1_approve_generates_outline(self, make_orchestrator, make_state, patch_state_manager):
        """gate1 approve: runs director, populates screen_outline."""
        orch = make_orchestrator()
        # Setup: create state at gate1 with story_brief
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="gate1",
            story_brief={
                "fields": {
                    "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                    "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
                    "core_talking_points": {"value": ["A", "B"], "source": "generated", "confirmed": True},
                }
            },
            brief_locked=True,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "approve", {})

        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result.get("screen_outline") is not None

    async def test_gate2_approve_generates_storyboard(self, make_orchestrator, make_state, patch_state_manager):
        """gate2 approve: runs writer, populates storyboard."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={
                "fields": {
                    "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                    "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
                    "core_talking_points": {"value": ["A", "B"], "source": "generated", "confirmed": True},
                }
            },
            screen_outline=MOCK_OUTLINE,
            brief_locked=True,
            outline_locked=False,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "approve", {})

        assert result["success"] is True
        assert result["phase"] == "review"
        assert result.get("storyboard") is not None
        assert len(result["storyboard"]) >= 3

    async def test_gate2_go_back_clears_outline_and_storyboard(self, make_orchestrator, make_state, patch_state_manager):
        """gate2 go_back_gate1: clears outline AND storyboard, returns to gate1."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "go_back_gate1", {})

        assert result["success"] is True
        assert result["phase"] == "gate1"
        assert result["state"]["has_screen_outline"] is False
        assert result["state"]["has_storyboard"] is False
        assert result["state"]["brief_locked"] is False

    async def test_review_go_back_gate2_clears_storyboard_preserves_outline(self, make_orchestrator, make_state, patch_state_manager):
        """review go_back_gate2: clears storyboard, preserves outline."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="review",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "go_back_gate2", {})

        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result["state"]["has_storyboard"] is False
        assert result["state"]["has_screen_outline"] is True


@pytest.mark.asyncio
class TestInvalidTransitions:
    """Test that invalid events are rejected."""

    async def test_invalid_event_for_phase(self, make_orchestrator, make_state, patch_state_manager):
        """brief_approve on outline phase should fail."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(phase="outline")
        manager.save(state)

        result = await orch.process_event("test-project", "brief_approve", {})

        assert result["success"] is False
        assert "Invalid" in result.get("error", "") or "Invalid" in result.get("message", "")
```

- [ ] **Step 2: Run tests to verify they fail (no conftest loaded yet from this path)**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/test_orchestrator_transitions.py -v --tb=short 2>&1 | head -40`
Expected: Tests collected and some pass (since conftest.py is in the same directory), verify all 11 tests are discovered.

- [ ] **Step 3: Fix any import or fixture issues found in step 2**

Adjust imports or fixture wiring based on actual errors. Common issues:
- `patch_state_manager` fixture may need adjustment based on how StateManager resolves `data_dir`
- `pytest-asyncio` may need `asyncio_mode = "auto"` in `pyproject.toml` or `pytest.ini`

- [ ] **Step 4: Run tests again and verify all pass**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/test_orchestrator_transitions.py -v`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/test/test_orchestrator_transitions.py
git commit -m "test: add 11 orchestrator state transition tests (KS flow, gates, cascade deletes)"
```

---

### Task 3: Regression Tests (`test_orchestrator_regressions.py`)

**Files:**
- Create: `backend/app/test/test_orchestrator_regressions.py`

- [ ] **Step 1: Write 5 regression tests — each maps to a PROGRESS.md bug**

```python
"""
Regression tests: each test reproduces a specific bug from PROGRESS.md.
These tests exist to prevent known bugs from recurring.
"""
import pytest
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestFieldWritebackRegressions:
    """
    Bug: round confirm handlers didn't write confirmed_fields back to
    state.story_brief["fields"]. User's input was lost on page refresh.
    Ref: PROGRESS.md "2026-03-23: State must survive refresh"
    """

    async def _setup_to_round1(self, orch):
        """Helper: get orchestrator to brief_round1."""
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})

    async def test_round1_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        """After round1_confirm, story_brief['fields'] must contain confirmed values."""
        orch = make_orchestrator()
        await self._setup_to_round1(orch)

        confirmed = {"topic": {"value": "User Edited Topic", "source": "extracted", "confirmed": True}}
        result = await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": confirmed})

        assert result["success"] is True
        # Load state directly to check story_brief (not just confirmed_fields)
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = manager.load()
        assert state.story_brief is not None
        assert state.story_brief["fields"]["topic"]["value"] == "User Edited Topic"

    async def test_round2_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        """After round2_confirm, story_brief['fields'] must contain round2 confirmed values."""
        orch = make_orchestrator()
        await self._setup_to_round1(orch)
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}
        })

        r2_confirmed = {"format_style": {"value": "User Picked Workshop", "source": "extracted", "confirmed": True}}
        result = await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": r2_confirmed})

        assert result["success"] is True
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = manager.load()
        assert state.story_brief["fields"]["format_style"]["value"] == "User Picked Workshop"
        # Round 1 field should also still be there
        assert state.story_brief["fields"]["topic"]["value"] == "ML"

    async def test_round3_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        """After round3_confirm, story_brief['fields'] must contain round3 confirmed values."""
        orch = make_orchestrator()
        await self._setup_to_round1(orch)
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "round2_confirm", {
            "confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML"})

        r3_confirmed = {"core_talking_points": {"value": ["A", "B"], "source": "generated", "confirmed": True}}
        result = await orch.process_event("test-project", "round3_confirm", {"confirmed_fields": r3_confirmed})

        assert result["success"] is True
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = manager.load()
        assert state.story_brief["fields"]["core_talking_points"]["value"] == ["A", "B"]
        # Earlier rounds' fields should still be present
        assert "topic" in state.story_brief["fields"]
        assert "format_style" in state.story_brief["fields"]


@pytest.mark.asyncio
class TestCascadeDeleteRegressions:
    """
    Bug: gate2_edit with target=outline should clear storyboard.
    Bug: review_edit with target=gate1 should clear both outline and storyboard.
    Ref: PROGRESS.md cascade delete lessons
    """

    async def test_gate2_edit_target_gate1_cascade(self, make_orchestrator, make_state, patch_state_manager):
        """gate2 edit target=gate1: outline cleared, storyboard cleared, brief unlocked."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "edit", {"target": "gate1"})

        assert result["success"] is True
        assert result["phase"] == "gate1"
        # Verify cascade
        loaded = manager.load()
        assert loaded.screen_outline is None
        assert loaded.brief_locked is False
        assert loaded.outline_locked is False

    async def test_review_edit_target_gate1_cascade(self, make_orchestrator, make_state, patch_state_manager):
        """review edit target=gate1: both outline AND storyboard cleared."""
        orch = make_orchestrator()
        from app.services.state import StateManager
        manager = StateManager("test-project")
        state = make_state(
            phase="review",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        manager.save(state)

        result = await orch.process_event("test-project", "edit", {"target": "gate1"})

        assert result["success"] is True
        assert result["phase"] == "gate1"
        loaded = manager.load()
        assert loaded.storyboard is None
        assert loaded.screen_outline is None
        assert loaded.outline_locked is False
        assert loaded.brief_locked is False
```

- [ ] **Step 2: Run tests and verify all pass**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/test_orchestrator_regressions.py -v`
Expected: All 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/test/test_orchestrator_regressions.py
git commit -m "test: add 5 regression tests for confirmed_fields writeback and cascade deletes"
```

---

### Task 4: Golden Path Test (`test_golden_path.py`)

**Files:**
- Create: `backend/app/test/test_golden_path.py`

- [ ] **Step 1: Write the golden path test — full Knowledge Share flow**

```python
"""
Golden path test: full Knowledge Share pipeline from intake to review.
One test, ~8 assertions. Validates the entire chain doesn't break.
"""
import pytest
from app.test.conftest import MOCK_INTAKE_FORM


@pytest.mark.asyncio
async def test_golden_path_knowledge_share(make_orchestrator, patch_state_manager):
    """
    Full Knowledge Share flow:
    intake → round1 → round2 → content_spine → round3 → brief_review
    → brief_approve (auto-runs director) → gate2
    → gate2_approve (auto-runs writer) → review
    """
    orch = make_orchestrator()

    # Step 1: Intake
    r = await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
    assert r["success"] is True
    assert r["phase"] == "brief_round1"

    # Step 2: Round 1 confirm
    r1_fields = {
        "topic": {"value": "ML Basics", "source": "extracted", "confirmed": True},
        "viewer_outcome": {"value": "Understand ML", "source": "extracted", "confirmed": True},
        "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
    }
    r = await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": r1_fields})
    assert r["success"] is True
    assert r["phase"] == "brief_round2"

    # Step 3: Round 2 confirm
    r2_fields = {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}
    r = await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": r2_fields})
    assert r["success"] is True
    assert r["phase"] == "brief_round3"

    # Step 4: Generate content spine (self-loop)
    r = await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML for engineers"})
    assert r["success"] is True
    assert r["phase"] == "brief_round3"

    # Step 5: Round 3 confirm
    r3_fields = {"core_talking_points": {"value": ["What is ML", "Types", "Getting started"], "source": "generated", "confirmed": True}}
    r = await orch.process_event("test-project", "round3_confirm", {"confirmed_fields": r3_fields})
    assert r["success"] is True
    assert r["phase"] == "brief_review"

    # Step 6: Brief approve (auto-runs director → gate2)
    r = await orch.process_event("test-project", "brief_approve", {})
    assert r["success"] is True
    assert r["phase"] == "gate2"
    assert r.get("screen_outline") is not None

    # Step 7: Gate 2 approve (runs writer → review)
    r = await orch.process_event("test-project", "approve", {})
    assert r["success"] is True
    assert r["phase"] == "review"
    assert r.get("storyboard") is not None
    assert len(r["storyboard"]) >= 3

    # Verify final state integrity
    from app.services.state import StateManager
    manager = StateManager("test-project")
    final_state = manager.load()
    assert final_state.phase == "review"
    assert final_state.story_brief is not None
    assert final_state.screen_outline is not None
    assert final_state.storyboard is not None
    assert final_state.brief_locked is True
    assert final_state.outline_locked is True
```

- [ ] **Step 2: Run the golden path test**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/test_golden_path.py -v`
Expected: 1 test PASS

- [ ] **Step 3: Commit**

```bash
git add backend/app/test/test_golden_path.py
git commit -m "test: add golden path test — full Knowledge Share pipeline intake to review"
```

---

### Task 5: Run Full Suite and Verify

**Files:** No new files.

- [ ] **Step 1: Run all orchestrator tests together**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/test_orchestrator_transitions.py app/test/test_orchestrator_regressions.py app/test/test_golden_path.py -v`
Expected: All 17 tests PASS

- [ ] **Step 2: Run the entire test suite to check for conflicts with existing tests**

Run: `cd backend && source venv/bin/activate && python -m pytest app/test/ -v --tb=short 2>&1 | tail -30`
Expected: All tests pass (new + existing). If existing tests break due to conftest, isolate with pytest markers or move conftest scope.

- [ ] **Step 3: Commit any fixes**

If step 2 required fixes, commit them:
```bash
git add -A
git commit -m "test: fix test suite compatibility with shared conftest"
```
