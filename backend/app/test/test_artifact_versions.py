"""Real-SQLite tests for immutable artifact version streams."""

import json
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.db.models import ArtifactVersion, Base, Project
from app.db.repository import ProjectRepository


async def _database(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'plotline.db'}")
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, sessionmaker


@pytest.mark.asyncio
async def test_artifact_versions_append_per_type_and_round_trip_json(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    intake_v1_content = {
        "prompt": "Teach immutable state",
        "sources": [{"kind": "text", "value": "Nested JSON survives"}],
    }
    intake_v2_content = {
        "prompt": "Teach immutable workflow state",
        "sources": [],
    }
    outline_content = "## Opening\n- Explain append-only history"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project("artifact-project", "test-user", "Artifacts")
        intake_v1 = await repo.create_artifact_version(
            project_id="artifact-project",
            artifact_type="intake",
            content=intake_v1_content,
            created_by="user",
        )
        outline_v1 = await repo.create_artifact_version(
            project_id="artifact-project",
            artifact_type="outline",
            content=outline_content,
            created_by="director",
            based_on_version_id=intake_v1.id,
        )
        intake_v2 = await repo.create_artifact_version(
            project_id="artifact-project",
            artifact_type="intake",
            content=intake_v2_content,
            created_by="user",
            based_on_version_id=intake_v1.id,
            is_override=True,
        )

        intake_versions = await repo.list_artifact_versions(
            "artifact-project", artifact_type="intake"
        )
        outline_versions = await repo.list_artifact_versions(
            "artifact-project", artifact_type="outline"
        )
        fetched = await repo.get_artifact_version(intake_v1.id)

        assert [version.version_number for version in intake_versions] == [1, 2]
        assert [version.version_number for version in outline_versions] == [1]
        assert UUID(intake_v1.id).version == 4
        assert UUID(outline_v1.id).version == 4
        assert json.loads(fetched.content) == intake_v1_content
        assert repo.parse_artifact_content(fetched) == intake_v1_content
        assert repo.parse_artifact_content(outline_v1) == outline_content
        assert intake_v2.based_on_version_id == intake_v1.id
        assert intake_v2.created_by == "user"
        assert intake_v2.is_override is True
        assert repo.parse_artifact_content(intake_v1) == intake_v1_content

    await engine.dispose()


@pytest.mark.asyncio
async def test_artifact_and_state_writes_can_be_committed_atomically(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "atomic-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Atomic", commit=False)
        intake_v1 = await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="intake",
            content={"prompt": "All or nothing"},
            created_by="user",
            commit=False,
        )
        intake_v2 = await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="intake",
            content={"prompt": "Still all or nothing"},
            created_by="user",
            based_on_version_id=intake_v1.id,
            commit=False,
        )
        await repo.update_pipeline_state(
            project_id,
            phase="intake",
            status="pending",
            state_data={"current_version_id": intake_v2.id},
            commit=False,
        )
        await session.commit()

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        versions = await repo.list_artifact_versions(project_id, "intake")
        pipeline_state = await repo.get_pipeline_state(project_id)

        assert [version.version_number for version in versions] == [1, 2]
        assert repo.parse_state_data(pipeline_state) == {
            "current_version_id": versions[1].id
        }

    await engine.dispose()


@pytest.mark.asyncio
async def test_uncommitted_composed_writes_roll_back_together(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "rollback-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Rollback", commit=False)
        await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="storyboard",
            content=[{"screen_number": 1}],
            created_by="writer",
            commit=False,
        )
        await session.rollback()

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        assert await repo.get_project(project_id) is None
        assert await repo.list_artifact_versions(project_id, "storyboard") == []

    await engine.dispose()


@pytest.mark.asyncio
async def test_project_delete_cascades_artifact_versions(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "cascade-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Cascade")
        await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="storyboard",
            content=[{"screen_number": 1}],
            created_by="writer",
        )

        result = await session.execute(
            select(Project)
            .where(Project.id == project_id)
            .options(selectinload(Project.artifact_versions))
        )
        project = result.scalar_one()
        assert len(project.artifact_versions) == 1

        await repo.delete_project(project_id)
        versions = await session.execute(
            select(ArtifactVersion).where(ArtifactVersion.project_id == project_id)
        )
        assert list(versions.scalars()) == []

    await engine.dispose()

