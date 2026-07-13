import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.models import Base
from app.db.repository import ProjectRepository
from app.main import _frontend_stage_summary, _frontend_stage_view


def test_gate2_stage_view_overrides_stale_saved_statuses():
    state_data = {
        "currentStageId": 2,
        "stageStatuses": [
            {"id": 1, "status": "approved"},
            {"id": 2, "status": "approved"},
            {"id": 3, "status": "not_started"},
            {"id": 4, "status": "not_started"},
        ],
    }

    current_stage, statuses = _frontend_stage_view("gate2", state_data)
    _, progress = _frontend_stage_summary("gate2", state_data)

    assert current_stage == 2
    assert statuses == [
        {"id": 1, "status": "approved"},
        {"id": 2, "status": "needs_review"},
        {"id": 3, "status": "not_started"},
        {"id": 4, "status": "not_started"},
    ]
    assert progress == 25


def test_review_phase_keeps_storyboard_authoritative_over_approved_snapshot():
    state_data = {
        "currentStageId": 4,
        "stageStatuses": [
            {"id": 1, "status": "approved"},
            {"id": 2, "status": "approved"},
            {"id": 3, "status": "approved"},
            {"id": 4, "status": "needs_review"},
        ],
    }

    current_stage, statuses = _frontend_stage_view("review", state_data)

    assert current_stage == 3
    assert statuses == [
        {"id": 1, "status": "approved"},
        {"id": 2, "status": "approved"},
        {"id": 3, "status": "needs_review"},
        {"id": 4, "status": "not_started"},
    ]


@pytest.mark.parametrize(
    "phase",
    ["brief_round1", "brief_round2", "brief_round3", "angle_selection"],
)
def test_historical_briefing_phases_override_stale_frontend_progress(phase):
    state_data = {
        "currentStageId": 4,
        "stageStatuses": [
            {"id": stage_id, "status": "approved"}
            for stage_id in range(1, 5)
        ],
    }

    current_stage, statuses = _frontend_stage_view(phase, state_data)

    assert current_stage == 1
    assert statuses[0] == {"id": 1, "status": "in_progress"}
    assert all(status["status"] == "not_started" for status in statuses[1:])


@pytest.mark.asyncio
async def test_anonymous_project_history_includes_legacy_local_users(tmp_path):
    db_path = tmp_path / "plotline.db"
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}")
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project("current", "anon_current", "Current")
        await repo.create_project("legacy", "user_legacy", "Legacy")
        await repo.create_project("batch", "codex-batch", "Batch")

        projects = await repo.list_projects("anon_current", include_legacy_local=True)

    assert {project.id for project in projects} == {"current", "legacy"}

    await engine.dispose()
