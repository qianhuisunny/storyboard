"""Tests for the additive four-stage workflow state contract."""

import pytest
from sqlalchemy import text

from app.db.repository import PipelineStateConflictError, ProjectRepository
from app.services.state import (
    ArtifactPointers,
    JobOverlay,
    StateManager,
    StoryboardState,
)


EXPECTED_ALLOWED_EVENTS = {
    "intake": ["save_intake", "approve_intake"],
    "outline": [
        "save_outline",
        "revise_outline",
        "approve_outline",
        "edit_intake",
    ],
    "storyboard": [
        "save_storyboard",
        "revise_storyboard",
        "approve_storyboard",
        "edit_outline",
        "edit_intake",
        "keep_storyboard",
    ],
    "complete": ["reopen_intake", "reopen_outline", "reopen_storyboard"],
}


@pytest.mark.asyncio
async def test_state_manager_owned_engine_enables_sqlite_foreign_keys(tmp_path):
    manager = StateManager("foreign-key-project", data_dir=tmp_path)
    await manager._ensure_tables()

    async with manager._owned_engine.connect() as connection:
        enabled = await connection.scalar(text("PRAGMA foreign_keys"))

    assert enabled == 1
    await manager._owned_engine.dispose()


def test_workflow_state_has_typed_defaults_and_exact_allowed_events():
    state = StoryboardState(project_id="workflow-project")
    manager = StateManager(state.project_id)

    assert state.workflow_stage == "intake"
    assert state.artifacts == {
        "intake": ArtifactPointers(),
        "outline": ArtifactPointers(),
        "storyboard": ArtifactPointers(),
    }
    assert state.job == JobOverlay()

    for workflow_stage, expected_events in EXPECTED_ALLOWED_EVENTS.items():
        state.workflow_stage = workflow_stage
        assert manager.allowed_events(state) == expected_events


def test_workflow_state_round_trips_unknown_stage_metadata():
    state = StoryboardState(
        project_id="extra-state-project",
        currentStageId=3,
        stageStatuses=[{"id": 3, "status": "in_progress"}],
        future_metadata={"owner": "frontend"},
    )

    dumped = state.model_dump()

    assert dumped["currentStageId"] == 3
    assert dumped["stageStatuses"] == [{"id": 3, "status": "in_progress"}]
    assert dumped["future_metadata"] == {"owner": "frontend"}


@pytest.mark.asyncio
async def test_state_manager_rejects_second_save_from_stale_loaded_revision(
    tmp_path,
):
    manager = StateManager("state-cas-project", data_dir=tmp_path)
    first = await manager.load()
    second = await manager.load()

    first.artifacts["intake"].current_version_id = "canonical-intake-v1"
    first.job = JobOverlay(
        status="running",
        job_id="canonical-job",
        kind="outline",
        input_version_id="canonical-intake-v1",
    )
    await manager.save(first)

    second.story_brief = {"prompt": "stale legacy overwrite"}
    with pytest.raises(PipelineStateConflictError):
        await manager.save(second)

    current = await manager.load()
    assert current.artifacts["intake"].current_version_id == "canonical-intake-v1"
    assert current.job.job_id == "canonical-job"
    assert current.story_brief is None
    assert current.state_revision == first.state_revision

    await manager._owned_engine.dispose()


@pytest.mark.parametrize(
    ("legacy_phase", "workflow_stage"),
    [
        ("intake", "intake"),
        ("research", "intake"),
        ("brief", "intake"),
        ("brief_chat", "intake"),
        ("brief_review", "intake"),
        ("gate1", "intake"),
        ("outline", "outline"),
        ("gate2", "outline"),
        ("outline_research", "outline"),
        ("write", "storyboard"),
        ("storyboard", "storyboard"),
        ("review", "storyboard"),
        ("complete", "complete"),
        ("done", "complete"),
    ],
)
def test_legacy_phase_maps_to_closest_workflow_stage(legacy_phase, workflow_stage):
    state = StoryboardState(project_id="legacy-project", phase=legacy_phase)

    assert state.workflow_stage == workflow_stage
    assert set(state.artifacts) == {"intake", "outline", "storyboard"}


