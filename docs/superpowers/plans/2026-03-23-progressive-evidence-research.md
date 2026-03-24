# Progressive Evidence Research — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display evidence research results progressively as each section completes, instead of waiting for all sections to finish.

**Architecture:** Frontend fires N parallel requests (one per outline section) to a new stateless `/research-section` endpoint. Each response appends one section's research to the UI. The existing single-call `research()` method stays as fallback.

**Tech Stack:** FastAPI (backend endpoint), React + TypeScript (frontend), existing `EvidenceResearcher` agent with OpenAI LLM calls.

**Spec:** `docs/superpowers/specs/2026-03-23-progressive-evidence-research.md`

---

### Task 1: Backend — Add `research_section()` method to EvidenceResearcher

**Files:**
- Modify: `backend/app/services/agents/evidence_researcher.py`

- [ ] **Step 1: Add `research_section()` method**

Add below the existing `research()` method (after line 118):

```python
def research_section(
    self,
    section_text: str,
    full_outline: str,
    story_brief: dict,
    project_id: str = None,
) -> dict:
    """
    Research a single section from the outline.

    Sends the full outline for cross-section context awareness,
    but instructs the LLM to research ONLY the specified section.

    Args:
        section_text: The single section's plain text (e.g., "Section 1 — Hook\n\nPurpose\n...")
        full_outline: The complete outline text (all sections) for context
        story_brief: Story brief dict with fields
        project_id: Optional project ID for RAG retrieval

    Returns:
        A single SectionResearch dict:
        {
            "section_title": "...",
            "evidence_items": [
                {
                    "evidence_needed": "...",
                    "research_blocks": [...]
                }
            ]
        }
    """
    if not section_text or not section_text.strip():
        return {"section_title": "", "evidence_items": []}

    viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome")
    target_audience = self._extract_brief_field(story_brief, "target_audience")

    rag_context = self._get_rag_context(full_outline, project_id)

    rag_section = ""
    if rag_context:
        rag_section = f"""
## USER-PROVIDED REFERENCE MATERIALS
The following excerpts are from documents uploaded by the user. Prioritize information from these sources when relevant, and cite them as "User-provided: [source name]".

{rag_context}
"""

    prompt = f"""Here is the full video outline for context:

## VIDEO CONTEXT
Viewer outcome: {viewer_outcome}
Target audience: {target_audience}
{rag_section}
## FULL OUTLINE (for context only)
{full_outline}

## RESEARCH TASK
Research ONLY the following section. Do NOT research other sections.

{section_text}

Return a JSON object with this exact structure:
{{
  "section_title": "the section title",
  "evidence_items": [
    {{
      "evidence_needed": "what evidence is needed",
      "research_blocks": [
        {{
          "research_question": "specific research question",
          "storyboard_usable_phrasing": ["ready-to-use phrasing 1", "ready-to-use phrasing 2"],
          "full_answer": "detailed answer",
          "sources": ["source 1"],
          "confidence": "high|medium|low"
        }}
      ]
    }}
  ]
}}"""

    response = self.call_llm(prompt, max_tokens=2000, temperature=0.4)
    parsed = self._extract_json(response)

    if not parsed or not isinstance(parsed, dict):
        return {"section_title": "", "evidence_items": []}

    return {
        "section_title": parsed.get("section_title", ""),
        "evidence_items": parsed.get("evidence_items", []),
    }
```

- [ ] **Step 2: Verify backend starts**

Run: `cd backend && source venv/bin/activate && python -c "from app.services.agents import EvidenceResearcher; r = EvidenceResearcher(); print('research_section' in dir(r))"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/agents/evidence_researcher.py
git commit -m "feat(backend): add research_section() method for per-section evidence research"
```

---

### Task 2: Backend — Add `/research-section` endpoint

**Files:**
- Modify: `backend/app/main.py`

- [ ] **Step 1: Add the endpoint**

Add the new endpoint right after the existing `rerun_evidence_research` function (after line 620 in `main.py`). Follow the same pattern as `rerun-research`:

