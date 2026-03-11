# UI Redesign: Warm Editorial Polish

**Date:** 2026-03-10
**Direction:** Warm & Editorial — creative studio feel, off-white warmth, subtle borders
**Target audience:** Marketing / content teams (high visual expectations)
**Approach:** Component-by-component polish (theme reskin + individual surface rework)
**Structure:** Keep current sidebar + content layout (no structural changes)
**Layout rule:** Left-aligned body content throughout — no centering. Comfortable left padding, max-width on form elements (~640px) to prevent stretching, but content block sits left.

---

## 1. Color & Typography Foundation

### Color Tokens (RGB component format)

The existing CSS uses `rgb(var(--neutral-N))` pattern where variables store `R, G, B` components. This allows Tailwind opacity modifiers like `bg-primary/10` to work. **All new colors must use this same RGB component format.**

New warm neutral scale replaces the Cal.com neutral scale:

```css
/* Warm Neutral Scale (Light Mode) */
--warm-1: 250, 248, 245;   /* #FAF8F5 — page background */
--warm-2: 245, 240, 234;   /* #F5F0EA — muted bg, active/selected bg */
--warm-3: 232, 224, 212;   /* #E8E0D4 — borders */
--warm-4: 212, 201, 186;   /* #D4C9BA — hover borders, drag handles */
--warm-5: 196, 185, 168;   /* #C4B9A8 — reserved */
--warm-6: 156, 142, 124;   /* #9C8E7C — muted text */
--warm-7: 124, 106, 86;    /* #7C6A56 — primary accent */
--warm-8: 92, 78, 60;      /* #5C4E3C — emphasis */
--warm-9: 61, 50, 38;      /* #3D3226 — header border */
--warm-10: 44, 36, 24;     /* #2C2418 — text primary, header bg */
```

Semantic token mapping:

| Token | RGB Value | Hex | CSS Variable |
|-------|-----------|-----|-------------|
| Page background | `250, 248, 245` | `#FAF8F5` | `--background: rgb(var(--warm-1))` |
| Card / surface | `255, 255, 255` | `#FFFFFF` | `--card: rgb(255, 255, 255)` |
| Card foreground | `44, 36, 24` | `#2C2418` | `--card-foreground: rgb(var(--warm-10))` |
| Border | `232, 224, 212` | `#E8E0D4` | `--border: rgb(var(--warm-3))` |
| Input border | `232, 224, 212` | `#E8E0D4` | `--input: rgb(var(--warm-3))` |
| Text primary | `44, 36, 24` | `#2C2418` | `--foreground: rgb(var(--warm-10))` |
| Text muted | `156, 142, 124` | `#9C8E7C` | `--muted-foreground: rgb(var(--warm-6))` |
| Primary accent | `124, 106, 86` | `#7C6A56` | `--primary: rgb(var(--warm-7))` |
| Primary foreground | `255, 255, 255` | `#FFFFFF` | `--primary-foreground: rgb(255, 255, 255)` |
| Secondary | `245, 240, 234` | `#F5F0EA` | `--secondary: rgb(var(--warm-2))` |
| Secondary foreground | `44, 36, 24` | `#2C2418` | `--secondary-foreground: rgb(var(--warm-10))` |
| Muted bg | `245, 240, 234` | `#F5F0EA` | `--muted: rgb(var(--warm-2))` |
| Accent / selected | `245, 240, 234` | `#F5F0EA` | `--accent: rgb(var(--warm-2))` |
| Accent foreground | `44, 36, 24` | `#2C2418` | `--accent-foreground: rgb(var(--warm-10))` |
| Ring | `124, 106, 86` | `#7C6A56` | `--ring: rgb(var(--warm-7))` |
| Success | `94, 140, 97` | `#5E8C61` | `--success: rgb(94, 140, 97)` |
| Success foreground | `255, 255, 255` | `#FFFFFF` | `--success-foreground: rgb(255, 255, 255)` |
| Warning | `196, 150, 60` | `#C4963C` | `--warning: rgb(196, 150, 60)` |
| Warning foreground | `44, 36, 24` | `#2C2418` | `--warning-foreground: rgb(var(--warm-10))` |
| Destructive | `196, 100, 74` | `#C4644A` | `--destructive: rgb(196, 100, 74)` |
| Destructive foreground | `255, 255, 255` | `#FFFFFF` | `--destructive-foreground: rgb(255, 255, 255)` |
| Header bg | `44, 36, 24` | `#2C2418` | `--header-background: rgb(var(--warm-10))` |
| Header fg | `255, 255, 255` | `#FFFFFF` | `--header-foreground: rgb(255, 255, 255)` |
| Header border | `61, 50, 38` | `#3D3226` | `--header-border: rgb(var(--warm-9))` |

