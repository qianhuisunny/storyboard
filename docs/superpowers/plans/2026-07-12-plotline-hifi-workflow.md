# Plotline HiFi Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plotline's legacy multi-gate pipeline with the approved Create → Smart Intake → Outline → Storyboard → Complete workflow while preserving editable artifacts, safe regeneration, backward compatibility, and the approved HiFi visual direction.

**Architecture:** Keep SQLite as the source of truth. Add immutable artifact versions for intake, outline, and storyboard, then store only workflow pointers, job state, and staleness flags in `pipeline_states.state_data`. A new workflow service owns optimistic concurrency, save-and-approve transitions, generation job promotion, and legacy-state hydration; the existing agents remain the generation boundary but consume the approved intake contract directly. The frontend reads one workflow response, saves with `expected_version_id`, and treats generation as a job overlay rather than a business stage.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async/aiosqlite, pytest, React 19, TypeScript, Vite, Playwright, Tailwind CSS, Radix UI.

---

## Locked product contract

- Business stages are exactly `intake`, `outline`, `storyboard`, and `complete`.
- Job state is an overlay: `idle`, `running`, or `failed`, with `job_id`, `kind`, and `input_version_id`.
- Intake, outline, and storyboard are immutable artifact-version streams with `current_version_id`, `approved_version_id`, and `based_on_version_id`.
- Saving or viewing history never changes the business stage.
- Save + Approve is one atomic workflow action guarded by `expected_version_id`.
- Editing upstream retains downstream content and marks it `needs_update`; it never cascade-deletes it.
- A generation result is promoted only when its job and input version are still current. Late results remain in history.
- Duplicate generation is rejected while a matching job is running.
- A failed generation keeps the last valid artifact current.
- Users may explicitly keep an existing storyboard after an outline change; this creates a new override version bound to the newly approved outline.
- `point_of_view`, `intent_route`, `content_mode`, `primary_pattern`, and `secondary_patterns` are not part of the new generation contract. Legacy data may still be read for old projects, but it is not requested or sent to new prompts.
- Director consumes approved intake + source snapshot and returns the existing editable plain-text outline contract.
- Writer consumes approved outline + intake + source snapshot + production formats. When a storyboard already exists, it updates that storyboard instead of starting over.
- Quality review is deterministic validation plus one holistic LLM review and at most one generation retry. A second subjective miss is advisory and does not block the user.

## File map

- `backend/app/db/models.py`: immutable `ArtifactVersion` persistence.
- `backend/app/db/repository.py`: transaction-aware artifact and workflow persistence helpers.
- `backend/app/services/state.py`: four-stage workflow state, allowed events, and legacy hydration.
- `backend/app/services/workflow.py`: concurrency, save/approve, jobs, promotion, staleness, and overrides.
- `backend/app/main.py`: workflow API contract and compatibility responses.
- `backend/app/services/agents/storyboard_director.py`: approved-intake Director input.
- `backend/app/services/agents/storyboard_writer.py`: approved-intake Writer input and update mode.
- `backend/app/services/quality_gate.py`: deterministic + holistic review.
- `prompts/*_v0712.md`: active prompt versions; superseded prompts move to `prompts/archive/`.
- `frontend/src/lib/workflow.ts`: typed API and version-conflict handling.
- `frontend/src/components/OnboardingPage.tsx`: HiFi Create composer and durable intake creation.
- `frontend/src/components/SmartIntakeBuilder.tsx`: missing-information intake editor.
- `frontend/src/components/StageLayout.tsx`: workflow hydration, history-safe stage navigation, and job overlay.
- `frontend/src/components/StageContent.tsx`: save, approve, revise, keep-as-is, and complete actions.
- `frontend/src/components/StageNavigation.tsx`: four-stage workflow labels/statuses.
- `frontend/src/index.css` and `frontend/src/main.tsx`: font/theme scoping without unrelated-page regressions.
- `backend/app/test/test_workflow_*.py`: backend behavior tests.
- `frontend/tests/plotline-workflow.spec.ts`: browser-visible critical-path and conflict/error tests.
- `design-qa.md`: source-vs-build visual QA evidence and final `passed` result.

---

### Task 1: Immutable artifacts and four-stage state contract

**Files:**
- Modify: `backend/app/db/models.py`
- Modify: `backend/app/db/repository.py`
- Modify: `backend/app/services/state.py`
- Create: `backend/app/test/test_workflow_state.py`
- Create: `backend/app/test/test_artifact_versions.py`

