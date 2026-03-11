# UI Redesign: Warm Editorial Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Plotline UI from a hackathon-style Cal.com neutral theme to a warm editorial palette that feels like a premium creative studio tool.

**Architecture:** CSS custom property overhaul (Layer 1) cascades warm colors to all semantic-token-using components. Then individually update ~18 files with hardcoded Tailwind color classes. No structural/layout changes — visual skin only.

**Tech Stack:** Tailwind CSS v4, React 19, shadcn/ui, CSS custom properties

**Spec:** `docs/superpowers/specs/2026-03-10-ui-redesign-design.md`

---

## Chunk 1: Theme Foundation + Global Chrome

### Task 1: Replace CSS custom properties in index.css

**Files:**
- Modify: `frontend/src/index.css`

- [ ] **Step 1: Replace the neutral scale with warm scale**

Replace lines 53-121 (`:root { ... }`) with:

```css
:root {
  /* Warm Neutral Scale */
  --warm-1: 250, 248, 245;
  --warm-2: 245, 240, 234;
  --warm-3: 232, 224, 212;
  --warm-4: 212, 201, 186;
  --warm-5: 196, 185, 168;
  --warm-6: 156, 142, 124;
  --warm-7: 124, 106, 86;
  --warm-8: 92, 78, 60;
  --warm-9: 61, 50, 38;
  --warm-10: 44, 36, 24;

  /* Mapped Variables */
  --radius: 0.5rem;
  --background: rgb(var(--warm-1));
  --foreground: rgb(var(--warm-10));
  --card: rgb(255, 255, 255);
  --card-foreground: rgb(var(--warm-10));
  --popover: rgb(255, 255, 255);
  --popover-foreground: rgb(var(--warm-10));
  --primary: rgb(var(--warm-7));
  --primary-foreground: rgb(255, 255, 255);
  --secondary: rgb(var(--warm-2));
  --secondary-foreground: rgb(var(--warm-10));
  --muted: rgb(var(--warm-2));
  --muted-foreground: rgb(var(--warm-6));
  --accent: rgb(var(--warm-2));
  --accent-foreground: rgb(var(--warm-10));
  --destructive: rgb(196, 100, 74);
  --destructive-foreground: rgb(255, 255, 255);
  --warning: rgb(196, 150, 60);
  --warning-foreground: rgb(var(--warm-10));
  --success: rgb(94, 140, 97);
  --success-foreground: rgb(255, 255, 255);
  --border: rgb(var(--warm-3));
  --input: rgb(var(--warm-3));
  --ring: rgb(var(--warm-7));

  /* Chart colors (warm-compatible) */
  --chart-1: rgb(124, 106, 86);
  --chart-2: rgb(94, 140, 97);
  --chart-3: rgb(156, 142, 124);
  --chart-4: rgb(196, 150, 60);
  --chart-5: rgb(196, 100, 74);

  /* Sidebar */
  --sidebar: rgb(255, 255, 255);
  --sidebar-foreground: rgb(var(--warm-10));
  --sidebar-primary: rgb(var(--warm-7));
  --sidebar-primary-foreground: rgb(255, 255, 255);
  --sidebar-accent: rgb(var(--warm-2));
  --sidebar-accent-foreground: rgb(var(--warm-10));
  --sidebar-border: rgb(var(--warm-3));
  --sidebar-ring: rgb(var(--warm-7));

  /* Header (warm dark) */
  --header-background: rgb(var(--warm-10));
  --header-foreground: rgb(255, 255, 255);
  --header-border: rgb(var(--warm-9));
}
```

- [ ] **Step 2: Remove the entire `.dark { }` block**

Delete lines 123-184 (the `.dark { ... }` block).

- [ ] **Step 3: Add heading letter-spacing to `@layer base`**

Update the heading rule in `@layer base`:

```css
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-cal);
    font-weight: 600;
  }
```

Replace with:

```css
  h1 {
    font-family: var(--font-cal);
    font-weight: 600;
    letter-spacing: -0.5px;
  }
  h2 {
    font-family: var(--font-cal);
    font-weight: 600;
    letter-spacing: -0.4px;
  }
  h3, h4, h5, h6 {
    font-family: var(--font-cal);
    font-weight: 600;
    letter-spacing: -0.3px;
  }
```

Also add `line-height: 1.6;` to the `body` rule:

```css
  body {
    @apply bg-background text-foreground antialiased;
    font-family: var(--font-inter);
    line-height: 1.6;
  }
```