```python
@app.post("/api/project/{project_id}/research-section")
async def research_single_section(project_id: str, request: Request):
    """
    Research a single outline section. Stateless — no state machine transition.
    Frontend calls this N times in parallel (one per section) for progressive display.
    """
    from app.services.state import StateManager
    from app.services.agents import EvidenceResearcher

    body = await request.json()

    section_text = body.get("section_text", "")
    full_outline = body.get("full_outline", "")
    section_index = body.get("section_index", 0)

    if not section_text or not section_text.strip():
        raise HTTPException(status_code=400, detail="section_text is required")

    if not full_outline or not full_outline.strip():
        raise HTTPException(status_code=400, detail="full_outline is required")

    # Load state for story_brief and project_id (read-only, no state mutation)
    manager = StateManager(project_id)
    state = manager.load()

    researcher = EvidenceResearcher()
    section_research = researcher.research_section(
        section_text=section_text,
        full_outline=full_outline,
        story_brief=state.story_brief or {},
        project_id=state.project_id,
    )

    return {
        "success": True,
        "section_index": section_index,
        "section_research": section_research,
    }
```

- [ ] **Step 2: Verify endpoint is registered**

Run: `cd backend && source venv/bin/activate && python -c "from app.main import app; routes = [r.path for r in app.routes]; print('/api/project/{project_id}/research-section' in routes)"`
Expected: `True`

- [ ] **Step 3: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): add /research-section endpoint for per-section progressive research"
```

---

### Task 3: Frontend — Progressive parallel fetch in StageContent.tsx

**Files:**
- Modify: `frontend/src/components/StageContent.tsx`
- Modify: `frontend/src/components/OutlineBuilder/types.ts`

This task replaces `handleRunResearch` with `handleRunResearchProgressive`. The key change: instead of one call that returns all sections at once, fire N parallel calls and append each section's result as it arrives.

- [ ] **Step 1: Add `researchProgress` state and `sectionCount` to OutlineBuilderProps**

In `frontend/src/components/OutlineBuilder/types.ts`, add to `OutlineBuilderProps`:

```typescript
researchProgress?: { completed: number; total: number } | null;
```

The full prop should now read:

```typescript
export interface OutlineBuilderProps {
  content: string;
  aiContent?: string | null;
  onChange: (content: string) => void;
  onRunResearch: () => void;
  onRerunResearch?: () => Promise<void>;
  onContinue: (filteredEvidence?: EvidenceResearch | null) => void | Promise<void>;
  onRegenerateSection?: (sectionNumber: number, instruction: string) => Promise<void>;
  onRefineOutline?: (instruction: string) => Promise<void>;
  isResearching?: boolean;
  isRegenerating?: boolean;
  researchResults?: EvidenceResearch | null;
  researchProgress?: { completed: number; total: number } | null;
}
```

- [ ] **Step 2: Replace `handleRunResearch` in StageContent.tsx**

Find the existing `handleRunResearch` (around line 617) and replace it with the progressive version. The function:

1. Parses the outline text into sections using `parseOutline` + `serializeOutline` (to get each section's text block)
2. Initializes `outlineResearchResults` with `{ sections: [] }`
3. Adds a new state `researchProgress` to track `{ completed, total }`
4. Fires N parallel fetch calls via `Promise.allSettled`
5. As each resolves, inserts the result at the correct `section_index`
6. When all complete, sets `isResearchingEvidence = false`

Replace `handleRunResearch` with:

```typescript
const [researchProgress, setResearchProgress] = useState<{ completed: number; total: number } | null>(null);

