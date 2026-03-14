# SQLite Migration — Design Spec

## Goal

Replace JSON file I/O with SQLite for persistent, queryable storage. Enable Fly.io deployment with Fly Volumes. Delete dead chat code. Track AI vs human versions of each stage's output. Add a drawer UI for comparing AI original vs user edits.

## Context

Current state: all project data lives in `data/project_{id}/` as flat JSON files. This works locally but breaks on Fly.io (ephemeral filesystem). Chat code exists in frontend and backend but is dead — no UI entry point, no active usage.

## Scope

**In scope:**
- 4-table SQLite schema (projects, pipeline_states, stage_snapshots, uploads)
- Async SQLite via aiosqlite + SQLAlchemy 2.0 async
- Alembic for migrations
- Delete all chat code (frontend components, backend endpoints, chatbot service)
- Fly Volume configuration for `.db` file + uploaded files
- "AI Original" drawer UI on Outline and Storyboard stages (Option B from design brainstorm)

**Out of scope:**
- PostgreSQL (SQLite is sufficient for single-instance deployment)
- Real-time collaboration / multi-writer concurrency
- User authentication tables (Clerk handles this externally)
- Per-screen storage (storyboard stored as JSON blob in stage_snapshots)

---

## Schema

### Table 1: `projects`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | TEXT | PK | UUID, generated at creation |
| user_id | TEXT | NOT NULL | Clerk user ID |
| title | TEXT | NOT NULL | Project title from intake form |
| created_at | DATETIME | NOT NULL | UTC |
| updated_at | DATETIME | NOT NULL | UTC, auto-updated |

### Table 2: `pipeline_states`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | TEXT | FK → projects.id, UNIQUE | One active state per project |
| phase | TEXT | NOT NULL | Current pipeline phase (e.g., "brief", "outline", "writing") |
| status | TEXT | NOT NULL | Phase status (e.g., "pending", "running", "complete") |
| state_data | TEXT | | JSON blob — full pipeline context (research_context, brief, outline, evidence, etc.) |
| created_at | DATETIME | NOT NULL | UTC |
| updated_at | DATETIME | NOT NULL | UTC |

`state_data` stores the entire pipeline state as a JSON string. This avoids needing to model every intermediate agent output as separate columns. The backend reads/writes specific keys within the blob as needed.

### Table 3: `stage_snapshots`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | TEXT | FK → projects.id | |
| stage_id | INTEGER | NOT NULL | 1=Briefing, 2=Outline, 3=Evidence, 4=Storyboard, 5=Review |
| ai_version | TEXT | | AI-generated output (JSON string). Written once, never overwritten. |
| human_version | TEXT | | User-edited version (JSON string). Updated on each save. |
| created_at | DATETIME | NOT NULL | UTC |
| updated_at | DATETIME | NOT NULL | UTC |

**Unique constraint:** (project_id, stage_id) — one snapshot per stage per project.

**Version tracking:** When AI generates output for a stage, it writes to `ai_version`. When the user edits, it writes to `human_version`. To see what the user changed: diff `ai_version` vs `human_version`. If `human_version` is NULL, the user hasn't edited yet.

### Table 4: `uploads`

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | INTEGER | PK AUTOINCREMENT | |
| project_id | TEXT | FK → projects.id | |
| filename | TEXT | NOT NULL | Original filename |
| file_path | TEXT | NOT NULL | Path on disk (relative to upload root) |
| content_type | TEXT | | MIME type |
| size_bytes | INTEGER | | File size |
| created_at | DATETIME | NOT NULL | UTC |

Files stored on filesystem (Fly Volume), metadata in DB.

---

## Architecture

### Database Layer

```
backend/app/
  db/
    engine.py          # async engine + session factory
    models.py          # SQLAlchemy ORM models (4 tables)
    repository.py      # Data access methods (CRUD)
  alembic/
    env.py
    versions/          # Migration scripts
  alembic.ini
```

**engine.py:** Creates `async_engine` via `aiosqlite`, provides `async_sessionmaker`. DB path configurable via env var `DATABASE_URL` (default: `data/plotline.db`).