### Dark Mode

**Decision: Remove dark mode for now.** The warm editorial palette is designed for light mode. Dark mode adds complexity and the current user base (marketing teams) doesn't need it. Implementation:
- Remove the `.dark { }` block from `index.css`
- Remove `ThemeToggle.tsx` from the header (remove import + component from `App.tsx`)
- The `ThemeToggle.tsx` file can stay in the codebase but won't be rendered

### Typography

- **Font:** Keep Inter (clean, professional)
- **Heading letter-spacing:** `h1` = `-0.5px`, `h2` = `-0.4px`, `h3`/`h4` = `-0.3px`
- **Body line-height:** `1.6` for comfortable reading
- **Text color:** `#2C2418` throughout — never pure black

### Spacing

- Cards and sections: generous padding (`16px` internal, `24px` between)
- Form field gaps: `gap-6` (24px) between fields
- Page content padding: `px-8` (32px) on desktop, `px-4` (16px) on mobile

### Border Radius Scale

- Inputs / inline elements: `6px`
- Cards: `8px`
- Modals: `10px`

### Shadow Scale

- **Resting shadow** (cards that always have it): Draft panel cards, Review cards — `0 1px 3px rgba(44,36,24,0.04)`
- **Hover-only shadow** (appears on hover): Project cards, Onboarding type cards, Outline section rows — `0 2px 8px rgba(44,36,24,0.06)`
- **Elevated shadow** (hover on resting-shadow cards): Review cards on hover — `0 2px 8px rgba(44,36,24,0.08)`

---

## 2. Global Chrome

### Header (AppHeader)

- Background: `#2C2418` (warm dark)
- Remove "AI-Powered Storyboard Generator" subtitle
- "Beta" badge: `rgba(255,255,255,0.08)` background
- Padding: `py-3.5` (slightly more breathing room)
- Keep: Plotline logo, My Projects link, theme toggle, user button

### Stage Navigation Sidebar

- Background: `#FFFFFF`
- Border-right: `#E8E0D4`
- Remove stage number prefixes ("1", "2") — order is obvious from position, use status icons only
- Active stage: `#F5F0EA` background, `#7C6A56` text, `2px` left border accent in `#7C6A56`
- Inactive stages: `#9C8E7C` text, no background
- "Stages" label: uppercase `#9C8E7C`
- Evidence Research sub-step: slightly more indent, same warm treatment
- "My Projects" bottom link: warm muted styling

---

## 3. Landing Page

- Background: `#FAF8F5`
- Hero headline: editorial tightness (`-0.5px` letter-spacing), `#2C2418`
- Subtitle: `#9C8E7C`, outcome-focused copy (e.g., "Turn briefs into production-ready storyboards in minutes")
- CTA button: solid `#2C2418` bg, white text, `border-radius: 6px`, generous padding
- Below CTA: horizontal 3-step "How it works" row — three items, each with a warm icon (`#7C6A56`), short label ("Brief", "Outline", "Storyboard"), and one-line description. Connected by subtle arrows or dots in `#D4C9BA`.
- No animations, parallax, or testimonials

---

## 4. Onboarding Page