- [ ] **Step 4: Build to verify no CSS errors**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "feat(ui): replace Cal.com neutrals with warm editorial palette"
```

---

### Task 2: Update App.tsx header — remove ThemeToggle and subtitle

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Remove ThemeToggle import**

Delete line 18:
```tsx
import ThemeToggle from "@/components/ThemeToggle";
```

- [ ] **Step 2: Remove subtitle and ThemeToggle from header**

In `AppHeader`, remove these lines from the `<div className="flex items-center gap-4">`:

```tsx
          <span className="text-sm opacity-80 hidden sm:inline">
            AI-Powered Storyboard Generator
          </span>
          <ThemeToggle />
```

- [ ] **Step 3: Update Beta badge background**

Change:
```tsx
<span className="text-xs bg-white/10 px-2 py-0.5 rounded text-[10px]">
```
To:
```tsx
<span className="text-xs bg-white/[0.08] px-2 py-0.5 rounded text-[10px]">
```

- [ ] **Step 4: Update header padding**

Change `py-3` to `py-3.5` in the header className.

- [ ] **Step 5: Remove "Cal.com inverted style" comment**

Change:
```tsx
        {/* Global Header - Cal.com inverted style */}
```
To:
```tsx
        {/* Global Header */}
```

- [ ] **Step 6: Build to verify**

Run: `cd frontend && npm run build`
Expected: Build succeeds (ThemeToggle is no longer imported but file stays).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat(ui): warm header — remove theme toggle and subtitle"
```

---

### Task 3: Update StageNavigation — remove numbers, warm active states

**Files:**
- Modify: `frontend/src/components/StageNavigation.tsx`

- [ ] **Step 1: Update nav container class**

Change line 46:
```tsx
<nav className="w-56 sm:w-48 h-full border-r border-border bg-card p-4 flex-shrink-0 overflow-y-auto flex flex-col">
```
To:
```tsx
<nav className="w-56 sm:w-48 h-full border-r border-border bg-white p-4 flex-shrink-0 overflow-y-auto flex flex-col">
```

- [ ] **Step 2: Update active stage styling — add left border accent**

Change the active stage className (lines 61-68):
```tsx
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md transition-colors",
                    "flex items-center",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : isClickable
                      ? "hover:bg-muted text-foreground"
                      : "text-muted-foreground cursor-not-allowed opacity-50"
                  )}
```
To:
```tsx
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md transition-colors",
                    "flex items-center",
                    isActive
                      ? "bg-accent text-primary border-l-2 border-l-primary"
                      : isClickable
                      ? "hover:bg-muted text-foreground"
                      : "text-muted-foreground cursor-not-allowed opacity-50"
                  )}
```

- [ ] **Step 3: Remove the stage number span**

Remove this line from the stage button content (line 75):
```tsx
                      <span className="text-xs text-muted-foreground">{stage.id}</span>
```

- [ ] **Step 4: Update EvidenceSubStep active styling**

Change EvidenceSubStep active className (lines 135-142):
```tsx
      className={cn(
        "w-full text-left px-3 py-2 rounded-md transition-colors mt-1",
        "flex items-center",
        isActive
          ? "bg-primary/10 text-primary"
          : isClickable
          ? "hover:bg-muted text-foreground"
          : "text-muted-foreground cursor-not-allowed opacity-50"
      )}
```
To:
```tsx
      className={cn(
        "w-full text-left px-3 py-2 pl-6 rounded-md transition-colors mt-1",
        "flex items-center",
        isActive
          ? "bg-accent text-primary border-l-2 border-l-primary"
          : isClickable
          ? "hover:bg-muted text-foreground"
          : "text-muted-foreground cursor-not-allowed opacity-50"
      )}
```

(Note: `pl-6` adds the extra indent for the sub-step.)

- [ ] **Step 5: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/StageNavigation.tsx
git commit -m "feat(ui): warm sidebar — remove stage numbers, add left border accent"
```

---

### Task 4: Update StageLayout — warm save status colors

**Files:**
- Modify: `frontend/src/components/StageLayout.tsx`

- [ ] **Step 1: Replace hardcoded save status colors**

Find the SaveStatusIndicator (around line 479-503). Replace:
```tsx
            <Cloud className="w-3.5 h-3.5 text-green-500" />
            <span className="text-green-600">Saved</span>