**repository.py:** Single class `ProjectRepository` with async methods:
- `create_project(user_id, title) → Project`
- `get_project(project_id) → Project`
- `list_projects(user_id) → list[Project]`
- `get_pipeline_state(project_id) → PipelineState`
- `update_pipeline_state(project_id, phase, status, state_data)`
- `save_stage_snapshot(project_id, stage_id, ai_version?, human_version?)`
- `get_stage_snapshot(project_id, stage_id) → StageSnapshot`
- `get_all_snapshots(project_id) → list[StageSnapshot]`
- `create_upload(project_id, filename, file_path, content_type, size_bytes)`
- `list_uploads(project_id) → list[Upload]`

### Migration Path

Existing JSON projects in `data/` are not migrated automatically. New projects use SQLite from day one. Old JSON projects remain readable via a legacy fallback (or are simply abandoned — user confirms acceptable).

### Fly.io Volume

```toml
# fly.backend.toml
[mounts]
  source = "plotline_data"
  destination = "/data"
```

DB file at `/data/plotline.db`. Uploads at `/data/uploads/`. Single volume, single instance.

---

## Chat Deletion Scope

### Backend — delete:
- `backend/app/services/chatbot.py` — entire file
- Chat endpoints in `backend/app/main.py`:
  - `POST /api/chat`
  - `POST /api/chat/save`
  - `GET /api/chat/history/{id}`
- Any imports/references to chatbot in main.py

### Frontend — delete:
- Chat-related components (search for chat/Chat imports and components)
- Chat-related API calls
- Chat state management in any context/store

---

## API Changes

Existing endpoints stay the same (same paths, same request/response shapes). The only change is the storage layer behind them:
- `POST /api/create-project` → writes to `projects` + `pipeline_states` tables
- `GET /api/project/{id}` → reads from DB instead of JSON files
- `POST /api/project/{id}/stages` → writes to `stage_snapshots` (ai_version or human_version)
- `GET /api/project/{id}/stages` → reads from `stage_snapshots`
- `GET /api/project/{id}/pipeline-state` → reads from `pipeline_states`
- `POST /api/project/{id}/event` → updates `pipeline_states`

Frontend sees no API contract changes.

---

## Version Compare UI — Option B (Drawer)

### Behavior

Each stage that has both `ai_version` and `human_version` shows a "View AI Original" button in the stage header. Clicking it slides open a read-only panel on the right showing the AI-generated content alongside the user's editable version.

### Where it appears

- **Stage 2 (Outline)** — drawer shows AI-generated outline sections (purpose, talking points, evidence needed)
- **Stage 4 (Storyboard Draft)** — drawer shows AI-generated screens (voiceover, visual direction, screen type)
- Stages 1, 3, 5 — no drawer (Stage 1 is user input, Stage 3 is research output, Stage 5 is review)

### Data flow

```
GET /api/project/{id}/stages → returns { stages: [{ stage_id, ai_version, human_version }] }
```

Frontend checks: if `ai_version` is non-null AND `human_version` is non-null (user has edited), show the drawer trigger button. If `human_version` is null (user hasn't edited yet), no button needed — what they see IS the AI version.

### UI spec

- **Trigger**: Button in stage header, right-aligned: `"View AI Original"` with split-panel icon
- **Drawer**: Slides in from right, ~400px wide, `border-left`, light surface background
- **Drawer header**: "AI Original" label + "Read-only" badge + close button
- **Drawer content**: Same section/screen rendering components as main view, but non-editable (no contentEditable, no drag handles)
- **State**: Single boolean `isDrawerOpen`, local to the stage component
- **Animation**: CSS transition on width (0 → 400px), same as preview

### Implementation

- New shared component: `AiOriginalDrawer` — receives `aiContent: string` (JSON), `isOpen: boolean`, `onClose: () => void`
- Renders content using existing read-only section/screen components
- Added to `OutlineBuilder` and `DraftBuilder` wrappers
- Drawer trigger button only rendered when both `ai_version` and `human_version` exist

---

## Dependencies

New Python packages:
- `sqlalchemy[asyncio]>=2.0`
- `aiosqlite`
- `alembic`

---

## Verification

1. Backend starts without errors: `curl localhost:8001/health`
2. Create new project → data appears in SQLite (not JSON files)
3. Full pipeline run (brief → outline → evidence → storyboard) → all stages saved with ai_version
4. Edit a stage → human_version populated, ai_version unchanged
5. Reload project from "My Projects" → all data loads correctly
6. Chat endpoints return 404 or are gone
7. `npm run build` passes (no broken chat imports)
8. On Outline stage: edit a section title → "View AI Original" button appears → click → drawer shows original AI title
9. On Storyboard stage: same behavior with screen-level content
