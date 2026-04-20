# Observability Data Architecture

## 1. High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   USER JOURNEY                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        │                               │                               │
        ▼                               ▼                               ▼
┌───────────────┐               ┌───────────────┐               ┌───────────────┐
│  STAGE 1      │               │  STAGE 2      │               │  STAGE 3      │
│  Brief        │ ────────────▶ │  Outline      │ ────────────▶ │  Draft        │
│               │               │               │               │               │
│  AI Gen ──┐   │               │  AI Gen ──┐   │               │  AI Gen ──┐   │
│           │   │               │           │   │               │           │   │
│  Human ◀──┘   │               │  Human ◀──┘   │               │  Human ◀──┘   │
│  Edits        │               │  Edits        │               │  Edits        │
└───────┬───────┘               └───────┬───────┘               └───────┬───────┘
        │                               │                               │
        │ edit events                   │ edit events                   │ edit events
        │ snapshots                     │ snapshots                     │ snapshots
        │                               │                               │
        └───────────────────────────────┼───────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            OBSERVABILITY LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                         ObservabilityService                             │    │
│  │   • log_field_edit()      • create_snapshot()      • get_edit_events()   │    │
│  │   • log_screen_delete()   • get_snapshots()        • compute_analytics() │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
                    ▼                   ▼                   ▼
            ┌───────────────┐   ┌───────────────┐   ┌───────────────┐
            │ Edit Events   │   │  Snapshots    │   │   Summary     │
            │ (JSONL)       │   │  (JSON)       │   │   (JSON)      │
            └───────────────┘   └───────────────┘   └───────────────┘
                    │                   │                   │
                    └───────────────────┼───────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            ANALYTICS DASHBOARD                                   │
│                                                                                  │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐                 │
│   │ Field Edit      │  │ Semantic        │  │ Prompt          │                 │
│   │ Patterns        │  │ Patterns        │  │ Signals         │                 │
│   │                 │  │                 │  │                 │                 │
│   │ voiceover: 68%  │  │ tone_change: 45%│  │ "Writer needs   │                 │
│   │ visual: 52%     │  │ rewrite: 32%    │  │  tone guidance" │                 │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Edit Event Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              EDIT EVENT LIFECYCLE                                │
└─────────────────────────────────────────────────────────────────────────────────┘

    User Action                    Frontend                         Backend
    ───────────                    ────────                         ───────
         │                             │                                │
         │  types in field             │                                │
         ├────────────────────────────▶│                                │
         │                             │                                │
         │                             │  debounce 500ms                │
         │                             │  ┌─────────────┐               │
         │  continues typing           │  │ wait...     │               │
         ├────────────────────────────▶│  │             │               │
         │                             │  │             │               │
         │                             │  └─────────────┘               │
         │                             │                                │
         │  stops typing               │                                │
         │                             │  POST /edit-event              │
         │                             ├───────────────────────────────▶│
         │                             │                                │
         │                             │  {                             │
         │                             │    stage: "outline",           │
         │                             │    edit_type: "field_edit",    │
         │                             │    field_name: "voiceover",    │
         │                             │    before: "AI text...",       │
         │                             │    after: "Human text...",     │
         │                             │    screen_number: 3            │
         │                             │  }                             │
         │                             │                                │
         │                             │                  ┌─────────────┤
         │                             │                  │ Compute     │
         │                             │                  │ DiffMetrics │
         │                             │                  │             │
         │                             │                  │ • word_diff │
         │                             │                  │ • semantic  │
         │                             │                  │   category  │
         │                             │                  └─────────────┤
         │                             │                                │
         │                             │                  ┌─────────────┤
         │                             │                  │ Append to   │
         │                             │                  │ edits.jsonl │
         │                             │                  └─────────────┤
         │                             │                                │
         │                             │  { event_id: "abc123" }        │
         │                             │◀───────────────────────────────┤
         │                             │                                │
```

---

## 3. Storage Structure

```
data/
├── project_1709312400/
│   ├── project_type3.json              # Project metadata
│   ├── state.json                       # Pipeline state
│   ├── stages.json                      # Frontend stage data
│   │
│   └── observability/                   # ◀── NEW
│       │
│       ├── events/
│       │   └── edits.jsonl              # Append-only edit log
│       │       │
│       │       ├── {"event_id":"e1", "stage":"brief", "edit_type":"field_edit", ...}
│       │       ├── {"event_id":"e2", "stage":"outline", "edit_type":"field_edit", ...}
│       │       ├── {"event_id":"e3", "stage":"outline", "edit_type":"screen_delete", ...}
│       │       └── {"event_id":"e4", "stage":"outline", "edit_type":"approve", ...}
│       │
│       ├── snapshots/
│       │   ├── brief_v1.json            # AI generation
│       │   ├── brief_v2.json            # Human approval
│       │   ├── outline_v1.json          # AI generation
│       │   ├── outline_v2.json          # Human save
│       │   └── outline_v3.json          # Human approval
│       │
│       └── summary.json                 # Computed edit patterns
│
├── project_1709312401/
│   └── observability/
│       └── ...
│
└── project_1709312402/
    └── observability/
        └── ...
