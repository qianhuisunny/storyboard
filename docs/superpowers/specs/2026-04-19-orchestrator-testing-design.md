# Orchestrator Testing Design Spec

**Date:** 2026-04-19
**Goal:** Regression prevention + demo stability for the orchestrator pipeline
**Approach:** State transition unit tests + end-to-end golden path test

---

## Scope

### In scope
- Orchestrator `process_event` state transitions (~10 high-risk handlers; remaining low-risk transitions covered implicitly by golden path)
- Data writeback correctness (confirmed_fields → story_brief["fields"])
- Cascade delete behavior (go_back transitions clear downstream data)
- Golden path: intake → round1/2/3 → brief_review → gate1 → gate2 → review

### Out of scope
- LLM response quality (eval system handles this)
- Frontend rendering
- HTTP layer (tests call orchestrator directly, not FastAPI)
- Quality gate scoring logic (mocked to pass)
- `_extract_json` edge cases (can add later)

---

## Test File Structure

```
backend/app/test/
├── conftest.py                        # Shared fixtures
├── test_orchestrator_transitions.py   # Single-step transition tests
├── test_orchestrator_regressions.py   # Bugs from PROGRESS.md → test cases
└── test_golden_path.py                # Full pipeline chain test
```

---

## Mock Strategy

### Agents
Mock all agents to return fixed JSON. No BaseAgent inheritance, no prompt loading, no LLM calls.

```python
class MockDirector:
    async def run(self, state, **kwargs):
        return {"sections": [{"title": "Section 1", "screens": [...]}]}

class MockWriter:
    async def run(self, state, **kwargs):
        return {"screens": [{"screen_number": 1, "voiceover": "..."}]}
```

### Quality Gate
Mock to always return passing score (composite > 7.0). Quality gate internals are out of scope.

### StateManager
Use in-memory dict instead of SQLite. Override `load()` and `save()` to read/write from a dict fixture.

### Mock Data Source
Use structures from `data/example/` as templates for mock agent return values, ensuring JSON schema matches real pipeline output.

---

## Test Cases

### Part 1: State Transition Tests (`test_orchestrator_transitions.py`)

High-risk transitions (~10 cases):

| # | Start Phase | Event | Expected Phase | Key Assertion |
|---|-------------|-------|----------------|---------------|
| 1 | `intake` | `submit_knowledge_share` | `brief_round1` | state.story_brief initialized with intake fields |
| 2 | `brief_round1` | `round1_confirm` | `brief_round2` | confirmed fields written to story_brief["fields"] |
| 3 | `brief_round2` | `round2_confirm` | `brief_round3` | round1 fields preserved, round2 fields added |
| 4 | `brief_round3` | `generate_content_spine` | `brief_round3` | content_spine populated, phase stays |
| 5 | `brief_round3` | `round3_confirm` | `brief_review` | all 3 rounds' fields present in story_brief |
| 6 | `brief_review` | `brief_approve` | `gate1` | brief locked, story_brief complete |
| 7 | `gate1` | `approve` | `gate2` | director called, screen_outline populated |
| 8 | `gate2` | `approve` | `review` | writer called, storyboard populated |
| 9 | `gate2` | `go_back_gate1` | `gate1` | outline AND storyboard cleared |
| 10 | `review` | `go_back_gate2` | `gate2` | storyboard cleared, outline preserved |

Invalid transition test:

| # | Start Phase | Event | Expected |
|---|-------------|-------|----------|
| 11 | `outline` | `brief_approve` | raises InvalidTransitionError |

### Part 2: Regression Tests (`test_orchestrator_regressions.py`)

Each case maps to a specific lesson from PROGRESS.md:

| # | Bug (from PROGRESS.md) | Test |
|---|------------------------|------|
| 1 | round1_confirm didn't write back to story_brief["fields"] | After round1_confirm, assert `state.story_brief["fields"]["field_name"]` == confirmed value |
| 2 | round2_confirm same bug | Same assertion for round2 fields |
| 3 | round3_confirm same bug | Same assertion for round3 fields |
| 4 | gate2_edit cascade: target=outline should clear storyboard | After edit(target="outline"), assert `state.storyboard is None` |
| 5 | review_edit three-way branch: target=gate1 | Assert both outline and storyboard cleared, phase=gate1 |

### Part 3: Golden Path Test (`test_golden_path.py`)

One test case that chains the full Knowledge Share flow:

```python
async def test_golden_path_knowledge_share():
    orch = make_orchestrator_with_mocks()
    state = make_initial_state()

    # Step 1: Intake
    state = await orch.process_event(state, "submit_knowledge_share", payload={...})
    assert state.phase == "brief_round1"

    # Step 2-4: Three rounds of brief building
    state = await orch.process_event(state, "round1_confirm", payload={...})
    assert state.phase == "brief_round2"
    assert "topic" in state.story_brief["fields"]

    state = await orch.process_event(state, "round2_confirm", payload={...})
    assert state.phase == "brief_round3"

    state = await orch.process_event(state, "generate_content_spine", payload={...})
    assert state.phase == "brief_round3"  # stays
    assert state.story_brief.get("content_spine") is not None

    state = await orch.process_event(state, "round3_confirm", payload={...})
    assert state.phase == "brief_review"

    # Step 5: Brief approval
    state = await orch.process_event(state, "brief_approve", payload={})
    assert state.phase == "gate1"

    # Step 6: Outline generation
    state = await orch.process_event(state, "approve", payload={})
    assert state.phase == "gate2"
    assert state.screen_outline is not None

    # Step 7: Storyboard generation
    state = await orch.process_event(state, "approve", payload={})
    assert state.phase == "review"
    assert state.storyboard is not None
```

---

## Fixtures (`conftest.py`)

```python
import pytest
from app.services.orchestrator import StoryboardOrchestrator
from app.services.state import StoryboardState

@pytest.fixture
def mock_agents():
    """All agents return fixed JSON, no LLM calls."""
    return {
        "brief_builder": MockBriefBuilder(),
        "director": MockDirector(),
        "writer": MockWriter(),
    }

@pytest.fixture
def mock_quality_gate():
    """Always passes with score 8.0."""
    return MockQualityGate(score=8.0)

@pytest.fixture
def make_state():
    """Factory fixture: create state at any phase with optional pre-populated data."""
    def _make(phase="intake", story_brief=None, screen_outline=None, storyboard=None):
        return StoryboardState(
            project_id="test-project",
            phase=phase,
            story_brief=story_brief or {},
            screen_outline=screen_outline,
            storyboard=storyboard,
        )
    return _make

@pytest.fixture
def make_orchestrator(mock_agents, mock_quality_gate):
    """Orchestrator with all agents mocked."""
    def _make():
        orch = StoryboardOrchestrator()
        orch.agents = mock_agents
        orch.quality_gate = mock_quality_gate
        return orch
    return _make
```

---

## Running Tests

```bash
cd backend
source venv/bin/activate
python -m pytest app/test/test_orchestrator_transitions.py -v
python -m pytest app/test/test_orchestrator_regressions.py -v
python -m pytest app/test/test_golden_path.py -v

# All together
python -m pytest app/test/ -v
```

---

## Estimated Scope

| File | Cases | Purpose |
|------|-------|---------|
| test_orchestrator_transitions.py | ~11 | High-risk single-step transitions + 1 invalid transition |
| test_orchestrator_regressions.py | ~5 | Each PROGRESS.md bug → a test |
| test_golden_path.py | 1 | Full chain, ~8 assertions |
| conftest.py | — | Fixtures only |
| **Total** | **~17** | |