```
With:
```tsx
            <Cloud className="w-3.5 h-3.5 text-success" />
            <span className="text-success">Saved</span>
```

Replace:
```tsx
            <CloudOff className="w-3.5 h-3.5 text-red-500" />
            <span className="text-red-600">Save failed</span>
```
With:
```tsx
            <CloudOff className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive">Save failed</span>
```

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StageLayout.tsx
git commit -m "feat(ui): warm save status indicators"
```

---

## Chunk 2: Landing Page + Onboarding + Projects

### Task 5: Rework LandingPage with warm editorial design

**Files:**
- Modify: `frontend/src/components/LandingPage.tsx`

This file has extensive hardcoded colors (bg-blue-*, bg-emerald-*, bg-amber-*, bg-cyan-*, bg-rose-*). The landing page needs a full rework to match the warm editorial direction.

- [ ] **Step 1: Read the current LandingPage.tsx fully**

Read the entire file to understand its structure before making changes.

- [ ] **Step 2: Replace all hardcoded color classes**

Apply these replacements throughout the file:
- `bg-blue-*` / `text-blue-*` / `border-blue-*` → warm primary equivalents (`bg-[#F5F0EA]`, `text-[#7C6A56]`, `border-[#E8E0D4]`)
- `bg-emerald-*` / `text-emerald-*` / `border-emerald-*` → warm success equivalents (`bg-[#EFF5F0]`, `text-[#5E8C61]`, `border-[#5E8C61]`)
- `bg-amber-*` / `text-amber-*` / `border-amber-*` → warm warning equivalents (`bg-[#FBF6ED]`, `text-[#C4963C]`, `border-[#C4963C]`)
- `bg-cyan-*` / `text-cyan-*` / `border-cyan-*` → warm muted equivalents (`bg-[#F5F0EA]`, `text-[#9C8E7C]`, `border-[#E8E0D4]`)
- `bg-rose-*` / `text-rose-*` / `border-rose-*` → warm destructive equivalents (`bg-[#FBF0ED]`, `text-[#C4644A]`, `border-[#C4644A]`)

- [ ] **Step 3: Update hero copy**

Replace the subtitle text with outcome-focused copy:
```tsx
"Turn briefs into production-ready storyboards in minutes"
```

- [ ] **Step 4: Update CTA button styling**

Use warm dark primary: `bg-[#2C2418] text-white rounded-md px-8 py-3`

