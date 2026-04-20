"""
Golden path test: full Knowledge Share pipeline from intake to review.
"""
import pytest
from app.services.state import StateManager
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
    manager = StateManager("test-project")
    final_state = await manager.load()
    assert final_state.phase == "review"
    assert final_state.story_brief is not None
    assert final_state.screen_outline is not None
    assert final_state.storyboard is not None
    assert final_state.brief_locked is True
    assert final_state.outline_locked is True
