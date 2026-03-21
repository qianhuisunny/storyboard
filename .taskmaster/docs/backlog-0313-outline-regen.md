# Backlog — Outline Regeneration with Comments

## Task: Outline Regeneration with User Comments

Allow users to request outline regeneration with comments/feedback. Comments should be visible to admin.

### Requirements
- User can add comments/feedback when requesting an outline regeneration (e.g. "make section 3 shorter", "add a hook about X")
- Comments are sent to the Director agent as context for regeneration
- All user comments are stored and visible to admin in the admin dashboard / eval view
- Comment history persisted (not lost on regeneration) — admin can see what feedback led to each version
- UI: comment input area on the Outline stage (Stage 2) with a "Regenerate with feedback" button
- Backend: store comments with project_id, stage, timestamp, comment text
- Admin view: show comment thread per project — which comments were given, which version they produced

### Key files
- `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` — outline editing UI
- `backend/app/services/agents/storyboard_director.py` — Director agent that generates outlines
- `backend/app/services/orchestrator.py` — pipeline handles regeneration events
- `backend/app/services/state.py` — state transitions for regeneration
- `frontend/src/components/admin/` — admin dashboard for viewing comments
- `backend/app/main.py` — API endpoints for submitting comments
