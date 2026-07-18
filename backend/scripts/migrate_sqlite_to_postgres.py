"""Copy Plotline's local SQLite history into the hosted Postgres database.

Browser session tokens are intentionally not copied. Projects owned by a
server-issued local session are reassigned to that session's legacy anonymous
browser ID so the production browser can reclaim them through /api/session.
"""

from __future__ import annotations

import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

import psycopg
from dotenv import load_dotenv
from psycopg import sql


REPO_ROOT = Path(__file__).resolve().parents[2]

TABLE_COLUMNS = {
    "projects": (
        "id",
        "user_id",
        "title",
        "type_id",
        "type_name",
        "user_input",
        "created_at",
        "updated_at",
    ),
    "pipeline_states": (
        "id",
        "project_id",
        "phase",
        "status",
        "state_data",
        "created_at",
        "updated_at",
    ),
    "stage_snapshots": (
        "id",
        "project_id",
        "stage_id",
        "ai_version",
        "human_version",
        "created_at",
        "updated_at",
    ),
    "chat_messages": (
        "id",
        "project_id",
        "stage_id",
        "role",
        "content",
        "phase",
        "field_key",
        "selected_chip",
        "created_at",
    ),
    "uploads": (
        "id",
        "project_id",
        "filename",
        "file_path",
        "content_type",
        "size_bytes",
        "created_at",
    ),
    "artifact_versions": (
        "id",
        "project_id",
        "artifact_type",
        "version_number",
        "content",
        "based_on_version_id",
        "created_by",
        "is_override",
        "created_at",
    ),
    "quality_log": (
        "id",
        "project_id",
        "event",
        "stage",
        "scope",
        "attempt",
        "model",
        "prompt_ref",
        "context",
        "raw_response",
        "parsed_output",
        "scores",
        "instruction",
        "before_content",
        "after_content",
        "parent_id",
        "created_at",
    ),
}

SERIAL_TABLES = {
    "pipeline_states": "id",
    "stage_snapshots": "id",
    "uploads": "id",
    "quality_log": "id",
}


def _insert_rows(
    target: psycopg.Connection,
    table: str,
    columns: tuple[str, ...],
    rows: Iterable[tuple],
) -> int:
    statement = sql.SQL("INSERT INTO {} ({}) VALUES ({}) ON CONFLICT DO NOTHING").format(
        sql.Identifier(table),
        sql.SQL(", ").join(map(sql.Identifier, columns)),
        sql.SQL(", ").join(sql.Placeholder() for _ in columns),
    )
    inserted = 0
    with target.cursor() as cursor:
        for row in rows:
            cursor.execute(statement, row)
            inserted += max(cursor.rowcount, 0)
    return inserted


def migrate(sqlite_path: Path, database_url: str) -> None:
    source = sqlite3.connect(sqlite_path)
    source.row_factory = sqlite3.Row
    target = psycopg.connect(database_url)

    try:
        legacy_ids = {
            row["id"]: row["legacy_user_id"]
            for row in source.execute(
                "SELECT id, legacy_user_id FROM anonymous_sessions "
                "WHERE legacy_user_id IS NOT NULL"
            )
        }
        remapped_owners = 0
        inserted_counts: dict[str, int] = {}

        with target.transaction():
            for table, columns in TABLE_COLUMNS.items():
                order_by = "version_number, created_at" if table == "artifact_versions" else "rowid"
                source_rows = source.execute(
                    f'SELECT {", ".join(columns)} FROM "{table}" ORDER BY {order_by}'
                )

                def normalized_rows():
                    nonlocal remapped_owners
                    for source_row in source_rows:
                        values = [source_row[column] for column in columns]
                        if table == "projects":
                            owner_index = columns.index("user_id")
                            owner = values[owner_index]
                            if isinstance(owner, str) and owner.startswith("session:"):
                                legacy_id = legacy_ids.get(owner.removeprefix("session:"))
                                if legacy_id:
                                    values[owner_index] = legacy_id
                                    remapped_owners += 1
                        elif table == "artifact_versions":
                            override_index = columns.index("is_override")
                            values[override_index] = bool(values[override_index])
                        elif table == "quality_log":
                            created_index = columns.index("created_at")
                            if isinstance(values[created_index], (int, float)):
                                values[created_index] = datetime.fromtimestamp(
                                    values[created_index], timezone.utc
                                ).replace(tzinfo=None)
                        yield tuple(values)

                inserted_counts[table] = _insert_rows(
                    target, table, columns, normalized_rows()
                )

            with target.cursor() as cursor:
                for table, column in SERIAL_TABLES.items():
                    cursor.execute(
                        sql.SQL(
                            "SELECT setval("
                            "pg_get_serial_sequence(%s, %s), "
                            "COALESCE(MAX({column}), 1), "
                            "MAX({column}) IS NOT NULL"
                            ") FROM {table}"
                        ).format(
                            table=sql.Identifier(table),
                            column=sql.Identifier(column),
                        ),
                        (table, column),
                    )

        print(f"SQLite source: {sqlite_path}")
        print(f"Remapped session-owned projects: {remapped_owners}")
        for table, count in inserted_counts.items():
            print(f"{table}: inserted {count}")
    finally:
        source.close()
        target.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sqlite",
        type=Path,
        default=REPO_ROOT / "data" / "plotline.db",
    )
    parser.add_argument(
        "--env-file",
        type=Path,
        default=REPO_ROOT / ".env.local",
    )
    args = parser.parse_args()

    load_dotenv(args.env_file, override=False)
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit(f"DATABASE_URL was not found in {args.env_file}")
    if not args.sqlite.is_file():
        raise SystemExit(f"SQLite database was not found: {args.sqlite}")

    migrate(args.sqlite, database_url)


if __name__ == "__main__":
    main()