@pytest.mark.asyncio
async def test_state_manager_hydrates_legacy_row_without_losing_content(tmp_path):
    project_id = "persisted-legacy-project"
    manager = StateManager(project_id, data_dir=tmp_path)
    await manager._ensure_tables()
    legacy_content = {
        "project_id": project_id,
        "phase": "review",
        "intake_form": {"topic": "Immutable artifacts"},
        "story_brief": {"fields": {"viewer_outcome": {"value": "Ship safely"}}},
        "screen_outline": "## Existing outline",
        "storyboard": [{"screen_number": 1, "voiceover": "Keep me"}],
    }

    async with manager._sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Legacy")
        await repo.update_pipeline_state(
            project_id,
            phase="review",
            status="pending",
            state_data=legacy_content,
        )

    hydrated = await manager.load()

    assert hydrated.workflow_stage == "storyboard"
    assert hydrated.intake_form == legacy_content["intake_form"]
    assert hydrated.story_brief == legacy_content["story_brief"]
    assert hydrated.screen_outline == legacy_content["screen_outline"]
    assert hydrated.storyboard == legacy_content["storyboard"]
    assert hydrated.artifacts == {
        "intake": ArtifactPointers(),
        "outline": ArtifactPointers(),
        "storyboard": ArtifactPointers(),
    }

    await manager._owned_engine.dispose()


def test_explicit_workflow_stage_is_not_replaced_by_legacy_phase_mapping():
    state = StoryboardState(
        project_id="new-project",
        phase="done",
        workflow_stage="outline",
    )

    assert state.workflow_stage == "outline"


def test_marking_intake_changed_marks_existing_downstream_artifacts_stale():
    outline = ArtifactPointers(
        current_version_id="outline-v2",
        approved_version_id="outline-v1",
    )
    storyboard = ArtifactPointers(
        current_version_id="storyboard-v3",
        approved_version_id="storyboard-v2",
    )
    state = StoryboardState(
        project_id="stale-project",
        workflow_stage="storyboard",
        story_brief={"fields": {"topic": {"value": "Preserve this"}}},
        screen_outline="## Preserve this outline",
        storyboard=[{"screen_number": 1}],
        artifacts={
            "intake": ArtifactPointers(current_version_id="intake-v2"),
            "outline": outline,
            "storyboard": storyboard,
        },
    )

    StateManager(state.project_id).mark_upstream_changed(state, "intake")

    assert state.artifacts["intake"].needs_update is False
    assert state.artifacts["outline"].needs_update is True
    assert state.artifacts["storyboard"].needs_update is True
    assert state.artifacts["outline"].current_version_id == "outline-v2"
    assert state.artifacts["storyboard"].approved_version_id == "storyboard-v2"
    assert state.screen_outline == "## Preserve this outline"
    assert state.storyboard == [{"screen_number": 1}]


def test_marking_outline_changed_only_marks_an_existing_storyboard_stale():
    state = StoryboardState(
        project_id="outline-change-project",
        workflow_stage="storyboard",
        artifacts={
            "intake": ArtifactPointers(current_version_id="intake-v1"),
            "outline": ArtifactPointers(current_version_id="outline-v2"),
            "storyboard": ArtifactPointers(),
        },
    )
    manager = StateManager(state.project_id)

    manager.mark_upstream_changed(state, "outline")
    assert state.artifacts["storyboard"].needs_update is False

    state.artifacts["storyboard"].current_version_id = "storyboard-v1"
    manager.mark_upstream_changed(state, "outline")

    assert state.artifacts["intake"].needs_update is False
    assert state.artifacts["outline"].needs_update is False
    assert state.artifacts["storyboard"].needs_update is True