- Left-aligned layout, max-width ~640px on form
- **Type selection cards:** white bg, `#E8E0D4` border, `border-radius: 8px`
  - Hover: warm shadow `0 2px 8px rgba(44,36,24,0.06)`
  - Selected: `#7C6A56` border (2px), `#F5F0EA` fill
  - Icons: `#7C6A56` warm accent
  - Descriptions: `#9C8E7C`
- **Form fields:** white bg, `#E8E0D4` border, `border-radius: 6px`
  - Focus: `#7C6A56` border + `ring-[#7C6A56]/20`
  - Labels: `#9C8E7C` uppercase small
  - Spacing: `gap-6`
- **CTA:** `#2C2418` bg, white text, full width at bottom

---

## 5. Brief Builder (Stage 1)

### Field Cards
- White cards, `#E8E0D4` border, `border-radius: 6px`
- Status badge warm tones — maps to existing `FieldColor` enum in `FieldCard.tsx`:
  - `green` (Confirmed): `bg-[#5E8C61] text-white` (was `bg-green-500`)
  - `blue` (Provided): `bg-[#7C6A56] text-white` (was `bg-blue-500`)
  - `yellow` (AI Suggested): `bg-[#C4963C] text-white` (was `bg-amber-500`)
  - `red` (Needs Input): `bg-[#C4644A] text-white` (was `bg-red-500`)
- The `StatusBadge.tsx` component uses a separate `auto_filled`/`inferred`/`not_applicable` system — update with same warm mapping: `auto_filled` → `#5E8C61`, `inferred` → `#C4963C`, `not_applicable` → `#9C8E7C`
- Labels: `#9C8E7C` uppercase

### Split Builder
- Panel divider: `#E8E0D4`
- Research panel bg: `#FAF8F5`
- Research chat status: lightweight inline, warm muted

### Angle Selection (Round 3)
- Option cards: white, `#E8E0D4` border
- Selected: `#7C6A56` left border accent (4px), `#F5F0EA` fill
- "Use this" button: ghost style, warm text

### Approve Button
- `#2C2418` bg, white text

---

## 6. Outline Builder (Stage 2)

### Section Rows
- White card, `#E8E0D4` border, `border-radius: 6px`
- Left border accents (warm palette) — positional logic matches current code in `SectionRow.tsx`:
  - First section (hook): `border-l-[#C4963C]` (warm amber, was `border-l-blue-400`)
  - Last section (takeaway): `border-l-[#5E8C61]` (sage green, was `border-l-green-400`)
  - Middle sections (body): `border-l-[#7C6A56]` (warm brown, was `border-l-gray-300`)
  - If `narrative_role` field exists on data model, use role-based; otherwise keep positional
- Section labels: small uppercase `#9C8E7C`
- contentEditable text: `#2C2418`, `line-height: 1.6`
- Drag handle: `#D4C9BA` dots, darker on hover

### Screen Type Badges
- Pill: `#F5F0EA` bg, `#7C6A56` text, no border

### Duration/Word Count
- Right-aligned, `#9C8E7C` muted, small

### Evidence Research View
- Evidence claims: white cards, `#5E8C61` left border
- Source citations: `#9C8E7C` small text

---

## 7. Draft Builder (Stage 3)

### Processing View
- Progress bar fill: `#7C6A56`
- Status text: `#9C8E7C` lightweight inline
- Percentage: `#2C2418`

### Panel Cards
- White, `#E8E0D4` border, `border-radius: 8px`, warm shadow `0 1px 3px rgba(44,36,24,0.04)`
- Screen number: small `#9C8E7C` label
- Screen type badge: `#F5F0EA` bg, `#7C6A56` text pill
- Narrative role: tiny uppercase `#9C8E7C`

### Voiceover Text Block
- `#F5F0EA` bg, `border-radius: 4px`, comfortable padding
- `#2C2418` text, `line-height: 1.6`

### Visual Direction
- Bullet points: `#9C8E7C`
- Text: `#2C2418`
- No card wrapper, indented list under small label

