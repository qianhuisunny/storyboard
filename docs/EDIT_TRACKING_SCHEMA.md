# Edit Tracking Schema for Plotline Observability

> **Goal**: Track granular human edits at each stage to feed back into prompt improvement.
> Inspired by OpenAI's Harness Engineering: "When the agent struggles, treat it as a signal."

---

## Overview

```
AI Generation → Snapshot v1 → Human Edit → Snapshot v2 → ... → Final
                    ↓              ↓
              Store diff      Analyze patterns
                    ↓              ↓
              Feed back into prompt refinement
```

---

## 1. Edit Event Schema

Each user edit creates an immutable event record.

```json
{
  "event_id": "uuid",
  "project_id": "timestamp",
  "user_id": "firebase_user_id",
  "timestamp": "2026-03-01T18:45:00Z",

  "stage": "brief" | "outline" | "draft" | "review",
  "stage_round": 1,  // For brief: round 1/2/3

  "edit_type": "field_edit" | "screen_edit" | "screen_add" | "screen_delete" | "screen_reorder" | "regenerate" | "approve" | "reject",

  "target": {
    "screen_number": 3,           // null for brief edits
    "field_name": "voiceover_text",
    "field_path": "screens[2].voiceover_text"  // JSONPath for querying
  },

  "before": {
    "value": "Welcome to our product demo...",
    "source": "ai_generated",
    "word_count": 8
  },

  "after": {
    "value": "Hey! Let me show you something cool...",
    "source": "human_edited",
    "word_count": 7
  },

  "diff_metrics": {
    "levenshtein_distance": 42,
    "word_diff_ratio": 0.85,      // How different (0=same, 1=completely different)
    "semantic_category": "tone_change" | "content_add" | "content_remove" | "rewrite" | "minor_fix"
  },

  "context": {
    "time_since_generation_sec": 45,
    "session_edit_count": 3,      // Nth edit this session
    "was_ai_regenerated": false
  }
}
```

---

## 2. Snapshot Schema

Store complete state at key moments for diffing.

```json
{
  "snapshot_id": "uuid",
  "project_id": "timestamp",
  "stage": "outline",
  "version": 1,
  "trigger": "ai_generation" | "human_save" | "stage_approval",
  "timestamp": "2026-03-01T18:40:00Z",

  "content": {
    // Full stage content at this moment
    "screens": [
      {
        "screen_number": 1,
        "screen_type": "hook",
        "voiceover_text": "...",
        "visual_direction": "...",
        "target_duration_sec": 5
      }
    ]
  },

  "metadata": {
    "total_screens": 8,
    "total_word_count": 450,
    "avg_screen_duration": 12.5
  }
}
```

---

## 3. Field Edit Patterns (Aggregated)

Roll up individual edits into patterns for the dashboard.

```json
{
  "project_id": "timestamp",
  "computed_at": "2026-03-01T19:00:00Z",

  "brief_stage": {
    "fields_edited": ["tone_and_style", "target_audience"],
    "fields_unchanged": ["video_type", "platform"],
    "edit_rate": 0.25,  // 2 of 8 fields edited
    "common_changes": [
      {
        "field": "tone_and_style",
        "ai_value": "professional",
        "human_value": "conversational",
        "frequency": 0.4  // 40% of projects change this
      }
    ]
  },

  "outline_stage": {
    "screens_edited": [1, 4, 7],
    "screens_deleted": [3],
    "screens_added": 0,
    "screens_reordered": false,
    "edit_rate": 0.5,  // 4 of 8 screens touched

    "field_edit_heatmap": {
      "voiceover_text": 0.75,      // 75% of edited screens changed this
      "visual_direction": 0.50,
      "screen_type": 0.12,
      "target_duration_sec": 0.25
    },

    "patterns": [
      {
        "pattern": "hook_rewrite",
        "description": "User rewrote hook screen voiceover",
        "frequency": 0.6
      },
      {
        "pattern": "duration_adjustment",
        "description": "User shortened total duration",
        "avg_change_sec": -15
      }
    ]
  },

  "draft_stage": {
    // Same structure as outline_stage
  }
}
```

---

## 4. Cross-Project Analytics Schema

Aggregate across all projects for dashboard metrics.

```json
{
  "computed_at": "2026-03-01T20:00:00Z",
  "time_range": "7d",
  "total_projects": 50,

  "stage_edit_rates": {
    "brief": 0.35,    // 35% of projects edit brief
    "outline": 0.72,  // 72% edit outline
    "draft": 0.45
  },

  "field_edit_frequency": [
    // Sorted by frequency, for "Field Edit Patterns" dashboard card
    { "stage": "outline", "field": "voiceover_text", "edit_rate": 0.68 },
    { "stage": "outline", "field": "visual_direction", "edit_rate": 0.52 },
    { "stage": "brief", "field": "tone_and_style", "edit_rate": 0.41 },
    { "stage": "draft", "field": "text_overlay", "edit_rate": 0.38 }
  ],

  "semantic_patterns": [
    // What KIND of changes are users making?
    { "category": "tone_change", "frequency": 0.45, "example": "professional → casual" },
    { "category": "length_reduction", "frequency": 0.38, "avg_word_reduction": 25 },
    { "category": "hook_rewrite", "frequency": 0.32, "description": "First screen heavily edited" },
    { "category": "cta_strengthening", "frequency": 0.28, "description": "Last screen CTA made more direct" }
  ],

  "revision_metrics": {
    "avg_revisions_before_approval": 1.8,
    "projects_with_zero_edits": 0.12,  // 12% approve AI output as-is
    "avg_time_to_first_edit_sec": 23
  },

  "prompt_improvement_signals": [
    // Direct feedback for agent refinement
    {
      "agent": "StoryboardDirector",
      "issue": "Too many screens",
      "evidence": "42% of projects delete at least 1 screen",
      "recommendation": "Reduce default screen count by 1-2"
    },
    {
      "agent": "StoryboardWriter",
      "issue": "Voiceover too formal",
      "evidence": "68% of voiceover edits change tone",
      "recommendation": "Add tone_style from brief to writer prompt"
    }
  ]
}
```

