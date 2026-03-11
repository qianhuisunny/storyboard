# Apply Approved Preview Design to Live React Site

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the user-approved preview design (`frontend/preview-form-70.html`) to the live React codebase — covering the Video Briefing page first, then propagating the same design tokens to all other pages.

**Architecture:** CSS custom properties cascade from `index.css` → all components. Most changes are token-level (update 3 root values) + targeted hardcoded-color replacements in ~15 component files. Layout changes (70vw constraint, 5-stage sidebar) require structural edits to `StageLayout.tsx` and `StageNavigation.tsx`.

**Tech Stack:** React 18, Tailwind CSS v4 with CSS custom properties, shadcn/ui, Fraunces + Nunito fonts

**Approved source of truth:** `frontend/preview-form-70.html`

---

## Key Design Decisions (Approved)

| Token | Old Value | New Value | Rationale |
|-------|-----------|-----------|-----------|
| `--sage-1` (page bg) | `243, 245, 240` (#F3F5F0) | `255, 255, 255` (#FFFFFF) | White page background |
| `--surface` (cards/nav) | `250, 251, 248` (#FAFBF8) | `255, 255, 255` (#FFFFFF) | White cards |
| `--sage-6` (muted text) | `141, 152, 133` (#8D9885) | `98, 107, 88` (#626B58) | WCAG AA compliant (4.8:1) |
| Layout | Full-width content | sidebar + form = 70vw | Left-aligned, nav stays full-width |
| Sidebar stages | 4 stages (ER as sub-item) | 5 equal stages | Evidence Research = Stage 3 |
| Progress Step 3 | "Research" | "Content Spine" | Approved label |
| CollapsibleSection | Green-tinted header | Option C neutral (#F8F8F6 bg) | Approved style |
| Input backgrounds | `#F3F5F0` | `#FFFFFF` | White inputs |

---

## Task 1: Global CSS Token Updates (`index.css`)

**Files:**
- Modify: `frontend/src/index.css:53-67`

Update the 3 root CSS variables that cascade to all semantic color mappings.

- [ ] **Step 1: Update `--sage-1` (page background)**

Change line 55:
```css
/* Old */ --sage-1: 243, 245, 240;    /* #F3F5F0 — page background */
/* New */ --sage-1: 255, 255, 255;    /* #FFFFFF — page background */
```

- [ ] **Step 2: Update `--surface` (cards, nav, sidebar)**

Change line 67:
```css
/* Old */ --surface: 250, 251, 248;   /* #FAFBF8 — cards, nav */
/* New */ --surface: 255, 255, 255;   /* #FFFFFF — cards, nav */
```

- [ ] **Step 3: Update `--sage-6` (muted text — WCAG fix)**

Change line 60:
```css
/* Old */ --sage-6: 141, 152, 133;    /* #8D9885 — muted text */
/* New */ --sage-6: 98, 107, 88;      /* #626B58 — muted text (WCAG 4.8:1) */
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npm run build`
Expected: no errors (these are CSS-only changes)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: update root CSS tokens — white bg, WCAG-compliant muted text"
```

---

## Task 2: Replace Hardcoded `#8D9885` → `#626B58` Across All Files

**Files (all with hardcoded `#8D9885`):**
- Modify: `frontend/src/App.tsx:42` (beta badge text)
- Modify: `frontend/src/components/StageNavigation.tsx:48,68,82,103,173` (sidebar muted text)
- Modify: `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx:39,155,374,400` (input bg, badge, button color)
- Modify: `frontend/src/components/ChatMessage.tsx:53,82` (label, timestamp)
- Modify: `frontend/src/components/StoryboardPanel.tsx:32` (getTypeColor)

This is a bulk find-and-replace. Every `#8D9885` in the frontend becomes `#626B58` for WCAG compliance.

- [ ] **Step 1: Replace all occurrences**

In every file listed above, replace `#8D9885` with `#626B58`.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Verify no remaining occurrences**

Run: `grep -r "#8D9885" frontend/src/` — should return nothing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "style: replace #8D9885 with WCAG-compliant #626B58 across all components"
```

---

## Task 3: Replace Hardcoded `#F3F5F0` and `#FAFBF8` Backgrounds

**Files:**
- Modify: `frontend/src/App.tsx:42` — beta badge bg `#F3F5F0` → `#FFFFFF`
- Modify: `frontend/src/components/StageNavigation.tsx:46` — sidebar bg `#FAFBF8` → `#FFFFFF`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx:39,155` — input bg `#F3F5F0` → `#FFFFFF`, card bg `#FAFBF8` → `#FFFFFF`
- Modify: `frontend/src/components/ChatMessage.tsx:70` — AI message bg `#F3F5F0` → `#FFFFFF`
- Modify: `frontend/src/components/EnhancedChatbot.tsx` — header bg `#FAFBF8` → `#FFFFFF`

**Important:** NOT every `#F3F5F0` / `#FAFBF8` should become white. Only background surfaces. Accent colors like `#E8F0E9` (active highlight) and `#E6F2EB` (approved badge) stay as-is.

- [ ] **Step 1: Replace targeted backgrounds**

For each file listed above, change the specific background color values from `#F3F5F0`/`#FAFBF8` to `#FFFFFF`.

Special cases:
- `FieldCard.tsx` input background: `#F3F5F0` → `#FFFFFF` (line 39, inputStyle object)
- `FieldCard.tsx` multiselect unselected bg: `#F3F5F0` → `#FFFFFF` (line 155)
- `FieldCard.tsx` card bg in className: `bg-[#FAFBF8]` → `bg-white` (line 341)
- `FieldCard.tsx` confirmed card bg `#F7FBF7` → `#FAFDF9` (keep as-is, subtle green tint for confirmed is fine)

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "style: replace #F3F5F0/#FAFBF8 backgrounds with white across components"
```

---

## Task 4: StageNavigation — 5 Equal Stages + Remove Evidence Sub-Item

**Files:**
- Modify: `frontend/src/components/StageLayout.tsx:11-16,19-24,412,548-556`
- Modify: `frontend/src/components/StageNavigation.tsx` (full restructure)
- Modify: `frontend/src/components/StageContent.tsx` (stage routing — verify stage 3 maps correctly)

This is the most structural change. Currently there are 4 stages with Evidence Research as a sub-item of Stage 2. The approved design has 5 equal-level stages.

- [ ] **Step 1: Update `INITIAL_STAGES` in StageLayout.tsx**

```typescript
const INITIAL_STAGES: Stage[] = [
  { id: 1, name: "Video Briefing", description: "Define your video concept and goals", status: "not_started" },
  { id: 2, name: "Video Outline", description: "Review screen structure and types", status: "not_started" },
  { id: 3, name: "Evidence Research", description: "Research evidence for claims", status: "not_started" },
  { id: 4, name: "Storyboard Draft", description: "Full storyboard with visuals and scripts", status: "not_started" },
  { id: 5, name: "Review and Share", description: "Final review and export", status: "not_started" },
];
```

- [ ] **Step 2: Update `STAGE_API_NAMES` in StageLayout.tsx**

```typescript
const STAGE_API_NAMES: Record<number, string> = {
  1: "brief",
  2: "outline",
  3: "evidence",
  4: "draft",
  5: "polish",
};
```

- [ ] **Step 3: Update `handleApprove` — max stage from 4 to 5**

Change `nextStageId <= 4` → `nextStageId <= 5` on line 412.

- [ ] **Step 4: Remove `activeAnchor` and `evidenceStatus` logic from StageLayout.tsx**

Evidence Research is no longer an anchor/sub-step — it's a real stage. Remove:
- `activeAnchor` state and `setActiveAnchor`
- `handleAnchorSelect` function
- `evidenceStatus` computed prop passed to StageNavigation
- `onAnchorSelect` prop passed to StageNavigation

- [ ] **Step 5: Simplify StageNavigation.tsx — remove EvidenceSubStep**

Remove the `EvidenceSubStep` component entirely. Remove `activeAnchor`, `evidenceStatus`, `onAnchorSelect` from props. The sidebar now just renders 5 equal items from `stages`.

- [ ] **Step 6: Verify StageContent.tsx routes stage 3 correctly**

Check that `StageContent.tsx` handles `stage.id === 3` for Evidence Research. This may already work if it uses the stage name/id to determine which component to render. If it uses a hardcoded switch, add the case for evidence research.

- [ ] **Step 7: Verify build + visual test**

Run: `cd frontend && npm run build`
Visual: confirm sidebar shows 5 numbered stages, all aligned equally.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/StageLayout.tsx frontend/src/components/StageNavigation.tsx frontend/src/components/StageContent.tsx
git commit -m "feat: promote Evidence Research to Stage 3, sidebar now shows 5 equal stages"
```

**⚠️ IMPORTANT:** This task changes stage IDs. The backend `STAGE_API_NAMES` mapping must match what the backend expects. Evidence Research currently runs via `onAnchorSelect` → a special flow on stage 2. After this change, it needs to be triggered when stage 3 becomes active. **Check how StageContent dispatches evidence research** — it may need a new case that triggers `TopicResearcher.research_evidence_claims()` when entering stage 3. If the backend doesn't have a `/stage/evidence/run` endpoint, the frontend stage 3 component should call the existing evidence research API directly (likely `/api/project/{id}/event` with an evidence-related event, or the existing research endpoint). Trace the full flow before coding.

---

## Task 5: StageLayout — 70vw Content Constraint

**Files:**
- Modify: `frontend/src/components/StageLayout.tsx:507,560`

The approved design constrains sidebar + form content to 70vw total. The top nav stays full-width (it's in `App.tsx`, outside StageLayout). The sidebar is 220px, so the main content area should be `calc(70vw - 220px)`.

- [ ] **Step 1: Add max-width to the layout container**

On line 507 (the root flex div), add a max-width:
```tsx
<div className="h-full flex flex-col md:flex-row relative" style={{ minHeight: 0, maxWidth: "70vw" }}>
```

This constrains sidebar (220px) + main content = 70vw total, left-aligned.

- [ ] **Step 2: Ensure main content doesn't overflow**

The main content area (line 560) should use `flex: 1` to fill the remaining space within the 70vw container. This should already work with the existing `flex-1`.

- [ ] **Step 3: Remove `w-full` from root div**

Change `className="h-full w-full flex ..."` to `className="h-full flex ..."` since we're now constraining width.

- [ ] **Step 4: Verify build + visual test**

Run: `cd frontend && npm run build`
Visual: sidebar + form content = 70vw, left-aligned. Nav bar still full-width.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StageLayout.tsx
git commit -m "style: constrain sidebar+content to 70vw, left-aligned"
```

---

## Task 6: KnowledgeShareBriefBuilder — Progress Bar Step 3 Label

**Files:**
- Modify: `frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx`

Find the progress bar step labels and change Step 3 from whatever it currently says to "Content Spine".

- [ ] **Step 1: Find and update Step 3 label**

Search for the progress step definitions (likely an array of step names). Change the Step 3 label to "Content Spine".

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx
git commit -m "style: rename progress Step 3 to 'Content Spine'"
```

---

## Task 7: CollapsibleSection — Option C Neutral Card Style

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/CollapsibleSection.tsx`

Replace the current green-tinted completed style with the approved "Option C" neutral card:
- Background: `#F8F8F6`
- Border: `1px solid var(--border)` (i.e., `#D9DDD2`)
- Border-radius: `8px`
- Padding: `13px 16px`
- Icon: green filled circle (`#3A6B47`) with white checkmark, 22x22px
- Badge text: muted color (`#626B58`) on `#EEF1E9` background
- Chevron: muted color, right-aligned

- [ ] **Step 1: Rewrite CollapsibleSection header style**

Replace the current completed header:
```tsx
// Old: bg-[#E6F2EB] with large green circle
// New: Option C neutral card
```

For the completed state:
- Container: `background: #F8F8F6; border: 1px solid #D9DDD2; border-radius: 8px; padding: 13px 16px`
- Icon: `width: 22px; height: 22px; border-radius: 50%; background: #3A6B47; color: white`
- Title: `font-size: 13px; font-weight: 500; color: #1C2118` (not green)
- Badge: `font-size: 9px; font-weight: 700; color: #626B58; background: #EEF1E9; padding: 2px 7px; border-radius: 20px`

- [ ] **Step 2: Update non-completed state**

Non-completed sections keep a similar neutral look but with a gray icon instead of green.

- [ ] **Step 3: Verify build + visual test**

Run: `cd frontend && npm run build`
Visual: completed sections show as neutral gray cards with green checkmark icon.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BriefBuilder/RoundForms/CollapsibleSection.tsx
git commit -m "style: CollapsibleSection uses Option C neutral card (approved design)"
```

---

## Task 8: App.tsx Header — Update Beta Badge Colors

**Files:**
- Modify: `frontend/src/App.tsx:42`

Update the beta badge to use the new approved colors.

- [ ] **Step 1: Update beta badge**

```tsx
// Old:
<span className="... text-[#8D9885] bg-[#F3F5F0] ...">Beta</span>

// New:
<span className="... text-[#626B58] bg-[#FFFFFF] ...">Beta</span>
```

Note: If Task 2 and 3 already handled this via bulk replacement, verify and skip.

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 3: Commit (if not already covered by Task 2/3)**

```bash
git add frontend/src/App.tsx
git commit -m "style: update App header beta badge colors"
```

---

## Task 9: ChatMessage + EnhancedChatbot — Token Updates

**Files:**
- Modify: `frontend/src/components/ChatMessage.tsx:53,70,82`
- Modify: `frontend/src/components/EnhancedChatbot.tsx:302,308`

- [ ] **Step 1: ChatMessage.tsx — update AI label and timestamp color**

```tsx
// Line 53: AI Assistant label
color: "#626B58"  // was #8D9885

// Line 70: AI message background
background: "#FFFFFF"  // was #F3F5F0

// Line 82: timestamp
color: "#626B58"  // was #8D9885
```

- [ ] **Step 2: EnhancedChatbot.tsx — update header**

```tsx
// Line 302: header background
background: "#FFFFFF"  // was #FAFBF8

// Line 308: subtitle color
color: "#626B58"  // was #8D9885
```

- [ ] **Step 3: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatMessage.tsx frontend/src/components/EnhancedChatbot.tsx
git commit -m "style: update chat component colors to match approved design tokens"
```

---

## Task 10: Secondary Pages — Apply Same Tokens

**Files:**
- Modify: `frontend/src/components/OnboardingPage.tsx` (minimal — only `#A63228` for required markers, which is correct/intentional)
- Modify: `frontend/src/components/ProjectsPage.tsx` (verify colors are semantic or need updating)
- Modify: `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` (priority badges use intentional colors, verify)
- Modify: `frontend/src/components/StoryboardPanel.tsx:32` — update `#8D9885` in `getTypeColor`

Most secondary pages already use semantic Tailwind classes (`bg-background`, `text-foreground`, `text-muted-foreground`) which will automatically update via Task 1's CSS variable changes. This task handles the remaining hardcoded values.

- [ ] **Step 1: StoryboardPanel.tsx — update `#8D9885` in getTypeColor**

```typescript
// Old: case "voiceover_over_visuals": return "#8D9885";
// New: case "voiceover_over_visuals": return "#626B58";
```

- [ ] **Step 2: Audit ProjectsPage.tsx**

Check if the hardcoded colors (`#E8F0E9`, `#3A6B47`, `#E6F2EB`, `#5A6352`) are accent/status colors (keep) or surface colors (update). These appear to be status/accent colors used correctly — likely no changes needed.

- [ ] **Step 3: Audit LandingPage.tsx**

LandingPage uses many hardcoded colors for a diagram/infographic. These are intentional design colors for the pipeline visualization, not surface tokens. **No changes needed** unless user requests.

- [ ] **Step 4: Audit OnboardingPage.tsx**

Only uses `#A63228` for required field markers — this is the destructive/error color, correct and intentional. **No changes needed.**

- [ ] **Step 5: Audit OutlineBuilder.tsx**

Uses `#3A6B47`, `#7A5C1E`, `#A63228` for confidence/priority badges — these are semantic status colors, intentional. **No changes needed.**

- [ ] **Step 6: Verify no remaining `#8D9885` anywhere**

Run: `grep -r "#8D9885" frontend/src/`
Expected: no results.

- [ ] **Step 7: Verify no remaining `#FAFBF8` surface backgrounds**

Run: `grep -r "#FAFBF8" frontend/src/`
Review each result — some may be intentional (e.g., confirmed card tint).

- [ ] **Step 8: Verify build**

Run: `cd frontend && npm run build`

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "style: apply design tokens to secondary pages, remove last #8D9885 occurrences"
```

---

## Task 11: Final Visual Verification + Cleanup

- [ ] **Step 1: Start dev server and visually verify each page**

```bash
cd frontend && npm run dev
```

Check each route:
- `/` (OnboardingPage) — white bg, correct fonts
- `/projects` (ProjectsPage) — white bg, correct muted text
- `/storyboard/:id` (StageLayout) — 70vw constraint, 5 stages in sidebar, white backgrounds, Option C collapsibles
- Progress bar shows: Core Intent, Delivery, Content Spine, Angle, Review
- Chat panel uses white backgrounds and correct muted text
- Admin pages render correctly

- [ ] **Step 2: Check WCAG contrast**

Verify that `#626B58` on `#FFFFFF` background passes WCAG AA (4.5:1 for normal text). Mathematical verification:
- `#626B58` relative luminance: ~0.125
- `#FFFFFF` relative luminance: 1.0
- Contrast ratio: (1.0 + 0.05) / (0.125 + 0.05) ≈ 6.0:1 ✓

- [ ] **Step 3: Remove preview HTML (optional)**

If user approves, `frontend/preview-form-70.html` can be removed as its design is now in the live code.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style: final visual verification pass, design system fully applied"
```
