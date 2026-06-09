# Backlog — 2026-03-13

## Task 1: Add Example Storyboards to Create Page

On the OnboardingPage ("Create Your Storyboard"), show example storyboards from the gold set so new users can see what a finished storyboard looks like before they start.

### Requirements
- Display 2-3 example storyboards (from gold sets: feynman_technique, video2, video3) as browsable previews
- Gold set data lives in `data/gold_sets/*/gold_standard.json` — each has brief, outline, and storyboard sections
- Examples should be read-only, showing the final storyboard output (screens with voiceover, visual direction, screen type)
- Located on or accessible from the OnboardingPage (`frontend/src/components/OnboardingPage.tsx`)
- Design should inspire confidence — "this is what you'll get"
- Do NOT modify gold set data files; read them as-is

### Key files
- `frontend/src/components/OnboardingPage.tsx` — the create page
- `data/gold_sets/feynman_technique/gold_standard.json` — 303s educational video, 6 screens
- `data/gold_sets/video2/gold_standard.json` — 714s interview tips, 45 screens
- `data/gold_sets/video3/gold_standard.json` — 353s interview secrets, 28 screens
- Backend endpoint needed to serve gold set storyboard data to frontend

---

## Task 2: Refactor Pipeline State Machine

The current state machine (`backend/app/services/state.py`) has issues when navigating backwards — going from a later stage back to an earlier stage causes errors or inconsistent state.

### Requirements
- Audit the current state machine transitions in `state.py` and identify all backward-navigation bugs
- Fix state transitions so users can go back to any previous stage without breaking
- Ensure frontend stage navigation (`StageNavigation.tsx`, `StageContent.tsx`) correctly reflects backend state after backward navigation
- Backward navigation should preserve existing work (don't clear completed stage data)
- Test: complete Stage 1 → Stage 2 → go back to Stage 1 → edit → re-approve → Stage 2 should still work

### Key files
- `backend/app/services/state.py` — state machine definitions and transitions
- `backend/app/services/orchestrator.py` — pipeline coordinator
- `frontend/src/components/StageNavigation.tsx` — sidebar stage nav
- `frontend/src/components/StageContent.tsx` — stage content routing
- `backend/app/main.py` — `/api/project/{id}/event` endpoint handles state transitions
