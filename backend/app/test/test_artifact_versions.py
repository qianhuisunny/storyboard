"""Real-SQLite tests for immutable artifact version streams."""

import asyncio
import json
from uuid import UUID

import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker
from sqlalchemy.orm import selectinload

from app.db import engine as db_engine
from app.db.models import ArtifactVersion, Base, Project
from app.db.repository import ProjectRepository


async def _database(tmp_path):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'plotline.db'}"
    )
    sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, sessionmaker


@pytest.mark.asyncio
async def test_production_engine_enables_sqlite_foreign_keys():
    async with db_engine.engine.connect() as connection:
        enabled = await connection.scalar(text("PRAGMA foreign_keys"))

    assert enabled == 1


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


@pytest.mark.asyncio
async def test_bulk_project_delete_cascades_artifact_versions(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "database-cascade-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Database cascade")
        await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="outline",
            content="## Retained only while project exists",
            created_by="director",
        )

        await session.execute(delete(Project).where(Project.id == project_id))
        await session.commit()

        versions = await session.execute(
            select(ArtifactVersion).where(ArtifactVersion.project_id == project_id)
        )
        assert list(versions.scalars()) == []

    await engine.dispose()


@pytest.mark.asyncio
async def test_deleting_base_version_sets_child_lineage_to_null(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "set-null-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Set null")
        base = await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="intake",
            content={"prompt": "Original"},
            created_by="user",
        )
        child = await repo.create_artifact_version(
            project_id=project_id,
            artifact_type="outline",
            content="## Derived outline",
            created_by="director",
            based_on_version_id=base.id,
        )
        child_id = child.id

        await session.execute(
            delete(ArtifactVersion).where(ArtifactVersion.id == base.id)
        )
        await session.commit()
        session.expire_all()

        reloaded_child = await repo.get_artifact_version(child_id)
        assert reloaded_child.based_on_version_id is None

    await engine.dispose()


@pytest.mark.asyncio
async def test_orphan_artifact_insert_is_rejected_by_sqlite(tmp_path):
    engine, sessionmaker = await _database(tmp_path)

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        with pytest.raises(IntegrityError):
            await repo.create_artifact_version(
                project_id="missing-project",
                artifact_type="storyboard",
                content=[],
                created_by="writer",
            )
        await session.rollback()

    await engine.dispose()


@pytest.mark.asyncio
async def test_based_on_version_must_belong_to_same_project(tmp_path):
    engine, sessionmaker = await _database(tmp_path)

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project("project-a", "test-user", "Project A")
        await repo.create_project("project-b", "test-user", "Project B")
        project_a_version = await repo.create_artifact_version(
            project_id="project-a",
            artifact_type="intake",
            content={"prompt": "Project A only"},
            created_by="user",
        )

        with pytest.raises(ValueError, match="same project"):
            await repo.create_artifact_version(
                project_id="project-b",
                artifact_type="outline",
                content="## Invalid lineage",
                created_by="director",
                based_on_version_id=project_a_version.id,
            )

    await engine.dispose()


@pytest.mark.asyncio
async def test_concurrent_appends_allocate_distinct_versions(tmp_path):
    engine, sessionmaker = await _database(tmp_path)
    project_id = "concurrent-project"

    async with sessionmaker() as session:
        repo = ProjectRepository(session)
        await repo.create_project(project_id, "test-user", "Concurrent")

    async def append_version(created_by):
        async with sessionmaker() as session:
            repo = ProjectRepository(session)
            return await repo.create_artifact_version(
                project_id=project_id,
                artifact_type="intake",
                content={"created_by": created_by},
                created_by=created_by,
            )

    first, second = await asyncio.gather(
        append_version("user-a"),
        append_version("user-b"),
    )

    async with sessionmaker() as session:
        versions = await ProjectRepository(session).list_artifact_versions(
            project_id, "intake"
        )
        assert {first.version_number, second.version_number} == {1, 2}
        assert [version.version_number for version in versions] == [1, 2]

    await engine.dispose()