- [ ] **Step 1: Write failing model and state tests**

Cover immutable version insertion/order, current/approved/based-on pointers, exact four-stage allowed-event sets, legacy phase hydration, and upstream staleness without deletion. Use a temporary SQLite database and real repository calls.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_workflow_state.py app/test/test_artifact_versions.py -v`

Expected: failures because `ArtifactVersion`, workflow pointers, and the four-stage contract do not exist.

- [ ] **Step 3: Add the minimal persistence contract**

Add an `artifact_versions` table with UUID `id`, `project_id`, `artifact_type`, monotonically increasing `version_number`, JSON `content`, nullable `based_on_version_id`, `created_by`, `is_override`, and timestamp. Add relationship/cascade behavior without changing existing tables or deleting legacy rows.

Use this state shape (Pydantic models, not untyped dictionaries):

```python
class ArtifactPointers(BaseModel):
    current_version_id: str | None = None
    approved_version_id: str | None = None
    needs_update: bool = False

class JobOverlay(BaseModel):
    status: Literal["idle", "running", "failed"] = "idle"
    job_id: str | None = None
    kind: Literal["outline", "storyboard"] | None = None
    input_version_id: str | None = None
    error: str | None = None

class StoryboardState(BaseModel):
    workflow_stage: Literal["intake", "outline", "storyboard", "complete"] = "intake"
    artifacts: dict[str, ArtifactPointers] = Field(default_factory=default_artifact_pointers)
    job: JobOverlay = Field(default_factory=JobOverlay)
    # retain legacy content fields for read compatibility
```

Expose `allowed_events(state)` from `StateManager`; do not duplicate event maps in API code.

- [ ] **Step 4: Run focused and existing state tests and verify GREEN**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_workflow_state.py app/test/test_artifact_versions.py app/test/test_orchestrator_transitions.py app/test/test_project_history_regressions.py -v`

Expected: all pass; legacy rows load into the closest new stage without losing their legacy payloads.

- [ ] **Step 5: Commit only Task 1 files**

```bash
git add backend/app/db/models.py backend/app/db/repository.py backend/app/services/state.py backend/app/test/test_workflow_state.py backend/app/test/test_artifact_versions.py
git commit -m "feat(workflow): add immutable artifact versions"
```

### Task 2: Concurrency-safe workflow service and API

**Files:**
- Create: `backend/app/services/workflow.py`
- Modify: `backend/app/main.py`
- Create: `backend/app/test/test_workflow_service.py`
- Create: `backend/app/test/test_workflow_api.py`

- [ ] **Step 1: Write failing service/API tests**

Cover: create initial intake; save without stage change; atomic save-and-approve; stale `expected_version_id` returns HTTP 409 and current version metadata; duplicate running job returns 409; generation failure preserves last current artifact; late result is stored but not promoted; upstream save marks downstream `needs_update`; keep-storyboard creates an override version bound to the new outline; API returns the service's `allowed_events`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_workflow_service.py app/test/test_workflow_api.py -v`

Expected: import/route failures because the workflow service and endpoint contract do not exist.

- [ ] **Step 3: Implement the workflow service**

Create explicit exceptions `VersionConflictError`, `DuplicateJobError`, and `InvalidWorkflowEvent`. Persist the running job before the LLM call. On completion, reload state and compare both `job_id` and the artifact's approved `input_version_id` before promotion. Always store a valid late result as history. On error, set the job to `failed` and retain existing artifact pointers.

Add these request forms to the existing event endpoint (legacy events remain normalized for old projects):

```json
{"event":"save_intake","payload":{"content":{},"expected_version_id":"..."}}
{"event":"approve_intake","payload":{"content":{},"expected_version_id":"..."}}
{"event":"save_outline","payload":{"content":"...","expected_version_id":"..."}}
{"event":"revise_outline","payload":{"instruction":"...","expected_version_id":"..."}}
{"event":"approve_outline","payload":{"content":"...","expected_version_id":"..."}}
{"event":"save_storyboard","payload":{"content":[],"expected_version_id":"..."}}
{"event":"revise_storyboard","payload":{"instruction":"...","expected_version_id":"..."}}
{"event":"keep_storyboard","payload":{"expected_version_id":"..."}}
{"event":"approve_storyboard","payload":{"content":[],"expected_version_id":"..."}}
```

