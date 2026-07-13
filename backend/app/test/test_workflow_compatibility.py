"""Compatibility regressions for persisted pre-HiFi workflow data."""

import json

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.models import Base
from app.db.repository import ProjectRepository
from app.services.workflow import WorkflowService


async def _legacy_database(tmp_path, project_id: str, phase: str, state_data: dict):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / f'{project_id}.db'}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "legacy-owner", "Legacy project")
        await repo.update_pipeline_state(
            project_id,
            phase,
            "completed" if phase == "done" else "pending",
            state_data,
        )
    return engine, sessions


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("legacy_phase", "workflow_stage"),
    [
        ("brief_round1", "intake"),
        ("brief_round2", "intake"),
        ("brief_round3", "intake"),
        ("angle_selection", "intake"),
        ("gate1", "intake"),
        ("gate2", "outline"),
        ("review", "storyboard"),
        ("done", "complete"),
    ],
)
async def test_legacy_gate_content_hydrates_into_four_stage_response(
    tmp_path, legacy_phase, workflow_stage
):
    project_id = f"legacy-{legacy_phase}"
    legacy = {
        "project_id": project_id,
        "phase": legacy_phase,
        "intake_form": {"description": f"Raw {legacy_phase} intake"},
        "story_brief": {"prompt": f"Approved {legacy_phase} brief"},
        "screen_outline": f"## Retained {legacy_phase} outline",
        "storyboard": [
            {
                "screen_number": 1,
                "screen_type": "cta",
                "on_screen_visual_keywords": "Retained legacy keywords",
                "voiceover_text": f"Retained {legacy_phase} voiceover",
            }
        ],
    }
    engine, sessions = await _legacy_database(
        tmp_path, project_id, legacy_phase, legacy
    )

    response = await WorkflowService(sessions).get_project(project_id)

    assert response["workflow_stage"] == workflow_stage
    assert response["phase"] == legacy_phase
    assert response["data"]["intake_form"] == legacy["intake_form"]
    assert response["data"]["story_brief"] == legacy["story_brief"]
    assert response["data"]["screen_outline"] == legacy["screen_outline"]
    assert response["data"]["storyboard"] == legacy["storyboard"]
    assert response["artifacts"]["intake"]["current_content"] == legacy["story_brief"]
    assert response["artifacts"]["outline"]["current_content"] == legacy["screen_outline"]
    assert response["artifacts"]["storyboard"]["current_content"] == legacy["storyboard"]

    await engine.dispose()


@pytest.mark.asyncio
async def test_metadata_creation_upgrades_pre_change_database_without_rewriting_rows(
    tmp_path,
):
    database_path = tmp_path / "pre-change.db"
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{database_path}"
    )
    legacy_state = {
        "project_id": "pre-change-project",
        "phase": "gate2",
        "story_brief": {"prompt": "Do not rewrite me"},
        "screen_outline": "## Original outline",
    }

    async with engine.begin() as connection:
        await connection.execute(text("""
            CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                title TEXT NOT NULL,
                type_id INTEGER,
                type_name TEXT,
                user_input TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
        """))
        await connection.execute(text("""
            CREATE TABLE pipeline_states (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL UNIQUE,
                phase TEXT NOT NULL,
                status TEXT NOT NULL,
                state_data TEXT,
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL,
                FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
        """))
        await connection.execute(
            text("""
                INSERT INTO projects (
                    id, user_id, title, type_id, type_name, user_input,
                    created_at, updated_at
                ) VALUES (
                    'pre-change-project', 'legacy-owner', 'Original title', 3,
                    'Knowledge Sharing', 'Original input',
                    '2026-01-01T00:00:00+00:00', '2026-01-02T00:00:00+00:00'
                )
            """)
        )
        await connection.execute(
            text("""
                INSERT INTO pipeline_states (
                    project_id, phase, status, state_data, created_at, updated_at
                ) VALUES (
                    'pre-change-project', 'gate2', 'pending', :state_data,
                    '2026-01-01T00:00:00+00:00', '2026-01-02T00:00:00+00:00'
                )
            """),
            {"state_data": json.dumps(legacy_state)},
        )

    async with engine.connect() as connection:
        project_before = (
            await connection.execute(
                text("SELECT * FROM projects WHERE id = 'pre-change-project'")
            )
        ).mappings().one()
        state_before = (
            await connection.execute(
                text("SELECT * FROM pipeline_states WHERE project_id = 'pre-change-project'")
            )
        ).mappings().one()

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with engine.connect() as connection:
        table_names = set(
            (
                await connection.execute(
                    text("SELECT name FROM sqlite_master WHERE type = 'table'")
                )
            ).scalars()
        )
        project_after = (
            await connection.execute(
                text("SELECT * FROM projects WHERE id = 'pre-change-project'")
            )
        ).mappings().one()
        state_after = (
            await connection.execute(
                text("SELECT * FROM pipeline_states WHERE project_id = 'pre-change-project'")
            )
        ).mappings().one()

    assert {"artifact_versions", "anonymous_sessions"} <= table_names
    assert dict(project_after) == dict(project_before)
    assert dict(state_after) == dict(state_before)

    await engine.dispose()
