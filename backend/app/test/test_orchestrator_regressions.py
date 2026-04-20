"""
Regression tests: each test reproduces a specific bug from PROGRESS.md.
These tests exist to prevent known bugs from recurring.
"""
import pytest
from app.services.state import StateManager
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestFieldWritebackRegressions:
    """
    Bug: round confirm handlers didn't write confirmed_fields back to
    state.story_brief["fields"]. User's input was lost on page refresh.
    """

    async def _setup_to_round1(self, orch):
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})

    async def test_round1_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await self._setup_to_round1(orch)
        confirmed = {"topic": {"value": "User Edited Topic", "source": "extracted", "confirmed": True}}
        result = await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": confirmed})
        assert result["success"] is True
        manager = StateManager("test-project")
        state = await manager.load()
        assert state.story_brief is not None
        assert state.story_brief["fields"]["topic"]["value"] == "User Edited Topic"

    async def test_round2_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await self._setup_to_round1(orch)
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}
        })
        r2_confirmed = {"format_style": {"value": "User Picked Workshop", "source": "extracted", "confirmed": True}}
        result = await orch.process_event("test-project", "round2_confirm", {"confirmed_fields": r2_confirmed})
        assert result["success"] is True
        manager = StateManager("test-project")
        state = await manager.load()
        assert state.story_brief["fields"]["format_style"]["value"] == "User Picked Workshop"
        assert state.story_brief["fields"]["topic"]["value"] == "ML"

    async def test_round3_confirm_writes_back_to_story_brief(self, make_orchestrator, patch_state_manager):
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
        manager = StateManager("test-project")
        state = await manager.load()
        assert state.story_brief["fields"]["core_talking_points"]["value"] == ["A", "B"]
        assert "topic" in state.story_brief["fields"]
        assert "format_style" in state.story_brief["fields"]


@pytest.mark.asyncio
class TestCascadeDeleteRegressions:
    """
    Bug: gate2_edit with target=gate1 should clear outline.
    Bug: review_edit with target=gate1 should clear both outline and storyboard.
    """

    async def test_gate2_edit_target_gate1_cascade(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        await manager.save(state)
        result = await orch.process_event("test-project", "edit", {"target": "gate1"})
        assert result["success"] is True
        assert result["phase"] == "gate1"
        loaded = await manager.load()
        assert loaded.screen_outline is None
        assert loaded.brief_locked is False
        assert loaded.outline_locked is False

    async def test_review_edit_target_gate1_cascade(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(
            phase="review",
            story_brief={"fields": {"topic": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            storyboard=list(MOCK_STORYBOARD),
            brief_locked=True,
            outline_locked=True,
        )
        await manager.save(state)
        result = await orch.process_event("test-project", "edit", {"target": "gate1"})
        assert result["success"] is True
        assert result["phase"] == "gate1"
        loaded = await manager.load()
        assert loaded.storyboard is None
        assert loaded.screen_outline is None
        assert loaded.outline_locked is False
        assert loaded.brief_locked is False
