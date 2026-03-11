# Batch Gold Set Evaluation System — Design Spec

## Goal

Enable batch evaluation of Director and Writer prompts against 50 gold standard YouTube videos, with descriptive statistics and LLM-as-judge content quality assessment to guide prompt improvements.

## Context

We have a working single-video eval system (eval page at `/admin/gold-set-eval`). This spec extends it to handle batch runs, aggregate reporting, LLM-based content quality evaluation, and a streamlined ingestion workflow.

---

## Gold Set Schema

Each `data/gold_sets/{name}/gold_standard.json`:

```json
{
  "meta": {
    "duration_bucket": "short | medium | long",
    "structure": "linear | parallel",
    "narrative_opening": "story_hook | problem_statement | direct_framework"
  },
  "brief": { ... },
  "outline": [ ... ],
  "storyboard": [ ... ]
}
```

Rules:
- Sponsor/CTA sections stripped before saving
- `brief.total_duration_sec` = content-only duration
- `meta` auto-computed from data on ingestion:
  - `duration_bucket`: <600s → short, <1200s → medium, else long
  - `structure`: LLM infers from outline — checks whether sections form a single linear thread (each exit_state feeds next entry_assumption) or parallel branches (sections address independent sub-topics). Single LLM call with outline JSON as input, returns "linear" or "parallel".
  - `narrative_opening`: keyword heuristic on Section 1 title + purpose. If contains story/anecdote/tale/narrative keywords → `story_hook`. If contains problem/challenge/mistake/struggle keywords → `problem_statement`. Else → `direct_framework`.
- All other video context (audience, tone, visual style) already in `brief` — no duplication
- Existing gold sets without `meta` get it computed on first batch run or via a one-time migration script

## Ingestion Workflow

User pastes raw Gemini JSON (brief + outline + storyboard). System:
1. Strips sponsor/CTA sections (sections where purpose mentions "sponsor", "pitch", "ad", "CTA", or similar)
2. Recomputes `total_duration_sec` from remaining sections
3. Renumbers sections and screens sequentially
4. Auto-computes `meta`
5. Slugifies video title for directory name
6. Saves to `data/gold_sets/{slug}/gold_standard.json`

API: `POST /api/eval/gold-set/ingest` with raw JSON body. Returns the saved gold set with meta.

## Batch Runner

`run_batch_eval(names: list[str])` runs eval on N gold sets sequentially, reusing existing per-video `run_eval()`. Each video's result cached individually (same as now).

**Cache invalidation:** Each cached eval stores the prompt filenames used. On batch run, if current prompt filenames differ from cached versions, that video's cache is invalidated and re-run. `run_eval()` accepts `force: bool = False` to bypass cache explicitly.

After all runs complete, generates aggregate batch report.

API: `POST /api/eval/batch` — kicks off background batch. Same polling pattern as single eval.
`GET /api/eval/batch/status` — poll progress (returns `{status, completed, total, started_at}`).
`GET /api/eval/batch/report` — returns latest batch report.

## Evaluation: Two Layers

### Layer 1 — Descriptive Statistics (deterministic)

Pure numbers, no judgments or severity labels. Computed from gold vs AI output comparison.

Organized by pipeline stage, not by path.

**Outline stats (per video) — gold outline vs AI outline:**
- `section_count`: gold vs AI
- `duration_overshoot_pct`: (AI estimated total - gold total) / gold total * 100

**Storyboard stats (per video) — gold storyboard vs AI storyboard:**
- `screen_count`: gold vs AI
- `avg_words_per_screen`: gold vs AI
- `total_duration_accuracy_pct`: (AI total duration - gold total duration) / gold total duration * 100

Stats are computed for both Path B (gold outline → Writer, isolates writer quality) and Path A (AI outline → Writer, end-to-end). Both are stored in the report but the primary comparison is Path B.

**Batch aggregates:** averages of the above across all videos in the batch.

### Layer 2 — LLM-as-Judge Content Quality

An LLM evaluates the AI output against the gold standard, outputting structured quality tags. Each tag is a short label identifying a specific quality issue found in the AI output.

**Outline quality dimensions (5):**

| Dimension | What it checks | Example tags |
|---|---|---|
| `flow_coherence` | Do sections connect logically? Does exit state of N match entry assumption of N+1? | `abrupt_transition`, `missing_bridge`, `circular_flow` |
| `talking_point_specificity` | Are talking points concrete or vague platitudes? | `vague_platitude`, `no_actionable_detail` |
| `evidence_relevance` | Are suggested evidence/research areas relevant to the claims? | `irrelevant_evidence`, `missing_key_evidence` |
| `brief_alignment` | Does the outline serve the brief's viewer_outcome and selected_angle? | `drifted_from_angle`, `outcome_not_served` |
| `section_necessity` | Does every section earn its place? Could any be merged or cut? | `redundant_section`, `filler_section` |