Return one canonical response with `workflow_stage`, `allowed_events`, `job`, `artifacts` (pointers plus current/approved content), and `needs_update`. Keep `phase` and existing `data.story_brief/screen_outline/storyboard` aliases during migration.

- [ ] **Step 4: Verify focused and full backend tests GREEN**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_workflow_service.py app/test/test_workflow_api.py -v && pytest app/test/ -v`

- [ ] **Step 5: Commit only Task 2 files**

```bash
git add backend/app/services/workflow.py backend/app/main.py backend/app/test/test_workflow_service.py backend/app/test/test_workflow_api.py
git commit -m "feat(workflow): add safe generation transitions"
```

### Task 3: Simplify Director, Writer, and Quality Gate contracts

**Files:**
- Modify: `backend/app/services/agents/storyboard_director.py`
- Modify: `backend/app/services/agents/storyboard_writer.py`
- Modify: `backend/app/services/quality_gate.py`
- Create: `prompts/storyboard_director_prompt_v0712.md`
- Create: `prompts/storyboard_writer_prompt_v0712.md`
- Create: `prompts/OUTLINE_EVAL_PROMPT_v0712.md`
- Create: `prompts/STORYBOARD_EVAL_PROMPT_v0712.md`
- Move: superseded active prompt files to `prompts/archive/`
- Modify: `backend/app/test/test_storyboard_writer.py`
- Modify: `backend/app/test/test_quality_gate.py`
- Create: `backend/app/test/test_storyboard_director.py`

- [ ] **Step 1: Write failing prompt-contract tests**

Assert that Director user context includes prompt/topic, target audience when known, viewer outcome, duration, platform, aspect ratio, source snapshot, tone, audience level, and production formats; and excludes `point_of_view`, `intent_route`, `content_mode`, `primary_pattern`, and `secondary_patterns`. Assert Writer receives approved outline and the same intake/source contract, plus an existing storyboard in update mode. Assert holistic review makes one review call per attempt, retries generation at most once, applies deterministic schema checks, and never blocks solely on a second subjective miss.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_storyboard_director.py app/test/test_storyboard_writer.py app/test/test_quality_gate.py -v`

- [ ] **Step 3: Replace obsolete prompt and code paths**

Delete the legacy taxonomy/pattern/point-of-view prompt sections before adding the new contract. Keep the Director plain-text outline format and Writer screen schema stable. The Writer should include `EXISTING STORYBOARD` only when one exists and instruct preservation of unaffected screens. Keep deterministic duration calculation in code.

Replace the six parallel dimension calls with one holistic JSON review:

```json
{"score": 0, "passed": false, "feedback": "...", "strengths": [], "issues": []}
```

Run deterministic validation first. If generation is structurally invalid, retry once. If review score is below threshold, retry once with feedback. After the second structurally valid result, return it with advisory review metadata even when the subjective score is still low.

- [ ] **Step 4: Run focused and full backend tests GREEN**

Run: `cd backend && source venv/bin/activate && pytest app/test/test_storyboard_director.py app/test/test_storyboard_writer.py app/test/test_quality_gate.py -v && pytest app/test/ -v`

- [ ] **Step 5: Verify every active prompt reference exists and commit**

Run: `cd backend && source venv/bin/activate && python - <<'PY'
from pathlib import Path
import re
root = Path('..')
for agent in (root / 'backend/app/services/agents').glob('*.py'):
    for name in re.findall(r'prompt_file\s*=\s*["\']([^"\']+)', agent.read_text()):
        assert (root / 'prompts' / name).exists(), (agent, name)
print('all prompt references exist')
PY`

```bash
git add backend/app/services/agents/storyboard_director.py backend/app/services/agents/storyboard_writer.py backend/app/services/quality_gate.py backend/app/test prompts
git commit -m "refactor(agents): simplify storyboard generation contract"
```

### Task 4: Finish the HiFi Create experience with durable intake

**Files:**
- Modify: `frontend/src/components/OnboardingPage.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/src/index.css`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `backend/app/main.py`
- Create: `frontend/tests/create-project.spec.ts`

- [ ] **Step 1: Write failing browser/API tests**

Test keyboard-accessible prompt, Platform, Sources, Duration, and Aspect Ratio controls; exact selected values; inline URL validation; partial source failure with retry/continue behavior; no hidden intent taxonomy; and refresh-safe persistence of prompt, duration, platform, aspect ratio, and source metadata in SQLite-backed intake. Include a test proving a vague prompt is not labeled or persisted as Planner/Lifestyle.

