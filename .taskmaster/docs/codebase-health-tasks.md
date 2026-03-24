# Codebase Health Tasks — Post-Assessment (2026-03-23)

These tasks were identified during a full codebase assessment. They are technical debt and quality improvements, not feature work. Priority ordering reflects risk to production stability.

---

## Task 1: Fix data ownership split-brain between backend and frontend

**Priority: high**

The backend stores the AI-generated outline in `state.screen_outline`. The frontend holds the user's edited version in stage_snapshots (via auto-save). After user edits, backend event handlers (e.g., evidence research, outline regeneration) read the stale backend copy instead of the user's current version.

This bug has occurred twice already (documented in PROGRESS.md). The root cause is unresolved: two copies of the same data exist with no single source of truth.

**Fix approach**: When any backend event handler needs to read user-editable content (outline, brief fields), it must first check stage_snapshots for a human_version. If one exists, use it instead of the pipeline state copy. Add a utility function `get_current_content(project_id, stage_id)` that implements this resolution logic.

**Files**: `backend/app/services/orchestrator.py`, `backend/app/services/state.py`

---

## Task 2: Remove dead code from orchestrator and agents

**Priority: medium**

Disabled event handlers and archived agent references still exist in the codebase:
- `select_perspective`, `confirm_talking_points` event handlers in orchestrator.py (disabled but not deleted)
- `topic_researcher.py` is archived but may still have import references
- `run_stage()` legacy method in orchestrator for backward compatibility
- Old state transitions for removed events still in state.py

**Fix**: Delete all dead handlers, remove stale state transitions, grep for orphaned imports. Verify backend starts and all active flows still work after cleanup.

**Files**: `backend/app/services/orchestrator.py`, `backend/app/services/state.py`, `backend/app/services/agents/__init__.py`

---

## Task 3: Replace broad exception handling in main.py with specific exceptions

**Priority: medium**

15+ instances of `except Exception as e:` in main.py. These catch everything including programming errors (AttributeError, KeyError) that should crash loudly during development. Replace with specific exception types (ValueError, HTTPException, json.JSONDecodeError, etc.) and let unexpected errors propagate.

**Files**: `backend/app/main.py`

---

## Task 4: Add agent-level regression tests

**Priority: medium**

Currently only eval/integration tests exist. No unit tests verify that agent output structures are parseable by downstream consumers. When a prompt version changes, there's no way to quickly verify the Director's output still parses correctly for the EvidenceResearcher, or that the Writer's output matches the expected screen schema.

**Fix**: Add pytest fixtures using gold set data. For each agent, test: (1) output structure matches expected schema, (2) required fields are present, (3) downstream consumer can parse the output. Use saved LLM responses from gold sets as fixtures (no live LLM calls in tests).

**Files**: `backend/app/test/`

---

## Task 5: Content spine — add POV quality validation

**Priority: low**

The content spine generation prompt asks for "the central claim this video will build and defend" but accepts any text, including vague intentions like "Enlighten the beginners." A weak POV cascades into a weak outline because there's no arguable thesis to build around.

**Fix**: Add a lightweight LLM validation step (or heuristic) before generating the spine. Check: (1) Is the POV a specific, arguable claim? (2) Could someone reasonably disagree with it? If not, return guidance to the user on how to sharpen it, with examples. This should be a soft gate (warning + suggestion), not a hard block.

**Files**: `backend/app/services/agents/brief_builder.py`, `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx`

---

## Task 6: Content spine — deduplicate misconception vs talking points

**Priority: low**

The spine generation can produce a misconception field that is nearly identical to one of the talking points (observed in project 1774203470824: both the misconception and talking point #3 said the same thing about lineage). The quality check in the prompt says "functionally distinct" but the LLM doesn't always enforce it.

**Fix**: Add a post-generation deduplication check. After LLM returns the spine fields, do a second LLM call (or semantic similarity check) to verify misconception doesn't overlap with any talking point. If overlap detected, regenerate the misconception with an explicit "must differ from talking points" constraint.

**Files**: `backend/app/services/agents/brief_builder.py`

---

## Task 7: Reduce frontend StageLayout state complexity

**Priority: low**

StageLayout.tsx manages 10+ useState hooks for parallel concerns (save status, loading, anchors, scroll position, etc.). This makes the component hard to reason about and prone to stale state bugs.

**Fix**: Extract related state into custom hooks: `useSaveStatus()`, `useScrollAnchors()`, `useStageData()`. Or use useReducer to consolidate related state transitions. Reduce prop drilling by introducing a StageContext.

**Files**: `frontend/src/components/StageLayout.tsx` and consumers