**Storyboard quality dimensions (4):**

| Dimension | What it checks | Example tags |
|---|---|---|
| `context_rot` | Does the voiceover say something without actually conveying substance? | `empty_elaboration`, `says_nothing` |
| `generic_rewrite` | Did the AI flatten specific gold content into generic language? | `lost_specificity`, `generic_replacement` |
| `factual_invention` | Did the AI fabricate facts, stats, or claims not in the gold set or brief? | `invented_stat`, `fabricated_claim` |
| `redundancy` | Do multiple screens repeat the same point? | `repeated_point`, `duplicate_content` |

**LLM-as-judge output format (per video):**

```json
{
  "outline_quality": {
    "flow_coherence": { "tags": ["abrupt_transition"], "notes": "Section 2→3 jumps topic" },
    "talking_point_specificity": { "tags": [], "notes": "" },
    "evidence_relevance": { "tags": ["irrelevant_evidence"], "notes": "Section 4 suggests unrelated study" },
    "brief_alignment": { "tags": [], "notes": "" },
    "section_necessity": { "tags": ["filler_section"], "notes": "Section 5 could merge into Section 4" }
  },
  "storyboard_quality": {
    "context_rot": { "tags": ["empty_elaboration"], "notes": "Screen 3 VO sounds deep but says nothing" },
    "generic_rewrite": { "tags": [], "notes": "" },
    "factual_invention": { "tags": ["invented_stat"], "notes": "Screen 5 claims '73% of learners' — not in source" },
    "redundancy": { "tags": [], "notes": "" }
  }
}
```

**Batch aggregation for quality tags:**

Across the batch, count tag frequency:

```json
{
  "tag_frequency": {
    "outline": {
      "abrupt_transition": { "count": 4, "total": 8, "videos": ["feynman_technique", "..."] },
      "filler_section": { "count": 3, "total": 8, "videos": ["..."] }
    },
    "storyboard": {
      "empty_elaboration": { "count": 5, "total": 8, "videos": ["..."] },
      "invented_stat": { "count": 2, "total": 8, "videos": ["..."] }
    }
  }
}
```

Tags appearing in 3+ videos signal a systematic prompt issue worth addressing.

**LLM-as-judge input:**
- Two separate LLM calls per video: one for outline quality, one for storyboard quality
- Outline call receives: gold brief (for brief_alignment), gold outline, AI outline
- Storyboard call receives: gold brief, gold outline (for context), gold storyboard, AI storyboard (Path A only — full pipeline output is what we want to judge)
- The judge prompt includes the dimension definitions and example tags from the tables above, but the LLM may also surface tags not in the examples if they fit a dimension
- Model: same as primary LLM in `llm_config.json`

## Batch Report

Stored at `data/gold_sets/batch_report.json`:

```json
{
  "timestamp": "...",
  "prompt_versions": {
    "director": "storyboard_director_prompt_v0309.md",
    "writer": "storyboard_writer_prompt_v0309.md"
  },
  "gold_sets_run": ["feynman_technique", ...],
  "videos_completed": 8,
  "videos_failed": 0,
  "descriptive_stats": {
    "outline": {
      "section_count": { "gold_avg": 5.2, "ai_avg": 4.8 },
      "duration_overshoot_pct": { "avg": 45 }
    },
    "storyboard": {
      "screen_count": { "gold_avg": 12, "ai_avg": 14 },
      "avg_words_per_screen": { "gold_avg": 142, "ai_avg": 98 },
      "total_duration_accuracy_pct": { "avg": -8 }
    }
  },
  "tag_frequency": {
    "outline": {
      "abrupt_transition": { "count": 4, "videos": ["feynman_technique", "..."] }
    },
    "storyboard": {
      "empty_elaboration": { "count": 5, "videos": ["feynman_technique", "..."] }
    }
  },
  "history": [
    {
      "timestamp": "...",
      "prompt_versions": { "director": "...", "writer": "..." },
      "top_tags": ["abrupt_transition:4", "empty_elaboration:5"],
      "total_tag_count": { "outline": 12, "storyboard": 8 }
    }
  ]
}
```

**Note:** `tag_frequency[*][tag].count` is out of `videos_completed` (not `videos_failed`). Videos that fail eval are excluded from aggregation and listed separately.

## Decision Rules for Prompt Updates