- [ ] **Step 5: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/LandingPage.tsx
git commit -m "feat(ui): warm editorial landing page"
```

---

### Task 6: Update ProjectsPage — warm cards and progress

**Files:**
- Modify: `frontend/src/components/ProjectsPage.tsx`

- [ ] **Step 1: Replace hardcoded badge colors**

Around line 34-36, replace:
```tsx
bg-blue-100 text-blue-700  →  bg-[#F5F0EA] text-[#7C6A56]
bg-green-100 text-green-700  →  bg-[#EFF5F0] text-[#5E8C61]
bg-purple-100 text-purple-700  →  bg-[#F5F0EA] text-[#9C8E7C]
```

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ProjectsPage.tsx
git commit -m "feat(ui): warm project cards and badges"
```

---

## Chunk 3: Brief Builder (Stage 1)

### Task 7: Update FieldCard badge colors

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx`

- [ ] **Step 1: Replace COLOR_CLASSES badge colors**

Change lines 21-42:
```tsx
const COLOR_CLASSES: Record<FieldColor, { badge: string; border: string; bg: string }> = {
  green: {
    badge: "bg-green-500 text-white",
    border: "border-border",
    bg: "bg-background",
  },
  blue: {
    badge: "bg-blue-500 text-white",
    border: "border-border",
    bg: "bg-background",
  },
  yellow: {
    badge: "bg-amber-500 text-white",
    border: "border-border",
    bg: "bg-background",
  },
  red: {
    badge: "bg-red-500 text-white",
    border: "border-border",
    bg: "bg-background",
  },
};
```

To:
```tsx
const COLOR_CLASSES: Record<FieldColor, { badge: string; border: string; bg: string }> = {
  green: {
    badge: "bg-[#5E8C61] text-white",
    border: "border-border",
    bg: "bg-background",
  },
  blue: {
    badge: "bg-[#7C6A56] text-white",
    border: "border-border",
    bg: "bg-background",
  },
  yellow: {
    badge: "bg-[#C4963C] text-white",
    border: "border-border",
    bg: "bg-background",
  },
  red: {
    badge: "bg-[#C4644A] text-white",
    border: "border-border",
    bg: "bg-background",
  },
};
```

- [ ] **Step 2: Replace validation error colors**

Around line 206, replace `text-red-500` and `text-red-700` with `text-destructive`.

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx
git commit -m "feat(ui): warm field card badge colors"
```

---

### Task 8: Update StatusBadge warm colors

**Files:**
- Modify: `frontend/src/components/BriefBuilder/UserView/StatusBadge.tsx`

- [ ] **Step 1: Replace all status color classes**

Replace the color maps:
```
bg-green-100 text-green-700 border-green-200  →  bg-[#EFF5F0] text-[#5E8C61] border-[#5E8C61]/20
bg-yellow-100 text-yellow-700 border-yellow-200  →  bg-[#FBF6ED] text-[#C4963C] border-[#C4963C]/20
bg-gray-100 text-gray-500 border-gray-200  →  bg-muted text-muted-foreground border-border
text-green-600  →  text-[#5E8C61]
text-yellow-600  →  text-[#C4963C]
text-red-600  →  text-destructive
```

Also remove all `dark:*` variants (dark mode is removed).

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BriefBuilder/UserView/StatusBadge.tsx
git commit -m "feat(ui): warm status badge colors, remove dark mode"
```

---

### Task 9: Update BriefReview, CollapsibleSection, RoundThreeForm

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/CollapsibleSection.tsx`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx`

- [ ] **Step 1: BriefReview — replace green badge**

Line 171: Replace `bg-green-100 text-green-800 border-green-200` with `bg-[#EFF5F0] text-[#5E8C61] border-[#5E8C61]/20`.

- [ ] **Step 2: CollapsibleSection — replace all green classes**

```
border-green-200  →  border-[#5E8C61]/20
bg-green-50 hover:bg-green-100  →  bg-[#EFF5F0] hover:bg-[#EFF5F0]
bg-green-500 text-white  →  bg-[#5E8C61] text-white
text-green-700  →  text-[#5E8C61]
bg-green-100 text-green-700  →  bg-[#EFF5F0] text-[#5E8C61]
```

- [ ] **Step 3: RoundThreeForm — replace yellow warning**

Line 50: Replace `text-yellow-600 bg-yellow-50` with `text-[#C4963C] bg-[#FBF6ED]`.

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx \
       frontend/src/components/BriefBuilder/RoundForms/CollapsibleSection.tsx \
       frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx
git commit -m "feat(ui): warm brief builder form colors"
```

---

### Task 10: Update MobileDrawer and ResearchChat

**Files:**
- Modify: `frontend/src/components/BriefBuilder/SplitBriefBuilder/MobileDrawer.tsx`
- Modify: `frontend/src/components/BriefBuilder/SplitBriefBuilder/ResearchPanel/ResearchChat.tsx`

- [ ] **Step 1: MobileDrawer — replace status colors**

Lines 60-62:
```
bg-blue-50  →  bg-[#F5F0EA]
bg-green-50  →  bg-[#EFF5F0]
bg-red-50  →  bg-[#FBF0ED]
```

- [ ] **Step 2: ResearchChat — replace error/success colors**

Lines 429-451:
```
bg-red-50 border border-red-200  →  bg-[#FBF0ED] border border-[#C4644A]/20
text-red-700  →  text-[#C4644A]
bg-green-50 border border-green-200  →  bg-[#EFF5F0] border border-[#5E8C61]/20
text-green-600  →  text-[#5E8C61]
```

Remove all `dark:*` variants.

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BriefBuilder/SplitBriefBuilder/MobileDrawer.tsx \
       frontend/src/components/BriefBuilder/SplitBriefBuilder/ResearchPanel/ResearchChat.tsx
git commit -m "feat(ui): warm mobile drawer and research chat colors"
```

---

## Chunk 4: Outline Builder (Stage 2)

### Task 11: Update SectionRow border accents

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/SectionRow.tsx`

- [ ] **Step 1: Replace left border color classes**

Lines 23-25:
```
border-l-blue-400  →  border-l-[#C4963C]
border-l-green-400  →  border-l-[#5E8C61]
border-l-gray-300  →  border-l-[#7C6A56]
```

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OutlineBuilder/SectionRow.tsx
git commit -m "feat(ui): warm section row border accents"
```

---

### Task 12: Update OutlineBuilder status colors

**Files:**
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx`

- [ ] **Step 1: Replace all hardcoded status colors**

```
bg-red-100 text-red-700  →  bg-[#FBF0ED] text-[#C4644A]
bg-amber-100 text-amber-700  →  bg-[#FBF6ED] text-[#C4963C]
bg-slate-100 text-slate-600  →  bg-muted text-muted-foreground
text-green-600  →  text-[#5E8C61]
text-amber-600  →  text-[#C4963C]
text-red-600  →  text-[#C4644A]
text-green-500  →  text-[#5E8C61]
```

Remove all `dark:*` variants.

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/OutlineBuilder/OutlineBuilder.tsx
git commit -m "feat(ui): warm outline builder status colors"
```

---

## Chunk 5: Draft Builder (Stage 3) + Review Builder (Stage 4)

### Task 13: Update DraftBuilder types, ProcessingView, PanelCard

**Files:**
- Modify: `frontend/src/components/DraftBuilder/types.ts`
- Modify: `frontend/src/components/DraftBuilder/ProcessingView/ProcessingView.tsx`
- Modify: `frontend/src/components/DraftBuilder/UserView/PanelCard.tsx`

- [ ] **Step 1: types.ts — replace all screen type badge colors**

This file has ~20 hardcoded badge color entries. Replace ALL of them with warm equivalents:
```
bg-purple-100 text-purple-700 border-purple-200  →  bg-[#F5F0EA] text-[#7C6A56] border-[#E8E0D4]
bg-amber-100 text-amber-700 border-amber-200  →  bg-[#FBF6ED] text-[#C4963C] border-[#C4963C]/20
bg-orange-100 text-orange-700 border-orange-200  →  bg-[#FBF6ED] text-[#C4963C] border-[#C4963C]/20
bg-indigo-100 text-indigo-700 border-indigo-200  →  bg-[#F5F0EA] text-[#7C6A56] border-[#E8E0D4]
bg-blue-100 text-blue-700 border-blue-200  →  bg-[#F5F0EA] text-[#7C6A56] border-[#E8E0D4]
bg-cyan-100 text-cyan-700 border-cyan-200  →  bg-[#F5F0EA] text-[#9C8E7C] border-[#E8E0D4]
bg-green-100 text-green-700 border-green-200  →  bg-[#EFF5F0] text-[#5E8C61] border-[#5E8C61]/20
bg-red-100 text-red-700 border-red-200  →  bg-[#FBF0ED] text-[#C4644A] border-[#C4644A]/20
bg-teal-100 text-teal-700 border-teal-200  →  bg-[#EFF5F0] text-[#5E8C61] border-[#5E8C61]/20
bg-yellow-100 text-yellow-700 border-yellow-200  →  bg-[#FBF6ED] text-[#C4963C] border-[#C4963C]/20
bg-rose-100 text-rose-700 border-rose-200  →  bg-[#FBF0ED] text-[#C4644A] border-[#C4644A]/20
bg-slate-100 text-slate-700 border-slate-200  →  bg-muted text-muted-foreground border-border
```

- [ ] **Step 2: ProcessingView — replace gray status colors**

```
bg-gray-100 text-gray-700  →  bg-muted text-muted-foreground
```

- [ ] **Step 3: PanelCard — replace gray badge**

```
bg-gray-100 text-gray-700 border-gray-200  →  bg-muted text-muted-foreground border-border
```

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DraftBuilder/types.ts \
       frontend/src/components/DraftBuilder/ProcessingView/ProcessingView.tsx \
       frontend/src/components/DraftBuilder/UserView/PanelCard.tsx
git commit -m "feat(ui): warm draft builder badges and status colors"
```

---

### Task 14: Update ReviewBuilder — warm cards and stats

**Files:**
- Modify: `frontend/src/components/ReviewBuilder/ReviewCard.tsx`
- Modify: `frontend/src/components/ReviewBuilder/UserView.tsx`

- [ ] **Step 1: ReviewCard — replace gray badge**

Line 71:
```
bg-gray-100 text-gray-700 border-gray-200  →  bg-muted text-muted-foreground border-border
```

- [ ] **Step 2: UserView — replace badge colors**

Lines 34-36:
```
bg-blue-100 text-blue-700  →  bg-[#F5F0EA] text-[#7C6A56]
bg-green-100 text-green-700  →  bg-[#EFF5F0] text-[#5E8C61]
bg-purple-100 text-purple-700  →  bg-[#F5F0EA] text-[#9C8E7C]
```

- [ ] **Step 3: UserView — update PDF StyleSheet colors**

In the `StyleSheet.create()` call, update all color references to warm palette. Key changes:
- Title color → `#2C2418`
- Section label color → `#9C8E7C`
- Border colors → `#E8E0D4`
- Card background → `#FFFFFF`

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReviewBuilder/ReviewCard.tsx \
       frontend/src/components/ReviewBuilder/UserView.tsx
git commit -m "feat(ui): warm review cards, stats bar, and PDF colors"
```

---

## Chunk 6: Utility Components + Chat + Modals

### Task 15: Update DiffView and SourceBadge

**Files:**
- Modify: `frontend/src/components/DiffView.tsx`
- Modify: `frontend/src/components/SourceBadge.tsx`

- [ ] **Step 1: DiffView — replace all diff colors**

```
text-green-600 bg-green-50  →  text-[#5E8C61] bg-[#EFF5F0]
text-red-600 bg-red-50  →  text-[#C4644A] bg-[#FBF0ED]
bg-red-400  →  bg-[#C4644A]
bg-green-400  →  bg-[#5E8C61]
bg-red-50 border-l-2 border-red-400  →  bg-[#FBF0ED] border-l-2 border-[#C4644A]
text-red-600  →  text-[#C4644A]
text-red-800  →  text-[#C4644A]
bg-green-50 border-l-2 border-green-400  →  bg-[#EFF5F0] border-l-2 border-[#5E8C61]
text-green-600  →  text-[#5E8C61]
text-green-800  →  text-[#5E8C61]
```

- [ ] **Step 2: SourceBadge — replace badge colors**

```
bg-blue-50 text-blue-700  →  bg-[#F5F0EA] text-[#7C6A56]
bg-purple-50 text-purple-700  →  bg-[#F5F0EA] text-[#9C8E7C]
bg-amber-50 text-amber-700  →  bg-[#FBF6ED] text-[#C4963C]
```

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DiffView.tsx \
       frontend/src/components/SourceBadge.tsx
git commit -m "feat(ui): warm diff view and source badge colors"
```

---

### Task 16: Update SatisfactionRatingModal

**Files:**
- Modify: `frontend/src/components/SatisfactionRatingModal.tsx`

- [ ] **Step 1: Replace star colors and overlay**

```
fill-yellow-400 text-yellow-400  →  fill-[#C4963C] text-[#C4963C]
```

Check for any `bg-black/50` overlay and replace with `bg-[#2C2418]/40`.

- [ ] **Step 2: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SatisfactionRatingModal.tsx
git commit -m "feat(ui): warm rating modal stars and overlay"
```

---

### Task 17: Update EnhancedChatbot and ChatMessage (Spec Section 10)

**Files:**
- Modify: `frontend/src/components/EnhancedChatbot.tsx`
- Modify: `frontend/src/components/ChatMessage.tsx`

- [ ] **Step 1: Read both files to identify hardcoded colors**

Read `EnhancedChatbot.tsx` and `ChatMessage.tsx` fully. The spec review reported no hardcoded color classes, but verify. If they use semantic tokens (`bg-card`, `text-foreground`, etc.), Layer 1 handles them. If they have any hardcoded Tailwind colors or `bg-black/*` overlays, replace them:

```
bg-black/50  →  bg-[#2C2418]/40
bg-black/20  →  bg-[#2C2418]/20
```

The chat header should use `bg-[var(--header-background)]` (warm dark `#2C2418`) — verify this is already the case from the EnhancedChatbot "Cal.com inverted style" comment on line 301.

- [ ] **Step 2: Remove any `dark:*` variants**

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add frontend/src/components/EnhancedChatbot.tsx \
       frontend/src/components/ChatMessage.tsx
git commit -m "feat(ui): warm chat panel colors"
```

---

### Task 18: Update OnboardingPage (Spec Section 4)

**Files:**
- Modify: `frontend/src/components/OnboardingPage.tsx`

The spec review reported no hardcoded color classes (uses design tokens). Layer 1 should cascade. However, verify and apply spec Section 4 layout changes:

- [ ] **Step 1: Read OnboardingPage.tsx to verify no hardcoded colors**

- [ ] **Step 2: Verify left-aligned layout**

The spec requires left-aligned body content with max-width ~640px on the form. If the current layout centers content, update to left-align.

- [ ] **Step 3: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit (only if changes were made)**

```bash
git add frontend/src/components/OnboardingPage.tsx
git commit -m "feat(ui): warm onboarding page, left-aligned layout"
```

---

### Task 19: Verify TabToggles, UI Primitives, and remaining files

**Files to verify (Layer 4 — TabToggles):**
- `frontend/src/components/BriefBuilder/TabToggle.tsx`
- `frontend/src/components/DraftBuilder/TabToggle.tsx`
- `frontend/src/components/ReviewBuilder/TabToggle.tsx`

**Files to verify (Layer 6 — UI Primitives):**
- `frontend/src/components/ui/button.tsx`
- `frontend/src/components/ui/badge.tsx`
- `frontend/src/components/ui/input.tsx`
- `frontend/src/components/ui/textarea.tsx`
- `frontend/src/components/ui/card.tsx`
- `frontend/src/components/ui/tabs.tsx`

**Other files to verify:**
- `frontend/src/components/BriefBuilder/RoundForms/AngleSelectionForm.tsx`
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/index.tsx`
- `frontend/src/components/StageContent.tsx`

- [ ] **Step 1: Read each TabToggle file**

If they use `bg-muted/30`, `border-primary`, `text-primary` — Layer 1 handles them. If they have hardcoded colors, replace per the color guide.

- [ ] **Step 2: Read each UI primitive file**

Check for hardcoded focus ring colors (e.g., `ring-blue-500`), hardcoded badge variant colors, or hardcoded shadow values. Replace any with semantic tokens or warm hex equivalents.

- [ ] **Step 3: Read AngleSelectionForm, SplitBriefBuilder/index, StageContent**

- AngleSelectionForm: verify selected card uses `border-primary` (warm brown) and `bg-accent` (warm fill). If hardcoded, replace.
- SplitBriefBuilder/index.tsx: verify panel divider uses `border-border`. If hardcoded, replace.
- StageContent.tsx: verify buttons use `bg-primary` etc. If hardcoded, replace.

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit (only if changes were made)**

```bash
git add -A
git commit -m "feat(ui): warm tab toggles, UI primitives, remaining components"
```

---

### Task 20: Global sweep — catch remaining hardcoded colors

- [ ] **Step 1: Grep for any remaining hardcoded Tailwind color classes**

Run:
```bash
cd frontend/src && grep -rn "bg-blue-\|bg-green-\|bg-red-\|bg-amber-\|bg-yellow-\|bg-purple-\|bg-cyan-\|bg-emerald-\|bg-rose-\|bg-orange-\|bg-indigo-\|bg-teal-\|bg-slate-\|bg-gray-\|text-blue-\|text-green-\|text-red-\|text-amber-\|text-yellow-\|text-purple-\|border-blue-\|border-green-\|border-red-\|border-amber-\|border-yellow-\|border-purple-\|bg-black/" --include="*.tsx" --include="*.ts" | grep -v "node_modules\|admin/"
```

Expected: No results (all hardcoded colors replaced). If any remain outside of admin/ (out of scope), replace per the color guide.

- [ ] **Step 2: Grep for remaining `dark:*` variants**

Run:
```bash
cd frontend/src && grep -rn "dark:" --include="*.tsx" --include="*.ts" | grep -v "node_modules\|admin/"
```

Expected: No results (dark mode is removed). Remove any remaining `dark:*` classes.

- [ ] **Step 3: Fix any found issues**

- [ ] **Step 4: Build to verify**

Run: `cd frontend && npm run build`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix(ui): remove remaining hardcoded colors and dark mode variants"
```

---

### Task 21: Final build verification and visual smoke test

- [ ] **Step 1: Full build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Start dev server and visually verify**

Run: `cd frontend && npm run dev`

Check each surface:
1. Landing page — warm off-white bg, editorial headline, warm CTA
2. Onboarding — warm cards (should cascade from CSS variables)
3. Stage workspace — warm sidebar, warm header, warm content
4. Brief Builder — warm badges (green/blue/yellow/red replaced)
5. Outline Builder — warm border accents (amber/brown/sage)
6. Draft Builder — warm badges and progress bars
7. Review Builder — warm cards and stats
8. Projects page — warm project cards
9. Chat panel — warm bubbles (should cascade from CSS variables)

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A
git commit -m "fix(ui): polish warm editorial theme edge cases"
```
