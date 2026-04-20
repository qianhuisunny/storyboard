import json
import sqlite3
import time
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent.parent.parent / "data" / "plotline.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS quality_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL,
    event           TEXT NOT NULL,
    stage           TEXT NOT NULL,
    scope           TEXT,
    attempt         INTEGER,
    model           TEXT,
    prompt_ref      TEXT,
    context         TEXT,
    raw_response    TEXT,
    parsed_output   TEXT,
    scores          TEXT,
    instruction     TEXT,
    before_content  TEXT,
    after_content   TEXT,
    parent_id       INTEGER REFERENCES quality_log(id),
    created_at      REAL NOT NULL
);
"""

_CREATE_INDEXES = [
    "CREATE INDEX IF NOT EXISTS ix_qlog_project ON quality_log(project_id);",
    "CREATE INDEX IF NOT EXISTS ix_qlog_event ON quality_log(event);",
]


class QualityLog:
    def __init__(self, db_path: Path = _DB_PATH):
        self._db_path = db_path
        self._ensure_table()

    def _ensure_table(self):
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self._db_path)
        try:
            conn.execute(_CREATE_TABLE)
            for idx in _CREATE_INDEXES:
                conn.execute(idx)
            conn.commit()
        finally:
            conn.close()

    def _insert(self, **fields) -> int:
        fields.setdefault("created_at", time.time())
        cols = list(fields.keys())
        placeholders = ", ".join(["?"] * len(cols))
        col_names = ", ".join(cols)
        values = [
            json.dumps(v) if isinstance(v, (dict, list)) else v
            for v in fields.values()
        ]
        conn = sqlite3.connect(self._db_path)
        try:
            cursor = conn.execute(
                f"INSERT INTO quality_log ({col_names}) VALUES ({placeholders})",
                values,
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def log_generate(
        self,
        project_id: str,
        stage: str,
        scope: str,
        attempt: int,
        model: str,
        prompt_ref: str,
        context: str,
        raw_response: str,
        parsed_output=None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="generate",
            stage=stage,
            scope=scope,
            attempt=attempt,
            model=model,
            prompt_ref=prompt_ref,
            context=context,
            raw_response=raw_response,
            parsed_output=parsed_output,
            parent_id=parent_id,
        )

    def log_eval(
        self,
        project_id: str,
        stage: str,
        scope: str,
        model: str,
        prompt_ref: str,
        context: str,
        raw_response: str,
        scores=None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="eval",
            stage=stage,
            scope=scope,
            model=model,
            prompt_ref=prompt_ref,
            context=context,
            raw_response=raw_response,
            scores=scores,
            parent_id=parent_id,
        )

    def log_override(
        self,
        project_id: str,
        stage: str,
        scope: str,
        instruction: str = None,
        before_content: str = None,
        after_content: str = None,
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="override",
            stage=stage,
            scope=scope,
            instruction=instruction,
            before_content=before_content,
            after_content=after_content,
            parent_id=parent_id,
        )

    def log_approve(
        self,
        project_id: str,
        stage: str,
        scope: str = "full",
        parent_id: int = None,
    ) -> int:
        return self._insert(
            project_id=project_id,
            event="approve",
            stage=stage,
            scope=scope,
            parent_id=parent_id,
        )


qlog = QualityLog()