- [ ] **Step 2: Run the Create test and verify RED**

Run: `cd frontend && npm test -- tests/create-project.spec.ts --project=chromium`

Expected: failure on the current unused import/build, inaccessible popovers, hidden taxonomy, and missing durable intake fields.

- [ ] **Step 3: Complete the Create composer**

Preserve the measured standalone reference: centered ~680px composer, Source Serif heading, DM Sans controls, warm neutral page, subtle green focus/CTA, and responsive chip popovers. Use Radix Popover/Dropdown primitives already installed for focus, Escape, and outside-click behavior. Use Lucide icons from the established codebase; remove the CSS-drawn aspect icons.

Scope new typography/colors to the Create workflow shell unless a shared component is explicitly migrated in the same task. Remove hidden route/content-mode inference and session keys. Create the initial intake artifact through the API; sessionStorage may be a short-lived navigation cache only, never the source of truth. Use per-source settled results and expose retry/continue so a failed source cannot silently abandon a created project.

- [ ] **Step 4: Verify tests, build, lint, and commit**

Run: `cd frontend && npm test -- tests/create-project.spec.ts --project=chromium && npm run build && npm run lint`

```bash
git add frontend/src/components/OnboardingPage.tsx frontend/src/main.tsx frontend/src/index.css frontend/package.json frontend/package-lock.json frontend/tests/create-project.spec.ts backend/app/main.py
git commit -m "feat(create): implement durable hifi project setup"
```

### Task 5: Replace legacy brief chat with Smart Intake

**Files:**
- Create: `frontend/src/components/SmartIntakeBuilder.tsx`
- Create: `frontend/src/lib/workflow.ts`
- Modify: `frontend/src/components/StageContent.tsx`
- Modify: `frontend/src/components/StageLayout.tsx`
- Modify: `frontend/src/components/StageNavigation.tsx`
- Create: `frontend/tests/smart-intake.spec.ts`

- [ ] **Step 1: Write failing Smart Intake tests**

Test that already-known Create fields render as an editable summary and are not re-asked. Only missing outline/production inputs appear: viewer outcome, target audience, audience level, delivery tone, and production formats. Empty audience stays empty instead of becoming `General audience`. Save persists without moving; Approve sends current edited values with `expected_version_id`, shows the outline job overlay, and lands on editable Outline. Refresh restores the same values/version.

- [ ] **Step 2: Run the Smart Intake test and verify RED**

Run: `cd frontend && npm test -- tests/smart-intake.spec.ts --project=chromium`

- [ ] **Step 3: Implement the typed workflow client and Smart Intake UI**

Centralize workflow response types and `409` parsing in `frontend/src/lib/workflow.ts`. Replace the active `ChatBriefBuilder`/split-brief entry path with `SmartIntakeBuilder` for new workflow projects; keep legacy components available only for legacy project hydration. Use the HiFi's tap-to-answer card language, but render only unanswered questions. Provide explicit Save and Save & Generate Outline actions.

- [ ] **Step 4: Verify test/build/lint and commit**

Run: `cd frontend && npm test -- tests/smart-intake.spec.ts --project=chromium && npm run build && npm run lint`

```bash
git add frontend/src/components/SmartIntakeBuilder.tsx frontend/src/lib/workflow.ts frontend/src/components/StageContent.tsx frontend/src/components/StageLayout.tsx frontend/src/components/StageNavigation.tsx frontend/tests/smart-intake.spec.ts
git commit -m "feat(intake): add refresh-safe smart intake"
```

### Task 6: Wire editable Outline, Storyboard, history safety, and Complete

