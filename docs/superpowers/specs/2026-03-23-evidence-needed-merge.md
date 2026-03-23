# Spec: Merge "Evidence needed" from Director into EvidenceResearcher

**Date:** 2026-03-23
**Status:** Draft

---

## Problem

The Director's outline contains "Evidence needed" bullets per section — these are internal task instructions for the EvidenceResearcher agent, not content the user needs to see or edit. Users see evidence-related content in two places (outline + evidence research stage) and don't understand the difference. The EvidenceResearcher is a dumb executor that follows the Director's list instead of autonomously assessing what needs researching.

## Solution

Remove "Evidence needed" from the Director's output. Merge the evidence quality principles into the EvidenceResearcher's prompt so it autonomously derives research needs from each section's purpose, talking points, and exit state.

---

## Changes

### 1. Director prompt (`prompts/storyboard_director_prompt_v0316.md` → `v0323`)

**Remove from output format** (lines 54-56):
```
Evidence needed
- {Specific evidence that would strengthen a talking point}
- {Another piece of evidence}
```

**Remove from section planning rules** (lines 93-97):
```
### Evidence needed
- Be specific — ...
- Focus on: mechanism explanations, worked examples, ...
- Avoid requesting: generic thought leader quotes, ...
```

**Remove from quality checklist** (line 165):
```
- [ ] Evidence requests are specific and mechanism-focused
```

Keep the rest of the Director prompt unchanged. The Director still produces: title, purpose, entry assumption, exit state, duration, talking points.

### 2. EvidenceResearcher prompt (`prompts/evidence_researcher_prompt_v0322.md` → `v0323`)

**Change the Input section** (line 54): Remove mention of "evidence needs" from the outline input description.

**Change the Process section** (lines 60-63): Replace "For each section's `Evidence needed` items" with autonomous derivation logic:

```markdown
## Process

For each section in the outline:
1. Read the section's purpose, talking points, and exit state to understand its teaching job
2. Identify which talking points make claims that need evidence support
3. For each claim, determine what TYPE of evidence best serves it:
   - Mechanism claim → how/why explanation with concrete steps
   - Trend claim → dated numbers from a named source
   - Comparison claim → contrast frame with specific differences
   - Definition → precise wording from an authoritative source
   - Limitation → boundary conditions and when it doesn't apply
   - Process/method → worked example showing real inputs and outputs
4. Form specific research questions (not broad "what do studies say about X")
5. Answer each question with facts, figures, and named sources
6. Convert into 2–4 storyboard-usable phrasing lines with [N] citations
```

**Add evidence quality principles** (absorbed from Director prompt):

```markdown
## Evidence Type Selection

Match evidence type to what the section's teaching job requires:
- **Prefer mechanism explanations over credentials.** HOW something works matters more than WHO said it.
- **Prefer worked examples over abstract descriptions.** "The word 'bank' gets attention weight 0.8 from 'river' but 0.1 from 'account'" beats "attention varies by context."
- **Prefer precise definitions over vague summaries.** Use the exact wording from the authoritative source.
- **Prefer concrete comparisons over isolated claims.** Before/after, old/new, with/without.
- **Avoid:** generic thought leader quotes, vague achievement statistics, motivational anchors — these don't help the viewer understand the mechanism.
```

**Add density guideline:** "Produce 2–4 evidence items per section. More for dense argument sections, fewer for transitional or narrative sections."

**Change output schema** (line 111): `evidence_needed` field changes from "Original evidence item text from the outline" to the researcher's own derived research need:

```json
{
  "evidence_needed": "Researcher-derived: what evidence this section needs and why"
}
```

### 3. EvidenceResearcher agent (`backend/app/services/agents/evidence_researcher.py`)

Update user prompt text (line 93): change "generate storyboard-ready research for each section's evidence items" → "generate storyboard-ready research for each section's claims and talking points."

### 4. StoryboardWriter agent (`backend/app/services/agents/storyboard_writer.py`)

**Remove** the parsing of "Evidence needed" from the outline:
- `_parse_outline`: Delete `"evidence_needed": self._extract_bullets(block, "Evidence needed")`
- `_build_full_storyboard_prompt`: Delete the `ev_text` block that formats evidence_needed bullets into the Writer's prompt
- `_extract_field` known headers: Remove `["Evidence needed", "Evidence"]` from the list

The Writer still includes "Evidence research" (actual research results from EvidenceResearcher) in its prompt. It just stops redundantly including the Director's evidence request bullets.

### 5. StoryboardWriter prompt (`prompts/storyboard_writer_prompt_v0321.md` → `v0323`)

Line 68: Remove "evidence needed" from the input description. Change from:
> Full outline — all sections with purpose, entry assumption, exit state, duration range, talking points, **and evidence needed**

To:
> Full outline — all sections with purpose, entry assumption, exit state, duration range, and talking points

### 6. Frontend outline UI

| File | Change |
|------|--------|
| `OutlineBuilder/outlineParser.ts` | Remove `evidenceNeeded` from parse + serialize logic. Keep as recognized-but-ignored header for backward compat with old stored outlines. |
| `OutlineBuilder/SectionRow.tsx` | Remove evidence column from the editable grid. Adjust grid template. |
| `OutlineBuilder/AiOriginalDrawer.tsx` | Remove `evidenceNeeded` rendering block from AI comparison panel. |
| `OutlineBuilder/types.ts` | Make `evidenceNeeded` optional (`evidenceNeeded?: string[]`) for backward compat, or remove and update all constructors. |

### 7. Admin/eval (non-blocking, can be done later)

| File | Change |
|------|--------|
| `backend/app/services/eval_gold_set.py` | Update outline parsing to not expect "Evidence needed" |
| `frontend/src/components/admin/eval-components.tsx` | Remove `evidence_needed` from type and rendering |
| `frontend/src/components/admin/GoldSetEval.tsx` | Remove `evidence_needed` reference |

---

## Backward compatibility

Old projects have "Evidence needed" in their stored outline text (`state.screen_outline`). These outlines are plain text, not structured data.

**Parser strategy:** `outlineParser.ts` should recognize the "Evidence needed" header but ignore its content (don't parse into `evidenceNeeded`, don't render). This prevents the text from bleeding into adjacent fields when parsing old outlines.

**Director regeneration:** `regenerate_section()` and `refine_outline()` pass the current outline to the LLM. If an old outline still has "Evidence needed" sections, the LLM may perpetuate them by imitating the format it sees. The new Director system prompt (v0323) won't include this field, so the LLM should drop it — but this is a soft guarantee, not a hard one. Acceptable risk.

---

## What does NOT change

- The EvidenceResearcher's output schema shape (sections → evidence_items → research_blocks) stays the same
- The Writer's consumption of EvidenceResearcher output stays the same (`_get_evidence_for_section`, `_format_evidence_for_prompt`)
- RAG retrieval logic stays the same
- The Director's other output fields (purpose, entry assumption, exit state, duration, talking points) stay the same
- The pipeline flow (Director → EvidenceResearcher → Writer) stays the same
- Old projects: `evidence_needed` values in stored research results remain valid (field is now researcher-derived instead of director-originated, but shape is identical)

---

## Prompt versioning

Per CLAUDE.md rules, changed prompts get new version dates:
- `storyboard_director_prompt_v0316.md` → `storyboard_director_prompt_v0323.md`
- `evidence_researcher_prompt_v0322.md` → `evidence_researcher_prompt_v0323.md`
- `storyboard_writer_prompt_v0321.md` → `storyboard_writer_prompt_v0323.md`
- Move old versions to `prompts/archive/`
- Update `prompt_file` references in all three agent `.py` files
