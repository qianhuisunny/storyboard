# Evidence Needed Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove "Evidence needed" from the Director's outline output and make the EvidenceResearcher autonomously derive research needs from each section's teaching job.

**Architecture:** Three prompt files get new versions (Director v0323, EvidenceResearcher v0323, Writer v0323). The frontend outline parser/UI stops producing/rendering the evidence column. The Writer agent stops parsing "Evidence needed" bullets from outlines. Backward compat: parser still recognizes the header in old outlines but discards it.

**Tech Stack:** Python (FastAPI agents), TypeScript/React (OutlineBuilder), Markdown prompts

**Spec:** `docs/superpowers/specs/2026-03-23-evidence-needed-merge.md`

---

### Task 1: Director prompt — remove "Evidence needed"

**Files:**
- Create: `prompts/storyboard_director_prompt_v0323.md` (copy of v0316, then edit)
- Move: `prompts/storyboard_director_prompt_v0316.md` → `prompts/archive/`
- Modify: `backend/app/services/agents/storyboard_director.py:23` (update `prompt_file`)

- [ ] **Step 1: Copy current Director prompt to v0323**

```bash
cp prompts/storyboard_director_prompt_v0316.md prompts/storyboard_director_prompt_v0323.md
```

- [ ] **Step 2: Edit v0323 — remove "Evidence needed" from output format**

In `prompts/storyboard_director_prompt_v0323.md`, delete these lines from the output format template (inside the code block around lines 54-56):

```
Evidence needed
- {Specific evidence that would strengthen a talking point}
- {Another piece of evidence}
```

- [ ] **Step 3: Edit v0323 — remove "Evidence needed" section planning rules**

Delete the entire `### Evidence needed` subsection under "### Talking points" (lines 93-97):

```
### Evidence needed

- Be specific — "worked example showing how the word 'bank' gets different attention weights in 'river bank' vs 'bank account'" is better than "example of context importance"
- Focus on: mechanism explanations, worked examples, precise definitions, concrete comparisons
- Avoid requesting: generic thought leader quotes, vague achievement statistics, motivational anchors — these don't help the viewer understand the mechanism
```

- [ ] **Step 4: Edit v0323 — remove from quality checklist**

Delete this line from the quality checklist:

```
- [ ] Evidence requests are specific and mechanism-focused
```

- [ ] **Step 5: Update Director agent prompt_file reference**

In `backend/app/services/agents/storyboard_director.py` line 23, change:

```python
prompt_file = "storyboard_director_prompt_v0316.md"
```
to:
```python
prompt_file = "storyboard_director_prompt_v0323.md"
```

- [ ] **Step 6: Archive old prompt**

```bash
mv prompts/storyboard_director_prompt_v0316.md prompts/archive/
```

- [ ] **Step 7: Verify Director agent imports**

```bash
cd backend && ./venv/bin/python -c "from app.services.agents.storyboard_director import StoryboardDirector; print('OK')"
```

- [ ] **Step 8: Commit**

```bash
git add prompts/storyboard_director_prompt_v0323.md prompts/archive/storyboard_director_prompt_v0316.md backend/app/services/agents/storyboard_director.py
git commit -m "refactor(director): remove Evidence needed from outline output format"
```

---

### Task 2: EvidenceResearcher prompt — autonomous derivation

**Files:**
- Create: `prompts/evidence_researcher_prompt_v0323.md` (copy of v0322, then edit)
- Move: `prompts/evidence_researcher_prompt_v0322.md` → `prompts/archive/`
- Modify: `backend/app/services/agents/evidence_researcher.py:25,93` (update `prompt_file` + user prompt text)

- [ ] **Step 1: Copy current EvidenceResearcher prompt to v0323**

```bash
cp prompts/evidence_researcher_prompt_v0322.md prompts/evidence_researcher_prompt_v0323.md
```

- [ ] **Step 2: Edit v0323 — update Input section (line 54)**

Change:
```
You receive:
- A video outline with sections, each containing: title, purpose, talking points, and evidence needs
```
To:
```
You receive:
- A video outline with sections, each containing: title, purpose, entry assumption, exit state, talking points, and duration
```

- [ ] **Step 3: Edit v0323 — replace Process section (lines 58-63)**

Replace the entire `## Process` section with:

```markdown
## Process

For each section in the outline:
1. Read the section's purpose, talking points, and exit state to understand its teaching job
2. Identify which talking points make claims that need evidence support — not every talking point needs research (some are framing, transitions, or self-evident)
3. For each claim that needs evidence, determine what TYPE of evidence best serves it:
   - Mechanism claim → how/why explanation with concrete steps
   - Trend claim → dated numbers from a named source
   - Comparison claim → contrast frame with specific differences
   - Definition → precise wording from an authoritative source
   - Limitation → boundary conditions and when it doesn't apply
   - Process/method → worked example showing real inputs and outputs
4. Form specific research questions (not broad "what do studies say about X")
5. Answer each question with specific facts, figures, and named sources
6. Convert into 2–4 storyboard-usable phrasing lines with [N] citations

**Density guideline:** Produce 2–4 evidence items per section. More for dense argument sections, fewer for transitional or narrative sections.
```

