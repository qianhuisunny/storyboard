# Backlog — Admin Version Diff View

## Task: Admin Project-Level Version Comparison (v1, v2, v3, v4)

Admin can view each user's project and compare all versions (v1 → v2 → v3 → v4) of outline and storyboard, seeing what changed between each regeneration.

### Requirements
- Admin dashboard shows per-project version history for each stage (outline, storyboard)
- Each regeneration creates a new version (v1 = first AI output, v2 = after first regen, etc.)
- Admin can select any two versions and see a side-by-side or inline diff
- Diff should highlight: added/removed/changed text in voiceover, visual direction changes, structural changes (sections added/removed/reordered)
- Show which user comments triggered each regeneration (links to regen comment history)
- Version metadata: timestamp, which model generated it, what comments were provided
- Backend: store each regeneration output as a numbered version (not just ai_version / human_version — need full version history)
- This extends the current DB schema (stage_snapshots table) — need a versions array or separate version table

### Backend needs
- New table or field: `stage_versions` — project_id, stage_id, version_number, content (JSON), created_at, trigger_comments
- API endpoint: `GET /api/admin/project/{id}/versions?stage=outline` → list all versions
- API endpoint: `GET /api/admin/project/{id}/versions/diff?stage=outline&v1=1&v2=3` → diff between two versions

### Frontend needs
- Admin project detail page with version timeline per stage
- Version selector (dropdown or timeline scrubber) to pick v1..vN
- Diff view: side-by-side or inline diff of two selected versions
- Show associated user comments per version

### Key files
- `frontend/src/components/admin/` — admin dashboard
- `backend/app/db/models.py` — DB schema (extend or add versions table)
- `backend/app/db/repository.py` — version CRUD methods
- `backend/app/main.py` — admin API endpoints
