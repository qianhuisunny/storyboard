"""HTTP contract tests for workflow events and canonical pipeline state."""

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.engine import get_db
from app.db.models import Base
from app.db.repository import ProjectRepository
from app.main import app
from app.services.workflow import WorkflowService


async def _outline(context):
    return f"Outline: {context.intake['prompt']}"


async def _storyboard(context):
    return [{"screen_number": 1, "voiceover": context.outline}]


@pytest_asyncio.fixture
async def workflow_api(tmp_path, monkeypatch):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'api.db'}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        await ProjectRepository(session).create_project(
            "api-project", "test-user", "API"
        )

    async def override_get_db():
        async with sessions() as session:
            yield session

    service = WorkflowService(sessions, _outline, _storyboard)
    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr("app.main.workflow_service", service)
    monkeypatch.setattr(
        "app.main._project_root_dir",
        lambda project_id: tmp_path / f"project_{project_id}",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, service

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_api_maps_conflict_duplicate_and_invalid_event(workflow_api):
    client, service = workflow_api
    saved = await client.post(
        "/api/project/api-project/event",
        json={
            "event": "save_intake",
            "payload": {"content": {"prompt": "First"}, "expected_version_id": None},
        },
    )
    assert saved.status_code == 200
    current_id = saved.json()["artifacts"]["intake"]["current_version_id"]

    conflict = await client.post(
        "/api/project/api-project/event",
        json={
            "event": "save_intake",
            "payload": {"content": {"prompt": "Stale"}, "expected_version_id": None},
        },
    )
    assert conflict.status_code == 409
    assert conflict.json()["detail"] == {
        "code": "version_conflict",
        "current_version_id": current_id,
    }

    invalid = await client.post(
        "/api/project/api-project/event",
        json={"event": "save_outline", "payload": {"content": "Too soon"}},
    )
    assert invalid.status_code == 400
    assert invalid.json()["detail"]["code"] == "invalid_workflow_event"
    assert invalid.json()["detail"]["workflow_stage"] == "intake"

    entered = __import__("asyncio").Event()
    release = __import__("asyncio").Event()

    async def blocked(_context):
        entered.set()
        await release.wait()
        return "Only one"

    service.outline_generator = blocked
    first = __import__("asyncio").create_task(
        client.post(
            "/api/project/api-project/event",
            json={
                "event": "approve_intake",
                "payload": {
                    "content": {"prompt": "First"},
                    "expected_version_id": current_id,
                },
            },
        )
    )
    await entered.wait()
    duplicate = await client.post(
        "/api/project/api-project/event",
        json={
            "event": "approve_intake",
            "payload": {
                "content": {"prompt": "First"},
                "expected_version_id": current_id,
            },
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["detail"]["code"] == "duplicate_job"
    assert duplicate.json()["detail"]["job"]["status"] == "running"
    release.set()
    assert (await first).status_code == 200


@pytest.mark.asyncio
async def test_api_maps_generation_failure_and_get_returns_persisted_failed_state(
    workflow_api,
):
    client, service = workflow_api

    async def failing(_context):
        raise RuntimeError("quality provider timed out")

    service.outline_generator = failing
    failed = await client.post(
        "/api/project/api-project/event",
        json={
            "event": "approve_intake",
            "payload": {
                "content": {"prompt": "Persist the failure"},
                "expected_version_id": None,
            },
        },
    )

    assert failed.status_code == 502
    assert failed.json()["detail"]["code"] == "workflow_generation_failed"
    assert "quality provider timed out" in failed.json()["detail"]["message"]

    state = await client.get("/api/project/api-project/pipeline-state")
    assert state.status_code == 200
    body = state.json()
    assert body["workflow_stage"] == body["phase"] == "outline"
    assert body["job"]["status"] == "failed"
    assert body["job"]["error"] == "quality provider timed out"
    assert body["allowed_events"] == body["available_events"]


@pytest.mark.asyncio
async def test_get_pipeline_state_hydrates_legacy_aliases(workflow_api):
    client, service = workflow_api
    legacy = {
        "project_id": "api-project",
        "phase": "review",
        "story_brief": {"prompt": "Legacy brief"},
        "screen_outline": "Legacy outline",
        "storyboard": [{"screen_number": 1}],
    }
    async with service.sessionmaker() as session:
        await ProjectRepository(session).update_pipeline_state(
            "api-project", "review", "pending", legacy
        )

    response = await client.get("/api/project/api-project/pipeline-state")

    assert response.status_code == 200
    body = response.json()
    assert body["workflow_stage"] == "storyboard"
    assert body["phase"] == "review"
    assert body["data"]["story_brief"] == legacy["story_brief"]
    assert body["data"]["screen_outline"] == legacy["screen_outline"]
    assert body["data"]["storyboard"] == legacy["storyboard"]
    assert body["artifacts"]["storyboard"]["current_content"] == legacy["storyboard"]


@pytest.mark.asyncio
async def test_created_project_persists_canonical_create_intake_across_reload(workflow_api):
    client, service = workflow_api
    create = await client.post(
        "/api/create-project",
        json={
            "projectId": "durable-create",
            "typeId": 1,
            "typeName": "Video storyboard",
            "userInput": "Something about organizing a team offsite",
            "userId": "owner-123",
        },
    )
    assert create.status_code == 200
    async with service.sessionmaker() as session:
        project = await ProjectRepository(session).get_project("durable-create")
        assert project is not None
        assert project.user_id == "owner-123"

    intake = {
        "prompt": "Something about organizing a team offsite",
        "duration_seconds": 120,
        "platform": "internal_lms",
        "aspect_ratio": "9:16",
        "source_snapshot": "The kickoff memo says to decide owners first.",
        "sources": [
            {
                "id": "source-1",
                "kind": "link",
                "name": "Kickoff memo",
                "url": "https://example.com/kickoff",
                "status": "ready",
                "path": "links/example.txt",
            }
        ],
    }
    saved = await client.post(
        "/api/project/durable-create/event",
        json={
            "event": "save_intake",
            "payload": {"content": intake, "expected_version_id": None},
        },
    )
    assert saved.status_code == 200

    reloaded = await client.get("/api/project/durable-create/pipeline-state")
    assert reloaded.status_code == 200
    body = reloaded.json()
    assert body["workflow_stage"] == "intake"
    assert body["artifacts"]["intake"]["current_content"] == intake
    assert body["artifacts"]["intake"]["current_version_id"]
    assert "target_audience" not in body["artifacts"]["intake"]["current_content"]
    assert "intent_route" not in body["artifacts"]["intake"]["current_content"]


@pytest.mark.asyncio
async def test_stage_autosave_and_workflow_transition_preserve_each_others_state(
    workflow_api, monkeypatch
):
    client, service = workflow_api
    async with service.sessionmaker() as session:
        repo = ProjectRepository(session)
        initial_row = await repo.get_pipeline_state("api-project")
        initial_revision = repo.parse_state_data(initial_row).get("state_revision")
    assert initial_revision is not None

    stage_at_update = asyncio.Event()
    release_stage = asyncio.Event()
    original_update = ProjectRepository.update_pipeline_state
    paused = False

    async def pause_stage_update(
        repo, project_id, phase, status, state_data, commit=True, **kwargs
    ):
        nonlocal paused
        if not paused and "currentStageId" in state_data:
            paused = True
            stage_at_update.set()
            await release_stage.wait()
        return await original_update(
            repo,
            project_id,
            phase,
            status,
            state_data,
            commit=commit,
            **kwargs,
        )

    monkeypatch.setattr(
        ProjectRepository, "update_pipeline_state", pause_stage_update
    )

    stage_save = asyncio.create_task(
        client.post(
            "/api/project/api-project/stages",
            json={
                "stages": {
                    "2": {
                        "aiVersion": "autosaved AI outline",
                        "humanVersion": "autosaved human outline",
                    }
                },
                "currentStageId": 2,
                "stageStatuses": [
                    {"id": 1, "status": "approved"},
                    {"id": 2, "status": "in_progress"},
                ],
            },
        )
    )
    await asyncio.wait_for(stage_at_update.wait(), timeout=2)
    workflow_save = asyncio.create_task(
        service.process_event(
            "api-project",
            "save_intake",
            {
                "content": {"prompt": "Concurrent workflow edit"},
                "expected_version_id": None,
            },
        )
    )

    await asyncio.sleep(0.1)
    release_stage.set()
    stage_response, workflow_response = await asyncio.gather(
        stage_save, workflow_save
    )

    assert stage_response.status_code == 200
    assert workflow_response["artifacts"]["intake"]["current_version_id"]
    async with service.sessionmaker() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state("api-project")
        raw = repo.parse_state_data(row)
        snapshot = await repo.get_stage_snapshot("api-project", 2)

    assert raw["currentStageId"] == 2
    assert raw["stageStatuses"][-1] == {"id": 2, "status": "in_progress"}
    assert raw["artifacts"]["intake"]["current_version_id"]
    assert raw["state_revision"] != initial_revision
    assert snapshot.ai_version == "autosaved AI outline"
    assert snapshot.human_version == "autosaved human outline"
