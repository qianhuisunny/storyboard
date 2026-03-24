# Outline + Evidence Research UX Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Outline Builder stage with bordered containers, sparkle regen popovers, confidence-first evidence display, and deletable evidence snippets.

**Architecture:** Frontend-only implementation. Backend (Director regen methods, orchestrator event handlers, state machine transitions) is already complete. All changes are in React components under `frontend/src/components/OutlineBuilder/` plus minor wiring in `StageContent.tsx`.

**Tech Stack:** React, TypeScript, Tailwind CSS, @dnd-kit (existing drag-and-drop), Lucide icons

**Spec:** `docs/superpowers/specs/2026-03-23-outline-research-ux-redesign.md`

**Visual reference:** `frontend/preview-outline-ux-redesign.html` (serve at port 8090 from repo root)

---

## File Structure

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `frontend/src/components/OutlineBuilder/RegenPopover.tsx` | Create: Claude Chat-style regen popover component | New |
| `frontend/src/components/OutlineBuilder/SectionRow.tsx` | Replace MoreHorizontal dropdown with actions column (× + sparkle) + 4-column grid | Modify |
| `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` | Container layout, outline-level sparkle popover, confidence-first evidence, deletable snippets | Modify |
| `frontend/src/components/OutlineBuilder/OutlineGrid.tsx` | No changes needed — already passes `onRegenerateSection` to SectionRow | Unchanged |
| `frontend/src/components/StageContent.tsx` | Send filtered evidence with approve event | Modify |

---

### Task 1: Create RegenPopover Component

Extract the Claude Chat-style regen popover into a reusable component used by both the outline-level header sparkle and section-level sparkles.

**Files:**
- Create: `frontend/src/components/OutlineBuilder/RegenPopover.tsx`

- [ ] **Step 1: Create RegenPopover component**

```tsx
// frontend/src/components/OutlineBuilder/RegenPopover.tsx
import { useState } from "react";
import { X, Pencil } from "lucide-react";

interface RegenPopoverProps {
  title: string;                          // "Regenerate entire outline" | "Regenerate this section"
  onRegenerate: (instruction: string) => void;
  onClose: () => void;
  isRegenerating?: boolean;
}

export function RegenPopover({ title, onRegenerate, onClose, isRegenerating }: RegenPopoverProps) {
  const [feedback, setFeedback] = useState("");

  const handleDirectRegen = () => {
    onRegenerate("Regenerate with a fresh approach");
  };

  const handleFeedbackRegen = () => {
    if (feedback.trim()) {
      onRegenerate(feedback.trim());
    }
  };

  return (
    <div className="mt-3 border border-border rounded-xl bg-background shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-sm font-medium">{title}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Option 1: Regenerate directly */}
      <div className="px-2">
        <button
          onClick={handleDirectRegen}
          disabled={isRegenerating}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors disabled:opacity-50"
        >
          <span className="w-7 h-7 flex items-center justify-center bg-muted/50 rounded-lg text-xs font-medium text-muted-foreground">1</span>
          <span className="text-sm">Regenerate directly</span>
        </button>
      </div>

      {/* Footer: feedback input */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-border/50 mx-2">
        <div className="w-7 h-7 flex items-center justify-center bg-muted/50 rounded-lg shrink-0">
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && feedback.trim()) handleFeedbackRegen();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Regenerate with my feedback"
          className="flex-1 border-none outline-none text-sm bg-transparent placeholder:text-muted-foreground/35"
          disabled={isRegenerating}
        />
        <button
          onClick={handleFeedbackRegen}
          disabled={!feedback.trim() || isRegenerating}
          className="px-3.5 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/30 disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS (component is not imported anywhere yet, but should compile)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OutlineBuilder/RegenPopover.tsx
git commit -m "feat(outline): add RegenPopover component (Claude Chat style)"
```

---

### Task 2: Redesign SectionRow — Actions Column + Sparkle

