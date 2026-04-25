import json
import sqlite3

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.infra.quality_log import QualityLog


@pytest.fixture
def seeded_qlog(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    qlog = QualityLog(db_path=db_path)

    g1 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="dir_v0324.md",
        context="brief", raw_response="outline v1",
    )
    e1 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 5.9, "passed": False},
        parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="dir_v0324.md",
        context="brief+feedback", raw_response="outline v2",
        parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 7.8, "passed": True},
        parent_id=g2,
    )
    a1 = qlog.log_approve(
        project_id="p1", stage="outline", scope="full", parent_id=e2,
    )

    g3 = qlog.log_generate(
        project_id="p1", stage="storyboard", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="writer_v0324.md",
        context="outline", raw_response="storyboard",
    )
    e3 = qlog.log_eval(
        project_id="p1", stage="storyboard", scope="full",
        model="gpt-4o", prompt_ref="SB_EVAL.md",
        context="ctx", raw_response="resp",
        scores={"composite_score": 7.6, "passed": True},
        parent_id=g3,
    )
    a2 = qlog.log_approve(
        project_id="p1", stage="storyboard", scope="full", parent_id=e3,
    )

    monkeypatch.setattr("app.infra.quality_log.qlog", qlog)
    monkeypatch.setattr("app.infra.quality_log._DB_PATH", db_path)
    monkeypatch.setattr("app.main.qlog", qlog)
    return qlog


@pytest.mark.asyncio
async def test_chains_endpoint_groups_by_stage(seeded_qlog):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/quality-log/p1/chains")
    assert resp.status_code == 200
    data = resp.json()

    assert data["project_id"] == "p1"
    stages = data["stages"]
    assert len(stages) == 2

    outline_stage = stages[0]
    assert outline_stage["stage"] == "outline"
    assert len(outline_stage["chains"]) == 1

    chain = outline_stage["chains"][0]
    events = chain["events"]
    assert len(events) == 5
    assert events[0]["event"] == "generate"
    assert events[1]["event"] == "eval"
    assert events[2]["event"] == "generate"
    assert events[3]["event"] == "eval"
    assert events[4]["event"] == "approve"

    sb_stage = stages[1]
    assert sb_stage["stage"] == "storyboard"
    assert len(sb_stage["chains"]) == 1
    assert len(sb_stage["chains"][0]["events"]) == 3


@pytest.mark.asyncio
async def test_chains_endpoint_empty_project(seeded_qlog):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/quality-log/nonexistent/chains")
    assert resp.status_code == 200
    data = resp.json()
    assert data["stages"] == []
