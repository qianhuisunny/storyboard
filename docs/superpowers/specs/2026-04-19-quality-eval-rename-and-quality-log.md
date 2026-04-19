# Quality Eval Rename + Quality Log

> Approved 2026-04-19. Two-phase spec: Phase 1 = rename for naming consistency, Phase 2 = quality_log table.

---

## Motivation

Three problems:
1. **Naming chaos** — runtime quality evaluation uses "judge", "grade", "eval" interchangeably across 15+ files. Dev-time evaluation uses "eval" which collides with runtime.
2. **No quality observability** — LLM prompts, context, responses, and scores are ephemeral. After a pipeline run, there's no way to ask "what did the LLM see when it generated this outline?"
3. **Context is layered, not flat** — quality diagnosis requires understanding what each agent saw: system instructions (shared), project data (per-project), and upstream agent outputs (cumulative per-agent).

---

## Phase 1: Naming Unification

Two naming domains, zero overlap:
- **Runtime** (production pipeline): `quality_eval`
- **Dev-time** (offline gold set comparison): `offline_prompt_bench`

### Runtime renames

| File | Before | After |
|------|--------|-------|
| `quality_gate.py` | `GradeResult` | `QualityEvalResult` |
| | `_call_judge()` | `_call_eval()` |
| | `_async_call_judge()` | `_async_call_eval()` |
| | `_judge_dimension()` | `_eval_dimension()` |
| | label `"judge"` / `"gut_check"` | `"eval"` / `"eval_gut"` |
| `state.py` | `outline_grade` | `outline_eval` |
| | `storyboard_grade` | `storyboard_eval` |
| | `cross_stage_grade` | **delete** (handoff merges into storyboard_eval) |
| `orchestrator.py` | `outline_grade` (6 refs) | `outline_eval` |
| | `storyboard_grade` (4 refs) | `storyboard_eval` |
| | `cross_stage_grade` (2 refs) | **delete** |
| | separate cross_stage eval call | **delete** (saves 1 LLM call) |
| `main.py` | `outline_grade`, `storyboard_grade` | `outline_eval`, `storyboard_eval` |
| `llm_config.json` | `storyboard.qg_gut_check` | `storyboard.qg_eval_gut` |
| `QUALITY_JUDGE_PROMPT.md` | single file, 3 modes | **split into 2 files** (see below) |
| `QualityScore.tsx` | prop `grade` / `GradeResult` | `eval` / `QualityEvalResult` |
| `StageContent.tsx` | `outlineGrade`, `storyboardGrade`, `crossStageGrade` | `outlineEval`, `storyboardEval` (crossStage deleted) |
| `OutlineBuilder.tsx` | `outlineGrade` | `outlineEval` |
| `UserView.tsx` | `storyboardGrade` | `storyboardEval` |

### Prompt split

`QUALITY_JUDGE_PROMPT.md` (1 file, 3 modes) splits into:

**`OUTLINE_EVAL_PROMPT.md`** — 5 dimensions:
1. flow_coherence
2. talking_point_sharpness
3. evidence_fitness
4. brief_pov_alignment
5. section_necessity

**`STORYBOARD_EVAL_PROMPT.md`** — 6 dimensions (handoff merged in):
1. instructional_progression
2. context_rot
3. specificity_retention
4. source_fidelity
5. redundancy
6. handoff_integrity (was cross_stage, requires outline in context)

Old `QUALITY_JUDGE_PROMPT.md` moves to `prompts/archive/`.

### Handoff merge into storyboard eval

- `cross_stage_grade` / `cross_stage_eval` field deleted from `state.py`
- Separate cross_stage evaluation call deleted from `orchestrator.py`
- `handoff_integrity` becomes dimension #6 in storyboard eval
- Storyboard eval context must include outline (currently only cross_stage passes it)
- `quality_gate.py`: `CROSS_STAGE_DIMENSIONS` merged into `STORYBOARD_DIMENSIONS`; `STAGE_DIMENSIONS["cross_stage"]` deleted

### Dev-time renames

| File | Before | After |
|------|--------|-------|
| `eval_batch.py` | filename | `offline_prompt_bench.py` |
| `eval_gold_set.py` | filename | `offline_prompt_bench_gold.py` |
| `EVAL_JUDGE_PROMPT.md` | in `prompts/archive/` | stays, rename to `OFFLINE_BENCH_JUDGE.md` |
| `test_eval_batch.py` | filename | `test_offline_prompt_bench.py` |
| `test_eval_ingestion.py` | filename | `test_offline_prompt_bench_ingestion.py` |
| `admin/eval-components.tsx` | filename | `bench-components.tsx` |
| `admin/GoldSetEval.tsx` | filename | `GoldSetBench.tsx` |
| `admin/BatchDiffs.tsx` | internal `judge` var | `benchResult` |
| `main.py` | eval-related endpoints | `/api/offline-prompt-bench/*` |

### Frontend type renames

| Before | After |
|--------|-------|
| `GradeResult` (TS type) | `QualityEvalResult` |
| `grade` prop | `eval` prop |

---

## Phase 2: quality_log Table

### Context model

LLM context is layered. Each layer has a different storage strategy:

```
Layer 1: System Instructions (shared across all projects)
  Versioned prompt files: OUTLINE_EVAL_PROMPT.md, STORYBOARD_EVAL_PROMPT.md, etc.
  Storage: prompt_ref field (filename only, content in prompts/)

Layer 2: Project Data (per-project)
  Brief fields, user uploaded files
  Storage: project_id field (look up in DB)

Layer 3: Agent Chain (per-agent, cumulative)
  B (brief output) feeds into every downstream agent
  Each agent accumulates all upstream outputs
  QG feedback writes back into next generate attempt's context
  Storage: context field (full text — this is the dynamic, diagnostic part)
```

Context flow through the pipeline:

```
BriefBuilder output = B

Director      context IN:  [B]
QG (outline)  context IN:  [B summary + Director output]
Writer        context IN:  [B + Director output]
QG (storyboard) context IN: [B summary + Director output + Writer output]
```

QG feedback loop:

```
generate (attempt=1)  context IN: [B + upstream]           → output_v1
eval                  context IN: [B summary + output_v1]  → scores + feedback
generate (attempt=2)  context IN: [B + upstream + feedback] → output_v2  (parent=eval id)
eval                  context IN: [B summary + output_v2]  → scores ✓   (parent=generate id)
```

### Schema

```sql
CREATE TABLE quality_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL,
    event           TEXT NOT NULL,      -- generate | eval | override | approve
    stage           TEXT NOT NULL,      -- brief | outline | storyboard
    scope           TEXT,               -- full | section:3 | screen:5
    attempt         INTEGER,            -- generate: 1, 2, ... (retry count)
    model           TEXT,               -- "gpt-4o" | NULL for human actions
    prompt_ref      TEXT,               -- "storyboard_director_prompt_v0324"
    context         TEXT,               -- Layer 3: assembled input the LLM saw
    raw_response    TEXT,
    parsed_output   TEXT,               -- JSON
    scores          TEXT,               -- JSON: {composite, gut, dimensions[]} (eval only)
    instruction     TEXT,               -- user feedback text (override/regenerate)
    before_content  TEXT,               -- before edit (override only)
    after_content   TEXT,               -- after edit (override only)
    parent_id       INTEGER REFERENCES quality_log(id),
    created_at      REAL NOT NULL DEFAULT (unixepoch('subsec'))
);

CREATE INDEX ix_qlog_project ON quality_log(project_id);
CREATE INDEX ix_qlog_event ON quality_log(event);
```

### 4 event types

| event | what | prompt_ref | context | raw_response | scores | instruction | before/after |
|-------|------|-----------|---------|-------------|--------|-------------|-------------|
| generate | AI produces content | Y | Y (B + upstream) | Y | - | - | - |
| eval | AI evaluates content | Y | Y (B summary + evaluated content) | Y | Y | - | - |
| override | human edits content | - | - | - | - | Y (optional) | Y |
| approve | human accepts content | - | - | - | - | - | - |

### Causal chain example

```
#1  generate  outline/full  attempt=1  context=[B]                     → outline_v1
#2  eval      outline/full             context=[B summary, outline_v1] → 6.2 + feedback    parent=#1
#3  generate  outline/full  attempt=2  context=[B, QG_feedback]        → outline_v2         parent=#2
#4  eval      outline/full             context=[B summary, outline_v2] → 7.8 ✓              parent=#3
#5  override  outline/section:3        before/after                                          parent=#4
#6  approve   outline/full                                                                   parent=#5
#7  generate  storyboard/full attempt=1 context=[B, outline_v2]        → storyboard         parent=#6
```

### Writer module

`backend/app/infra/quality_log.py`:

```python
class QualityLog:
    log_generate(project_id, stage, scope, attempt, model, prompt_ref, context, raw_response, parsed_output, parent_id=None) -> int
    log_eval(project_id, stage, scope, model, prompt_ref, context, raw_response, scores, parent_id=None) -> int
    log_override(project_id, stage, scope, instruction, before_content, after_content, parent_id=None) -> int
    log_approve(project_id, stage, scope, parent_id=None) -> int
```

Each method returns `id` for downstream `parent_id` chaining. Synchronous writes (INSERT is fast).

### Emit points

| Event | Where | parent_id source |
|-------|-------|-----------------|
| generate | `orchestrator.py` after Director/Writer run | None (chain head) or eval id (retry) |
| eval | `quality_gate.py` after evaluate() | generate id |
| override | `main.py` stage save endpoint | most recent eval id |
| approve | `main.py` stage approve endpoint | most recent eval or override id |

### API endpoints

```
GET /api/quality-log/{project_id}         -> causal chain for a project
GET /api/quality-log/stats/overrides      -> override hotspots (stage x scope x count)
```

### Systems replaced

| System | Fate |
|--------|------|
| `analytics.py` | PostHog replaces it (separate effort) |
| `observability.py` | quality_log replaces it; old data expires naturally |
| `offline_prompt_bench` | Stays independent; dev-time only |

### Not in scope

- Frontend dashboard (SQL + curl for now)
- Data migration from observability.py
- PostHog integration
- offline_prompt_bench rename (covered in Phase 1)