Replace the `MoreHorizontal` dropdown with a 4-column grid layout, stacked × and sparkle buttons in column 4, and inline RegenPopover.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/SectionRow.tsx`

**Reference:** Preview HTML Section 1 & 2 — actions column with × on top, sparkle below

- [ ] **Step 1: Read current SectionRow.tsx**

Read the full file to understand current structure before editing.

- [ ] **Step 2: Replace grid layout from 3-column to 4-column**

Change the grid class on the section row wrapper (line ~167):

Old: `grid grid-cols-[32px_56px_1fr]`
New: `grid grid-cols-[28px_40px_1fr_32px]`

Also update column sizing:
- Drag handle column: 32px → 28px
- Section number column: 56px → 40px (number text size stays same)
- Content column: 1fr (unchanged)
- Actions column: 32px (new)

- [ ] **Step 3: Remove MoreHorizontal dropdown**

Delete the entire MoreHorizontal button + dropdown menu (lines ~208-254). This includes:
- The `MoreHorizontal` icon import
- The `showMenu` / `setShowMenu` state
- The menu trigger button
- The fixed backdrop overlay
- The dropdown menu with "Regen with note" and "Remove section" items

- [ ] **Step 4: Remove existing inline regen input**

Delete the existing regen input section (lines ~283-325). This includes:
- The `showRegenInput` / `setShowRegenInput` state
- The `regenInstruction` / `setRegenInstruction` state
- The `regenError` / `setRegenError` state
- The entire inline regen form div

- [ ] **Step 5: Update imports**

Add new imports, remove old ones:

```tsx
// ADD:
import { X, Sparkles } from "lucide-react";
import { RegenPopover } from "./RegenPopover";

// REMOVE: MoreHorizontal, Send (no longer used after dropdown removal)
```

Add state for popover visibility (replace the deleted `showMenu`, `showRegenInput`, `regenInstruction`, `regenError` states):
```tsx
const [showRegenPopover, setShowRegenPopover] = useState(false);
```

- [ ] **Step 6: Add actions column (grid column 4)**

After the content `<div>` (column 3), add the actions column:

```tsx
{/* Column 4: Actions */}
<div className="flex flex-col items-center gap-0.5">
  {/* Remove button — hidden, shows on row hover */}
  {!disabled && onRemove && (
    <button
      onClick={() => onRemove(section.id)}
      className="w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-35 hover:!opacity-100 hover:text-destructive hover:bg-destructive/5 transition-all text-muted-foreground"
      title="Remove section"
    >
      <X className="w-4 h-4" />
    </button>
  )}
  {/* Sparkle regen button — always visible */}
  {!disabled && onRegenerate && (
    <button
      onClick={() => setShowRegenPopover((v) => !v)}
      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
      title="Regenerate this section"
    >
      <Sparkles className="w-[15px] h-[15px]" />
    </button>
  )}
</div>
```

- [ ] **Step 7: Add RegenPopover inside content column**

At the bottom of the content div (column 3), after talking points, add the popover:

```tsx
{/* Regen popover — inside content column, pushes rows down */}
{showRegenPopover && (
  <RegenPopover
    title="Regenerate this section"
    onRegenerate={(instruction) => {
      onRegenerate(section.sectionNumber, instruction);
      setShowRegenPopover(false);
    }}
    onClose={() => setShowRegenPopover(false)}
    isRegenerating={isRegenerating}
  />
)}
```

- [ ] **Step 8: Clean up unused imports and state**

Remove from imports: `MoreHorizontal`, `Send` (no longer needed after dropdown + old regen input removal).

Remove state variables: `showMenu`/`setShowMenu`, `showRegenInput`/`setShowRegenInput`, `regenInstruction`/`setRegenInstruction`, `regenError`/`setRegenError`.

The build **will fail** if any of these remain as unused locals (`noUnusedLocals: true` in tsconfig).

- [ ] **Step 9: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/OutlineBuilder/SectionRow.tsx
git commit -m "feat(outline): replace dropdown with actions column (× + sparkle + popover)"
```

---

### Task 3: Container Layout + Outline-Level Sparkle

Wrap the outline and evidence research in bordered container boxes. Add outline-level sparkle in the container header with the same grid as section rows for alignment.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

**Reference:** Preview HTML — container-box, container-header with grid alignment

- [ ] **Step 1: Read current OutlineBuilder.tsx**

Read the full file.

- [ ] **Step 2: Add sparkle import and outline-level popover state**

```tsx
import { Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { RegenPopover } from "./RegenPopover";

// Inside component:
const [showOutlineRegenPopover, setShowOutlineRegenPopover] = useState(false);
```

- [ ] **Step 3: Add UX copy above the outline container**

Between the existing header/description and the outline grid, add:

