"""
Regression tests for known state writeback and cascade-delete bugs.
"""
import pytest
from app.services.state import StateManager
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestBriefWritebackRegressions:
    """
    Bug: final chat-approved brief fields were not fully written back to
    state.story_brief["fields"], which caused stale data on refresh.
    """

    async def test_chat_brief_approve_writes_all_fields_back_to_story_brief(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})

        all_fields = {
            "viewer_outcome": {"value": "User Edited Outcome", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Non-technical builders", "source": "extracted", "confirmed": True},
            "core_talking_points": {"value": ["A", "B"], "source": "inferred", "confirmed": True},
        }
        result = await orch.process_event("test-project", "chat_brief_approve", {"all_fields": all_fields})
        assert result["success"] is True

        manager = StateManager("test-project")
        state = await manager.load()
        assert state.story_brief is not None
        assert state.phase == "gate1"
        assert state.story_brief["fields"]["viewer_outcome"]["value"] == "User Edited Outcome"
        assert state.story_brief["fields"]["target_audience"]["value"] == "Non-technical builders"
        assert state.story_brief["fields"]["core_talking_points"]["value"] == ["A", "B"]

    async def test_submit_knowledge_share_is_idempotent_after_initialization(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()

        first = await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        assert first["success"] is True
        assert first["phase"] == "brief_chat"
        assert first.get("brief_fields") is not None

        second = await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        assert second["success"] is True
        assert second["phase"] == "brief_chat"
        assert second.get("brief_fields") == first.get("brief_fields")

        manager = StateManager("test-project")
        state = await manager.load()
        assert state.phase == "brief_chat"
        assert state.story_brief is not None


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
            story_brief={"fields": {"viewer_outcome": {"value": "ML"}}},
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
            story_brief={"fields": {"viewer_outcome": {"value": "ML"}}},
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
