# Plotline Repo Restructuring Plan

## Completed

- ✅ **Langflow removal** — `chatbot.py` rewritten to direct OpenAI. Run `rm -f AGENTS.md.bak && rm -rf langflow_env/` to finish.
- ✅ **CLAUDE.md** — Restored as single operating manual.

---

## Cleanup Script (Run Now)

```bash
# Langflow leftovers
rm -f AGENTS.md.bak
rm -rf langflow_env/

# Orphan files → docs
mkdir -p docs/future_roadmap
mv company-and-team-level.md docs/future_roadmap/
mv content-mapping-best-practices.md docs/future_roadmap/

# Test artifacts
rm -f Storyboard.json test.json

# Consolidate backend tests
mkdir -p backend/app/test/fixtures
mv backend/debug_google_api.py backend/quick_test_api.py backend/test_image_search.py backend/test_json_extractor.py backend/test_models.py backend/app/test/ 2>/dev/null
rm -f backend/backend.log

# Housekeeping
touch PROGRESS.md
rm -rf data/project_test_*
```

---

## DB: data/ Folder Strategy

This is an offline project. No dual-write, no phased cutover.

1. **Map existing data to new schema** — write a script that reads each `data/project_*` folder's JSON files and inserts into Postgres. Spot-check a few projects, then delete the JSON.
2. **New projects write to DB** — rewrite endpoints in `main.py`, `state.py`, `edit_tracker.py`, `analytics.py` to use SQLAlchemy instead of `json.dump()`/`json.load()`.

That's it.

---

## Database Design

### Stack

- **PostgreSQL** via Fly Postgres (local Docker for dev)
- **SQLAlchemy 2.0** async with `asyncpg`
- **Alembic** for schema migrations

### What's Being Replaced

| Service | JSON File | → DB Table |
|---------|-----------|------------|
| `main.py` → `create_project()` | `project_type{n}.json` | `projects` |
| `main.py` → `save_chat_messages()` | `chat_history.json` | `chat_messages` |
| `main.py` → `save_stories_to_project()` | `story_{n}.json` | `screens` |
| `main.py` → `save_stages()` | `stages.json` | `stage_snapshots` |
| `main.py` → `upload_file_to_project()` | `uploads/{filename}` | `uploads` (metadata) + S3 later |
| `main.py` → `fetch_link_content()` | `links/{domain}_{ts}.txt` | `fetched_links` |
| `main.py` → `generate_brief()` | `story_brief.json` | `projects.story_brief` (JSONB) |
| `main.py` → `run_research()` | `context_pack.json` | `projects.context_pack` (JSONB) |
| `state.py` → `StateManager.save()` | `state.json` | `pipeline_states` |
| `edit_tracker.py` → `save_edit_log()` | `edit_log.json` | `stage_snapshots` (merged) |
| `analytics.py` → various methods | `analytics.json` | `analytics_events` |

**11 JSON files per project → 9 DB tables.**

### Schema Overview

```
projects (1) ──── (1) pipeline_states
    │
    ├──── (many) screens
    ├──── (many) chat_messages
    ├──── (many) stage_snapshots      ← merges stages.json + edit_log.json
    ├──── (many) uploads
    ├──── (many) fetched_links
    ├──── (many) analytics_events
    └──── (1)    satisfaction_ratings
```

All child tables cascade-delete when a project is deleted.

### Table Definitions

#### projects
Replaces `project_type{n}.json`. JSONB columns for semi-structured data (intake_form, context_pack, story_brief).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` PK | Project UUID |
| `user_id` | `String` indexed | Clerk user ID |
| `video_type` | `Integer` | 1=Product Release, 2=How-to, 3=Knowledge |
| `video_type_name` | `String` | Human-readable name |
| `user_input` | `Text` | Original user description |
| `intake_form` | `JSONB` nullable | Full intake form data |
| `context_pack` | `JSONB` nullable | TopicResearcher output |
| `story_brief` | `JSONB` nullable | BriefBuilder output |
| `created_at` | `DateTime` | |
| `updated_at` | `DateTime` | Auto-updates |

Composite index on `(user_id, created_at)` for project listing.

#### pipeline_states
Replaces `state.json`. One row per project.

| Column | Type | Notes |
|--------|------|-------|
| `project_id` | `String` PK, FK→projects | |
| `phase` | `String` | intake/research/brief/gate1/outline/gate2/write/review/done |
| `brief_locked` | `Boolean` | Gate 1 approved |
| `outline_locked` | `Boolean` | Gate 2 approved |
| `revision_count_gate1` | `Integer` | |
| `revision_count_gate2` | `Integer` | |
| `max_revisions` | `Integer` default=3 | |
| `screen_outline` | `JSONB` nullable | StoryboardDirector output |
| `storyboard_draft` | `JSONB` nullable | StoryboardWriter output |
| `revision_history` | `JSONB` default=[] | List of revision records |
| `updated_at` | `DateTime` | |

#### screens
Replaces `story_{n}.json`. Supports both legacy and new schema fields.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` FK→projects | |
| `screen_number` | `Integer` | |
| `screen_type` | `String` | stock-video/screencast/talking-head/text-overlay/cta |
| `voiceover_text` | `Text` | |
| `target_duration_sec` | `Float` | word_count / 130 × 60 |
| `on_screen_visual_keywords` | `Text` nullable | Legacy field (string) |
| `visual_direction` | `JSONB` nullable | New field (array) |
| `action_notes` | `Text` nullable | |
| `image_url` | `String` nullable | |
| `created_at` | `DateTime` | |

Composite index on `(project_id, screen_number)`.

