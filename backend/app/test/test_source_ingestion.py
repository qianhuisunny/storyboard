"""Security regressions for project-owned source ingestion."""

import io
import time
import zipfile

import httpx
import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.db import engine as db_engine
from app.db.engine import get_db
from app.db.models import Base
from app.db.repository import ProjectRepository
from app.main import app
from app.services.source_ingestion import (
    SourceIngestionError,
    fetch_public_text,
    extract_with_timeout,
    validate_docx_archive,
    validate_public_url,
)


async def public_resolver(hostname: str, port: int) -> list[str]:
    assert hostname
    assert port in {80, 443}
    return ["93.184.216.34"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "https://user:secret@example.com/private",
        "https://example.com:99999/bad-port",
        "https://example.com:0/bad-port",
        "http://127.0.0.1/admin",
        "http://169.254.169.254/latest/meta-data",
        "http://10.0.0.8/internal",
        "http://[::1]/",
    ],
)
async def test_public_url_validation_rejects_unsafe_targets(url):
    with pytest.raises(SourceIngestionError):
        await validate_public_url(url, resolver=public_resolver)


@pytest.mark.asyncio
async def test_fetch_validates_relative_redirects_without_real_network():
    requested: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requested.append(str(request.url))
        if request.url.path == "/start":
            return httpx.Response(302, headers={"location": "/final"})
        return httpx.Response(
            200,
            headers={"content-type": "text/html; charset=utf-8"},
            content=b"<title>Safe</title><p>Public content</p>",
        )

    result = await fetch_public_text(
        "https://example.com/start",
        resolver=public_resolver,
        transport=httpx.MockTransport(handler),
    )

    assert requested == [
        "https://example.com/start",
        "https://example.com/final",
    ]
    assert result.final_url == "https://example.com/final"
    assert "Public content" in result.text


@pytest.mark.asyncio
async def test_fetch_rejects_redirect_to_private_target():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "http://127.0.0.1/secret"})

    with pytest.raises(SourceIngestionError, match="public"):
        await fetch_public_text(
            "https://example.com/start",
            resolver=public_resolver,
            transport=httpx.MockTransport(handler),
        )


@pytest.mark.asyncio
async def test_fetch_caps_redirect_count():
    def handler(request: httpx.Request) -> httpx.Response:
        count = int(request.url.path.removeprefix("/"))
        return httpx.Response(302, headers={"location": f"/{count + 1}"})

    with pytest.raises(SourceIngestionError, match="too many"):
        await fetch_public_text(
            "https://example.com/0",
            resolver=public_resolver,
            transport=httpx.MockTransport(handler),
            max_redirects=2,
        )


@pytest.mark.asyncio
async def test_fetch_rejects_unsafe_content_type_and_decompressed_oversize():
    binary = httpx.MockTransport(
        lambda _request: httpx.Response(
            200,
            headers={"content-type": "application/octet-stream"},
            content=b"binary",
        )
    )
    with pytest.raises(SourceIngestionError, match="content type"):
        await fetch_public_text(
            "https://example.com/file",
            resolver=public_resolver,
            transport=binary,
        )

    oversized = httpx.MockTransport(
        lambda _request: httpx.Response(
            200,
            headers={"content-type": "text/plain"},
            content=b"a" * 65,
        )
    )
    with pytest.raises(SourceIngestionError, match="too large"):
        await fetch_public_text(
            "https://example.com/large",
            resolver=public_resolver,
            transport=oversized,
            max_bytes=64,
        )


def _docx_bytes(*, expanded_size: int = 32) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", "<Types />")
        archive.writestr("word/document.xml", "x" * expanded_size)
    return buffer.getvalue()


def test_docx_archive_limits_block_zip_bombs(tmp_path):
    path = tmp_path / "bomb.docx"
    path.write_bytes(_docx_bytes(expanded_size=4096))

    with pytest.raises(SourceIngestionError, match="expanded size"):
        validate_docx_archive(path, max_uncompressed_bytes=1024)


@pytest.mark.asyncio
async def test_extraction_is_offloaded_timeout_bounded_and_output_capped(tmp_path):
    source = tmp_path / "source.txt"
    source.write_text("source")

    def slow_extractor(_path):
        time.sleep(0.05)
        return "late"

    with pytest.raises(SourceIngestionError, match="timed out"):
        await extract_with_timeout(slow_extractor, source, timeout_seconds=0.001)

    result = await extract_with_timeout(
        lambda _path: "é" * 100,
        source,
        timeout_seconds=1,
        max_chars=10,
    )
    assert result == "é" * 10


