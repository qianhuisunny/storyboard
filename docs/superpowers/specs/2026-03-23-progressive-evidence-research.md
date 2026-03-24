# Progressive Evidence Research — Section-by-Section Display

**Date:** 2026-03-23
**Status:** Approved

## Summary

Display evidence research results progressively as each section completes, instead of waiting for all sections to finish. Frontend fires N parallel requests (one per outline section), each returns one section's research. Sections appear in the UI as each call resolves.

## Context

The current evidence researcher makes one LLM call with the full outline and returns all sections' research at once. For a 5-section outline, the user sees a loading spinner for 30-60 seconds, then everything appears. Progressive display gives faster perceived feedback.

**Decision:** Parallel calls (not sequential) for demo speed. This trades cross-section source consolidation for faster display. See `memory/feedback_parallel_research.md` for rationale and future reconsideration.

## Design

### Backend: New `research_section()` Method

**File:** `backend/app/services/agents/evidence_researcher.py`

Add a method that researches a single section:

```python
def research_section(self, section_text: str, full_outline: str, story_brief: dict, project_id: str = None) -> dict:
```

- **Context sent:** Full outline (for cross-section awareness) + the specific section to research
- **Prompt:** "Here is the full video outline for context. Research ONLY the following section: {section_text}"
- **Returns:** A single `SectionResearch` dict: `{"section_title": "...", "evidence_items": [...]}`
- **Parameters:** `max_tokens: 2000`, `temperature: 0.4` (same temp as current)
- **RAG:** Same `_get_rag_context()` call using outline text for retrieval

The existing `research()` method stays unchanged as a fallback.

### Backend: New Endpoint

**File:** `backend/app/main.py`

```
POST /api/project/{project_id}/research-section
Body: {
  "section_text": "Section 1 — Title\n\nPurpose\n...",
  "full_outline": "Section 1 — ...\n\nSection 2 — ...",
  "section_index": 0
}
Returns: {
  "success": true,
  "section_index": 0,
  "section_research": { "section_title": "...", "evidence_items": [...] }
}
```

No orchestrator involvement — direct call to `EvidenceResearcher.research_section()`. No state machine transition. The endpoint is stateless: it takes input, calls the LLM, returns output.

After all sections complete, the frontend calls the existing stages auto-save to persist the combined results.

### Frontend: Parallel Fetch + Progressive Append

**File:** `frontend/src/components/StageContent.tsx`

New `handleRunResearchProgressive` replaces (or wraps) `handleRunResearch`:

1. Parse outline into sections using `parseOutline(currentOutlineText)`
2. Initialize `outlineResearchResults` with empty `{ sections: [] }`
3. Set `isResearchingEvidence = true`
4. Fire N parallel `fetch("/api/project/{id}/research-section")` calls — one per section
5. As each resolves, insert into `outlineResearchResults.sections[section_index]`
6. When all N complete (via `Promise.allSettled`), set `isResearchingEvidence = false`
7. Save combined results via existing auto-save

**File:** `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

Minimal changes:
- Already renders `researchResults?.sections.map(...)` — sections appear as array grows
- Replace the single "Researching evidence..." spinner with per-section awareness: show "Researching N sections..." with a count that updates as sections complete (e.g., "2 of 5 sections researched")
- Sections that have resolved render normally with confidence display + deletable snippets

### What Stays the Same

- `EvidenceResearch`, `SectionResearch`, `ResearchBlock` types — unchanged
- System prompt `evidence_researcher_prompt_v0323.md` — unchanged (section-level prompt uses same system prompt)
- Deletable snippets, confidence display, filtered evidence on approve — unchanged
- Existing `research()` method and `run_research` orchestrator flow — kept as fallback
- `rerun-research` endpoint — could later be updated to use progressive flow, but stays as-is for now

## Files to Modify

| File | Change |
|------|--------|
| `backend/app/services/agents/evidence_researcher.py` | Add `research_section()` method |
| `backend/app/main.py` | Add `POST /research-section` endpoint |
| `frontend/src/components/StageContent.tsx` | New `handleRunResearchProgressive`, parallel fetch logic |
| `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` | Progressive loading indicator (count of completed sections) |