---

## 5. File Structure

```
data/project_{id}/
├── project_type3.json
├── state.json
├── stages.json
├── edit_log.json          # Keep existing (backwards compatible)
│
├── observability/         # NEW: Granular tracking
│   ├── snapshots/
│   │   ├── brief_v1.json
│   │   ├── brief_v2.json
│   │   ├── outline_v1.json
│   │   └── outline_v2.json
│   │
│   ├── events/
│   │   └── edits.jsonl    # Append-only event log (one JSON per line)
│   │
│   └── summary.json       # Computed patterns for this project
```

---

## 6. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/project/{id}/edit-event` | Log a single edit event |
| `POST` | `/api/project/{id}/snapshot` | Create a stage snapshot |
| `GET` | `/api/project/{id}/edit-history` | Get all edits for a project |
| `GET` | `/api/project/{id}/diff/{stage}` | Get AI vs Human diff for stage |
| `GET` | `/api/analytics/field-patterns` | Aggregated field edit patterns |
| `GET` | `/api/analytics/prompt-signals` | Prompt improvement recommendations |

---

## 7. Frontend Integration Points

### 7.1 Capture Edits (OutlineBuilder, DraftBuilder)

```typescript
// On any field change
const captureEdit = (screenNumber: number, field: string, before: any, after: any) => {
  api.post(`/api/project/${projectId}/edit-event`, {
    stage: currentStage,
    edit_type: 'field_edit',
    target: { screen_number: screenNumber, field_name: field },
    before: { value: before },
    after: { value: after }
  });
};
```

### 7.2 Snapshot on Key Events

```typescript
// When AI generates content
await api.post(`/api/project/${projectId}/snapshot`, {
  stage: 'outline',
  trigger: 'ai_generation',
  content: generatedScreens
});

// When user approves stage
await api.post(`/api/project/${projectId}/snapshot`, {
  stage: 'outline',
  trigger: 'stage_approval',
  content: currentScreens
});
```

### 7.3 Dashboard Display

```typescript
// Fetch for Analytics Dashboard
const patterns = await api.get('/api/analytics/field-patterns?range=7d');

// Display in "Field Edit Patterns" card
patterns.field_edit_frequency.map(f => (
  <ProgressBar
    label={`${f.stage}: ${f.field}`}
    value={f.edit_rate * 100}
  />
));
```

---

## 8. Migration Path

1. **Phase 1**: Add `observability/` directory + event logging (no breaking changes)
2. **Phase 2**: Populate dashboard with real data
3. **Phase 3**: Build diff viewer UI
4. **Phase 4**: Connect to prompt improvement workflow

---

## 9. Example: Tracking an Outline Edit

User changes Screen 3 voiceover from AI version to their edit:

```json
// Event logged to observability/events/edits.jsonl
{
  "event_id": "e7f8a9b0-...",
  "project_id": "1709312400",
  "timestamp": "2026-03-01T18:45:32Z",
  "stage": "outline",
  "edit_type": "field_edit",
  "target": {
    "screen_number": 3,
    "field_name": "voiceover_text"
  },
  "before": {
    "value": "Our enterprise solution provides comprehensive analytics capabilities for your business needs.",
    "source": "ai_generated",
    "word_count": 11
  },
  "after": {
    "value": "See exactly where your users drop off—in real time.",
    "source": "human_edited",
    "word_count": 10
  },
  "diff_metrics": {
    "word_diff_ratio": 0.91,
    "semantic_category": "tone_change"
  }
}
```

This tells us: **User prefers concrete, punchy language over corporate speak.**
→ Feed back to `StoryboardWriter` prompt: "Use specific, concrete language. Avoid corporate jargon."

---

## 10. Dashboard Wireframe Updates

### Current (Empty)
```
┌─────────────────────────────────┐
│ Field Edit Patterns             │
│                                 │
│ Most frequently edited fields   │
│ (for prompt refinement)         │
│                                 │
│   No field edits recorded yet   │
│                                 │
└─────────────────────────────────┘
```

### With Data
```
┌─────────────────────────────────┐
│ Field Edit Patterns             │
│                                 │
│ outline: voiceover_text   ████████░░ 68%
│ outline: visual_direction █████░░░░░ 52%
│ brief: tone_and_style     ████░░░░░░ 41%
│ draft: text_overlay       ███░░░░░░░ 38%
│                                 │
│ Top Change: "formal → casual"   │
│ 45% of voiceover edits          │
└─────────────────────────────────┘
```

### New Card: Edit Diff Viewer
```
┌─────────────────────────────────┐
│ Recent Edits (Outline Stage)    │
│                                 │
│ Project #1709312400 • Screen 3  │
│ ─ "comprehensive analytics..."  │
│ + "See exactly where users..."  │
│                                 │
│ Pattern: tone_change (formal→casual)
│                                 │
│ [View Full Diff] [Next →]       │
└─────────────────────────────────┘
```