### Text Overlay
- `#F5F0EA` bg, `border-dashed #D4C9BA`

### Placeholder Images
- Present: `border-radius: 6px`, `#E8E0D4` border
- Missing: `#F5F0EA` box, muted icon

---

## 8. Review Builder (Stage 4)

### Review Cards
- White, `#E8E0D4` border, `border-radius: 8px`, warm shadow
- Hover: border → `#D4C9BA`, shadow increases
- Edit mode: `#7C6A56` border, warm focus ring

### Summary Stats Bar
- `#F5F0EA` bg strip
- Numbers: `#2C2418` bold
- Labels: `#9C8E7C`
- Warm dividers between stats

### PDF Export Button
- Secondary: white bg, `#E8E0D4` border, `#2C2418` text

### PDF Document
- Header title: `#2C2418`
- Card borders: warm
- Section labels: `#9C8E7C`

---

## 9. Projects Page

- Project cards: white, `#E8E0D4` border, `border-radius: 8px`, warm shadow on hover
- Progress bar fill: `#7C6A56`
- Title: `#2C2418`, `-0.3px` letter-spacing
- Metadata: `#9C8E7C`
- Empty state: warm muted text

---

## 10. Chat Panel (EnhancedChatbot)

- Header: `#2C2418` dark warm (matches app header)
- Chat bg: `#FAF8F5`
- User messages: `#2C2418` bg, white text (dark bubbles)
- AI messages: white bg, `#E8E0D4` border
- Input: white, `#E8E0D4` border, `#7C6A56` focus ring
- Send button: `#2C2418`
- Status messages: `#9C8E7C` inline, no bubble

---

## 11. Modals & Dialogs

- Overlay: `rgba(44,36,24,0.4)` warm dark
- Modal card: white, `border-radius: 10px`, warm shadow
- Buttons: same warm primary/secondary pattern

---

## Out of Scope

- **Admin Dashboard** (`admin/AdminDashboard.tsx`) — internal tool, not user-facing. Skip for now.
- **Storyboard legacy components** (`StoryboardPanel.tsx`, `StoryboardSidebar.tsx`, `StoryboardMainContent.tsx`, `StoryboardEditor.tsx`, `StoryboardHeader.tsx`) — legacy code, not part of active stage pipeline. Skip.

## Files to Modify

### Layer 1: Theme Foundation (do first — cascades to all semantic-token-using components)
- `frontend/src/index.css` — Replace neutral scale with warm scale, update all semantic token mappings, remove `.dark {}` block, add heading letter-spacing
- `frontend/src/App.tsx` — Remove ThemeToggle import + component, remove subtitle text, update header to use warm tokens

### Layer 2: Global Components
- `frontend/src/components/StageNavigation.tsx` — Remove stage numbers, warm active/inactive styling, left border accent
- `frontend/src/components/StageLayout.tsx` — Mobile menu button, save status indicator warm colors
- `frontend/src/components/LandingPage.tsx` — Full warm editorial rework + "How it works" section
- `frontend/src/components/OnboardingPage.tsx` — Warm cards, left-aligned form layout
- `frontend/src/components/ProjectsPage.tsx` — Warm cards, progress bar color

