# Quality Log — Brainstorm In Progress

> Resume this brainstorm with: "继续 quality_log 的 brainstorm，context 在 docs/superpowers/specs/quality-log-brainstorm-context.md"

## Status: Clarifying questions phase

## What we know

### Purpose
- Developer (solo founder) needs to observe production generation quality
- See user feedback (overrides/edits)
- Incorporate user feedback to improve prompts
- Consumption: SQL direct query + curl API endpoints (no frontend dashboard yet)

### Proposed Schema (user-designed)

```sql
CREATE TABLE quality_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id      TEXT NOT NULL,
    event           TEXT NOT NULL,      -- generate | judge | override | regenerate
    stage           TEXT NOT NULL,      -- brief | outline | storyboard
    scope           TEXT,               -- full | section:3 | screen:5
    model           TEXT,               -- "gpt-4o", NULL for human actions
    system_prompt   TEXT,
    user_prompt     TEXT,
    raw_response    TEXT,
    parsed_output   TEXT,               -- JSON
    scores          TEXT,               -- JSON: {composite, gut, dimensions[]}
    instruction     TEXT,               -- user feedback text
    before_content  TEXT,               -- before edit
    after_content   TEXT,               -- after edit
    parent_id       INTEGER REFERENCES quality_log(id),
    created_at      REAL NOT NULL DEFAULT (unixepoch('subsec'))
);
```

### 4 Event Types — Field Usage

| event     | model | prompts+response | scores | instruction | before/after |
|-----------|-------|------------------|--------|-------------|-------------|
| generate  | Y     | Y                | —      | —           | —           |
| judge     | Y     | Y                | Y      | —           | —           |
| override  | —     | —                | —      | Y (optional)| Y           |
| regenerate| Y     | Y                | —      | Y (trigger) | —           |

### Causal Chain Example

```
#1  generate   outline/full        (gpt-4o → produced outline)
#2  judge      outline/full        (gpt-4o → 6.2, flow_coherence weak) parent=#1
#3  override   outline/section:3   (user: "argument too weak") parent=#2
#4  regenerate outline/section:3   (gpt-4o → regenerated with user instruction) parent=#3
#5  judge      outline/full        (gpt-4o → 7.8, passed) parent=#4
#6  override   outline/section:5   (user directly edited voiceover text) parent=#5
```

### Existing Infrastructure

- **DB**: SQLite via SQLAlchemy async + aiosqlite, 4 tables (projects, pipeline_states, stage_snapshots, uploads)
- **No Alembic** — tables created via `Base.metadata.create_all()`
- **Quality gate**: `quality_gate.py` — LLM-as-judge, scores stored in state.json (not DB)
- **Analytics**: `analytics.py` — file-based JSON, tracks user behavior
- **Observability models**: `observability.py` — EditEvent/Snapshot dataclasses exist but not persisted
- **Eval framework**: `eval_gold_set.py` / `eval_batch.py` — dev-time gold standard comparison
- **LLM gateway**: `app/infra/llm_gateway.py` — centralized LLM calls with category logging (just built)

### Integration Points (where to emit events)

- `generate` → orchestrator.py when Director/Writer runs
- `judge` → quality_gate.py after evaluate()
- `override` → stage save endpoint or edit tracker
- `regenerate` → orchestrator.py on retry with feedback

### Remaining Questions to Resolve

1. Should system_prompt + user_prompt + raw_response be stored in full? (can be large — 5-10KB per row)
2. How does this relate to existing analytics.py? Replace it? Complement it?
3. Does the existing eval framework (eval_batch.py) also log to quality_log, or stay separate?
4. API surface: what queries does the developer need? (by project? by stage? low scores only? recent overrides?)

### File Location
New table goes in existing DB (`plotline.db`). Writer module should live at `app/infra/quality_log.py`.