- Run batches of 5-8 videos (stratified by duration_bucket)
- Only update prompts when a quality tag appears in 3+ videos in the batch
- After prompt change: re-run full batch, compare tag frequencies vs previous run
- History field tracks prompt version → tag counts over time
- After all 50 gold sets collected: freeze 10-15 as permanent regression suite (stratified by duration_bucket)

## Frontend Changes

### Page-level tabs

The eval page (`/admin/gold-set-eval`) gets two top-level tabs:

| Tab | Contents |
|---|---|
| **Single** (existing) | Gold set selector → single-video eval with diffs. Unchanged from current. |
| **Batch** (new) | Aggregate view across multiple gold sets. Described below. |

Tab switch is URL-hash based (`#single` / `#batch`) so it survives page reload. Default: `#single`.

### Single tab changes

- Replace the hardcoded `feynman_technique` with a dropdown of all available gold sets (from `GET /api/eval/gold-sets`)
- Everything else stays the same

### Batch tab layout

Single page, no sub-tabs. Contains: Descriptive Stats → Quality Tags → Run History.

```
┌──────────────────────────────────────────────────────────────┐
│ [Run Batch ▶]   Progress: 3/8 running...                     │
│ Last run: 2026-03-10 14:30  Prompts: director_v0309, writer_v0309 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ┌─ Descriptive Stats ──────────────────────────────────────┐ │
│ │  Outline (gold outline vs AI outline)                    │ │
│ │  ┌──────────┐  ┌──────────────────┐                      │ │
│ │  │ Sections │  │ Duration Overshoot│                      │ │
│ │  │ G:5.2 A:4.8│  │ avg +45%         │                      │ │
│ │  └──────────┘  └──────────────────┘                      │ │
│ │                                                          │ │
│ │  Storyboard (gold storyboard vs AI storyboard)           │ │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────────┐           │ │
│ │  │ Screens  │  │ Words/Scr│  │ Duration Acc │           │ │
│ │  │ G:12 A:14│  │ G:142 A:98│  │ avg -8%      │           │ │
│ │  └──────────┘  └──────────┘  └──────────────┘           │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─ Quality Tags ───────────────────────────────────────────┐ │
│ │  Outline                                                 │ │
│ │  ┌────────────────────┬───────┬─────────────────────┐    │ │
│ │  │ Tag                │ Count │ Videos              │    │ │
│ │  ├────────────────────┼───────┼─────────────────────┤    │ │
│ │  │ abrupt_transition  │ 4/8   │ feynman, ahrefs...  │    │ │
│ │  │ filler_section     │ 3/8   │ ali_abdaal...       │    │ │
│ │  └────────────────────┴───────┴─────────────────────┘    │ │
│ │                                                          │ │
│ │  Storyboard                                              │ │
│ │  ┌────────────────────┬───────┬─────────────────────┐    │ │
│ │  │ Tag                │ Count │ Videos              │    │ │
│ │  ├────────────────────┼───────┼─────────────────────┤    │ │
│ │  │ empty_elaboration  │ 5/8   │ feynman, ...        │    │ │
│ │  │ invented_stat      │ 2/8   │ ...                 │    │ │
│ │  └────────────────────┴───────┴─────────────────────┘    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌─ Run History ────────────────────────────────────────────┐ │
│ │  ┌────────────┬───────────────────┬──────────┬────────┐  │ │
│ │  │ Date       │ Prompts           │ Outline  │ SB     │  │ │
│ │  ├────────────┼───────────────────┼──────────┼────────┤  │ │
│ │  │ Mar 10     │ dir_v0309,wr_v0309│ 12 tags  │ 8 tags │  │ │
│ │  │ Mar 8      │ dir_v0308,wr_v0308│ 18 tags  │ 14 tags│  │ │
│ │  └────────────┴───────────────────┴──────────┴────────┘  │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

### Batch Diffs page (new page)

Route: `/admin/gold-set-eval/diffs`

Separate page for per-project deep dive. Shows a foldable list of all gold sets from the latest batch run. Each project is collapsed by default — expand to see full gold-vs-AI comparison reusing existing SectionDiff and StoryboardDiff components.

Nav link: "View Diffs →" text link at the top of the Batch tab (next to Run Batch button).

```
┌──────────────────────────────────────────────────────────────┐
│  Batch Diffs — 8 gold sets            [← Back to Batch]      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ ▶ feynman_technique     Sec: 6→5  Scr: 7→12  Tags: 3       │
│                                                              │
│ ▼ ahrefs_seo            Sec: 8→8  Scr: 14→18 Tags: 2       │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │                                                          │ │
│ │ ┌─ Quality Tags ──────────────────────────────────────┐  │ │
│ │ │  Outline: drifted_from_angle                        │  │ │
│ │ │    "Outline focuses on tools, brief says strategy"  │  │ │
│ │ │  Storyboard: empty_elaboration                      │  │ │
│ │ │    "Screen 4 VO sounds deep but says nothing"       │  │ │
│ │ └─────────────────────────────────────────────────────┘  │ │
│ │                                                          │ │
│ │  Outline — Gold vs AI                                    │ │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐               │ │
│ │  │ Sections │  │ Duration │  │ TPs      │               │ │
│ │  │ G:8 A:8  │  │ G:720s.. │  │ G:24 A:20│               │ │
│ │  └──────────┘  └──────────┘  └──────────┘               │ │
│ │  ┌─────────────────────┬─────────────────────┐           │ │
│ │  │ GOLD Section 1 — .. │ AI  Section 1 — ..  │           │ │
│ │  │ Purpose: ...        │ Purpose: ...         │           │ │
│ │  │ Duration: 90s       │ Duration: 1:30–2:00  │           │ │
│ │  │ ...                 │ ...                  │           │ │
│ │  ├─────────────────────┼─────────────────────┤           │ │
│ │  │ GOLD Section 2 — .. │ AI  Section 2 — ..  │           │ │
│ │  │ ...                 │ ...                  │           │ │
│ │  └─────────────────────┴─────────────────────┘           │ │
│ │                                                          │ │
│ │  Storyboard — Gold vs AI                                 │ │
│ │  (side-by-side screen cards, same as Single tab)         │ │
│ │                                                          │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ▶ ali_abdaal_learning    Sec: 10→9 Scr: 20→24 Tags: 1      │
│ ▶ huberman_sleep         Sec: 7→7  Scr: 16→15 Tags: 0      │
│ ...                                                          │
└──────────────────────────────────────────────────────────────┘
```

**Collapsed row:** `▶ {name}   Sec: {gold}→{ai}  Scr: {gold}→{ai}  Tags: {count}`

**Expanded row contents (top to bottom):**
1. Quality tags with notes (from LLM-as-judge for this video)
2. Outline — Gold vs AI: MetricCards + SectionDiff (gold sections vs AI sections side-by-side)
3. Storyboard — Gold vs AI: MetricCards + ScreenCard pairs (gold screens vs AI screens side-by-side)

All reusing existing SectionDiff, StoryboardDiff, MetricCard, ScreenCard components. Data loaded lazily — individual cached eval fetched on expand (`GET /api/eval/gold-set/{name}`).

### Batch tab interaction flow

1. **Initial state (no report):** Shows "No batch results yet. Click Run Batch to evaluate all gold sets." Empty state card.
2. **User clicks "Run Batch":**
   - Button changes to spinner + "Running 0/N..."
   - Frontend `POST /api/eval/batch` → starts background job
   - Frontend polls `GET /api/eval/batch/status` every 3s
   - Progress text updates: "Running 3/8..."
   - On `status: "done"`: fetch `GET /api/eval/batch/report`, render results
   - On `status: "error"`: show error message, enable re-run
3. **Results loaded:** Descriptive stats cards + tag frequency tables + run history render. "View Diffs →" link appears.
4. **User clicks "View Diffs →":** Navigates to `/admin/gold-set-eval/diffs`. Shows foldable project list.
5. **User expands a project row:** Lazy-fetches that project's cached eval, renders full diff inline.
6. **Run History table:** Read-only. Shows tag count trend (up/down arrow vs previous run).

## Files to Create/Modify

| File | Change |
|---|---|
| `backend/app/services/eval_gold_set.py` | Add `ingest_gold_set()`, `run_batch_eval()`, `compute_batch_report()`, `auto_compute_meta()`, `run_llm_judge()` |
| `backend/app/main.py` | Add `/api/eval/gold-set/ingest`, `/api/eval/batch`, `/api/eval/batch/status`, `/api/eval/batch/report` |
| `prompts/EVAL_JUDGE_PROMPT.md` | LLM-as-judge system prompt with dimension definitions and output format |
| `frontend/src/components/admin/GoldSetEval.tsx` | Add Batch tab with aggregate view, gold set dropdown for Single tab |
| `frontend/src/components/admin/BatchDiffs.tsx` | New page — foldable per-project diffs, reuses SectionDiff/StoryboardDiff/MetricCard/ScreenCard |
| `frontend/src/App.tsx` | Add route `/admin/gold-set-eval/diffs` → BatchDiffs |
| `data/gold_sets/feynman_technique/gold_standard.json` | Strip sponsor section, add meta, update duration |

## What's NOT in scope

- No subtype-based routing — same prompts for all video types
- No automatic prompt rewriting — system surfaces patterns, human decides
- No per-subtype prompt variants
- No severity labels on descriptive stats — just numbers
