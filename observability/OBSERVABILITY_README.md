# Plotline Observability System

> Track what humans edit to improve AI output quality.
> Inspired by [OpenAI's Harness Engineering](https://openai.com/index/harness-engineering/): "When the agent struggles, treat it as a signal."

---

## Why We Built This

The existing Analytics Dashboard showed high-level metrics (completion funnel, ratings) but couldn't answer:

- **What** do users edit most? (voiceover? visuals? structure?)
- **Why** do they edit? (tone mismatch? too long? wrong style?)
- **Which agent** needs improvement? (Director? Writer?)

This system captures granular edit data to create a feedback loop from user behavior back to prompt refinement.

---

## Key Decisions

### 1. Event-Sourced Edit Log (Append-Only)

**Decision**: Store every edit as an immutable event, not just the final state.

**Why**:
- Enables replay and analysis of user behavior patterns
- Preserves the full journey from AI generation → human refinement
- Allows computing diffs at any point in time

**Implementation**: `observability/events/edits.jsonl` — one JSON object per line, append-only.

---

### 2. Snapshot Versioning

**Decision**: Create snapshots at key moments (AI generation, stage approval).

**Why**:
- Enables side-by-side diff between AI output and human final
- Captures metadata (word count, screen count) for trend analysis
- Allows "what changed" visualization in dashboard

**Triggers**:
- `ai_generation` — When agent produces output
- `human_save` — When user saves edits (optional)
- `stage_approval` — When user approves and moves to next stage

---

### 3. Semantic Classification of Edits

**Decision**: Automatically classify edits into categories (tone_change, content_add, rewrite, etc.)

**Why**:
- Raw diffs don't tell you *why* users edit
- Categories enable actionable insights: "68% of edits are tone changes"
- Feeds directly into prompt improvement recommendations

**Categories**:
| Category | Meaning |
|----------|---------|
| `tone_change` | Formal → casual, or vice versa |
| `content_add` | User added significant content |
| `content_remove` | User removed content (AI too verbose) |
| `rewrite` | Major rewrite (>50% different) |
| `minor_fix` | Small tweaks (<20% different) |

---

### 4. Field-Level Granularity

**Decision**: Track edits at the field level, not just "screen was edited."

**Why**:
- Knowing "Screen 3 was edited" isn't actionable
- Knowing "voiceover_text is edited 68% of the time" tells you the Writer agent needs work
- Enables heatmap visualization in dashboard

**Fields Tracked**:
- `voiceover_text` — Narration/script
- `visual_direction` — What appears on screen
- `screen_type` — Hook, demo, CTA, etc.
- `target_duration_sec` — Timing
- `text_overlay` — On-screen text

---

### 5. Debounced Frontend Tracking

**Decision**: Debounce edit events by 500ms to avoid flooding the server.

**Why**:
- Users type continuously; we don't need every keystroke
- Reduces server load and storage
- Still captures the meaningful before → after transition

**Implementation**: Frontend `editTracker` batches rapid edits to the same field.

---

### 6. Prompt Improvement Signals

**Decision**: Automatically generate actionable recommendations from edit patterns.

**Why**:
- Data without action is useless
- Surfaces insights like "StoryboardWriter needs tone guidance"
- Closes the feedback loop: User Edits → Signal → Prompt Update → Better AI

**Example Signal**:
```json
{
  "agent": "StoryboardWriter",
  "issue": "Voiceover tone mismatch",
  "evidence": "68% of edits are tone changes",
  "recommendation": "Pass tone_and_style from brief directly to writer prompt",
  "confidence": 0.7
}
```

---

### 7. File-Based Storage (For Now)

**Decision**: Store observability data in `data/project_{id}/observability/` alongside existing project data.

**Why**:
- Consistent with current architecture (no DB yet)
- Easy to inspect and debug
- Will migrate to Postgres with rest of system (tasks 103-105)

**Structure**:
```
data/project_{id}/observability/
├── events/
│   └── edits.jsonl       # Append-only edit log
├── snapshots/
│   ├── brief_v1.json     # AI generation
│   ├── brief_v2.json     # Human approval
│   ├── outline_v1.json
│   └── outline_v2.json
└── summary.json          # Computed patterns
```

---

### 8. Non-Blocking Tracking

**Decision**: Observability calls fail silently; never break the main app.

**Why**:
- Edit tracking is secondary to the core storyboard workflow
- Network issues shouldn't block user actions
- Logs warnings to console for debugging

**Implementation**: All API calls wrapped in try/catch with `console.warn`.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  useEditTracking(projectId, stage)                   │    │
│  │    • trackEdit(field, before, after, screenNum)      │    │
│  │    • trackSnapshot(trigger, content)                 │    │
│  │    • markGeneration()                                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Endpoints                           │
│  POST /api/project/{id}/edit-event     → Log edit           │
│  POST /api/project/{id}/snapshot       → Save version       │
│  GET  /api/project/{id}/edit-history   → List edits         │
│  GET  /api/project/{id}/diff/{stage}   → AI vs Human        │
│  GET  /api/analytics/field-patterns    → Dashboard data     │
│  GET  /api/analytics/prompt-signals    → Recommendations    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  ObservabilityService                        │
│  • log_field_edit()         → Append to JSONL               │
│  • create_snapshot()        → Save versioned JSON           │
│  • compute_project_summary()→ Aggregate patterns            │
│  • compute_cross_project_analytics() → Dashboard metrics    │
│  • _generate_improvement_signals()   → Prompt recommendations│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    File Storage                              │
│  data/project_{id}/observability/                           │
│    ├── events/edits.jsonl                                   │
│    ├── snapshots/*.json                                     │
│    └── summary.json                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Dashboard Integration

### Field Edit Patterns Card

**Before** (empty):
```
No field edits recorded yet
```

**After** (with data):
```
outline: voiceover_text   ████████░░ 68%
outline: visual_direction █████░░░░░ 52%
brief: tone_and_style     ████░░░░░░ 41%
draft: text_overlay       ███░░░░░░░ 38%

Top Change: "formal → casual" (45% of voiceover edits)
```

### New: Edit Diff Viewer

```
┌─────────────────────────────────────────────────────────────┐
│ Recent Edits (Outline Stage)                                │
│                                                             │
│ Project #1709312400 • Screen 3 • voiceover_text             │
│ ───────────────────────────────────────────────────────────│
│ AI:    "Our enterprise solution provides comprehensive      │
│         analytics capabilities for your business needs."    │
│                                                             │
│ Human: "See exactly where your users drop off—in real time."│
│ ───────────────────────────────────────────────────────────│
│ Pattern: tone_change (formal → casual)                      │
│                                                             │
│ [View Full Diff] [Previous] [Next]                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Files Created

| File | Purpose |
|------|---------|
| `docs/EDIT_TRACKING_SCHEMA.md` | Detailed schema specification |
| `backend/app/models/observability.py` | Data models (EditEvent, Snapshot, etc.) |
| `backend/app/services/observability.py` | Storage and analytics service |
| `backend/app/main.py` | API endpoints (added to existing) |
| `frontend/src/lib/observability.ts` | Frontend tracking utility |

---

## Next Steps

1. **Wire up stage builders** — Add `trackEdit()` calls to `OutlineBuilder.tsx` and `DraftBuilder.tsx`
2. **Update Analytics Dashboard** — Fetch from `/api/analytics/field-patterns`
3. **Build Diff Viewer component** — Side-by-side AI vs Human
4. **Connect to prompt workflow** — Use signals to update agent prompts

---

## References

- [OpenAI Harness Engineering](https://openai.com/index/harness-engineering/)
- [Martin Fowler: Harness Engineering](https://martinfowler.com/articles/exploring-gen-ai/harness-engineering.html)
- [5 Harness Engineering Principles](https://tonylee.im/en/blog/openai-harness-engineering-five-principles-codex)
