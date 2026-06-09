# Backlog — Storyboard Panel-Level Regeneration with Comments

## Task: Storyboard Panel-Level Regeneration with User Comments

Allow users to regenerate individual storyboard panels (screens) with comments/feedback. Comments should be visible to admin.

### Requirements
- User can select a specific screen/panel in the DraftBuilder (Stage 4) and request regeneration
- User provides comments on what to change (e.g. "make voiceover more conversational", "change visual to animation")
- Only the selected panel is regenerated, not the entire storyboard
- Comments are sent to the Writer agent as context for panel-level regeneration
- All user comments are stored and visible to admin in the admin dashboard
- Comment history persisted per panel — admin can see feedback trail for each screen
- UI: per-panel "Regenerate" button + comment input on DraftBuilder
- Backend: panel-level regeneration endpoint, store comments with project_id, screen_number, timestamp, comment text
- Admin view: show comment thread per panel per project

### Key files
- `frontend/src/components/DraftBuilder/` — storyboard draft panel UI
- `backend/app/services/agents/storyboard_writer.py` — Writer agent that generates screens
- `backend/app/services/orchestrator.py` — pipeline coordination
- `backend/app/main.py` — API endpoints
- `frontend/src/components/admin/` — admin dashboard for viewing comments