- [ ] **Step 4: Edit v0323 — add Evidence Type Selection section**

Add after the Process section, before Storyboard-Usable Phrasing:

```markdown
## Evidence Type Selection

Match evidence type to what the section's teaching job requires:
- **Prefer mechanism explanations over credentials.** HOW something works matters more than WHO said it.
- **Prefer worked examples over abstract descriptions.** "The word 'bank' gets attention weight 0.8 from 'river' but 0.1 from 'account'" beats "attention varies by context."
- **Prefer precise definitions over vague summaries.** Use the exact wording from the authoritative source.
- **Prefer concrete comparisons over isolated claims.** Before/after, old/new, with/without.
- **Avoid:** generic thought leader quotes, vague achievement statistics, motivational anchors — these don't help the viewer understand the mechanism.
```

- [ ] **Step 5: Edit v0323 — update output schema description (line 111)**

Change:
```json
"evidence_needed": "Original evidence item text from the outline's Evidence needed list",
```
To:
```json
"evidence_needed": "What evidence this section needs — derived from the section's talking points and teaching job",
```

- [ ] **Step 6: Edit v0323 — update edge cases (line 145)**

Change:
```
- Section with no evidence items: include with empty `evidence_items` array
```
To:
```
- Section with no claims needing evidence (e.g., pure framing or transition): include with empty `evidence_items` array
```

Remove:
```
- Use the section's talking points as context to understand what claims the evidence should support, but organize output by evidence item
```
(This is now redundant since talking points ARE the primary input.)

- [ ] **Step 7: Update EvidenceResearcher agent — prompt_file + user prompt**

In `backend/app/services/agents/evidence_researcher.py`:

Line 25, change:
```python
prompt_file = "evidence_researcher_prompt_v0322.md"
```
to:
```python
prompt_file = "evidence_researcher_prompt_v0323.md"
```

Line 93, change:
```python
prompt = f"""Analyze this video outline and generate storyboard-ready research for each section's evidence items.
```
to:
```python
prompt = f"""Analyze this video outline and generate storyboard-ready research for each section's claims and talking points.
```

- [ ] **Step 8: Archive old prompt**

```bash
mv prompts/evidence_researcher_prompt_v0322.md prompts/archive/
```

- [ ] **Step 9: Verify agent imports**

```bash
cd backend && ./venv/bin/python -c "from app.services.agents.evidence_researcher import EvidenceResearcher; print('OK')"
```

- [ ] **Step 10: Commit**

```bash
git add prompts/evidence_researcher_prompt_v0323.md prompts/archive/evidence_researcher_prompt_v0322.md backend/app/services/agents/evidence_researcher.py
git commit -m "refactor(evidence-researcher): autonomous evidence derivation from talking points"
```

---

### Task 3: Writer — stop parsing "Evidence needed" from outline

**Files:**
- Modify: `backend/app/services/agents/storyboard_writer.py:202,235,451-452`
- Create: `prompts/storyboard_writer_prompt_v0323.md` (copy of v0321, then edit)
- Move: `prompts/storyboard_writer_prompt_v0321.md` → `prompts/archive/`

- [ ] **Step 1: Copy Writer prompt to v0323**

```bash
cp prompts/storyboard_writer_prompt_v0321.md prompts/storyboard_writer_prompt_v0323.md
```

- [ ] **Step 2: Edit Writer prompt v0323 — update input description (line 68)**

Change:
```
1. **Full outline** — all sections with purpose, entry assumption, exit state, duration range, talking points, evidence needed
```
To:
```
1. **Full outline** — all sections with purpose, entry assumption, exit state, duration range, and talking points
```

- [ ] **Step 3: Edit storyboard_writer.py — remove evidence_needed from _parse_outline**

In `_parse_outline` → `parseBlock`, delete this line (around line 202):

```python
"evidence_needed": self._extract_bullets(block, "Evidence needed"),
```

- [ ] **Step 4: Edit storyboard_writer.py — remove "Evidence needed" from known headers**

In `_extract_field`, remove this entry from `known_headers` list (around line 235):

```python
["Evidence needed", "Evidence"],
```

- [ ] **Step 5: Edit storyboard_writer.py — remove ev_text from _build_full_storyboard_prompt**

In `_build_full_storyboard_prompt`, find and delete the lines that format `evidence_needed` bullets (around lines 451-452):

```python
ev_text = "\n".join(f"  - {ev}" for ev in section.get("evidence_needed", [])) or "  - (none)"
```

And in the block f-string template below it, delete:

```
Evidence needed:
{ev_text}
```