```

---

## 4. Edit Event Schema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                               EDIT EVENT                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  HEADER                                                                   │   │
│  │  ┌────────────────┬────────────────┬────────────────┬────────────────┐   │   │
│  │  │ event_id       │ project_id     │ user_id        │ timestamp      │   │   │
│  │  │ "e7f8a9b0..."  │ "1709312400"   │ "user_abc"     │ "2026-03-01T.."│   │   │
│  │  └────────────────┴────────────────┴────────────────┴────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  LOCATION                                                                 │   │
│  │  ┌────────────────┬────────────────┬────────────────┬────────────────┐   │   │
│  │  │ stage          │ stage_round    │ edit_type      │                │   │   │
│  │  │ "outline"      │ 1              │ "field_edit"   │                │   │   │
│  │  └────────────────┴────────────────┴────────────────┴────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  TARGET                                                                   │   │
│  │  ┌────────────────────────┬────────────────────────┬─────────────────┐   │   │
│  │  │ field_name             │ screen_number          │ field_path      │   │   │
│  │  │ "voiceover_text"       │ 3                      │ "screens[2]..." │   │   │
│  │  └────────────────────────┴────────────────────────┴─────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  BEFORE / AFTER                                                           │   │
│  │  ┌───────────────────────────────┬───────────────────────────────────┐   │   │
│  │  │ BEFORE                        │ AFTER                             │   │   │
│  │  │ ┌───────────────────────────┐ │ ┌───────────────────────────────┐ │   │   │
│  │  │ │ value: "Our enterprise..." │ │ │ value: "See exactly where..." │ │   │   │
│  │  │ │ source: "ai_generated"     │ │ │ source: "human_edited"        │ │   │   │
│  │  │ │ word_count: 11             │ │ │ word_count: 8                  │ │   │   │
│  │  │ └───────────────────────────┘ │ └───────────────────────────────┘ │   │   │
│  │  └───────────────────────────────┴───────────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌──────────────────────────────────────────────────────────────────────────┐   │
│  │  DIFF METRICS (auto-computed)                                             │   │
│  │  ┌────────────────────────┬────────────────────────┬─────────────────┐   │   │
│  │  │ word_diff_ratio        │ levenshtein_distance   │ semantic_category│   │   │
│  │  │ 0.85                   │ 42                     │ "tone_change"   │   │   │
│  │  └────────────────────────┴────────────────────────┴─────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Snapshot Schema

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                 SNAPSHOT                                         │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │  HEADER                                                                 │     │
│  │  snapshot_id: "s1a2b3c4..."     version: 1                              │     │
│  │  project_id: "1709312400"       timestamp: "2026-03-01T18:40:00Z"       │     │
│  │  stage: "outline"               trigger: "ai_generation"                │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │  CONTENT (full stage data at this moment)                               │     │
│  │                                                                         │     │
│  │  {                                                                      │     │
│  │    "screens": [                                                         │     │
│  │      {                                                                  │     │
│  │        "screen_number": 1,                                              │     │
│  │        "screen_type": "hook",                                           │     │
│  │        "voiceover_text": "Welcome to our product demo...",              │     │
│  │        "visual_direction": "Product logo animation",                    │     │
│  │        "target_duration_sec": 5                                         │     │
│  │      },                                                                 │     │
│  │      { ... },                                                           │     │
│  │      { ... }                                                            │     │
│  │    ]                                                                    │     │
│  │  }                                                                      │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐     │
│  │  METADATA (auto-computed)                                               │     │
│  │                                                                         │     │
│  │  total_screens: 8                                                       │     │
│  │  total_word_count: 450                                                  │     │
│  │  avg_screen_duration: 12.5                                              │     │
│  └────────────────────────────────────────────────────────────────────────┘     │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Diff Computation

```
                    SNAPSHOT v1                              SNAPSHOT v2
                   (ai_generation)                          (stage_approval)
                         │                                        │
                         ▼                                        ▼
┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐
│  Screen 1: Hook                     │    │  Screen 1: Hook                     │
│  ┌────────────────────────────────┐ │    │  ┌────────────────────────────────┐ │
│  │ voiceover: "Our enterprise     │ │    │  │ voiceover: "See exactly where  │ │
│  │ solution provides comprehensive│ │◀──▶│  │ your users drop off—in real    │ │
│  │ analytics capabilities..."     │ │ ≠  │  │ time."                         │ │
│  └────────────────────────────────┘ │    │  └────────────────────────────────┘ │
│                                     │    │                                     │
│  Screen 2: Problem                  │    │  Screen 2: Problem                  │
│  ┌────────────────────────────────┐ │    │  ┌────────────────────────────────┐ │
│  │ voiceover: "Many businesses    │ │    │  │ voiceover: "Many businesses    │ │
│  │ struggle with data..."         │ │◀──▶│  │ struggle with data..."         │ │
│  └────────────────────────────────┘ │ =  │  └────────────────────────────────┘ │
│                                     │    │                                     │
│  Screen 3: Solution                 │    │  ██████████████████████████████████ │
│  ┌────────────────────────────────┐ │    │  ██  DELETED BY USER  ██████████████│
│  │ voiceover: "Introducing our    │ │    │  ██████████████████████████████████ │
│  │ revolutionary platform..."     │ │    │                                     │
│  └────────────────────────────────┘ │    │                                     │
└─────────────────────────────────────┘    └─────────────────────────────────────┘
                         │                                        │
                         └───────────────────┬────────────────────┘
                                             │
                                             ▼
                              ┌─────────────────────────────┐
                              │         DIFF RESULT         │
                              ├─────────────────────────────┤
                              │ screens_edited: [1]         │
                              │ screens_deleted: [3]        │
                              │ screens_unchanged: [2]      │
                              │                             │
                              │ field_changes:              │
                              │   Screen 1:                 │
                              │     voiceover_text:         │
                              │       diff_ratio: 0.91      │
                              │       category: tone_change │
                              └─────────────────────────────┘
