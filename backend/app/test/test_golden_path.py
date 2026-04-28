"""
Golden path test: streamlined Knowledge Share pipeline from intake to review.
"""
import pytest
from app.services.state import StateManager
from app.test.conftest import MOCK_INTAKE_FORM


@pytest.mark.asyncio
async def test_golden_path_knowledge_share(make_orchestrator, patch_state_manager):
    """
    Full Knowledge Share flow:
    intake -> brief_chat
    -> chat_brief_approve -> gate1
    -> approve -> gate2
    -> approve -> review
    """
    orch = make_orchestrator()

    r = await orch.process_event("test-project", "submit_knowledge_share", {"intake_form": MOCK_INTAKE_FORM})
    assert r["success"] is True
    assert r["phase"] == "brief_chat"
    assert r.get("brief_fields") is not None

    all_fields = {
        "viewer_outcome": {"value": "Understand ML", "source": "extracted", "confirmed": True},
        "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
        "core_talking_points": {"value": ["What is ML", "Types", "Getting started"], "source": "inferred", "confirmed": True},
    }
    r = await orch.process_event("test-project", "chat_brief_approve", {"all_fields": all_fields})
    assert r["success"] is True
    assert r["phase"] == "gate1"
    assert r.get("story_brief") is not None

    r = await orch.process_event("test-project", "approve", {})
    assert r["success"] is True
    assert r["phase"] == "gate2"
    assert r.get("screen_outline") is not None

    r = await orch.process_event("test-project", "approve", {})
    assert r["success"] is True
    assert r["phase"] == "review"
    assert r.get("storyboard") is not None
    assert len(r["storyboard"]) >= 3

    manager = StateManager("test-project")
    final_state = await manager.load()
    assert final_state.phase == "review"
    assert final_state.story_brief is not None
    assert final_state.screen_outline is not None
    assert final_state.storyboard is not None
    assert final_state.brief_locked is True
    assert final_state.outline_locked is True
