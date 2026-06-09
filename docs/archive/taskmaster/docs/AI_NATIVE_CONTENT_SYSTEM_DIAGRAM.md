# AI-Native Content System — Diagram Spec

> Use this to generate a visual architecture diagram (e.g., with Claude Artifacts, Mermaid, or design tool)

---

## 6 Columns (left to right)

### Column 1: Context Layer (DataRoom)
_Persistent, shared across all workflows. Like a data room in M&A._

- Company context (brand voice, products, audiences)
- Product documentation (source of truth)
- SME input
- Knowledge base (uploaded docs, RAG)
- Learner profiles
- **Taxonomy** (roles × features matrix)
- **Learning path suggestions** (per-role sequences: slides → QRG → video → ...)

Visual: green boxes, labeled "DataRoom" as group header

### Column 2: Generation Layer (Workflow-Based Agents)
_Format-specific creation pipelines. Each workflow pulls from the DataRoom._

- **Strategy agent** — reads taxonomy + DataRoom → suggests learning paths
- **Slide deck workflow** → Director → Writer
- **QRG workflow** → Outline → Content Writer
- **Video storyboard workflow** → Director → Evidence Researcher → Storyboard Writer _(this is Plotline today)_
- **Help article workflow** → Outline → Writer
- **eLearning workflow** (future) → Module Designer → Screen Writer

Visual: purple/blue boxes. Dashed border around all workflows. Arrow from DataRoom feeds into all workflows.

### Column 3: Evals
_Split into two types. Fires after EACH agent, not just at pipeline end._

**Deterministic (zero cost, must-pass):**
- Schema validation (required fields, types)
- Policy / guardrail check (brand compliance, tone)
- Duration / word count bounds
- Handoff field completeness (between agents)
- Brief alignment check

**LLM-Judged (has cost, subjective):**
- Per-agent quality (domain-specific rubric)
- E2E coherence (LLM-as-judge)
- Tone & voice consistency
- Gold set comparison

Visual: green boxes for deterministic, olive/dark-green for LLM-judged. Two sub-groups within the column.

### Column 4: Content Drift Detection
_Event-driven. Watches DataRoom for changes, flags downstream impact._

**Triggers (from DataRoom):**
- Product feature renamed
- New capability added
- Audience/permission change
- Source doc updated
- Brand guideline changed

**Outputs:**
- Stale content flagged (with reason type)
- Impact analysis (N artifacts across M learning paths)
- Suggested updates (rename, add content, create new audience variant)
- Human review queue (HAG: human gates before publish)

Visual: amber/yellow boxes. Arrow FROM DataRoom INTO this column (watching for changes). Arrow FROM this column BACK TO Generation Layer (triggers re-generation).

### Column 5: Iteration (Dev-Time)
_Separated by actor. These happen during development, not runtime._

**Developer activities:**
- Prompt refinement
- Gold set comparison (cached eval — zero API cost)

**CI / Ops:**
- Model swap / upgrade testing
- Eval suite coverage check

**Runtime (HAG):**
- Human expert review (domain expert gates output)

Visual: khaki/sand boxes. Grouped by actor with subtle labels.

### Column 6: Regression
_Ensures changes don't break existing quality._

- Fix one, break two? (regression test on prompt changes)
- New model drop test (switch model, run cached evals)
- Eval suite full coverage (are all dimensions tested?)
- Cross-format consistency check (same content spine → all formats still aligned?)

Visual: red/coral boxes.

---

## Two Loops (Critical — this is what the original diagram was missing)

### Inner Loop (Runtime)
**Agent → Eval → fail → retry with feedback → Agent**
- Happens per-agent, during generation
- Max 3 retries
- Visual: small circular arrow between Column 2 (Agents) and Column 3 (Evals)
- Label: "generate-evaluate-retry"

### Outer Loop (Dev-Time + Drift)
**DataRoom change → Drift Detection → flag stale content → re-enter Generation Layer → Eval → Iteration/Regression**
- Happens when product changes or during development
- Visual: large arrow from Column 4 (Drift) back to Column 2 (Generation), and from Column 5/6 (Iteration/Regression) back to Column 2
- Label: "content drift loop" and "dev iteration loop"

---

## Key Design Notes

- Column 1 (DataRoom) is the ONLY input source. All workflows pull from it.
- Column 4 (Drift Detection) is NEW vs the original diagram — it replaces the vague "loop back" arrow with a concrete mechanism inspired by Mintlify's Workflows.
- Evals fire per-agent (inner loop), not just at pipeline end.
- The original "QA Validator" agent is removed — eval is a cross-cutting concern, not a pipeline stage.
- Iteration column is split by actor (developer vs CI vs human reviewer).

---

## Comparison: Original → Updated

| Original | Updated |
|----------|---------|
| 5 columns: Context, Agents, Evals, Iteration, Regression | 6 columns: adds Content Drift Detection |
| Context = flat list of inputs | Context = DataRoom (persistent, structured, with taxonomy + learning paths) |
| Single "loop back" arrow | Two explicit loops: inner (runtime) + outer (drift/dev) |
| QA validator as final agent | Removed — eval is per-agent, not a pipeline stage |
| "Automated vs Quality" eval split | "Deterministic vs LLM-Judged" eval split |
| Iteration mixes all actors | Iteration split by actor (developer, CI, human) |
| No drift detection | Content Drift Detection as dedicated column |
| Agents = one pipeline | Agents = multiple format-specific workflows sharing one DataRoom |

---

## Suggested Prompt for Claude Diagram Generation

"Draw a clean, professional architecture diagram with 6 columns left to right: DataRoom (green), Generation Workflows (purple), Evals (green/olive split), Content Drift Detection (amber), Iteration (sand), Regression (coral). Show two loops: a small inner loop between Generation and Evals labeled 'generate-evaluate-retry', and a large outer loop from Drift Detection back to Generation and from Iteration/Regression back to Generation. The DataRoom feeds into all Generation workflows with a wide arrow. Use the same visual style as the original diagram (soft rounded boxes, muted colors, clean sans-serif type)."