const handleRunResearch = useCallback(async () => {
  if (!projectId || !currentOutlineText.trim()) return;

  // Parse outline into individual section texts
  const { parseOutline, serializeOutline } = await import("./OutlineBuilder/outlineParser");
  const sections = parseOutline(currentOutlineText);

  if (sections.length === 0) return;

  setIsResearchingEvidence(true);
  setOutlineResearchResults({ sections: [] });
  setResearchProgress({ completed: 0, total: sections.length });
  onAnchorChange?.("evidence");
  setTimeout(() => {
    document.getElementById("evidence")?.scrollIntoView({ behavior: "smooth" });
  }, 100);

  // Track results in a local array (state updates are batched)
  const results: Array<SectionResearch | null> = new Array(sections.length).fill(null);
  let completedCount = 0;

  const promises = sections.map(async (section, index) => {
    // Serialize just this section back to text for the backend
    const sectionText = serializeOutline([section]);

    try {
      const response = await fetch(`/api/project/${projectId}/research-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_text: sectionText,
          full_outline: currentOutlineText,
          section_index: index,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        results[index] = data.section_research;
      }
    } catch (err) {
      console.error(`[Outline] Research failed for section ${index}:`, err);
    }

    // Update UI after each section completes
    completedCount++;
    const currentSections = results.filter((r): r is SectionResearch => r !== null);
    // Build the full array preserving order (nulls for incomplete sections are excluded)
    const orderedSections: SectionResearch[] = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        orderedSections.push(results[i]!);
      }
    }
    setOutlineResearchResults({ sections: orderedSections });
    setResearchProgress({ completed: completedCount, total: sections.length });
  });

  await Promise.allSettled(promises);

  setIsResearchingEvidence(false);
  setResearchProgress(null);
}, [projectId, currentOutlineText, onAnchorChange]);
```

Note: The import of `SectionResearch` type is needed. Check if it's already imported in StageContent.tsx. If not, add:
```typescript
import type { SectionResearch } from "./OutlineBuilder/types";
```

- [ ] **Step 3: Pass `researchProgress` to OutlineBuilder**

Find where `OutlineBuilder` is rendered in StageContent.tsx and add the new prop:

```tsx
researchProgress={researchProgress}
```

- [ ] **Step 4: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StageContent.tsx frontend/src/components/OutlineBuilder/types.ts
git commit -m "feat(frontend): progressive parallel evidence research with per-section fetch calls"
```

---

### Task 4: Frontend — Progressive loading indicator in OutlineBuilder.tsx

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

Replace the single "Researching evidence across sections..." spinner with a progress counter that updates as sections complete. Sections that have resolved render normally below the progress indicator.

- [ ] **Step 1: Accept `researchProgress` prop**

In `OutlineBuilder.tsx`, destructure the new prop from `OutlineBuilderProps`:

```tsx
const {
  // ...existing props
  researchProgress,
} = props;
```

- [ ] **Step 2: Replace the loading spinner with progressive display**

Find the evidence research container content (around line 330-346). Replace:

```tsx
{isResearching ? (
  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
    <Loader2 className="w-4 h-4 animate-spin" />
    <span className="text-sm">Researching evidence across sections...</span>
  </div>
) : (
  researchResults?.sections.map((sectionRes, i) => (
    <SectionResearchCard
      key={i}
      sectionRes={sectionRes}
      sectionIndex={i}
      deletedSnippets={deletedSnippets}
      onToggleSnippet={toggleSnippet}
    />
  ))
)}
```

With:

```tsx
<>
  {/* Render completed sections as they arrive */}
  {researchResults?.sections.map((sectionRes, i) => (
    <SectionResearchCard
      key={i}
      sectionRes={sectionRes}
      sectionIndex={i}
      deletedSnippets={deletedSnippets}
      onToggleSnippet={toggleSnippet}
    />
  ))}
  {/* Progress indicator while researching */}
  {isResearching && (
    <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span className="text-sm">
        {researchProgress
          ? `${researchProgress.completed} of ${researchProgress.total} sections researched...`
          : "Researching evidence across sections..."}
      </span>
    </div>
  )}
</>
```

This renders already-completed sections above the progress spinner. As each call resolves, the section appears and the counter updates.

- [ ] **Step 3: Update `hasResearch` condition**

The evidence container is gated by `hasResearch || isResearching` (line 310). `hasResearch` should also be true when we have partial results:

Check the current `hasResearch` definition. It likely checks `researchResults?.sections.length > 0`. This already works because we initialize with `{ sections: [] }` and append — once the first section resolves, `sections.length > 0` becomes true. But we also need the container visible while `isResearching` is true with zero sections yet (the `|| isResearching` already handles this). No change needed.

- [ ] **Step 4: Verify build passes**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx
git commit -m "feat(frontend): progressive section-by-section evidence display with count indicator"
```