```

---

## 7. Analytics Aggregation Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CROSS-PROJECT ANALYTICS                                  │
└─────────────────────────────────────────────────────────────────────────────────┘

     Project A              Project B              Project C
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ edits.jsonl     │    │ edits.jsonl     │    │ edits.jsonl     │
│                 │    │                 │    │                 │
│ • 12 events     │    │ • 8 events      │    │ • 15 events     │
│ • 3 tone_change │    │ • 5 tone_change │    │ • 4 tone_change │
│ • 2 rewrite     │    │ • 1 rewrite     │    │ • 6 rewrite     │
└────────┬────────┘    └────────┬────────┘    └────────┬────────┘
         │                      │                      │
         └──────────────────────┼──────────────────────┘
                                │
                                ▼
              ┌─────────────────────────────────────┐
              │     compute_cross_project_analytics │
              │                                     │
              │  1. Scan all project observability/ │
              │  2. Aggregate edit events           │
              │  3. Compute frequencies             │
              │  4. Generate signals                │
              └─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────┐                       │
│  │   STAGE EDIT RATES      │  │   FIELD EDIT FREQUENCY  │                       │
│  │                         │  │                         │                       │
│  │   brief:   35%          │  │   1. outline:voiceover  │                       │
│  │   outline: 72%  ◀───────│  │      68% edit rate      │                       │
│  │   draft:   45%          │  │                         │                       │
│  │                         │  │   2. outline:visual     │                       │
│  │   (% of projects with   │  │      52% edit rate      │                       │
│  │    edits in this stage) │  │                         │                       │
│  └─────────────────────────┘  │   3. brief:tone         │                       │
│                               │      41% edit rate      │                       │
│  ┌─────────────────────────┐  │                         │                       │
│  │   SEMANTIC PATTERNS     │  └─────────────────────────┘                       │
│  │                         │                                                    │
│  │   tone_change:  45%     │  ┌─────────────────────────┐                       │
│  │   rewrite:      32%     │  │   PROMPT SIGNALS        │                       │
│  │   content_add:  15%     │  │                         │                       │
│  │   minor_fix:     8%     │  │   ⚠ StoryboardWriter    │                       │
│  │                         │  │     "Voiceover tone     │                       │
│  └─────────────────────────┘  │      mismatch"          │                       │
│                               │     Evidence: 68% edits │                       │
│                               │     are tone changes    │                       │
│                               │     Recommendation:     │                       │
│                               │     "Pass tone_style    │                       │
│                               │      to writer prompt"  │                       │
│                               └─────────────────────────┘                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Dashboard Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            ANALYTICS DASHBOARD                                   │
└─────────────────────────────────────────────────────────────────────────────────┘

  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  GET /api/analytics/field-patterns?range=7d                                   │
  └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │  Response:                                                                    │
  │  {                                                                            │
  │    "total_projects": 50,                                                      │
  │    "stage_edit_rates": { "brief": 0.35, "outline": 0.72, "draft": 0.45 },    │
  │    "field_edit_frequency": [                                                  │
  │      { "stage": "outline", "field": "voiceover_text", "edit_rate": 0.68 },   │
  │      { "stage": "outline", "field": "visual_direction", "edit_rate": 0.52 }, │
  │      { "stage": "brief", "field": "tone_and_style", "edit_rate": 0.41 }      │
  │    ],                                                                         │
  │    "semantic_patterns": [                                                     │
  │      { "category": "tone_change", "frequency": 0.45 },                        │
  │      { "category": "rewrite", "frequency": 0.32 }                             │
  │    ]                                                                          │
  │  }                                                                            │
  └──────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
  ┌──────────────────────────────────────────────────────────────────────────────┐
  │                                                                               │
  │   ┌─────────────────────────────────────────────────────────────────────┐    │
  │   │  Field Edit Patterns                                                 │    │
  │   │                                                                      │    │
  │   │  outline: voiceover_text    ████████████████░░░░░░░░  68%           │    │
  │   │  outline: visual_direction  ██████████████░░░░░░░░░░  52%           │    │
  │   │  brief: tone_and_style      ██████████░░░░░░░░░░░░░░  41%           │    │
  │   │  draft: text_overlay        ████████░░░░░░░░░░░░░░░░  38%           │    │
  │   │                                                                      │    │
  │   │  ─────────────────────────────────────────────────────────────────  │    │
  │   │  Top Pattern: tone_change (45%)                                      │    │
  │   │  "Users frequently change formal language to casual"                 │    │
  │   │                                                                      │    │
  │   └─────────────────────────────────────────────────────────────────────┘    │
  │                                                                               │
  └──────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Feedback Loop to Prompts

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      PROMPT IMPROVEMENT FEEDBACK LOOP                            │
└─────────────────────────────────────────────────────────────────────────────────┘

        USER EDITS                    ANALYTICS                    PROMPT UPDATE
        ──────────                    ─────────                    ─────────────

  ┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
  │ User changes    │          │ System detects  │          │ Developer       │
  │ "Our enterprise │          │ pattern:        │          │ updates prompt: │
  │  solution..." → │   ───▶   │                 │   ───▶   │                 │
  │ "See exactly    │          │ 68% of voiceover│          │ "Write in a     │
  │  where users    │          │ edits are       │          │  conversational │
  │  drop off"      │          │ tone_change     │          │  tone. Avoid    │
  │                 │          │                 │          │  corporate      │
  │                 │          │ formal → casual │          │  jargon."       │
  └─────────────────┘          └─────────────────┘          └─────────────────┘
                                       │
                                       │
                                       ▼
                        ┌─────────────────────────────┐
                        │      PROMPT SIGNAL          │
                        │                             │
                        │  Agent: StoryboardWriter    │
                        │  Issue: Tone mismatch       │
                        │  Evidence: 68% tone edits   │
                        │  Confidence: 0.7            │
                        │                             │
                        │  Recommendation:            │
                        │  "Pass tone_and_style from  │
                        │   brief to writer prompt"   │
                        │                             │
                        └─────────────────────────────┘
                                       │
                                       │
           ┌───────────────────────────┴───────────────────────────┐
           │                                                       │
           ▼                                                       ▼
  ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
  │  prompts/storyboard_writer.md   │              │  RESULT: Better AI Output       │
  │                                 │              │                                 │
  │  BEFORE:                        │              │  AI now generates:              │
  │  "Write professional            │              │  "See exactly where your        │
  │   voiceover scripts..."         │              │   users drop off—in real time." │
  │                                 │              │                                 │
  │  AFTER:                         │              │  Instead of:                    │
  │  "Write voiceover in the tone   │              │  "Our enterprise solution       │
  │   specified in the brief        │              │   provides comprehensive        │
  │   ({{tone_and_style}}). Use     │              │   analytics capabilities..."    │
  │   conversational language..."   │              │                                 │
  └─────────────────────────────────┘              └─────────────────────────────────┘
```