@pytest_asyncio.fixture
async def source_api(tmp_path, monkeypatch):
    engine = db_engine.create_sqlite_async_engine(
        f"sqlite+aiosqlite:///{tmp_path / 'sources.db'}"
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as session:
        repo = ProjectRepository(session)
        await repo.create_project("anon-source", "anon_owner", "Anonymous")
        await repo.create_project("user-source", "user_owner", "Signed in")

    async def override_get_db():
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    monkeypatch.setattr(
        "app.main._project_root_dir",
        lambda project_id: tmp_path / f"project_{project_id}",
    )
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client, tmp_path

    app.dependency_overrides.clear()
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("project_id", "owner"),
    [("anon-source", "anon_owner"), ("user-source", "user_owner")],
)
async def test_upload_requires_exact_owner_and_allows_exact_owner(
    source_api, project_id, owner
):
    client, _ = source_api
    files = {"file": ("notes.txt", b"hello", "text/plain")}

    assert (await client.post(f"/api/project/{project_id}/upload", files=files)).status_code == 403
    assert (
        await client.post(
            f"/api/project/{project_id}/upload",
            headers={"X-User-ID": "wrong-owner"},
            files=files,
        )
    ).status_code == 403
    allowed = await client.post(
        f"/api/project/{project_id}/upload",
        headers={"X-User-ID": owner},
        files=files,
    )
    assert allowed.status_code == 200


@pytest.mark.asyncio
async def test_upload_uses_unique_server_names_and_rejects_traversal_signature_and_doc(
    source_api,
):
    client, tmp_path = source_api
    headers = {"X-User-ID": "anon_owner"}
    first = await client.post(
        "/api/project/anon-source/upload",
        headers=headers,
        files={"file": ("../../notes.txt", b"one", "text/plain")},
    )
    second = await client.post(
        "/api/project/anon-source/upload",
        headers=headers,
        files={"file": ("../../notes.txt", b"two", "text/plain")},
    )

    assert first.status_code == second.status_code == 200
    assert first.json()["path"] != second.json()["path"]
    uploads = tmp_path / "project_anon-source" / "uploads"
    assert all(path.resolve().is_relative_to(uploads.resolve()) for path in uploads.iterdir())
    assert not (tmp_path / "notes.txt").exists()

    bad_pdf = await client.post(
        "/api/project/anon-source/upload",
        headers=headers,
        files={"file": ("fake.pdf", b"not a pdf", "application/pdf")},
    )
    legacy_doc = await client.post(
        "/api/project/anon-source/upload",
        headers=headers,
        files={"file": ("legacy.doc", b"legacy", "application/msword")},
    )
    corrupt_pdf = await client.post(
        "/api/project/anon-source/upload",
        headers=headers,
        files={"file": ("corrupt.pdf", b"%PDF-not-a-document", "application/pdf")},
    )
    assert bad_pdf.status_code == 400
    assert corrupt_pdf.status_code == 400
    assert legacy_doc.status_code == 400


@pytest.mark.asyncio
async def test_upload_stream_enforces_hard_size_limit(source_api, monkeypatch):
    client, _ = source_api
    monkeypatch.setattr("app.main.MAX_UPLOAD_BYTES", 8)

    response = await client.post(
        "/api/project/anon-source/upload",
        headers={"X-User-ID": "anon_owner"},
        files={"file": ("large.txt", b"123456789", "text/plain")},
    )

    assert response.status_code == 413


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("project_id", "owner"),
    [("anon-source", "anon_owner"), ("user-source", "user_owner")],
)
async def test_fetch_link_requires_exact_owner(
    source_api, monkeypatch, project_id, owner
):
    client, _ = source_api

    async def fake_fetch(_url):
        return type(
            "Fetched",
            (),
            {
                "final_url": "https://example.com/notes",
                "content_type": "text/html",
                "text": "<title>Notes</title><p>Safe text</p>",
            },
        )()

    monkeypatch.setattr("app.main.fetch_public_text", fake_fetch)
    endpoint = f"/api/project/{project_id}/fetch-link"
    payload = {"url": "https://example.com/notes"}

    assert (await client.post(endpoint, json=payload)).status_code == 403
    assert (
        await client.post(
            endpoint, headers={"X-User-ID": "wrong-owner"}, json=payload
        )
    ).status_code == 403
    allowed = await client.post(
        endpoint, headers={"X-User-ID": owner}, json=payload
    )
    assert allowed.status_code == 200
    assert "Safe text" in allowed.json()["content"]
