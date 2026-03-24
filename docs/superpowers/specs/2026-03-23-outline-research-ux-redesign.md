# Outline + Evidence Research UX Redesign

**Date:** 2026-03-23
**Status:** Approved

## Summary

Redesign the Outline Builder stage to add regeneration controls (section-level and outline-level), a framed container layout, confidence-first evidence research display, and deletable evidence snippets.

## Context

The outline stage lacked any AI regeneration feedback loop. Users could only manually edit inline or go back to the brief. Evidence research displayed flat checkmarks with no priority signal, and "evidence needed" items were shown in the outline despite being removed from the Director prompt (v0323+).

## Design Decisions

### 1. Container Layout

Both the outline and evidence research sections are wrapped in bordered container boxes (`border: 1px solid var(--border); border-radius: 10px`). Each container has a header row with a title and action button.

- **Outline container header:** "VIDEO OUTLINE" label + sparkle button (right-aligned)
- **Evidence container header:** "EVIDENCE RESEARCH" label + "Re-run Research" button (right-aligned)

The header uses the **same grid** as the section rows (`grid-template-columns: 28px 40px 1fr 32px; gap: 0 8px`) to guarantee vertical alignment between the header sparkle and section sparkles. The label spans columns 1–3 (`grid-column: 1 / 4`), and the sparkle sits in column 4 with `justify-self: center`.

### 2. Section Row Grid (4 columns)

```
| drag-handle (28px) | section-num (40px) | content (1fr) | actions (32px) |
```

The previous 5-column grid with a 32% "evidence needed" column is removed. Director v0323+ no longer outputs `evidenceNeeded` per section — the Evidence Researcher derives evidence items independently from talking points.

### 3. Section Actions Column

This replaces the current `MoreHorizontal` dropdown menu in `SectionRow.tsx`. The dropdown and its trigger should be removed entirely.

The actions column (32px, grid column 4) stacks two buttons vertically:

1. **Remove button (x)** — top, 28x28, hidden by default, appears on row hover at 0.35 opacity. Hover: red text + red background tint.
2. **Sparkle button** — bottom, 28x28, always visible. Hover: subtle gray background. Click: opens regen popover inline below the section content.

Both buttons have identical dimensions (28x28) and border-radius (6px) for consistent hover backgrounds.

### 4. Regeneration Popover (Claude Chat style)

Triggered by clicking any sparkle button (outline-level or section-level). Appears inline, not as a floating tooltip.

**Structure:**
- Header: "Regenerate entire outline" / "Regenerate this section" + close button
- Option 1: Numbered option "Regenerate directly" (click to regen without feedback)
- Footer: Pencil icon + text input ("Regenerate with my feedback") + "Confirm" button

**Behavior:**
- Hidden by default — only appears on sparkle click
- Close via x button or clicking sparkle again (toggle)
- "Regenerate directly" sends a default instruction: `"Regenerate with a fresh approach"` (backend handlers must accept this; update `_handle_regenerate_section` and `_handle_refine_outline` to use a default if instruction is empty)
- "Confirm" sends the text input as instruction to the backend regen endpoint
- The popover appears inside the content column (column 3), below the section's talking points, pushing subsequent rows down. This replaces the existing inline regen input in `SectionRow.tsx`. For the outline-level popover, it appears inside the container body below the header.

### 5. Evidence Research — Confidence-First Display

Evidence items are grouped per section (collapsible). Each research block uses **confidence level as the primary visual hierarchy:**

- **High confidence:** Green left border accent (`3px solid #3A6B47`) + green "HIGH" badge (text: `#3A6B47`, bg: `rgba(58,107,71,0.1)`)
- **Medium confidence:** Amber left border accent (`3px solid #B8960C`) + amber "MEDIUM" badge (text: `#7A5C1E`, bg: `rgba(184,150,12,0.1)`)
- **Low confidence:** Red left border accent (`3px solid #A63228`) + red "LOW" badge (text: `#A63228`, bg: `rgba(166,50,40,0.1)`)

Research block layout:
```
[colored left accent border]
  Research question (muted, small)          [CONFIDENCE badge]
  - Snippet line with citation [1]                         x
  - Snippet line with citation [2]                         x
  > Sources: [1] Author, Title, Year (expandable)
```

### 6. Deletable Evidence Snippets

Each `storyboard_usable_phrasing` line is a clickable row:
- **Click:** Toggles strikethrough + reduced opacity (0.4)
- **Hover:** Shows x button on the right (muted, turns red on hover)
- Struck-through snippets are excluded when passing evidence to the storyboard writer

**State management:** Deletion state is tracked in frontend component state as `deletedSnippets: Map<string, Set<number>>` keyed by `"sectionIndex-evidenceIndex-blockIndex"` → set of struck phrase indices. When the user clicks "Continue to Storyboard Draft," the frontend filters out struck snippets and sends the filtered `evidence_research` payload with the approve event body, so the backend writer receives only the kept snippets. This follows the data ownership pattern: after user edits, the frontend is the owner.

### 7. UX Copy

Positioned outside the container box, between the page-level stage description and the outline container border:
> "Review each section before moving on. What you confirm here shapes everything the researcher and writer produce downstream."

### 8. Outline-Level Actions Removed from Evidence Column

The "evidence needed" field no longer appears in the outline grid. Evidence items are researcher-derived and displayed only in the Evidence Research container.

## Data Flow

### Section-Level Regeneration
```
User clicks section sparkle → popover appears → user picks "Regenerate directly" or types feedback + "Confirm"
→ POST /api/project/{id}/event { event: "regenerate_section", section_number, instruction, current_outline }
→ Director.regenerate_section() → returns new section text
→ Frontend replaces that section in the outline
```

### Outline-Level Regeneration
```
User clicks header sparkle → popover appears → same options
→ POST /api/project/{id}/event { event: "refine_outline", instruction, current_outline }
→ Director.refine_outline() → returns full new outline
→ Frontend replaces entire outline
```

### Re-run Research
```
User clicks "Re-run Research" in evidence container header
→ POST /api/project/{id}/rerun-research { current_outline }
→ EvidenceResearcher.research() with user's edited outline (not stale backend copy)
→ Frontend replaces evidence research results
```

### Stale Research After Outline Regeneration

Research results are not automatically cleared after outline regeneration. The user must manually click "Re-run Research" to update. No warning is shown — this is intentional to keep the UI simple. The user controls when to re-run.

## Files to Modify

| File | Change |
|------|--------|
| `backend/app/services/agents/storyboard_director.py` | Add `regenerate_section()` and `refine_outline()` methods |
| `backend/app/services/orchestrator.py` | Add event handlers for `regenerate_section` and `refine_outline` |
| `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` | Container layout, regen popovers, confidence-first evidence, deletable snippets |
| `frontend/src/components/OutlineBuilder/SectionRow.tsx` | Replace `MoreHorizontal` dropdown with actions column (sparkle + ×), 4-column grid |
| `frontend/src/components/OutlineBuilder/OutlineGrid.tsx` | Pass `onRegenerateSection` popover behavior to SectionRow |
| `frontend/src/components/OutlineBuilder/types.ts` | Already updated — `evidenceNeeded` is optional/legacy |
| `frontend/src/components/StageContent.tsx` | Wire new regen events; already sends `current_outline` for rerun-research |

## Preview

Interactive HTML preview: `frontend/preview-outline-ux-redesign.html`
Serve via `python3 -m http.server 8090` from repo root.