**Files:**
- Modify: `frontend/src/components/StageLayout.tsx`
- Modify: `frontend/src/components/StageContent.tsx`
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`
- Modify: `frontend/src/components/DraftBuilder/DraftBuilder.tsx`
- Modify: `frontend/src/components/ReviewBuilder/ReviewBuilder.tsx`
- Create: `frontend/tests/plotline-workflow.spec.ts`

- [ ] **Step 1: Write failing end-to-end workflow tests**

Cover Create → Smart Intake → editable Outline → editable Storyboard → Complete; current user edits are sent for AI revise and approve; an outline edit marks storyboard `needs_update` without deleting it; generation failure retains the last storyboard; stale-tab save displays a version conflict instead of overwriting; duplicate generation is disabled/rejected; a late job cannot replace newer content; keep-as-is clears the visible storyboard staleness through an explicit override; Complete can reopen any upstream artifact.

- [ ] **Step 2: Run the workflow test and verify RED**

Run: `cd frontend && npm test -- tests/plotline-workflow.spec.ts --project=chromium`

- [ ] **Step 3: Use workflow versions as the only active ownership model**

Hydrate current stage and artifact content from the canonical workflow response. Stop deriving new-project state from `stage_snapshots`, frontend-only statuses, or sessionStorage. Autosave current edits with the current version id and surface `409` with Reload/Keep Copy actions. Existing OutlineBuilder, DraftBuilder, and ReviewBuilder remain the editors; adapt their callbacks rather than replacing their schemas.

Render the job overlay independently of stage. Preserve the last valid artifact during running/failed jobs. Show `needs_update` with Regenerate and Keep as-is actions. Completing the storyboard changes only `workflow_stage` to `complete`; reopening changes stage but retains all versions.

- [ ] **Step 4: Verify workflow test/build/lint and commit**

Run: `cd frontend && npm test -- tests/plotline-workflow.spec.ts --project=chromium && npm run build && npm run lint`

```bash
git add frontend/src/components/StageLayout.tsx frontend/src/components/StageContent.tsx frontend/src/components/OutlineBuilder/OutlineBuilder.tsx frontend/src/components/DraftBuilder/DraftBuilder.tsx frontend/src/components/ReviewBuilder/ReviewBuilder.tsx frontend/tests/plotline-workflow.spec.ts
git commit -m "feat(workflow): connect editable artifact stages"
```

### Task 7: Backward compatibility, migration verification, and visual QA

**Files:**
- Modify: relevant backend/frontend regression tests only where the old expected behavior is intentionally superseded
- Create: `design-qa.md`
- Modify: `PROGRESS.md` only for non-obvious lessons discovered during implementation

- [ ] **Step 1: Add failing legacy-hydration and production-schema regressions**

Create fixtures for old `gate1`, `gate2`, `review`, and `done` states and prove they load into intake, outline, storyboard, and complete with their content retained. Prove legacy `on_screen_visual_keywords` and `screen_type: "cta"` inputs still normalize for display. Prove a database with only pre-change tables upgrades via metadata creation without modifying existing rows.

- [ ] **Step 2: Run regressions and verify RED, then implement only missing compatibility**

Run: `cd backend && source venv/bin/activate && pytest app/test/ -v`

- [ ] **Step 3: Run the full verification suite**

Run:

```bash
cd backend && source venv/bin/activate && pytest app/test/ -v
cd ../../frontend && npm run build && npm run lint
git diff --check
```

Start the backend on `8001` and frontend on `3000`, then smoke test `/health`, create-project, save/approve intake, approve outline, save storyboard, and complete.

- [ ] **Step 4: Perform Product Design source-vs-build QA**

Use the in-app browser only. Capture the standalone HiFi source and the implementation at the same viewport/state. Put the two screenshots together in one comparison, fix all visible typography, width, spacing, border, radius, focus, overflow, and responsive mismatches, and repeat until the comparison passes. Exercise every visible core control.

Write `design-qa.md` containing:

```markdown
# Design QA

- Reference: `/Users/qianhuisun/Desktop/Plotline Hifi Redesign (standalone).html`
- Viewports: desktop and narrow mobile
- States checked: Create default, each popover, source error, Smart Intake missing fields, generation, needs-update, Complete
- Functional checks: [results]
- Accessibility checks: keyboard, focus, labels, contrast [results]
- Final result: passed
```

- [ ] **Step 5: Commit verification artifacts**

```bash
git add design-qa.md PROGRESS.md backend/app/test frontend/tests
git commit -m "test(workflow): verify hifi pipeline end to end"
```

### Task 8: Final review and branch finish

- [ ] **Step 1: Dispatch a final specification reviewer over the complete diff**

Require explicit confirmation of every locked product-contract bullet above.

- [ ] **Step 2: Dispatch a final code-quality reviewer**

Review the full `main..HEAD` diff, database migration safety, stale-job promotion, optimistic concurrency, prompt references, error handling, accessibility, and test realism. Fix all Critical and Important findings, then re-review.

- [ ] **Step 3: Re-run all verification commands from Task 7**

- [ ] **Step 4: Use `superpowers:finishing-a-development-branch`**

Present branch completion options without merging or pushing unless the user explicitly chooses one.
