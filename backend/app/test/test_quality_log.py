import json
import sqlite3
from pathlib import Path

import pytest

from app.infra.quality_log import QualityLog


@pytest.fixture
def qlog(tmp_path):
    db_path = tmp_path / "test.db"
    return QualityLog(db_path=db_path)


def _query(qlog, sql, params=()):
    conn = sqlite3.connect(qlog._db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(sql, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def test_log_generate_returns_id(qlog):
    row_id = qlog.log_generate(
        project_id="p1",
        stage="outline",
        scope="full",
        attempt=1,
        model="gpt-4o",
        prompt_ref="storyboard_director_prompt_v0324",
        context="brief fields here",
        raw_response="outline text",
        parsed_output={"sections": []},
    )
    assert row_id == 1
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert len(rows) == 1
    assert rows[0]["event"] == "generate"
    assert rows[0]["attempt"] == 1
    assert json.loads(rows[0]["parsed_output"]) == {"sections": []}


def test_log_eval_with_scores(qlog):
    gen_id = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
    )
    eval_id = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="OUTLINE_EVAL_PROMPT",
        context="brief + outline", raw_response="judge response",
        scores={"composite": 7.8, "gut": {"score": 8.0}},
        parent_id=gen_id,
    )
    assert eval_id == 2
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (eval_id,))
    assert rows[0]["parent_id"] == gen_id
    assert json.loads(rows[0]["scores"])["composite"] == 7.8


def test_log_override(qlog):
    row_id = qlog.log_override(
        project_id="p1", stage="outline", scope="section:3",
        instruction="argument too weak",
        before_content="old text", after_content="new text",
    )
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert rows[0]["event"] == "override"
    assert rows[0]["before_content"] == "old text"
    assert rows[0]["model"] is None


def test_log_approve(qlog):
    row_id = qlog.log_approve(project_id="p1", stage="outline")
    rows = _query(qlog, "SELECT * FROM quality_log WHERE id = ?", (row_id,))
    assert rows[0]["event"] == "approve"
    assert rows[0]["scope"] == "full"


def test_causal_chain(qlog):
    g1 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=1,
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="v1",
    )
    e1 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
        scores={"composite": 6.2}, parent_id=g1,
    )
    g2 = qlog.log_generate(
        project_id="p1", stage="outline", scope="full", attempt=2,
        model="gpt-4o", prompt_ref="ref", context="ctx + feedback",
        raw_response="v2", parent_id=e1,
    )
    e2 = qlog.log_eval(
        project_id="p1", stage="outline", scope="full",
        model="gpt-4o", prompt_ref="ref", context="ctx", raw_response="resp",
        scores={"composite": 7.8}, parent_id=g2,
    )
    chain = _query(qlog, "SELECT id, event, parent_id FROM quality_log WHERE project_id = ? ORDER BY id", ("p1",))
    assert len(chain) == 4
    assert chain[0]["parent_id"] is None
    assert chain[1]["parent_id"] == g1
    assert chain[2]["parent_id"] == e1
    assert chain[3]["parent_id"] == g2
