# Output.ai-Inspired Improvements for Plotline

> Source: Output.ai (GrowthX) open-source framework analysis + Plotline architecture review
> Date: 2026-03-31
> Status: Planning — not yet implemented

---

## 1. Deterministic Eval Checks (Zero API cost, implement now)

### Director (outline)
- **Section count bounds**: outline should have 3–8 sections, not 1 or 20
- **Duration sum check**: all sections' estimated duration should sum to target duration ±20%
- **Talking point coverage**: every `core_talking_points` from brief must appear in at least one section
- **Required fields completeness**: each section must have title, talking_points, evidence_needed

### Evidence Researcher
- **Citation presence**: every evidence task must have at least 1 source
- **Claim-evidence alignment**: evidence `section_title` must match outline `section_title`
- **No empty usable_line**: if search returned results, `usable_line` cannot be empty

### Writer (storyboard)
- **Word count bounds per screen**: voiceover must be 20–80 words
- **Duration calculation accuracy**: `word_count / 130 * 60` should equal duration ±5s
- **Screen count limits**: total screen count within reasonable range for video duration
- **Required field completeness**: every screen must have voiceover, visual_direction, screen_type
- **Brief alignment**: title/audience should match brief values

---

## 2. Generate-Evaluate-Retry Loop (Highest ROI)

Inner loop — Output.ai's core pattern:

```
Agent generates → deterministic eval → fail → append failure reasons to prompt → retry → max 3 attempts
```

### Implementation approach
Add `call_llm_with_eval()` to `BaseAgent`:
- Accepts an `eval_fn(response) -> (pass, failures[])` callback
- If eval fails, format failures as feedback, append to user_prompt, re-call LLM
- Max 3 retries; return last response regardless on final attempt
- Log each attempt + eval results for debugging

### Per-agent eval functions
- `eval_director_output(outline, brief)` → checks section count, duration sum, talking point coverage
- `eval_evidence_output(evidence, outline)` → checks citation presence, alignment, usable_line
- `eval_writer_output(storyboard, brief, outline)` → checks word count, duration, required fields, brief alignment

---

## 3. Cached Eval Mode (Dev-time iteration)

Save every agent output to file/DB. After prompt changes, re-run evals on saved outputs at zero API cost.

### Use cases
- **Prompt refinement validation**: changed Director prompt → run eval on 10 saved outlines → check for regression
- **Gold set comparison**: compare new outputs against human-approved gold examples
- **Model swap testing**: switch from claude-sonnet to gpt-4o → run cached eval → compare scores

### Implementation
- Save outputs: `data/eval_cache/{project_id}/{agent_name}_{timestamp}.json`
- CLI command: `python -m eval --agent director --cached` runs eval on all cached outputs
- Output: pass/fail counts + specific failures per output

---

## 4. Five-Column Architecture Diagram Corrections

Based on the diagram review (2026-03-31):

### Two loops, not one
- **Inner loop (runtime)**: Agent → Eval → fail → retry with feedback → Agent. Happens per-agent during generation.
- **Outer loop (dev-time)**: Change prompt/model → cached eval on saved outputs → regression suite. Happens during development.

### Eval classification
Use **deterministic vs LLM-judged**, not "automated vs quality":
- **Deterministic** (zero cost, must-pass): schema validation, policy/guardrail, duration arithmetic, word count bounds, handoff field completeness
- **LLM-judged** (has cost, subjective): per-agent quality, E2E coherence, tone/voice consistency

### Per-agent eval gating
Eval fires after EACH agent, not just at pipeline end. Director produces bad outline → stop before Evidence Researcher runs on bad input.

### Iteration column: separate by actor
- Developer activities: prompt refinement, gold set comparison
- Runtime human gating: human expert review (HAG framework)
- CI/ops: model swap/upgrade, regression suite

---

## 5. Infra/Domain Separation (P3 — for CTO)

### Infra layer (reusable across content types)
- Workflow engine (step sequencing, state machine)
- `step()` abstraction (input schema → LLM call → output schema → eval)
- Eval framework (deterministic + LLM-judged runners)
- Prompt file loader + versioning
- Cached eval runner + CLI
- Token/cost/latency logging

### Domain layer (content-type specific)
- Prompt methodology (HAG, content spine, visual direction taxonomy)
- Eval taxonomy (5 outline dimensions + 5 storyboard dimensions)
- Content type definitions (knowledge_share, product_tutorial, etc.)
- Agent-specific logic (brief → outline → evidence → storyboard)

---

## Suggested Implementation Order

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | Deterministic eval checks for Writer | 1 day | Catches most visible quality bugs |
| 2 | Generate-evaluate-retry loop in BaseAgent | 1 day | Automatic quality improvement per generation |
| 3 | Deterministic eval checks for Director | 0.5 day | Prevents bad outlines from propagating |
| 4 | Deterministic eval checks for Evidence | 0.5 day | Ensures research is usable |
| 5 | Cached eval mode | 1–2 days | Enables safe prompt iteration |
| 6 | Infra/domain separation | CTO | Enables multi-content-type platform |
