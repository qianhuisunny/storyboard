"""Concurrency and persistence tests for the four-stage workflow service."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.models import Base
from app.db.repository import ProjectRepository
from app.services.orchestrator import StoryboardOrchestrator
from app.services.state import JobOverlay, StateManager, StoryboardState
from app.services.workflow import (
    DuplicateJobError,
    InvalidWorkflowEvent,
    VersionConflictError,
    WorkflowGenerationError,
    WorkflowService,
)


async def _workflow_database(tmp_path, project_id="workflow-project"):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / (project_id + '.db')}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        await ProjectRepository(session).create_project(
            project_id, "test-user", "Workflow"
        )
    return engine, sessions


async def _outline(context):
    return f"Outline for {context.intake['prompt']}"


async def _storyboard(context):
    return [{"screen_number": 1, "voiceover": context.outline}]


async def _reach_storyboard(service, project_id="workflow-project"):
    outlined = await service.process_event(
        project_id,
        "approve_intake",
        {"content": {"prompt": "Storyboard setup"}, "expected_version_id": None},
    )
    outline = outlined["artifacts"]["outline"]
    return await service.process_event(
        project_id,
        "approve_outline",
        {
            "content": outline["current_content"],
            "expected_version_id": outline["current_version_id"],
        },
    )


async def _make_storyboard_stale(sessions, project_id="workflow-project"):
    async with sessions() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state(project_id)
        state = StoryboardState(**repo.parse_state_data(row))
        new_outline = await repo.create_artifact_version(
            project_id,
            "outline",
            "New approved outline",
            "human",
            based_on_version_id=state.artifacts["intake"].approved_version_id,
            commit=False,
        )
        state.artifacts["outline"].current_version_id = new_outline.id
        state.artifacts["outline"].approved_version_id = new_outline.id
        state.artifacts["storyboard"].needs_update = True
        state.screen_outline = "New approved outline"
        await repo.update_pipeline_state(
            project_id,
            "storyboard",
            "pending",
            state.model_dump(),
            commit=False,
        )
        await session.commit()
    return new_outline.id


@pytest.mark.asyncio
async def test_initial_save_reuses_identical_content_without_changing_stage(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    content = {"prompt": "Explain versioned workflows"}

    first = await service.process_event(
        "workflow-project",
        "save_intake",
        {"content": content, "expected_version_id": None},
    )
    second = await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": content,
            "expected_version_id": first["artifacts"]["intake"]["current_version_id"],
        },
    )

    assert first["workflow_stage"] == second["workflow_stage"] == "intake"
    assert first["phase"] == second["phase"] == "intake"
    assert second["artifacts"]["intake"]["current_content"] == content
    assert second["artifacts"]["intake"]["current_version_id"] == first["artifacts"]["intake"]["current_version_id"]
    assert len(second["artifacts"]["intake"]["versions"]) == 1

    await engine.dispose()


@pytest.mark.asyncio
async def test_approve_is_atomic_and_generated_artifact_tracks_approved_input(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    seen = []

    async def outline_generator(context):
        seen.append(context)
        return "Section 1 — Safe state"

    service = WorkflowService(sessions, outline_generator, _storyboard)
    content = {"prompt": "Teach atomic promotion"}
    response = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": content, "expected_version_id": None},
    )

    intake = response["artifacts"]["intake"]
    outline = response["artifacts"]["outline"]
    assert response["workflow_stage"] == response["phase"] == "outline"
    assert intake["approved_version_id"] == intake["current_version_id"]
    assert outline["current_content"] == "Section 1 — Safe state"
    assert outline["versions"][0]["based_on_version_id"] == intake["approved_version_id"]
    assert outline["versions"][0]["created_by"] == "ai"
    assert response["job"]["status"] == "idle"
    assert seen[0].intake == content
    assert seen[0].input_version_id == intake["approved_version_id"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_target_edit_during_generation_keeps_ai_result_history_only(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def blocked_outline(_context):
        entered.set()
        await release.wait()
        return "Late AI outline"

    service = WorkflowService(sessions, blocked_outline, _storyboard)
    generation = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {"content": {"prompt": "Target ownership"}, "expected_version_id": None},
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    running = await service.get_project("workflow-project")
    assert running["job"]["target_version_id"] is None
    assert datetime.fromisoformat(running["job"]["started_at"]).tzinfo is not None

    human = await service.process_event(
        "workflow-project",
        "save_outline",
        {"content": "Human-owned outline", "expected_version_id": None},
    )
    human_id = human["artifacts"]["outline"]["current_version_id"]
    release.set()
    await generation

    final = await service.get_project("workflow-project")
    assert final["artifacts"]["outline"]["current_version_id"] == human_id
    assert final["artifacts"]["outline"]["current_content"] == "Human-owned outline"
    assert len(final["artifacts"]["outline"]["versions"]) == 2
    assert final["job"]["status"] == "idle"

    await engine.dispose()


@pytest.mark.asyncio
async def test_upstream_current_edit_during_generation_prevents_promotion(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def blocked_outline(_context):
        entered.set()
        await release.wait()
        return "Outline from stale intake"

    service = WorkflowService(sessions, blocked_outline, _storyboard)
    generation = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {"content": {"prompt": "Old intake"}, "expected_version_id": None},
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    running = await service.get_project("workflow-project")
    old_intake_id = running["artifacts"]["intake"]["current_version_id"]
    moved = await service.process_event("workflow-project", "edit_intake", {})
    assert moved["job"]["status"] == "running"
    assert moved["job"]["job_id"] == running["job"]["job_id"]
    await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": {"prompt": "New intake"},
            "expected_version_id": old_intake_id,
        },
    )
    release.set()
    await generation

    final = await service.get_project("workflow-project")
    assert final["artifacts"]["outline"]["current_version_id"] is None
    assert len(final["artifacts"]["outline"]["versions"]) == 1
    assert final["job"]["status"] == "idle"

    await engine.dispose()


@pytest.mark.asyncio
async def test_stale_expected_id_conflict_does_not_create_a_version(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    first = await service.process_event(
        "workflow-project",
        "save_intake",
        {"content": {"prompt": "First"}, "expected_version_id": None},
    )
    current_id = first["artifacts"]["intake"]["current_version_id"]

    with pytest.raises(VersionConflictError) as exc_info:
        await service.process_event(
            "workflow-project",
            "save_intake",
            {"content": {"prompt": "Stale"}, "expected_version_id": None},
        )

    current = await service.get_project("workflow-project")
    assert exc_info.value.current_version_id == current_id
    assert current["artifacts"]["intake"]["current_version_id"] == current_id
    assert len(current["artifacts"]["intake"]["versions"]) == 1

    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_saves_from_same_expected_create_exactly_one_version(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    start = asyncio.Event()

    async def save(content):
        await start.wait()
        return await service.process_event(
            "workflow-project",
            "save_intake",
            {"content": content, "expected_version_id": None},
        )

    tasks = [
        asyncio.create_task(save({"prompt": "First concurrent edit"})),
        asyncio.create_task(save({"prompt": "Second concurrent edit"})),
    ]
    start.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)

    assert sum(isinstance(result, dict) for result in results) == 1
    assert sum(isinstance(result, VersionConflictError) for result in results) == 1
    current = await service.get_project("workflow-project")
    assert len(current["artifacts"]["intake"]["versions"]) == 1

    await engine.dispose()


@pytest.mark.asyncio
async def test_duplicate_generation_is_rejected_while_first_job_is_blocked(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def blocked_outline(_context):
        entered.set()
        await release.wait()
        return "Generated once"

    service = WorkflowService(sessions, blocked_outline, _storyboard)
    payload = {"content": {"prompt": "One job"}, "expected_version_id": None}
    first = asyncio.create_task(
        service.process_event("workflow-project", "approve_intake", payload)
    )
    await asyncio.wait_for(entered.wait(), timeout=2)

    with pytest.raises(DuplicateJobError) as exc_info:
        await service.process_event(
            "workflow-project", "approve_intake", payload
        )

    assert exc_info.value.job["kind"] == "outline"
    assert exc_info.value.job["status"] == "running"
    release.set()
    await first

    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_identical_approvals_start_only_one_generator(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service_start = asyncio.Event()
    second_generator_started = asyncio.Event()
    release = asyncio.Event()
    generator_calls = 0

    async def blocked_outline(_context):
        nonlocal generator_calls
        generator_calls += 1
        if generator_calls == 2:
            second_generator_started.set()
        service_start.set()
        await release.wait()
        return "Only generated outline"

    service = WorkflowService(sessions, blocked_outline, _storyboard)
    start = asyncio.Event()
    payload = {"content": {"prompt": "Approve once"}, "expected_version_id": None}

    async def approve():
        await start.wait()
        return await service.process_event(
            "workflow-project", "approve_intake", payload
        )

    tasks = [asyncio.create_task(approve()), asyncio.create_task(approve())]
    start.set()
    await asyncio.wait_for(service_start.wait(), timeout=2)
    second_generator_signal = asyncio.create_task(second_generator_started.wait())
    await asyncio.wait(
        [*tasks, second_generator_signal],
        timeout=2,
        return_when=asyncio.FIRST_COMPLETED,
    )
    release.set()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    second_generator_signal.cancel()
    await asyncio.gather(second_generator_signal, return_exceptions=True)

    assert generator_calls == 1
    assert sum(isinstance(result, dict) for result in results) == 1
    assert sum(isinstance(result, DuplicateJobError) for result in results) == 1
    current = await service.get_project("workflow-project")
    assert len(current["artifacts"]["intake"]["versions"]) == 1
    assert current["job"]["status"] == "idle"

    await engine.dispose()


@pytest.mark.asyncio
async def test_generation_failure_preserves_current_and_persists_failed_job(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    calls = 0

    async def outline_generator(_context):
        nonlocal calls
        calls += 1
        if calls == 1:
            return "Last valid outline"
        raise RuntimeError("director unavailable")

    service = WorkflowService(sessions, outline_generator, _storyboard)
    approved = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Failure safety"}, "expected_version_id": None},
    )
    outline_id = approved["artifacts"]["outline"]["current_version_id"]

    with pytest.raises(WorkflowGenerationError, match="director unavailable"):
        await service.process_event(
            "workflow-project",
            "revise_outline",
            {"instruction": "Make it sharper", "expected_version_id": outline_id},
        )

    failed = await service.get_project("workflow-project")
    assert failed["artifacts"]["outline"]["current_version_id"] == outline_id
    assert failed["artifacts"]["outline"]["current_content"] == "Last valid outline"
    assert failed["job"]["status"] == "failed"
    assert failed["job"]["error"] == "director unavailable"

    await engine.dispose()


@pytest.mark.asyncio
async def test_failed_outline_retry_gets_a_fresh_job_identity_after_edit_intake(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)

    async def failing_outline(_context):
        raise RuntimeError("first outline failed")

    service = WorkflowService(sessions, failing_outline, _storyboard)
    content = {"prompt": "Retry the canonical intake", "sources": []}
    with pytest.raises(WorkflowGenerationError, match="first outline failed"):
        await service.process_event(
            "workflow-project",
            "approve_intake",
            {"content": content, "expected_version_id": None},
        )

    failed = await service.get_project("workflow-project")
    failed_job_id = failed["job"]["job_id"]
    assert failed["job"]["status"] == "failed"

    editable = await service.process_event("workflow-project", "edit_intake", {})
    assert editable["workflow_stage"] == "intake"
    assert editable["job"]["status"] == "idle"
    assert editable["job"]["job_id"] is None

    entered = asyncio.Event()
    release = asyncio.Event()

    async def recovered_outline(_context):
        entered.set()
        await release.wait()
        return "Fresh outline after retry"

    service.outline_generator = recovered_outline
    retry = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {
                "content": content,
                "expected_version_id": editable["artifacts"]["intake"]["current_version_id"],
            },
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    running = await service.get_project("workflow-project")
    assert running["job"]["status"] == "running"
    assert running["job"]["job_id"] != failed_job_id

    release.set()
    completed = await retry
    assert completed["job"]["status"] == "idle"
    assert completed["artifacts"]["outline"]["current_content"] == (
        "Fresh outline after retry"
    )

    await engine.dispose()


@pytest.mark.asyncio
async def test_expired_generation_lease_is_failed_and_retry_can_start(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    initial = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Recover lease"}, "expected_version_id": None},
    )
    outline = initial["artifacts"]["outline"]
    intake_id = initial["artifacts"]["intake"]["approved_version_id"]

    async with sessions() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state("workflow-project")
        state = StoryboardState(**repo.parse_state_data(row))
        state.job = JobOverlay(
            status="running",
            job_id="abandoned-job",
            kind="outline",
            input_version_id=intake_id,
            target_version_id=outline["current_version_id"],
            started_at=(
                datetime.now(timezone.utc) - timedelta(minutes=16)
            ).isoformat(),
        )
        await repo.update_pipeline_state(
            "workflow-project",
            "outline",
            "pending",
            state.model_dump(),
        )

    async def recovered_outline(_context):
        return "Outline after expired lease"

    service.outline_generator = recovered_outline
    retried = await service.process_event(
        "workflow-project",
        "revise_outline",
        {
            "instruction": "Try again after the worker disappeared",
            "expected_version_id": outline["current_version_id"],
        },
    )

    assert retried["artifacts"]["outline"]["current_content"] == (
        "Outline after expired lease"
    )
    assert retried["job"]["status"] == "idle"

    await engine.dispose()


@pytest.mark.asyncio
async def test_get_project_expires_and_persists_an_abandoned_generation_lease(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    initial = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Observe lease"}, "expected_version_id": None},
    )
    intake_id = initial["artifacts"]["intake"]["approved_version_id"]

    async with sessions() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state("workflow-project")
        state = StoryboardState(**repo.parse_state_data(row))
        state.job = JobOverlay(
            status="running",
            job_id="abandoned-read-job",
            kind="outline",
            input_version_id=intake_id,
            target_version_id=initial["artifacts"]["outline"]["current_version_id"],
            started_at=(
                datetime.now(timezone.utc) - timedelta(minutes=16)
            ).isoformat(),
        )
        await repo.update_pipeline_state(
            "workflow-project",
            "outline",
            "pending",
            state.model_dump(),
        )

    observed = await service.get_project("workflow-project")
    assert observed["job"]["status"] == "failed"
    assert observed["job"]["error"] == "Generation job lease expired"

    reloaded = await service.get_project("workflow-project")
    assert reloaded["job"] == observed["job"]

    async with sessions() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state("workflow-project")
        persisted = StoryboardState(**repo.parse_state_data(row))
        assert persisted.job.status == "failed"
        assert persisted.job.error == "Generation job lease expired"

    await engine.dispose()


@pytest.mark.asyncio
async def test_cancelled_generation_persists_failure_and_preserves_current(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    initial = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Cancellation"}, "expected_version_id": None},
    )
    outline = initial["artifacts"]["outline"]
    entered = asyncio.Event()
    never_release = asyncio.Event()

    async def blocked_revision(_context):
        entered.set()
        await never_release.wait()
        return "Should never finish"

    service.outline_generator = blocked_revision
    task = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "revise_outline",
            {
                "instruction": "Cancel this revision",
                "expected_version_id": outline["current_version_id"],
            },
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task

    final = await service.get_project("workflow-project")
    assert final["artifacts"]["outline"]["current_version_id"] == outline[
        "current_version_id"
    ]
    assert final["job"]["status"] == "failed"
    assert "cancel" in final["job"]["error"].lower()

    await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_generation_cannot_overwrite_concurrent_canonical_save(
    tmp_path, monkeypatch
):
    engine, sessions = await _workflow_database(tmp_path)

    def bind_state_manager(self, project_id, data_dir=None):
        self.project_id = project_id
        self.data_dir = None
        self._owned_engine = None
        self._sessionmaker = sessions

    monkeypatch.setattr(StateManager, "__init__", bind_state_manager)
    manager = StateManager("workflow-project")
    legacy = await manager.load()
    legacy.phase = "gate1"
    legacy.workflow_stage = "intake"
    legacy.story_brief = {
        "fields": {
            "viewer_outcome": {"value": "Understand CAS"},
            "target_audience": {"value": "Backend engineers"},
            "core_talking_points": {"value": ["Load", "Generate", "CAS"]},
        }
    }
    await manager.save(legacy)

    entered = asyncio.Event()
    release = asyncio.Event()

    class BlockingQualityGate:
        model = "test-model"

        async def run_with_gate(self, agent, state, stage, **kwargs):
            entered.set()
            await release.wait()

            class PassingEvaluation:
                passed = True
                attempt = 1
                composite_score = 10.0

                @staticmethod
                def to_dict():
                    return {"passed": True, "composite_score": 10.0}

            return "Legacy outline that must not overwrite canonical state", PassingEvaluation()

    legacy_orchestrator = StoryboardOrchestrator()
    legacy_orchestrator.quality_gate = BlockingQualityGate()
    legacy_task = asyncio.create_task(
        legacy_orchestrator.process_event("workflow-project", "approve", {})
    )
    await asyncio.wait_for(entered.wait(), timeout=2)

    service = WorkflowService(sessions, _outline, _storyboard)
    canonical = await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": {"prompt": "Canonical edit wins"},
            "expected_version_id": None,
        },
    )
    canonical_intake_id = canonical["artifacts"]["intake"][
        "current_version_id"
    ]
    release.set()
    legacy_result = await legacy_task

    assert legacy_result["success"] is False
    assert "changed" in legacy_result["error"].lower()
    final = await service.get_project("workflow-project")
    assert final["artifacts"]["intake"]["current_version_id"] == canonical_intake_id
    assert final["artifacts"]["intake"]["current_content"] == {
        "prompt": "Canonical edit wins"
    }
    assert final["data"]["screen_outline"] is None

    await engine.dispose()


@pytest.mark.asyncio
async def test_late_result_is_history_only_when_input_and_job_have_changed(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    entered = asyncio.Event()
    release = asyncio.Event()

    async def blocked_outline(_context):
        entered.set()
        await release.wait()
        return "Late outline"

    service = WorkflowService(sessions, blocked_outline, _storyboard)
    task = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {"content": {"prompt": "Old input"}, "expected_version_id": None},
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)

    async with sessions() as session:
        repo = ProjectRepository(session)
        row = await repo.get_pipeline_state("workflow-project")
        state = StoryboardState(**repo.parse_state_data(row))
        replacement = await repo.create_artifact_version(
            "workflow-project", "intake", {"prompt": "New input"}, "human", commit=False
        )
        state.artifacts["intake"].current_version_id = replacement.id
        state.artifacts["intake"].approved_version_id = replacement.id
        state.intake_form = {"prompt": "New input"}
        state.story_brief = {"prompt": "New input"}
        state.job = JobOverlay(
            status="running",
            job_id="replacement-job",
            kind="outline",
            input_version_id=replacement.id,
            started_at=datetime.now(timezone.utc).isoformat(),
        )
        await repo.update_pipeline_state(
            "workflow-project", "outline", "pending", state.model_dump(), commit=False
        )
        await session.commit()

    release.set()
    response = await task
    assert response["artifacts"]["outline"]["current_version_id"] is None
    assert len(response["artifacts"]["outline"]["versions"]) == 1
    assert response["artifacts"]["outline"]["versions"][0]["created_by"] == "ai"
    assert response["job"]["job_id"] == "replacement-job"
    assert response["job"]["status"] == "running"

    await engine.dispose()


@pytest.mark.asyncio
async def test_inverted_completion_race_keeps_new_result_current_and_job_idle(
    tmp_path, monkeypatch
):
    engine, sessions = await _workflow_database(tmp_path)
    old_entered = asyncio.Event()
    new_entered = asyncio.Event()
    release_old = asyncio.Event()
    release_new = asyncio.Event()

    async def controlled_outline(context):
        if context.intake["prompt"] == "Old input":
            old_entered.set()
            await release_old.wait()
            return "Old outline"
        new_entered.set()
        await release_new.wait()
        return "New outline"

    service = WorkflowService(sessions, controlled_outline, _storyboard)
    old_task = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {"content": {"prompt": "Old input"}, "expected_version_id": None},
        )
    )
    await asyncio.wait_for(old_entered.wait(), timeout=2)
    old_state = await service.get_project("workflow-project")
    old_intake_id = old_state["artifacts"]["intake"]["current_version_id"]
    await service.process_event("workflow-project", "edit_intake", {})
    saved_new = await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": {"prompt": "New input"},
            "expected_version_id": old_intake_id,
        },
    )
    new_intake_id = saved_new["artifacts"]["intake"]["current_version_id"]
    new_task = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {
                "content": {"prompt": "New input"},
                "expected_version_id": new_intake_id,
            },
        )
    )

    try:
        await asyncio.wait_for(new_entered.wait(), timeout=0.5)
    except asyncio.TimeoutError:
        release_old.set()
        release_new.set()
        await asyncio.gather(old_task, new_task, return_exceptions=True)
        pytest.fail("a newly approved input was rejected as a duplicate job")

    original_create = ProjectRepository.create_artifact_version
    both_at_insert = asyncio.Event()
    new_inserted = asyncio.Event()
    arrivals = 0

    async def ordered_create(repo, *args, **kwargs):
        nonlocal arrivals
        content = kwargs.get("content", args[2] if len(args) > 2 else None)
        if content in {"Old outline", "New outline"}:
            arrivals += 1
            if arrivals == 2:
                both_at_insert.set()
            try:
                await asyncio.wait_for(both_at_insert.wait(), timeout=0.15)
            except asyncio.TimeoutError:
                pass
            if content == "Old outline":
                await asyncio.wait_for(new_inserted.wait(), timeout=1)
            version = await original_create(repo, *args, **kwargs)
            if content == "New outline":
                new_inserted.set()
            return version
        return await original_create(repo, *args, **kwargs)

    monkeypatch.setattr(ProjectRepository, "create_artifact_version", ordered_create)
    release_new.set()
    release_old.set()
    results = await asyncio.gather(old_task, new_task, return_exceptions=True)
    assert all(isinstance(result, dict) for result in results)

    final = await service.get_project("workflow-project")
    assert final["job"]["status"] == "idle"
    assert final["artifacts"]["outline"]["current_content"] == "New outline"
    async with sessions() as session:
        repo = ProjectRepository(session)
        versions = await repo.list_artifact_versions("workflow-project", "outline")
        contents = [repo.parse_artifact_content(version) for version in versions]
    assert sorted(contents) == ["New outline", "Old outline"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_upstream_save_retains_downstream_versions_and_marks_them_stale(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    outline_response = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Original"}, "expected_version_id": None},
    )
    outline = outline_response["artifacts"]["outline"]
    storyboard_response = await service.process_event(
        "workflow-project",
        "approve_outline",
        {
            "content": outline["current_content"],
            "expected_version_id": outline["current_version_id"],
        },
    )
    old_outline_id = storyboard_response["artifacts"]["outline"]["current_version_id"]
    old_storyboard_id = storyboard_response["artifacts"]["storyboard"]["current_version_id"]
    await service.process_event("workflow-project", "edit_intake", {})
    intake_id = storyboard_response["artifacts"]["intake"]["current_version_id"]

    changed = await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": {"prompt": "Changed"},
            "expected_version_id": intake_id,
        },
    )

    assert changed["workflow_stage"] == "intake"
    assert changed["artifacts"]["outline"]["current_version_id"] == old_outline_id
    assert changed["artifacts"]["storyboard"]["current_version_id"] == old_storyboard_id
    assert changed["artifacts"]["outline"]["needs_update"] is True
    assert changed["artifacts"]["storyboard"]["needs_update"] is True

    await engine.dispose()


@pytest.mark.asyncio
async def test_identical_outline_gets_new_lineage_after_approved_intake_changes(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    entered = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def controlled_outline(_context):
        nonlocal calls
        calls += 1
        if calls == 1:
            return "Same visible outline"
        entered.set()
        await release.wait()
        return "New AI outline"

    service = WorkflowService(sessions, controlled_outline, _storyboard)
    initial = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "First intake"}, "expected_version_id": None},
    )
    old_outline_id = initial["artifacts"]["outline"]["current_version_id"]
    old_intake_id = initial["artifacts"]["intake"]["current_version_id"]
    await service.process_event("workflow-project", "edit_intake", {})
    saved_intake = await service.process_event(
        "workflow-project",
        "save_intake",
        {
            "content": {"prompt": "Second intake"},
            "expected_version_id": old_intake_id,
        },
    )
    new_intake_id = saved_intake["artifacts"]["intake"]["current_version_id"]
    generation = asyncio.create_task(
        service.process_event(
            "workflow-project",
            "approve_intake",
            {
                "content": {"prompt": "Second intake"},
                "expected_version_id": new_intake_id,
            },
        )
    )
    await asyncio.wait_for(entered.wait(), timeout=2)
    rebound = await service.process_event(
        "workflow-project",
        "save_outline",
        {
            "content": "Same visible outline",
            "expected_version_id": old_outline_id,
        },
    )
    release.set()
    await generation

    rebound_outline = rebound["artifacts"]["outline"]
    assert rebound_outline["current_version_id"] != old_outline_id
    assert rebound_outline["versions"][-1]["created_by"] == "human"
    assert rebound_outline["versions"][-1]["based_on_version_id"] == new_intake_id

    await engine.dispose()


@pytest.mark.asyncio
async def test_stale_unchanged_storyboard_requires_keep_override(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    storyboard_stage = await _reach_storyboard(service)
    storyboard = storyboard_stage["artifacts"]["storyboard"]
    new_outline_id = await _make_storyboard_stale(sessions)

    with pytest.raises(InvalidWorkflowEvent, match="keep_storyboard"):
        await service.process_event(
            "workflow-project",
            "approve_storyboard",
            {
                "content": storyboard["current_content"],
                "expected_version_id": storyboard["current_version_id"],
            },
        )

    kept = await service.process_event(
        "workflow-project",
        "keep_storyboard",
        {"expected_version_id": storyboard["current_version_id"]},
    )
    override = kept["artifacts"]["storyboard"]
    assert override["versions"][-1]["is_override"] is True
    assert override["versions"][-1]["based_on_version_id"] == new_outline_id

    await engine.dispose()


@pytest.mark.asyncio
async def test_unchanged_stale_storyboard_cannot_save_around_keep_override(
    tmp_path,
):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    storyboard_stage = await _reach_storyboard(service)
    storyboard = storyboard_stage["artifacts"]["storyboard"]
    new_outline_id = await _make_storyboard_stale(sessions)

    with pytest.raises(InvalidWorkflowEvent, match="keep_storyboard"):
        await service.process_event(
            "workflow-project",
            "save_storyboard",
            {
                "content": storyboard["current_content"],
                "expected_version_id": storyboard["current_version_id"],
            },
        )

    still_stale = await service.get_project("workflow-project")
    assert still_stale["artifacts"]["storyboard"]["needs_update"] is True
    assert (
        still_stale["artifacts"]["storyboard"]["current_version_id"]
        == storyboard["current_version_id"]
    )
    with pytest.raises(InvalidWorkflowEvent, match="keep_storyboard"):
        await service.process_event(
            "workflow-project",
            "approve_storyboard",
            {
                "content": storyboard["current_content"],
                "expected_version_id": storyboard["current_version_id"],
            },
        )

    kept = await service.process_event(
        "workflow-project",
        "keep_storyboard",
        {"expected_version_id": storyboard["current_version_id"]},
    )
    override = kept["artifacts"]["storyboard"]
    assert override["versions"][-1]["is_override"] is True
    assert override["versions"][-1]["based_on_version_id"] == new_outline_id

    completed = await service.process_event(
        "workflow-project",
        "approve_storyboard",
        {
            "content": override["current_content"],
            "expected_version_id": override["current_version_id"],
        },
    )
    assert completed["workflow_stage"] == "complete"

    await engine.dispose()


@pytest.mark.asyncio
async def test_edited_stale_storyboard_saves_as_normal_bound_human_version(
    tmp_path,
):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    storyboard_stage = await _reach_storyboard(service)
    storyboard = storyboard_stage["artifacts"]["storyboard"]
    new_outline_id = await _make_storyboard_stale(sessions)
    edited = [{"screen_number": 1, "voiceover": "Edited for the new outline"}]

    saved = await service.process_event(
        "workflow-project",
        "save_storyboard",
        {
            "content": edited,
            "expected_version_id": storyboard["current_version_id"],
        },
    )

    current = saved["artifacts"]["storyboard"]
    assert current["current_content"] == edited
    assert current["needs_update"] is False
    assert current["versions"][-1]["created_by"] == "human"
    assert current["versions"][-1]["is_override"] is False
    assert current["versions"][-1]["based_on_version_id"] == new_outline_id

    await engine.dispose()


@pytest.mark.asyncio
async def test_edited_stale_storyboard_can_be_approved_with_new_lineage(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    storyboard_stage = await _reach_storyboard(service)
    storyboard = storyboard_stage["artifacts"]["storyboard"]
    new_outline_id = await _make_storyboard_stale(sessions)
    edited = [{"screen_number": 1, "voiceover": "Human updated for new outline"}]

    completed = await service.process_event(
        "workflow-project",
        "approve_storyboard",
        {
            "content": edited,
            "expected_version_id": storyboard["current_version_id"],
        },
    )

    current = completed["artifacts"]["storyboard"]
    assert completed["workflow_stage"] == "complete"
    assert current["current_content"] == edited
    assert current["versions"][-1]["created_by"] == "human"
    assert current["versions"][-1]["based_on_version_id"] == new_outline_id

    await engine.dispose()


@pytest.mark.asyncio
async def test_keep_storyboard_creates_override_based_on_approved_outline(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    storyboard_calls = 0

    async def storyboard_generator(context):
        nonlocal storyboard_calls
        storyboard_calls += 1
        if storyboard_calls == 1:
            return [{"screen_number": 1, "voiceover": "Keep this"}]
        raise RuntimeError("regeneration failed")

    service = WorkflowService(sessions, _outline, storyboard_generator)
    outline_response = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Overrides"}, "expected_version_id": None},
    )
    outline = outline_response["artifacts"]["outline"]
    storyboard_response = await service.process_event(
        "workflow-project",
        "approve_outline",
        {
            "content": outline["current_content"],
            "expected_version_id": outline["current_version_id"],
        },
    )
    old_storyboard = storyboard_response["artifacts"]["storyboard"]
    await service.process_event("workflow-project", "edit_outline", {})
    saved = await service.process_event(
        "workflow-project",
        "save_outline",
        {
            "content": "A newly approved outline",
            "expected_version_id": outline["current_version_id"],
        },
    )
    with pytest.raises(WorkflowGenerationError):
        await service.process_event(
            "workflow-project",
            "approve_outline",
            {
                "content": saved["artifacts"]["outline"]["current_content"],
                "expected_version_id": saved["artifacts"]["outline"]["current_version_id"],
            },
        )
    failed = await service.get_project("workflow-project")

    kept = await service.process_event(
        "workflow-project",
        "keep_storyboard",
        {"expected_version_id": old_storyboard["current_version_id"]},
    )
    override = kept["artifacts"]["storyboard"]
    assert override["current_content"] == old_storyboard["current_content"]
    assert override["current_version_id"] != old_storyboard["current_version_id"]
    assert override["versions"][-1]["created_by"] == "human"
    assert override["versions"][-1]["is_override"] is True
    assert override["versions"][-1]["based_on_version_id"] == failed["artifacts"]["outline"]["approved_version_id"]
    assert override["needs_update"] is False
    assert kept["workflow_stage"] == "storyboard"

    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reopen_event", "expected_stage"),
    [
        ("reopen_intake", "intake"),
        ("reopen_outline", "outline"),
        ("reopen_storyboard", "storyboard"),
    ],
)
async def test_complete_and_reopen_retain_all_version_pointers(
    tmp_path, reopen_event, expected_stage
):
    engine, sessions = await _workflow_database(tmp_path)
    service = WorkflowService(sessions, _outline, _storyboard)
    outline_response = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Finish"}, "expected_version_id": None},
    )
    outline = outline_response["artifacts"]["outline"]
    storyboard_response = await service.process_event(
        "workflow-project",
        "approve_outline",
        {
            "content": outline["current_content"],
            "expected_version_id": outline["current_version_id"],
        },
    )
    storyboard = storyboard_response["artifacts"]["storyboard"]
    completed = await service.process_event(
        "workflow-project",
        "approve_storyboard",
        {
            "content": storyboard["current_content"],
            "expected_version_id": storyboard["current_version_id"],
        },
    )
    pointers = {
        name: artifact["current_version_id"]
        for name, artifact in completed["artifacts"].items()
    }
    reopened = await service.process_event(
        "workflow-project", reopen_event, {}
    )

    assert completed["workflow_stage"] == "complete"
    assert completed["artifacts"]["storyboard"]["approved_version_id"] == storyboard["current_version_id"]
    assert reopened["workflow_stage"] == reopened["phase"] == expected_stage
    assert {
        name: artifact["current_version_id"]
        for name, artifact in reopened["artifacts"].items()
    } == pointers

    await engine.dispose()


@pytest.mark.asyncio
async def test_revise_generators_receive_current_content_and_instruction(tmp_path):
    engine, sessions = await _workflow_database(tmp_path)
    outline_contexts = []
    storyboard_contexts = []

    async def outline_generator(context):
        outline_contexts.append(context)
        return "Revised outline" if context.instruction else "Initial outline"

    async def storyboard_generator(context):
        storyboard_contexts.append(context)
        return [
            {
                "screen_number": 1,
                "voiceover": "Revised" if context.instruction else "Initial",
            }
        ]

    service = WorkflowService(sessions, outline_generator, storyboard_generator)
    outlined = await service.process_event(
        "workflow-project",
        "approve_intake",
        {"content": {"prompt": "Revise safely"}, "expected_version_id": None},
    )
    outline = outlined["artifacts"]["outline"]
    revised_outline = await service.process_event(
        "workflow-project",
        "revise_outline",
        {
            "instruction": "Lead with the example",
            "expected_version_id": outline["current_version_id"],
        },
    )
    current_outline = revised_outline["artifacts"]["outline"]
    storyboard = await service.process_event(
        "workflow-project",
        "approve_outline",
        {
            "content": current_outline["current_content"],
            "expected_version_id": current_outline["current_version_id"],
        },
    )
    current_storyboard = storyboard["artifacts"]["storyboard"]
    await service.process_event(
        "workflow-project",
        "revise_storyboard",
        {
            "instruction": "Tighten the ending",
            "expected_version_id": current_storyboard["current_version_id"],
        },
    )

    assert outline_contexts[-1].current_content == "Initial outline"
    assert outline_contexts[-1].instruction == "Lead with the example"
    assert storyboard_contexts[-1].current_content == current_storyboard["current_content"]
    assert storyboard_contexts[-1].storyboard == current_storyboard["current_content"]
    assert storyboard_contexts[-1].instruction == "Tighten the ending"

    await engine.dispose()


@pytest.mark.asyncio
async def test_canonical_response_has_history_aliases_flags_and_legacy_content(tmp_path):
    engine, sessions = await _workflow_database(tmp_path, "legacy-project")
    legacy = {
        "project_id": "legacy-project",
        "phase": "review",
        "intake_form": {"prompt": "Original intake"},
        "story_brief": {"prompt": "Approved legacy brief"},
        "screen_outline": "Legacy outline",
        "storyboard": [{"screen_number": 1, "voiceover": "Legacy"}],
        "outline_eval": {"score": 8},
        "storyboard_eval": {"score": 7},
        "brief_locked": True,
    }
    async with sessions() as session:
        await ProjectRepository(session).update_pipeline_state(
            "legacy-project", "review", "pending", legacy
        )
    service = WorkflowService(sessions, _outline, _storyboard)

    response = await service.get_project("legacy-project")

    assert response["workflow_stage"] == "storyboard"
    assert response["phase"] == "review"
    assert response["allowed_events"] == response["available_events"]
    assert response["allowed_events"] == [
        "save_storyboard",
        "revise_storyboard",
        "approve_storyboard",
        "edit_outline",
        "edit_intake",
        "keep_storyboard",
    ]
    assert response["artifacts"]["outline"]["current_content"] == "Legacy outline"
    assert response["artifacts"]["storyboard"]["current_content"] == legacy["storyboard"]
    assert response["artifacts"]["outline"]["versions"] == []
    assert response["data"] == {
        "intake_form": legacy["intake_form"],
        "story_brief": legacy["story_brief"],
        "screen_outline": legacy["screen_outline"],
        "storyboard": legacy["storyboard"],
        "evidence_research": None,
        "outline_eval": legacy["outline_eval"],
        "storyboard_eval": legacy["storyboard_eval"],
    }
    assert response["state"]["brief_locked"] is True
    assert response["state"]["has_storyboard"] is True

    await engine.dispose()


@pytest.mark.asyncio
async def test_partial_migration_preserves_distinct_legacy_intake_aliases(tmp_path):
    engine, sessions = await _workflow_database(tmp_path, "partial-project")
    legacy_intake = {"prompt": "Raw create input"}
    legacy_brief = {"fields": {"viewer_outcome": {"value": "Distinct brief"}}}
    async with sessions() as session:
        repo = ProjectRepository(session)
        outline = await repo.create_artifact_version(
            "partial-project",
            "outline",
            "Versioned outline only",
            "ai",
            commit=False,
        )
        state = StoryboardState(
            project_id="partial-project",
            phase="gate2",
            intake_form=legacy_intake,
            story_brief=legacy_brief,
            screen_outline="Legacy outline",
        )
        state.artifacts["outline"].current_version_id = outline.id
        await repo.update_pipeline_state(
            "partial-project", "gate2", "pending", state.model_dump(), commit=False
        )
        await session.commit()

    response = await WorkflowService(sessions, _outline, _storyboard).get_project(
        "partial-project"
    )

    assert response["data"]["intake_form"] == legacy_intake
    assert response["data"]["story_brief"] == legacy_brief
    assert response["data"]["screen_outline"] == "Versioned outline only"

    await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_gate2_revise_materializes_dependency_lineage(tmp_path):
    engine, sessions = await _workflow_database(tmp_path, "legacy-gate2")
    legacy_brief = {"prompt": "Legacy gate2 brief"}
    async with sessions() as session:
        await ProjectRepository(session).update_pipeline_state(
            "legacy-gate2",
            "gate2",
            "pending",
            {
                "project_id": "legacy-gate2",
                "phase": "gate2",
                "story_brief": legacy_brief,
                "screen_outline": "Legacy editable outline",
            },
        )

    async def revise(context):
        assert context.current_content == "Legacy editable outline"
        return "Revised legacy outline"

    service = WorkflowService(sessions, revise, _storyboard)
    response = await service.process_event(
        "legacy-gate2",
        "revise_outline",
        {"instruction": "Tighten it", "expected_version_id": None},
    )

    intake = response["artifacts"]["intake"]
    outline = response["artifacts"]["outline"]
    assert intake["current_version_id"] == intake["approved_version_id"]
    assert outline["current_content"] == "Revised legacy outline"
    assert [item["created_by"] for item in outline["versions"]] == [
        "migration",
        "ai",
    ]
    assert outline["versions"][0]["based_on_version_id"] == intake["approved_version_id"]

    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("legacy_phase", ["review", "done"])
async def test_legacy_review_and_done_keep_storyboard_materialize_override(
    tmp_path, legacy_phase
):
    project_id = f"legacy-{legacy_phase}"
    engine, sessions = await _workflow_database(tmp_path, project_id)
    legacy_storyboard = [{"screen_number": 1, "voiceover": "Keep legacy"}]
    async with sessions() as session:
        await ProjectRepository(session).update_pipeline_state(
            project_id,
            legacy_phase,
            "pending",
            {
                "project_id": project_id,
                "phase": legacy_phase,
                "story_brief": {"prompt": "Legacy brief"},
                "screen_outline": "Legacy approved outline",
                "storyboard": legacy_storyboard,
            },
        )
    service = WorkflowService(sessions, _outline, _storyboard)
    if legacy_phase == "done":
        reopened = await service.process_event(project_id, "reopen_storyboard", {})
        expected_id = reopened["artifacts"]["storyboard"]["current_version_id"]
    else:
        expected_id = None

    kept = await service.process_event(
        project_id,
        "keep_storyboard",
        {"expected_version_id": expected_id},
    )

    storyboard = kept["artifacts"]["storyboard"]
    assert storyboard["current_content"] == legacy_storyboard
    assert storyboard["versions"][-1]["created_by"] == "human"
    assert storyboard["versions"][-1]["is_override"] is True
    assert storyboard["versions"][-1]["based_on_version_id"] == kept["artifacts"]["outline"]["approved_version_id"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_upstream_save_retains_and_marks_materialized_downstream_stale(
    tmp_path,
):
    engine, sessions = await _workflow_database(tmp_path, "legacy-stale")
    legacy_intake_form = {"prompt": "Raw intake answers"}
    legacy_story_brief = {"prompt": "Legacy current intake"}
    async with sessions() as session:
        await ProjectRepository(session).update_pipeline_state(
            "legacy-stale",
            "review",
            "pending",
            {
                "project_id": "legacy-stale",
                "phase": "review",
                "intake_form": legacy_intake_form,
                "story_brief": legacy_story_brief,
                "screen_outline": "Legacy retained outline",
                "storyboard": [{"screen_number": 1, "voiceover": "Retain me"}],
            },
        )
    service = WorkflowService(sessions, _outline, _storyboard)
    moved = await service.process_event("legacy-stale", "edit_intake", {})
    intake_id = moved["artifacts"]["intake"]["current_version_id"]
    outline_id = moved["artifacts"]["outline"]["current_version_id"]
    storyboard_id = moved["artifacts"]["storyboard"]["current_version_id"]
    assert moved["data"]["intake_form"] == legacy_intake_form
    assert moved["data"]["story_brief"] == legacy_story_brief

    changed = await service.process_event(
        "legacy-stale",
        "save_intake",
        {
            "content": {"prompt": "Changed intake"},
            "expected_version_id": intake_id,
        },
    )

    assert changed["artifacts"]["outline"]["current_version_id"] == outline_id
    assert changed["artifacts"]["storyboard"]["current_version_id"] == storyboard_id
    assert changed["artifacts"]["outline"]["needs_update"] is True
    assert changed["artifacts"]["storyboard"]["needs_update"] is True
    assert changed["data"]["intake_form"] == legacy_intake_form
    assert changed["data"]["story_brief"] == {"prompt": "Changed intake"}

    await engine.dispose()
