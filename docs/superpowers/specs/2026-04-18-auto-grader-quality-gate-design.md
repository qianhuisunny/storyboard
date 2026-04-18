# Auto-Grader Quality Gate

Inline quality gates that grade AI output during generation, retry with design-manager feedback if below threshold, and show users the scores.

## Problem

AI-generated outlines and storyboards vary in quality. Users currently see whatever the first generation produces. There's no automated quality check, no retry mechanism, and no transparency into how good the output is.

## Solution

Insert quality gates at 3 pipeline stages: after Director (outline), after Writer (storyboard), and cross-stage (outline→storyboard handoff). Each gate uses a two-tier grading system, retries up to 2 times with written feedback, and surfaces scores to users.

## Architecture

### Pipeline Flow

```
Director.run()
    ↓
QualityGate("outline")
    ├─ Tier 1: Gut Check (1 call) — "Would you watch this?"
    │   ↓ fail → retry Director with gut-check feedback (skip Tier 2)
    │   ↓ pass → Tier 2
    ├─ Tier 2: 5 parallel dimension judges
    │   ↓ avg < threshold → retry Director with dimension feedback
    │   ↓ avg ≥ threshold → pass
    ↓
Writer.run()
    ↓
QualityGate("storyboard")
    ├─ Tier 1: Gut Check
    ├─ Tier 2: 5 parallel dimension judges
    ↓
QualityGate("cross_stage")
    ├─ Tier 1: Gut Check (outline + storyboard together)
    ├─ Tier 2: 1 dimension judge (handoff_integrity)
    ↓
Show user: output + scores + feedback
```

Max 2 attempts per gate (1 initial + 1 retry). If still below threshold after 2 attempts, show the best-scoring attempt with its scores. The user never sees a failed attempt — output is hidden until quality check passes or best attempt is selected.

Cross-stage gate receives both outline AND storyboard as input — it evaluates whether the Writer faithfully realized the Director's outline.

### Two-Tier Grading