```tsx
<p className="text-sm text-muted-foreground leading-relaxed mb-5">
  Review each section before moving on. What you confirm here shapes everything the researcher and writer produce downstream.
</p>
```

- [ ] **Step 4: Wrap outline grid in bordered container**

Replace the current bare `<OutlineGrid>` wrapper with a bordered container:

```tsx
{/* Outline container */}
<div className="border border-border rounded-[10px] mb-6">
  {/* Header — same grid as section rows for sparkle alignment */}
  <div className="grid grid-cols-[28px_40px_1fr_32px] gap-x-2 items-center px-5 py-3 border-b border-border">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridColumn: "1 / 4" }}>
      Video Outline
    </h3>
    {onRefineOutline && (
      <button
        onClick={() => setShowOutlineRegenPopover((v) => !v)}
        className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all justify-self-center"
        title="Regenerate entire outline"
      >
        <Sparkles className="w-[15px] h-[15px]" />
      </button>
    )}
  </div>

  {/* Outline-level regen popover */}
  {showOutlineRegenPopover && (
    <div className="mx-5 my-3">
      <RegenPopover
        title="Regenerate entire outline"
        onRegenerate={(instruction) => {
          handleRefineOutline(instruction);
          setShowOutlineRegenPopover(false);
        }}
        onClose={() => setShowOutlineRegenPopover(false)}
        isRegenerating={isRefiningOutline}
      />
    </div>
  )}

  {/* Grid content */}
  <div className="px-5">
    <OutlineGrid ... />
  </div>
</div>
```

- [ ] **Step 5: Remove the old outline-level regen text input**

Delete ALL of these (search by name, not line number — lines will have shifted):
- State: `outlineRegenInstruction` / `setOutlineRegenInstruction`
- State: `outlineRegenError` / `setOutlineRegenError`
- The JSX text input + "Regen Outline" button block (search for `outlineRegenInstruction`)
- The JSX error display for `outlineRegenError`
- Unused imports: `ChevronDown`, `ChevronRight` (now replaced by text characters in Task 4's rewritten research cards)

Update `handleRefineOutline` to accept an instruction parameter directly instead of reading from state:

```tsx
const handleRefineOutline = useCallback(async (instruction: string) => {
  if (!onRefineOutline || !instruction.trim()) return;
  setIsRefiningOutline(true);
  try {
    await onRefineOutline(instruction.trim());
  } finally {
    setIsRefiningOutline(false);
  }
}, [onRefineOutline]);
```

- [ ] **Step 6: Wrap evidence research in bordered container**

Replace the current evidence research section with a container:

```tsx
{/* Evidence Research container */}
{(hasResearch || isResearching) && (
  <div className="border border-border rounded-[10px]" id="evidence">
    {/* Header */}
    <div className="flex items-center justify-between px-5 py-3 border-b border-border">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Evidence Research
      </h3>
      {onRerunResearch && hasResearch && (
        <button
          onClick={handleRerunResearch}
          disabled={isRerunningResearch}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRerunningResearch ? "animate-spin" : ""}`} />
          Re-run Research
        </button>
      )}
    </div>

    {/* Research content */}
    <div className="px-5">
      {isResearching ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Researching evidence across sections...</span>
        </div>
      ) : (
        researchResults?.sections.map((sectionRes, idx) => (
          <SectionResearchCard key={idx} ... />
        ))
      )}
    </div>
  </div>
)}
```

- [ ] **Step 7: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx
git commit -m "feat(outline): add bordered containers + outline-level sparkle popover"
```

---

### Task 4: Confidence-First Evidence Research Display

Redesign `SectionResearchCard` and `ResearchBlockCard` inline components to use confidence as the primary visual hierarchy with colored left border accents and badges.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

**Reference:** Preview HTML — `.res-block-v2` with confidence accents

- [ ] **Step 1: Read the current SectionResearchCard and ResearchBlockCard**

These are inline components inside `OutlineBuilder.tsx`. Read the current rendering logic.

- [ ] **Step 2: Delete old inline components that will be replaced**

Delete these function components from OutlineBuilder.tsx (they become dead code, and `noUnusedLocals: true` will break the build):
- `EvidenceItemCard` (search for `function EvidenceItemCard`)
- `TalkingPointCard` (search for `function TalkingPointCard`)
- The old `ResearchBlockCard` (will be replaced with the new version below)
- The old `SectionResearchCard` (will be replaced below)

