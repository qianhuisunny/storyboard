"""
Orchestrator transition tests for the streamlined Knowledge Share flow.
"""
import pytest
from app.services.agents.storyboard_director import StoryboardDirector
from app.services.state import StateManager, StoryboardState
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestKnowledgeShareTransitions:

    async def test_intake_to_brief_chat(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        result = await orch.process_event(
            "test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM},
        )
        assert result["success"] is True
        assert result["phase"] == "brief_chat"
        assert result.get("brief_fields") is not None

    async def test_chat_brief_approve_to_gate1(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        all_fields = {
            "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            "core_talking_points": {"value": ["A", "B", "C"], "source": "inferred", "confirmed": True},
        }
        result = await orch.process_event("test-project", "chat_brief_approve", {"all_fields": all_fields})
        assert result["success"] is True
        assert result["phase"] == "gate1"
        assert result.get("story_brief") is not None
        assert result.get("brief_locked") is False

    async def test_approve_alias_from_brief_review_routes_to_brief_approve(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = StoryboardState(
            project_id="test-project",
            phase="brief_review",
            story_brief={"fields": {
                "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
                "core_talking_points": {"value": ["Hook", "Body", "Closing"], "source": "generated", "confirmed": True},
            }},
        )
        await manager.save(state)

        result = await orch.process_event("test-project", "approve", {})
        assert result["success"] is True
        assert result["event"] == "brief_approve"
        assert result["phase"] == "gate2"

    async def test_edit_brief_alias_routes_to_brief_chat(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = StoryboardState(
            project_id="test-project",
            phase="brief_review",
            story_brief={"fields": {"viewer_outcome": {"value": "ML", "source": "extracted", "confirmed": True}}},
        )
        await manager.save(state)

        result = await orch.process_event("test-project", "edit_brief", {})
        assert result["success"] is True
        assert result["event"] == "edit"
        assert result["phase"] == "brief_chat"


@pytest.mark.asyncio
class TestGateTransitions:

    async def test_gate1_approve_generates_outline(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(
            phase="gate1",
            story_brief={"fields": {
                "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            }},
            brief_locked=True,
        )
        await manager.save(state)
        result = await orch.process_event("test-project", "approve", {})
        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result.get("screen_outline") is not None

    async def test_gate1_flat_legacy_brief_retains_goal_and_key_points_in_director_prompt(
        self, make_orchestrator, make_state, patch_state_manager
    ):
        orch = make_orchestrator()
        captured = []

        class CapturingDirector:
            prompt_file = StoryboardDirector.prompt_file

            def run(self, state, **_kwargs):
                captured.append(StoryboardDirector()._build_prompt(state.story_brief))
                return MOCK_OUTLINE

        orch.agents["director"] = CapturingDirector()
        manager = StateManager("test-project")
        flat_brief = {
            "video_goal": "Teach safe deployments",
            "target_audience": "Engineering leads",
            "key_points": ["Stop the rollout", "Restore service"],
        }
        await manager.save(
            make_state(
                phase="gate1",
                story_brief=flat_brief,
                brief_locked=True,
            )
        )

        result = await orch.process_event("test-project", "approve", {})

        assert result["success"] is True
        assert "Teach safe deployments" in captured[0]
        assert "Stop the rollout" in captured[0]
        assert (await manager.load()).story_brief == flat_brief

    async def test_gate2_approve_generates_storyboard(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={"fields": {
                "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
                "core_talking_points": {"value": ["A", "B"], "source": "generated", "confirmed": True},
            }},
            screen_outline=MOCK_OUTLINE,
            brief_locked=True,
        )
        await manager.save(state)
        result = await orch.process_event("test-project", "approve", {})
        assert result["success"] is True
        assert result["phase"] == "review"
        assert result.get("storyboard") is not None
        assert len(result["storyboard"]) >= 3

    async def test_gate2_refine_alias_routes_to_refine_outline(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(
            phase="gate2",
            story_brief={"fields": {"viewer_outcome": {"value": "ML"}}},
            screen_outline=MOCK_OUTLINE,
            brief_locked=True,
        )
        await manager.save(state)

        result = await orch.process_event(
            "test-project",
            "refine",
            {"feedback": "Make the ending sharper", "current_outline": MOCK_OUTLINE},
        )
        assert result["success"] is True
        assert result["event"] == "refine_outline"
        assert result["phase"] == "gate2"
        assert "Refined Outline" in result["screen_outline"]

    async def test_gate2_go_back_clears_outline_and_storyboard(self, make_orchestrator, make_state, patch_state_manager):
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
        assert result["state"]["has_screen_outline"] is False
        assert result["state"]["has_storyboard"] is False
        assert result["state"]["brief_locked"] is False

    async def test_review_go_back_gate2_clears_storyboard_preserves_outline(self, make_orchestrator, make_state, patch_state_manager):
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
        result = await orch.process_event("test-project", "edit", {"target": "gate2"})
        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result["state"]["has_storyboard"] is False
        assert result["state"]["has_screen_outline"] is True


@pytest.mark.asyncio
class TestInvalidTransitions:

    async def test_invalid_event_for_phase(self, make_orchestrator, make_state, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = make_state(phase="outline")
        await manager.save(state)
        result = await orch.process_event("test-project", "chat_brief_approve", {})
        assert result["success"] is False
        assert "Invalid" in result.get("error", "") or "Invalid" in result.get("message", "")