Keep the "Evidence research:" block — that's the actual research results.

- [ ] **Step 6: Update Writer agent prompt_file**

Change line 40:
```python
prompt_file = "storyboard_writer_prompt_v0321.md"
```
to:
```python
prompt_file = "storyboard_writer_prompt_v0323.md"
```

- [ ] **Step 7: Archive old prompt**

```bash
mv prompts/storyboard_writer_prompt_v0321.md prompts/archive/
```

- [ ] **Step 8: Verify agent imports**

```bash
cd backend && ./venv/bin/python -c "from app.services.agents.storyboard_writer import StoryboardWriter; print('OK')"
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/services/agents/storyboard_writer.py prompts/storyboard_writer_prompt_v0323.md prompts/archive/storyboard_writer_prompt_v0321.md
git commit -m "refactor(writer): stop parsing Evidence needed from outline, use research results only"
```

---

### Task 4: Frontend — remove evidence column from outline UI

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/types.ts:15`
- Modify: `frontend/src/components/OutlineBuilder/outlineParser.ts:96,104,114,151-152,209-212`
- Modify: `frontend/src/components/OutlineBuilder/SectionRow.tsx:167,328-338`
- Modify: `frontend/src/components/OutlineBuilder/AiOriginalDrawer.tsx:123-137`
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx:102`

- [ ] **Step 1: types.ts — make evidenceNeeded optional**

In `frontend/src/components/OutlineBuilder/types.ts` line 15, change:

```typescript
evidenceNeeded: string[];
```
to:
```typescript
evidenceNeeded?: string[];  // Legacy — no longer produced by Director v0323+
```

- [ ] **Step 2: outlineParser.ts — stop parsing and serializing evidence**

In `outlineParser.ts`:

Remove `evidenceNeeded` from the `parseBlock` return type (line 96) and default object (line 104):
```typescript
// Delete: evidenceNeeded: string[];    (from return type)
// Delete: evidenceNeeded: [] as string[],  (from result object)
```

Keep the `evidenceNeeded` pattern in `fieldHeaders` (line 114) but change key to `_evidenceNeeded` to make it recognized-but-discarded, like `_visualIntent`:
```typescript
{ key: "_evidenceNeeded" as const, pattern: /^Evidence\s+needed\s*$/im },  // recognized but discarded
```

Delete the parsing branch (lines 151-152):
```typescript
// Delete: } else if (pos.key === "evidenceNeeded") {
// Delete:   result.evidenceNeeded = parseBullets(content);
```

In `serializeOutline` (lines 209-212), delete:
```typescript
lines.push("Evidence needed");
for (const ev of s.evidenceNeeded) {
  lines.push(`- ${ev}`);
}
```

In fallback section (line 67), delete:
```typescript
// Delete: evidenceNeeded: [],
```

- [ ] **Step 3: SectionRow.tsx — remove evidence column**

Change grid template (line 167) from:
```typescript
"group relative grid grid-cols-[32px_56px_1fr_36%] items-start py-8 transition-colors rounded-lg",
```
to:
```typescript
"group relative grid grid-cols-[32px_56px_1fr] items-start py-8 transition-colors rounded-lg",
```

Delete the entire evidence column block (lines 328-338):
```tsx
{/* Evidence column */}
<div className="min-w-0 pt-1">
  <BulletBlock
    items={section.evidenceNeeded}
    onChange={(items) =>
      onUpdate(section.id, { evidenceNeeded: items })
    }
    placeholder="Evidence needed..."
    disabled={disabled}
  />
</div>
```

- [ ] **Step 4: AiOriginalDrawer.tsx — remove evidence rendering**

Delete lines 123-137:
```tsx
{section.evidenceNeeded.length > 0 && (
  <div>
    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
      Evidence Needed
    </p>
    {section.evidenceNeeded.map((ev, j) => (
      <p key={j} className="text-[13px] text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/40 mb-1">
        {ev}
      </p>
    ))}
  </div>
)}
```

- [ ] **Step 5: OutlineBuilder.tsx — remove from handleInsertSection**

Line 102, delete:
```typescript
evidenceNeeded: [],
```

- [ ] **Step 6: Build check**

```bash
cd frontend && npm run build
```

Fix any TypeScript errors from the removal.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/OutlineBuilder/
git commit -m "refactor(outline-ui): remove Evidence needed column from outline editor"
```

---

### Task 5: Update CLAUDE.md prompt mapping table

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update prompt ↔ agent mapping table**

In `CLAUDE.md`, update the mapping table to reflect new versions:

```markdown
| `agents/storyboard_director.py` | `prompts/storyboard_director_prompt_v0323.md` |
| `agents/evidence_researcher.py` | `prompts/evidence_researcher_prompt_v0323.md` |
| `agents/storyboard_writer.py` | `prompts/storyboard_writer_prompt_v0323.md` |
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update prompt version mapping in CLAUDE.md"
```
