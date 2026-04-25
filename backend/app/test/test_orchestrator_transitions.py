"""
Orchestrator state transition tests.
Each test: given phase + event + payload → verify phase changed + data correct.
"""
import pytest
from app.services.state import StateManager, StoryboardState
from app.test.conftest import MOCK_INTAKE_FORM, MOCK_OUTLINE, MOCK_STORYBOARD


@pytest.mark.asyncio
class TestKnowledgeShareTransitions:

    async def test_intake_to_brief_round1(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        result = await orch.process_event(
            "test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM},
        )
        assert result["success"] is True
        assert result["phase"] == "brief_round1"
        assert result.get("brief_fields") is not None
        assert "topic" in result["brief_fields"]

    async def test_round1_confirm_to_brief_round2(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        confirmed = {
            "topic": {"value": "ML Basics (edited)", "source": "extracted", "confirmed": True},
            "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
        }
        result = await orch.process_event("test-project", "round1_confirm", {"confirmed_fields": confirmed})
        assert result["success"] is True
        assert result["phase"] == "brief_round2"
        assert result["state"]["confirmed_fields"]["topic"]["value"] == "ML Basics (edited)"

    async def test_round2_confirm_to_brief_round3(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML Basics", "source": "extracted", "confirmed": True}}
        })
        result = await orch.process_event("test-project", "round2_confirm", {
            "confirmed_fields": {"format_style": {"value": "Workshop", "source": "extracted", "confirmed": True}}
        })
        assert result["success"] is True
        assert result["phase"] == "brief_round3"
        assert result["state"]["confirmed_fields"]["topic"]["value"] == "ML Basics"
        assert result["state"]["confirmed_fields"]["format_style"]["value"] == "Workshop"

    async def test_generate_content_spine_stays_in_round3(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "round2_confirm", {
            "confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}
        })
        result = await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML for engineers"})
        assert result["success"] is True
        assert result["phase"] == "brief_round3"
        assert result.get("brief_fields") is not None

    async def test_round3_confirm_to_brief_review(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "round2_confirm", {
            "confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML"})
        result = await orch.process_event("test-project", "round3_confirm", {
            "confirmed_fields": {"core_talking_points": {"value": ["Topic A", "Topic B"], "source": "generated", "confirmed": True}}
        })
        assert result["success"] is True
        assert result["phase"] == "brief_review"
        assert result["state"]["confirmed_fields"]["topic"]["value"] == "ML"
        assert result["state"]["confirmed_fields"]["format_style"]["value"] == "Tutorial"
        assert result["state"]["confirmed_fields"]["core_talking_points"]["value"] == ["Topic A", "Topic B"]

    async def test_brief_approve_to_gate2(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
        await orch.process_event("test-project", "round1_confirm", {
            "confirmed_fields": {
                "topic": {"value": "ML", "source": "extracted", "confirmed": True},
                "viewer_outcome": {"value": "Learn ML", "source": "extracted", "confirmed": True},
                "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            }
        })
        await orch.process_event("test-project", "round2_confirm", {
            "confirmed_fields": {"format_style": {"value": "Tutorial", "source": "extracted", "confirmed": True}}
        })
        await orch.process_event("test-project", "generate_content_spine", {"point_of_view": "Practical ML"})
        await orch.process_event("test-project", "round3_confirm", {
            "confirmed_fields": {"core_talking_points": {"value": ["A", "B", "C"], "source": "generated", "confirmed": True}}
        })
        result = await orch.process_event("test-project", "brief_approve", {})
        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result.get("screen_outline") is not None
        assert result.get("brief_locked") is True

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

    async def test_edit_brief_alias_routes_to_edit(self, make_orchestrator, patch_state_manager):
        orch = make_orchestrator()
        manager = StateManager("test-project")
        state = StoryboardState(
            project_id="test-project",
            phase="brief_review",
            story_brief={"fields": {"topic": {"value": "ML", "source": "extracted", "confirmed": True}}},
        )
        await manager.save(state)

        result = await orch.process_event("test-project", "edit_brief", {})
        assert result["success"] is True
        assert result["event"] == "edit"
        assert result["phase"] == "brief_round1"


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
                "core_talking_points": {"value": ["A", "B"], "source": "generated", "confirmed": True},
            }},
            brief_locked=True,
        )
        await manager.save(state)
        result = await orch.process_event("test-project", "approve", {})
        assert result["success"] is True
        assert result["phase"] == "gate2"
        assert result.get("screen_outline") is not None

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
            story_brief={"fields": {"topic": {"value": "ML"}}},
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
        assert result["state"]["has_screen_outline"] is False
        assert result["state"]["has_storyboard"] is False
        assert result["state"]["brief_locked"] is False

    async def test_review_go_back_gate2_clears_storyboard_preserves_outline(self, make_orchestrator, make_state, patch_state_manager):
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
        result = await orch.process_event("test-project", "brief_approve", {})
        assert result["success"] is False
        assert "Invalid" in result.get("error", "") or "Invalid" in result.get("message", "")