Also remove any imports only used by these deleted components (e.g., `Check` icon if only used in old `ResearchBlockCard` — check if `Check` is used in the footer button first; if yes, keep it).

- [ ] **Step 3: Add confidence color mapping** (inside OutlineBuilder.tsx, above the component function or as a module-level const)

```tsx
const CONFIDENCE_STYLES = {
  high: {
    border: "#3A6B47",
    badgeBg: "rgba(58,107,71,0.1)",
    badgeText: "#3A6B47",
  },
  medium: {
    border: "#B8960C",
    badgeBg: "rgba(184,150,12,0.1)",
    badgeText: "#7A5C1E",
  },
  low: {
    border: "#A63228",
    badgeBg: "rgba(166,50,40,0.1)",
    badgeText: "#A63228",
  },
} as const;
```

- [ ] **Step 4: Rewrite ResearchBlockCard with confidence-first layout**

Replace the existing `ResearchBlockCard` component. Each block gets:
- Colored left border accent (3px) based on confidence
- Header row: research question (muted, small) + confidence badge (right-aligned)
- Snippet lines (will add deletion in Task 5)
- Expandable sources toggle

```tsx
function ResearchBlockCard({ block }: { block: ResearchBlock }) {
  const [showDetails, setShowDetails] = useState(false);
  const style = CONFIDENCE_STYLES[block.confidence] || CONFIDENCE_STYLES.medium;

  return (
    <div
      className="py-2.5 px-3.5 mb-3 rounded-r-md last:mb-0"
      style={{ borderLeft: `3px solid ${style.border}`, background: "rgba(245,245,243,0.3)" }}
    >
      {/* Header: question + confidence badge */}
      <div className="flex items-center gap-2.5 mb-2">
        <span className="flex-1 text-xs text-muted-foreground">{block.research_question}</span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
          style={{ background: style.badgeBg, color: style.badgeText }}
        >
          {block.confidence}
        </span>
      </div>

      {/* Snippet lines */}
      {block.storyboard_usable_phrasing.map((line, i) => (
        <div key={i} className="text-sm leading-relaxed py-1">
          {line}
        </div>
      ))}

      {/* Expandable sources */}
      {block.sources.length > 0 && (
        <>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1 cursor-pointer"
          >
            <span>{showDetails ? "▾" : "▸"}</span>
            Sources: {block.sources[0]}
            {block.sources.length > 1 && ` (+${block.sources.length - 1})`}
          </button>
          {showDetails && (
            <div className="text-[11px] text-muted-foreground leading-relaxed pt-1 pl-3">
              {block.sources.map((s, i) => <div key={i}>{s}</div>)}
              {block.full_answer && (
                <div className="mt-2 italic">{block.full_answer}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Update SectionResearchCard to use borderless layout with dividers**

Replace the bordered card layout with:
- Section header with chevron + title + evidence count
- Collapsible content area
- Evidence items as labels, research blocks below each

```tsx
function SectionResearchCard({ sectionRes }: { sectionRes: SectionResearch }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const evidenceItems = sectionRes.evidence_items || [];
  const talkingPoints = sectionRes.talking_points || [];
  const itemCount = evidenceItems.length || talkingPoints.length;

  return (
    <div className="py-4 border-b border-border/50 last:border-b-0">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-muted-foreground text-xs">{isExpanded ? "▾" : "▸"}</span>
        <span className="text-sm font-semibold flex-1">{sectionRes.section_title}</span>
        <span className="text-xs text-muted-foreground">{itemCount} evidence items</span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="pl-6 mt-3">
          {/* v0317: evidence_items */}
          {evidenceItems.map((item, i) => (
            <div key={i}>
              <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{item.evidence_needed}</div>
              {item.research_blocks.map((block, j) => (
                <ResearchBlockCard key={j} block={block} />
              ))}
            </div>
          ))}
          {/* v0316 fallback: talking_points */}
          {!evidenceItems.length && talkingPoints.map((tp, i) => (
            <div key={i}>
              <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{tp.talking_point}</div>
              {tp.research_blocks.map((block, j) => (
                <ResearchBlockCard key={j} block={block} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx
git commit -m "feat(outline): confidence-first evidence research display with colored accents"
```

---

### Task 5: Deletable Evidence Snippets

Add click-to-strikethrough on evidence snippet lines with × delete button, and track deletion state for filtering before sending to writer.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

- [ ] **Step 1: Add deletedSnippets state to OutlineBuilder**

```tsx
// Key: "sectionIdx-evidenceIdx-blockIdx", Value: set of struck phrase indices
const [deletedSnippets, setDeletedSnippets] = useState<Record<string, Set<number>>>({});

const toggleSnippet = useCallback((key: string, phraseIdx: number) => {
  setDeletedSnippets((prev) => {
    const next = { ...prev };
    const set = new Set(next[key] || []);
    if (set.has(phraseIdx)) {
      set.delete(phraseIdx);
    } else {
      set.add(phraseIdx);
    }
    next[key] = set;
    return next;
  });
}, []);
```

- [ ] **Step 2: Add a helper to build filtered evidence for the writer**

```tsx
const getFilteredEvidence = useCallback((): EvidenceResearch | null => {
  if (!researchResults) return null;
  return {
    sections: researchResults.sections.map((sec, si) => ({
      ...sec,
      evidence_items: sec.evidence_items?.map((ei, ei_idx) => ({
        ...ei,
        research_blocks: ei.research_blocks.map((rb, bi) => {
          const key = `${si}-${ei_idx}-${bi}`;
          const struck = deletedSnippets[key];
          if (!struck || struck.size === 0) return rb;
          return {
            ...rb,
            storyboard_usable_phrasing: rb.storyboard_usable_phrasing.filter((_, pi) => !struck.has(pi)),
          };
        }),
      })),
      talking_points: sec.talking_points?.map((tp, tp_idx) => ({
        ...tp,
        research_blocks: tp.research_blocks.map((rb, bi) => {
          const key = `${si}-tp${tp_idx}-${bi}`;
          const struck = deletedSnippets[key];
          if (!struck || struck.size === 0) return rb;
          return {
            ...rb,
            storyboard_usable_phrasing: rb.storyboard_usable_phrasing.filter((_, pi) => !struck.has(pi)),
          };
        }),
      })),
    })),
  };
}, [researchResults, deletedSnippets]);
```

- [ ] **Step 3: Update ResearchBlockCard to accept deletion props**

Add props for deletion state and toggle callback. Update the snippet lines to be interactive:

```tsx
function ResearchBlockCard({
  block,
  blockKey,
  deletedIndices,
  onToggleSnippet,
}: {
  block: ResearchBlock;
  blockKey: string;
  deletedIndices?: Set<number>;
  onToggleSnippet?: (key: string, idx: number) => void;
}) {
  // ... (header + confidence badge stays same)

  {/* Snippet lines — clickable with strikethrough */}
  {block.storyboard_usable_phrasing.map((line, i) => {
    const isStruck = deletedIndices?.has(i) ?? false;
    return (
      <div
        key={i}
        onClick={() => onToggleSnippet?.(blockKey, i)}
        className={`group/snippet flex items-start gap-2 py-1 rounded cursor-pointer hover:bg-muted/30 transition-opacity ${
          isStruck ? "opacity-40" : ""
        }`}
      >
        <span className={`text-sm leading-relaxed flex-1 ${isStruck ? "line-through decoration-muted-foreground/35" : ""}`}>
          {line}
        </span>
        <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted-foreground opacity-0 group-hover/snippet:opacity-60 hover:!opacity-100 hover:text-destructive text-lg">
          &times;
        </span>
      </div>
    );
  })}
}
```

- [ ] **Step 4: Thread deletion props through SectionResearchCard**

Update `SectionResearchCard` to pass `blockKey`, `deletedIndices`, and `onToggleSnippet` down to each `ResearchBlockCard`:

```tsx
function SectionResearchCard({
  sectionRes,
  sectionIndex,
  deletedSnippets,
  onToggleSnippet,
}: {
  sectionRes: SectionResearch;
  sectionIndex: number;
  deletedSnippets: Record<string, Set<number>>;
  onToggleSnippet: (key: string, idx: number) => void;
}) {
  // ...

  {/* v0317: evidence_items */}
  {evidenceItems.map((item, ei) => (
    <div key={ei}>
      <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{item.evidence_needed}</div>
      {item.research_blocks.map((block, bi) => {
        const key = `${sectionIndex}-${ei}-${bi}`;
        return (
          <ResearchBlockCard
            key={bi}
            block={block}
            blockKey={key}
            deletedIndices={deletedSnippets[key]}
            onToggleSnippet={onToggleSnippet}
          />
        );
      })}
    </div>
  ))}

  {/* v0316 fallback: talking_points */}
  {!evidenceItems.length && talkingPoints.map((tp, ti) => (
    <div key={ti}>
      <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{tp.talking_point}</div>
      {tp.research_blocks.map((block, bi) => {
        const key = `${sectionIndex}-tp${ti}-${bi}`;
        return (
          <ResearchBlockCard
            key={bi}
            block={block}
            blockKey={key}
            deletedIndices={deletedSnippets[key]}
            onToggleSnippet={onToggleSnippet}
          />
        );
      })}
    </div>
  ))}
}
```

- [ ] **Step 5: Update the research results render in OutlineBuilder**

Pass `deletedSnippets` and `toggleSnippet` to each `SectionResearchCard`:

```tsx
researchResults?.sections.map((sectionRes, idx) => (
  <SectionResearchCard
    key={idx}
    sectionRes={sectionRes}
    sectionIndex={idx}
    deletedSnippets={deletedSnippets}
    onToggleSnippet={toggleSnippet}
  />
))
```

- [ ] **Step 6: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx
git commit -m "feat(outline): deletable evidence snippets with click-to-strikethrough"
```

---

### Task 6: Wire Filtered Evidence to StageContent Approve

When the user clicks "Continue to Storyboard Draft," send the filtered evidence (with struck snippets removed) alongside the approve event.

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` (expose `getFilteredEvidence`)
- Modify: `frontend/src/components/OutlineBuilder/types.ts` (add `onContinue` with evidence param)
- Modify: `frontend/src/components/StageContent.tsx` (send filtered evidence in approve event body)

- [ ] **Step 1: Update OutlineBuilderProps to pass filtered evidence on continue**

In `types.ts`, change `onContinue`:

```tsx
onContinue: (filteredEvidence?: EvidenceResearch | null) => void | Promise<void>;
```

- [ ] **Step 2: Update OutlineBuilder footer to pass filtered evidence**

In the "Continue to Storyboard Draft" button onClick:

```tsx
onClick={async () => {
  setIsContinuing(true);
  try {
    await onContinue(getFilteredEvidence());
  } finally {
    setIsContinuing(false);
  }
}}
```

- [ ] **Step 3: Update StageContent handleResearchContinue**

Read `StageContent.tsx` to find the current `handleResearchContinue` handler. Update it to accept and send filtered evidence:

```tsx
const handleResearchContinue = useCallback(async (filteredEvidence?: EvidenceResearch | null) => {
  if (!projectId) return;
  try {
    const response = await fetch(`/api/project/${projectId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "approve",
        payload: {
          current_outline: currentOutlineText,
          ...(filteredEvidence ? { evidence_research: filteredEvidence } : {}),
        },
      }),
    });
    // ... rest stays same
  }
}, [projectId, currentOutlineText]);
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx frontend/src/components/OutlineBuilder/types.ts frontend/src/components/StageContent.tsx
git commit -m "feat(outline): send filtered evidence (struck snippets removed) on approve"
```

---

### Task 7: Final Verification + Cleanup

Run build, verify no regressions, remove unused imports/code.

**Files:**
- All modified files

- [ ] **Step 1: Full build check**

Run: `cd frontend && npm run build`
Expected: PASS with no errors or warnings

- [ ] **Step 2: Check for unused imports**

Grep for imports that may now be unused after removing MoreHorizontal dropdown:
- `MoreHorizontal` from lucide-react in SectionRow
- `Send` from lucide-react in SectionRow (if was only used in old regen input)
- Old state variables in OutlineBuilder (outlineRegenInstruction, outlineRegenError)

- [ ] **Step 3: Verify visual match against preview HTML**

Start dev server (`npm run dev`), navigate to a project with an outline. Compare visually against `frontend/preview-outline-ux-redesign.html`:
- Container borders present on both outline and evidence
- Header sparkle aligned with section sparkles (same grid column)
- × button above sparkle in actions column, hover backgrounds same size
- Claude Chat-style regen popover opens/closes on sparkle click
- Confidence badges + colored left accents on research blocks
- Snippet click toggles strikethrough

- [ ] **Step 4: Commit final cleanup**

```bash
git add -A
git commit -m "chore(outline): clean up unused imports and dead code from UX redesign"
```
