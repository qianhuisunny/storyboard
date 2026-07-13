import threading

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.engine import get_db
from app.db.models import AnonymousSession, Base
from app.db.repository import ProjectRepository
from app.main import app
from app.services.session_auth import SESSION_COOKIE, hash_session_token


def _payload(**updates):
    payload = {
        "messages": [{"role": "user", "content": "Make it practical."}],
        "fields_so_far": {
            "viewer_outcome": {"value": "Run the check"},
            "intent_route": {"value": "must-not-leak"},
            "core_talking_points": {"value": ["must-not-leak"]},
        },
        "onboarding": {
            "prompt": "Explain production handoffs.",
            "duration_seconds": 90,
            "target_audience": "Engineering leads",
            "platform": "LinkedIn",
            "aspect_ratio": "9:16",
            "production_formats": ["slides"],
            "source_snapshot": "Use the launch checklist source.",
            "intent_route": "must-not-leak",
            "content_mode": "must-not-leak",
        },
    }
    payload.update(updates)
    return payload


@pytest_asyncio.fixture
async def chat_api(tmp_path):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'chat-api.db'}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        session.add_all([
            AnonymousSession(id="chat-owner", token_hash=hash_session_token("chat-token")),
            AnonymousSession(id="chat-other", token_hash=hash_session_token("chat-other-token")),
        ])
        await session.commit()
        repo = ProjectRepository(session)
        await repo.create_project(
            "chat-project", "session:chat-owner", "Chat API"
        )
        await repo.create_project(
            "clerk-project", "user_clerk_123", "Clerk-owned Chat API"
        )

    async def override_get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        client.cookies.set(SESSION_COOKIE, "chat-token")
        yield client

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
async def test_chat_brief_uses_canonical_bounded_context_fenced_json_and_thread(
    chat_api, monkeypatch
):
    captured = {}
    caller_thread = threading.get_ident()

    def fake_chat(**kwargs):
        captured.update(kwargs)
        captured["thread_id"] = threading.get_ident()
        return """Model preface with {not valid JSON}.
```json
{
  "reply": "I have what I need.",
  "done": true,
  "extracted_fields": {
    "viewer_outcome": "Run the check",
    "target_audience": "Engineering leads",
    "audience_level": "Intermediate",
    "delivery_tone": "Direct",
    "production_formats": ["slides"],
    "intent_route": "must-not-return"
  }
}
```
Trailing prose with {another brace}."""

    monkeypatch.setattr("app.infra.llm_gateway.llm.chat", fake_chat)
    response = await chat_api.post(
        "/api/project/chat-project/chat-brief",
        headers={"X-User-ID": "owner-123"},
        json=_payload(),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["done"] is True
    assert set(body["extracted_fields"]) == {
        "viewer_outcome",
        "target_audience",
        "audience_level",
        "delivery_tone",
        "production_formats",
    }
    assert captured["thread_id"] != caller_thread
    system_prompt = captured["system_prompt"]
    user_prompt = captured["user_prompt"]
    for key in (
        "viewer_outcome",
        "target_audience",
        "audience_level",
        "delivery_tone",
        "production_formats",
    ):
        assert key in system_prompt
    for expected in (
        "Explain production handoffs.",
        "90",
        "Engineering leads",
        "LinkedIn",
        "9:16",
        "slides",
        "Use the launch checklist source.",
        "Run the check",
    ):
        assert expected in user_prompt
    lowered = f"{system_prompt}\n{user_prompt}".lower()
    for retired in (
        "intent_route",
        "intent route",
        "content_mode",
        "content mode",
        "core_talking_points",
        "core talking points",
        "point_of_view",
        "point of view",
        "misconceptions",
    ):
        assert retired not in lowered
    assert "must-not-leak" not in user_prompt


@pytest.mark.asyncio
async def test_chat_brief_rejects_missing_and_unauthorized_projects_before_llm(
    chat_api, monkeypatch
):
    calls = []
    monkeypatch.setattr(
        "app.infra.llm_gateway.llm.chat",
        lambda **kwargs: calls.append(kwargs) or "{}",
    )

    missing = await chat_api.post(
        "/api/project/missing/chat-brief",
        headers={"X-User-ID": "owner-123"},
        json=_payload(),
    )
    chat_api.cookies.set(SESSION_COOKIE, "chat-other-token")
    forbidden = await chat_api.post(
        "/api/project/chat-project/chat-brief",
        headers={"X-User-ID": "intruder"},
        json=_payload(),
    )
    headerless_clerk = await chat_api.post(
        "/api/project/clerk-project/chat-brief",
        json=_payload(),
    )

    assert missing.status_code == 404
    assert forbidden.status_code == 403
    assert headerless_clerk.status_code == 403
    assert calls == []
    chat_api.cookies.set(SESSION_COOKIE, "chat-token")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        _payload(messages=[{"role": "user", "content": "ok"}] * 21),
        _payload(messages=[{"role": "user", "content": "x" * 6001}]),
        _payload(onboarding={"source_snapshot": "x" * 50001}),
    ],
)
async def test_chat_brief_rejects_oversized_payload_without_llm(
    chat_api, monkeypatch, payload
):
    calls = []
    monkeypatch.setattr(
        "app.infra.llm_gateway.llm.chat",
        lambda **kwargs: calls.append(kwargs) or "{}",
    )

    response = await chat_api.post(
        "/api/project/chat-project/chat-brief",
        headers={"X-User-ID": "owner-123"},
        json=payload,
    )

    assert response.status_code == 422
    assert calls == []


@pytest.mark.asyncio
async def test_chat_brief_caps_every_rendered_nested_value_and_reply(
    chat_api, monkeypatch
):
    captured = {}
    huge_but_valid = "x" * 12000

    def fake_chat(**kwargs):
        captured.update(kwargs)
        return """```json
{"reply": "%s", "done": false, "extracted_fields": {}}
```""" % ("r" * 12000)

    monkeypatch.setattr("app.infra.llm_gateway.llm.chat", fake_chat)
    response = await chat_api.post(
        "/api/project/chat-project/chat-brief",
        headers={"X-User-ID": "owner-123"},
        json=_payload(
            onboarding={"source_snapshot": {"nested": huge_but_valid}},
            fields_so_far={"viewer_outcome": {"value": huge_but_valid}},
        ),
    )

    assert response.status_code == 200
    assert "[truncated]" in captured["user_prompt"]
    assert len(response.json()["reply"]) <= 6000
    assert "[truncated]" in response.json()["reply"]