#### chat_messages
Replaces `chat_history.json`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String` PK | Frontend-generated ID |
| `project_id` | `String` FK→projects | |
| `role` | `String` | "user" or "assistant" |
| `content` | `Text` | |
| `created_at` | `DateTime` | |

Index on `(project_id, created_at)`.

#### stage_snapshots
Replaces both `stages.json` AND `edit_log.json` — merged into one table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` FK→projects | |
| `stage_id` | `Integer` | 1-4 |
| `stage_name` | `String` | |
| `status` | `String` | pending/active/approved |
| `ai_version` | `Text` nullable | AI-generated content |
| `human_version` | `Text` nullable | Human-edited content |
| `context_pack` | `JSONB` nullable | |
| `sources` | `JSONB` default=[] | |
| `was_edited` | `Boolean` default=False | |
| `characters_added` | `Integer` default=0 | |
| `characters_removed` | `Integer` default=0 | |
| `edit_time_seconds` | `Float` nullable | |
| `regeneration_count` | `Integer` default=0 | |
| `feedback` | `Text` nullable | |
| `approved_at` | `DateTime` nullable | |
| `created_at` | `DateTime` | |
| `updated_at` | `DateTime` | |

Unique index on `(project_id, stage_id)`.

#### uploads
Replaces `uploads/` directory metadata. Files stay local for now, move to S3/R2 later.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` FK→projects | |
| `filename` | `String` | |
| `storage_key` | `String` | S3 key or local path |
| `mime_type` | `String` | |
| `size_bytes` | `Integer` | |
| `extracted_text` | `Text` nullable | PDF/DOCX extraction |
| `uploaded_at` | `DateTime` | |

#### fetched_links
Replaces `links/` directory.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` FK→projects | |
| `url` | `String` | |
| `title` | `String` nullable | |
| `extracted_text` | `Text` nullable | |
| `fetched_at` | `DateTime` | |

#### analytics_events
Replaces `analytics.json`. Append-only event log — never update, only insert.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` indexed | |
| `user_id` | `String` nullable indexed | |
| `event_type` | `String` | stage_enter/stage_exit/field_edit/regeneration/go_back/registration |
| `payload` | `JSONB` default={} | Event-specific data |
| `created_at` | `DateTime` | |

Indexes on `(project_id, event_type)` and `(created_at)`.

#### satisfaction_ratings
One rating per project.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `Integer` PK auto | |
| `project_id` | `String` FK→projects unique | |
| `user_id` | `String` nullable | |
| `rating` | `Integer` | 1-5 |
| `feedback` | `Text` nullable | |
| `submitted_at` | `DateTime` | |

### Connection Module (`backend/app/db.py`)

```python
import os
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from app.models.database import Base

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/plotline",
)

# Fly.io gives "postgres://" but asyncpg requires "postgresql+asyncpg://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

engine = create_async_engine(
    DATABASE_URL,
    echo=os.getenv("SQL_ECHO", "false").lower() == "true",
    pool_size=5,
    max_overflow=10,
)

async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False,
)

async def get_db():
    """FastAPI dependency: db: AsyncSession = Depends(get_db)"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise

async def init_db():
    """Dev only — use Alembic in production."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
```

### Endpoint Rewrite Order

Do these in order — each one removes a chunk of file I/O from `main.py`:

1. `create_project` + `get_project` + `list_projects` + `delete_project` — core CRUD, biggest win
2. `StateManager` in `state.py` — rewrite `load()`/`save()` to query/update `pipeline_states`
3. `save_stories_to_project` — bulk insert `Screen` rows
4. `save_stages` / `load_stages` — upsert `StageSnapshot` rows (absorbs edit_tracker)
5. `save_chat_messages` / `get_chat_history` — insert/query `ChatMessage` rows
6. Analytics endpoints — insert `AnalyticsEvent` rows, SQL aggregation for dashboard
7. Upload + fetch-link — metadata in DB, files stay local for now

### What This Unlocks

| Before (JSON) | After (Postgres) |
|---|---|
| List user's projects = scan every directory | `SELECT * FROM projects WHERE user_id = ?` |
| Aggregate analytics = load 100+ JSON files | `GROUP BY event_type` |
| "How many users edited stage 2?" = impossible | `SELECT COUNT(*) FROM stage_snapshots WHERE was_edited` |
| Concurrent writes = race condition | Transaction isolation |
| Redeploy on Fly.io = lose all data | Postgres persists independently |
| Schema change = rewrite every file | `alembic upgrade head` |

---

## Remaining Tasks

| # | Task | Depends On |
|---|------|-----------|
| 101 | Run cleanup script above | — |
| 102 | Unify screen schema (one canonical Pydantic model) | — |
| 103 | DB setup (Postgres + SQLAlchemy + Alembic, create tables) | 102 |
| 104 | Map existing JSON → DB, verify, delete | 103 |
| 105 | Rewrite endpoints to use DB | 103 |
| 106 | Object storage for uploads (low priority) | 105 |

---

## Target Structure

```
storyboard-hackathon/
├── CLAUDE.md
├── PRD.md
├── README.md
├── PROGRESS.md
├── docs/future_roadmap/
├── prompts/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── db.py                # async DB connection
│   │   ├── models/
│   │   │   ├── database.py      # SQLAlchemy ORM (9 tables)
│   │   │   └── screen.py        # canonical screen schema
│   │   ├── services/
│   │   │   ├── agents/
│   │   │   ├── orchestrator.py
│   │   │   ├── chatbot.py       # direct OpenAI
│   │   │   ├── state.py
│   │   │   ├── analytics.py
│   │   │   └── edit_tracker.py
│   │   ├── utils/
│   │   └── test/
│   ├── scripts/migrate_json_to_db.py
│   ├── alembic/
│   └── requirements.txt
├── frontend/
├── data/example/                # test fixture only
├── fly.backend.toml
└── fly.frontend.toml
```
