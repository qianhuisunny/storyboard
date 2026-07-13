"""Final trust-boundary regressions for the durable Create flow."""

import asyncio
from uuid import uuid4

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.engine import get_db
from app.db.models import Base
from app.main import app
from app.services.workflow import WorkflowService


@pytest_asyncio.fixture
async def isolated_api(tmp_path, monkeypatch):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'security.db'}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    async def outline(context):
        return f"Outline: {context.intake['prompt']}"

    async def storyboard(context):
        return [{"screen_number": 1, "voiceover": context.outline}]

    monkeypatch.setattr(
        "app.main.workflow_service", WorkflowService(sessions, outline, storyboard)
    )
    monkeypatch.setattr(
        "app.main._project_root_dir",
        lambda project_id: tmp_path / f"project_{project_id}",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as owner:
        async with AsyncClient(transport=transport, base_url="http://test") as other:
            yield owner, other

    app.dependency_overrides.clear()
    await engine.dispose()


async def _establish_session(client: AsyncClient) -> None:
    response = await client.post(
        "/api/session",
        json={"legacy_user_id": f"anon_{uuid4()}"},
    )
    assert response.status_code == 200
    assert response.json() == {"success": True}
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie


@pytest.mark.asyncio
async def test_opaque_sessions_isolate_every_project_surface(isolated_api):
    owner, other = isolated_api
    await _establish_session(owner)
    await _establish_session(other)
    created = await owner.post(
        "/api/create-project",
        json={
            "projectId": "private-project",
            "typeId": 1,
            "typeName": "Video storyboard",
            "userInput": "Keep this private",
        },
    )
    assert created.status_code == 200

    project = await owner.get("/api/project/private-project")
    assert project.status_code == 200
    assert "userId" not in project.json()["project"]

    for method, path, kwargs in (
        ("get", "/api/project/private-project", {}),
        ("get", "/api/project/private-project/pipeline-state", {}),
        ("get", "/api/project/private-project/stages", {}),
        ("post", "/api/project/private-project/event", {"json": {"event": "save_intake", "payload": {"content": {"prompt": "stolen"}}}}),
        ("post", "/api/project/private-project/start", {"json": {"intake_form": {"prompt": "stolen"}}}),
        ("post", "/api/project/private-project/upload", {"files": {"file": ("x.txt", b"x", "text/plain")}}),
        ("get", "/api/project/private-project/documents", {}),
        ("delete", "/api/project/private-project", {}),
    ):
        response = await getattr(other, method)(path, **kwargs)
        assert response.status_code == 403, (method, path, response.text)

    owner_projects = await owner.get("/api/projects")
    other_projects = await other.get("/api/projects")
    assert [item["id"] for item in owner_projects.json()["projects"]] == ["private-project"]
    assert other_projects.json()["projects"] == []


@pytest.mark.asyncio
async def test_session_rejects_caller_claimed_signed_in_identity(isolated_api):
    owner, _ = isolated_api
    response = await owner.post(
        "/api/session", json={"legacy_user_id": "user_admin"}
    )
    assert response.status_code == 422
    await _establish_session(owner)
    create = await owner.post(
        "/api/create-project",
        json={
            "projectId": "claimed-owner",
            "typeId": 1,
            "typeName": "Video storyboard",
            "userInput": "claimed",
            "userId": "user_admin",
        },
    )
    assert create.status_code == 422


@pytest.mark.asyncio
async def test_concurrent_create_is_idempotent_only_for_same_session(isolated_api):
    owner, other = isolated_api
    await _establish_session(owner)
    await _establish_session(other)
    payload = {
        "projectId": "concurrent-project",
        "typeId": 1,
        "typeName": "Video storyboard",
        "userInput": "Concurrent create",
    }
    first, second = await asyncio.gather(
        owner.post("/api/create-project", json=payload),
        owner.post("/api/create-project", json=payload),
    )
    assert first.status_code == second.status_code == 200
    assert sorted([first.json().get("idempotent", False), second.json().get("idempotent", False)]) == [False, True]
    conflict = await other.post("/api/create-project", json=payload)
    assert conflict.status_code in {403, 409}


@pytest.mark.asyncio
async def test_canonical_intake_is_typed_normalized_and_consistent(isolated_api):
    owner, _ = isolated_api
    await _establish_session(owner)
    await owner.post(
        "/api/create-project",
        json={
            "projectId": "typed-intake",
            "typeId": 1,
            "typeName": "Video storyboard",
            "userInput": "Typed",
        },
    )
    invalid = await owner.post(
        "/api/project/typed-intake/event",
        json={
            "event": "save_intake",
            "payload": {
                "content": {
                    "prompt": "Typed",
                    "duration_seconds": 77,
                    "platform": "carrier_pigeon",
                    "aspect_ratio": "square-ish",
                    "sources": [
                        {"id": "s", "kind": "link", "name": "x", "status": "ready"}
                    ],
                }
            },
        },
    )
    assert invalid.status_code == 422

    valid = await owner.post(
        "/api/project/typed-intake/event",
        json={
            "event": "save_intake",
            "payload": {
                "content": {
                    "prompt": "  A normalized prompt  ",
                    "duration_seconds": 120,
                    "platform": "internal_lms",
                    "aspect_ratio": "9:16",
                    "sources": [],
                }
            },
        },
    )
    assert valid.status_code == 200
    state = await owner.get("/api/project/typed-intake/pipeline-state")
    assert state.json()["artifacts"]["intake"]["current_content"]["prompt"] == "A normalized prompt"