**Tier 1 — Gut Check (1 LLM call):**
- Judge adopts the persona of the target audience
- Answers: "Would you choose to watch this video? Would you stay through the whole thing?"
- Returns: score (1-10) + 2-3 sentence viewer reaction
- If score < threshold: skip Tier 2, retry immediately (no point analyzing dimensions if the whole thing doesn't land)

**Tier 2 — Dimension Scoring (parallel LLM calls):**
- One call per dimension, all fired in parallel
- Judge is a senior instructional designer / design manager
- Returns: score (1-10) + 2-3 sentences of specific feedback per dimension
- Pass/fail based on average across all dimensions

### Quality Dimensions

Reused from existing `EVAL_JUDGE_PROMPT.md` (which gets archived after this ships):

**Outline (5 dimensions):**
1. `flow_coherence` — Does each section prepare the next with natural cognitive progression?
2. `talking_point_sharpness` — Are talking points specific, differentiated, and thesis-supporting?
3. `evidence_fitness` — Do evidence directions provide right kind and strength of support?
4. `brief_pov_alignment` — Does outline serve brief's viewer outcome and defend the POV?
5. `section_necessity` — Does each section have a distinct teaching job?

**Storyboard (5 dimensions):**
1. `instructional_progression` — Do screens build understanding step-by-step?
2. `context_rot` — Does storyboard preserve specificity and intent of outline?
3. `specificity_retention` — Does writing preserve concrete, topic-specific substance?
4. `source_fidelity` — Does storyboard stay within supported claims without invention?
5. `redundancy` — Do screens add distinct instructional value?

**Cross-stage (1 dimension):**
1. `handoff_integrity` — Does storyboard faithfully realize outline's teaching job and section thesis?

### Retry Mechanism

When a gate fails, the feedback is injected into the generation prompt:

```
[Original system prompt]

--- QUALITY REVIEW FEEDBACK (attempt 2 of 2) ---
Your previous output scored 6.2/10. A senior reviewer provided this feedback:

[Watchability - 5/10]: "I'd probably skip this — the opening reads like a 
course syllabus, not something I'd choose to watch over a competitor's video."

[Flow Coherence - 6/10]: "Section 3 jumps to implementation before the viewer 
understands why this matters. Section 2's exit state doesn't prepare them."

[Talking Point Sharpness - 7/10]: "Most points are sharp, but Section 4's 
talking points read like topic labels rather than explanatory steps."

Please revise your output addressing this feedback.
```

The generator (Director/Writer) receives its original system prompt + the feedback block. It regenerates from scratch — not editing the previous output.

### Best-Attempt Selection

If both attempts fail the threshold, show the attempt with the highest composite score. The user never sees intermediate failed attempts — only the final result.

**Composite score formula** (used for both threshold check and best-attempt selection): `(gut_check_score + avg_dimension_scores) / 2`. A gut-check-only failure (Tier 2 never ran) uses just the gut check score as composite.

## Components

### New Files

| File | Purpose |
|------|---------|
| `backend/app/services/quality_gate.py` | QualityGate class — orchestrates gut check + dimension grading + retry loop |
| `prompts/QUALITY_JUDGE_PROMPT.md` | Single judge prompt with two modes (gut_check, dimension) |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/services/orchestrator.py` | Wrap Director/Writer calls with `QualityGate.run_with_gate()` |
| `backend/app/services/state.py` | Add `outline_grade`, `storyboard_grade`, `cross_stage_grade` fields to `StoryboardState` |
| `frontend/src/components/...` | Add QualityScore card to OutlineBuilder and DraftBuilder |

### Archived Files

| File | Reason |
|------|--------|
| `prompts/EVAL_JUDGE_PROMPT.md` → `prompts/archive/` | Replaced by `QUALITY_JUDGE_PROMPT.md` |

## QualityGate API

```python
class QualityGate:
    def __init__(self, model="claude-sonnet-4-6", threshold=7.0, max_attempts=2):
        ...

    async def run_with_gate(self, agent, state, stage) -> tuple[Any, GradeResult]:
        """Generate → grade → retry loop. Returns (output, best_grade).
        Calls agent.run(state) internally (sync call wrapped in async gate)."""
        ...

    async def evaluate(self, stage, brief, output) -> GradeResult:
        """Tier 1 gut check → Tier 2 dimension scoring."""
        ...

    def format_feedback_for_retry(self, grade: GradeResult) -> str:
        """Format grade into retry prompt block."""
        ...

@dataclass
class GradeResult:
    passed: bool
    gut: GutScore              # score + 2-3 sentence reaction
    dimensions: list[DimensionScore] | None  # None if gut check failed
    composite_score: float
    attempt: int
    total_attempts: int

@dataclass
class GutScore:
    score: float
    feedback: str

@dataclass
class DimensionScore:
    dimension: str
    score: float
    feedback: str
```

## Judge Model

Sonnet 4.0 (`claude-sonnet-4-6`) for all judge calls. Generation models stay as configured in `llm_config.json`.

## Threshold

Single overall threshold: average of (gut check + all dimension scores) must be ≥ 7.0. Configurable via `QualityGate(threshold=N)`.

## Frontend Display

### Generation Progress (empty screen with spinner)

While generating + grading, the outline/storyboard area is blank. A centered spinner shows step-by-step progress:

```
                    ◌ Generating outline...

Progress sequence:
  ◷ "Generating outline..."
  ◷ "Reviewing quality..."
  ◷ "Score 5.8 — refining with feedback..."   (amber, only if retry needed)
  ◷ "Reviewing revised outline..."             (only if retry needed)
  ◷ "Quality check passed: 7.8/10" → show outline
```

The footer button also shows the current step (e.g., "Generating outline..." with spinner). User sees NO content until the quality gate passes or best attempt is selected.

### QualityScore Card (shown after generation completes)

Collapsible card on the right side of the description text, between description and VIDEO OUTLINE container:

```
┌─────────────────────────────────────────────┐
│ ▾ Quality Score: 8.1/10                     │
│                                              │
│ Watchability: 8/10                           │
│ "Clear hook — I'd want to know why my       │
│  current approach is wrong."                 │
│                                              │
│ Flow: 9 · Sharpness: 7 · Evidence: 8        │
│ POV: 8 · Necessity: 9                        │
│                                              │
│ ▸ Detailed feedback                          │
│   [expandable per-dimension feedback]        │
└─────────────────────────────────────────────┘
```

- Collapsed by default: composite score + watchability one-liner
- Expand for dimension scores + per-dimension 2-3 sentence feedback
- Shows final attempt's scores only (user never sees failed attempts)

## Deterministic Checks

Existing deterministic checks (filler phrases, duration accuracy, screen count) run as pre-filters before the LLM judge. If filler phrases are detected, they're auto-stripped and flagged — no need to waste a judge call on something regex can catch.

## Eval System Coexistence

The offline eval system (`eval_gold_set.py`, `eval_batch.py`) stays untouched. It serves a different purpose: benchmarking AI output against human gold standards. The auto-grader evaluates standalone quality without a gold reference.

After shipping, archive `EVAL_JUDGE_PROMPT.md` to `prompts/archive/` since its dimension definitions are now consolidated into `QUALITY_JUDGE_PROMPT.md`.