### Layer 3: Stage Components (hardcoded colors that won't cascade from Layer 1)
- `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx` — Warm badge colors (hardcoded `bg-green-500` etc.)
- `frontend/src/components/BriefBuilder/UserView/StatusBadge.tsx` — Warm status colors (hardcoded `bg-green-*` etc.)
- `frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx` — Hardcoded `bg-green-100 text-green-800`
- `frontend/src/components/BriefBuilder/RoundForms/CollapsibleSection.tsx` — Hardcoded `bg-green-50`, `bg-green-500`
- `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx` — Hardcoded `text-yellow-600 bg-yellow-50`
- `frontend/src/components/BriefBuilder/RoundForms/AngleSelectionForm.tsx` — Warm selection cards
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/index.tsx` — Panel divider color
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/MobileDrawer.tsx` — Hardcoded `bg-blue-50`, `bg-green-50`, `bg-red-50`
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/ResearchPanel/ResearchChat.tsx` — Warm status
- `frontend/src/components/OutlineBuilder/SectionRow.tsx` — Warm border accents (hardcoded `border-l-blue-400` etc.)
- `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` — Warm card styling
- `frontend/src/components/DraftBuilder/ProcessingView/ProcessingView.tsx` — Warm progress bars
- `frontend/src/components/DraftBuilder/UserView/PanelCard.tsx` — Warm panel cards
- `frontend/src/components/DraftBuilder/types.ts` — Badge color map update
- `frontend/src/components/ReviewBuilder/ReviewCard.tsx` — Warm hover-to-edit cards
- `frontend/src/components/ReviewBuilder/UserView.tsx` — Stats bar, PDF styles
- `frontend/src/components/StageContent.tsx` — Buttons and status UI warm treatment
- `frontend/src/components/DiffView.tsx` — Hardcoded `bg-red-50`, `bg-green-50`
- `frontend/src/components/SourceBadge.tsx` — Hardcoded `bg-blue-50 text-blue-700`, `bg-purple-50`

### Layer 4: Tab Toggles (all use `bg-muted/30`, `border-primary` — mostly handled by Layer 1, verify)
- `frontend/src/components/BriefBuilder/TabToggle.tsx`
- `frontend/src/components/DraftBuilder/TabToggle.tsx`
- `frontend/src/components/ReviewBuilder/TabToggle.tsx`

### Layer 5: Chat & Modals
- `frontend/src/components/EnhancedChatbot.tsx` — Warm chat theme
- `frontend/src/components/ChatMessage.tsx` — Chat bubble warm styling
- `frontend/src/components/SatisfactionRatingModal.tsx` — Warm overlay + modal

### Layer 6: UI Primitives (verify after Layer 1 — may need tweaks)
- `frontend/src/components/ui/button.tsx` — Verify warm variant appearance
- `frontend/src/components/ui/badge.tsx` — Verify warm color variants
- `frontend/src/components/ui/input.tsx` — Verify focus ring color
- `frontend/src/components/ui/textarea.tsx` — Verify focus ring color
- `frontend/src/components/ui/card.tsx` — Verify shadow treatment
- `frontend/src/components/ui/tabs.tsx` — Verify `bg-muted` appearance

### Hardcoded Color Replacement Guide

All hardcoded Tailwind color classes must be replaced with warm equivalents:

| Hardcoded Class | Warm Replacement |
|----------------|-----------------|
| `bg-green-500` | `bg-[#5E8C61]` |
| `bg-green-50`, `bg-green-100` | `bg-[#EFF5F0]` (sage tint) |
| `text-green-600`, `text-green-700`, `text-green-800` | `text-[#5E8C61]` |
| `bg-blue-500` | `bg-[#7C6A56]` (primary) |
| `bg-blue-50` | `bg-[#F5F0EA]` (warm-2 tint) |
| `text-blue-700` | `text-[#7C6A56]` |
| `bg-amber-500` | `bg-[#C4963C]` |
| `bg-yellow-50` | `bg-[#FBF6ED]` (amber tint) |
| `text-yellow-600` | `text-[#C4963C]` |
| `bg-red-500` | `bg-[#C4644A]` |
| `bg-red-50` | `bg-[#FBF0ED]` (red tint) |
| `text-red-600` | `text-[#C4644A]` |
| `bg-purple-50` | `bg-[#F5F0EA]` (use warm-2) |
| `border-l-blue-400` | `border-l-[#C4963C]` (hook) or `border-l-[#7C6A56]` (body) |
| `border-l-green-400` | `border-l-[#5E8C61]` (takeaway) |
| `border-l-gray-300` | `border-l-[#7C6A56]` (body) |
| `bg-black/50`, `bg-black/20` | `bg-[#2C2418]/40`, `bg-[#2C2418]/20` |
