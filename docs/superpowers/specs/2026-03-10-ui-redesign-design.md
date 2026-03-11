# UI Redesign: Warm Editorial Polish

**Date:** 2026-03-10
**Direction:** Warm & Editorial — creative studio feel, off-white warmth, subtle borders
**Target audience:** Marketing / content teams (high visual expectations)
**Approach:** Component-by-component polish (theme reskin + individual surface rework)
**Structure:** Keep current sidebar + content layout (no structural changes)
**Layout rule:** Left-aligned body content throughout — no centering. Comfortable left padding, max-width on form elements (~640px) to prevent stretching, but content block sits left.

---

## 1. Color & Typography Foundation

### Color Tokens

| Token | Current | New | CSS Variable |
|-------|---------|-----|-------------|
| Page background | `#ffffff` / `#fafafa` | `#FAF8F5` | `--background` |
| Card / surface | `#ffffff` | `#FFFFFF` | `--card` |
| Border | `#e5e5e5` | `#E8E0D4` | `--border` |
| Text primary | `#0a0a0a` | `#2C2418` | `--foreground` |
| Text secondary / muted | `#737373` | `#9C8E7C` | `--muted-foreground` |
| Primary accent | blue | `#7C6A56` (warm brown) | `--primary` |
| Primary foreground | white | `#FFFFFF` | `--primary-foreground` |
| Header background | `#1a1a1a` | `#2C2418` | `--header-background` |
| Header border | current | `#3D3226` | `--header-border` |
| Active/selected bg | `primary/10` | `#F5F0EA` | `--accent` |
| Hover border | — | `#D4C9BA` | — |
| Success | green | `#5E8C61` (sage) | `--success` |
| Warning | yellow/amber | `#C4963C` (warm amber) | `--warning` |
| Danger | red | `#C4644A` (warm red) | `--danger` |
| Muted background | — | `#F5F0EA` | `--muted` |
| Warm shadow | — | `rgba(44,36,24,0.04)` | — |
| Warm shadow hover | — | `rgba(44,36,24,0.08)` | — |
| Warm overlay | `rgba(0,0,0,0.5)` | `rgba(44,36,24,0.4)` | — |

### Typography

- **Font:** Keep Inter (clean, professional)
- **Heading letter-spacing:** `-0.3px` to `-0.5px` for editorial tightness
- **Body line-height:** `1.6` for comfortable reading
- **Text color:** `#2C2418` throughout — never pure black

### Spacing

- Cards and sections: more generous padding (`16px` / `24px` rhythm)
- Form field gaps: `gap-6` (24px) between fields
- Page content: left padding `px-8` or `px-12`

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
- Below CTA: minimal 3-step "How it works" (Brief > Outline > Storyboard) or simple workspace mockup
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
- Status badge warm tones:
  - Confirmed: `#5E8C61` (sage)
  - Provided: `#7C6A56` (warm brown)
  - AI-suggested: `#C4963C` (warm amber)
  - Needs input: `#C4644A` (warm red)
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
- Left border accents (warm palette):
  - Hook: `#C4963C` (warm amber)
  - Body: `#7C6A56` (warm brown)
  - Takeaway: `#5E8C61` (sage green)
  - CTA: `#9C8E7C` (warm gray)
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

## Files to Modify

### Theme Foundation
- `frontend/src/index.css` — CSS custom property overhaul (all color tokens)

### Global Components
- `frontend/src/App.tsx` — Header styling, remove subtitle
- `frontend/src/components/StageNavigation.tsx` — Warm sidebar, remove numbers
- `frontend/src/components/LandingPage.tsx` — Full warm editorial rework
- `frontend/src/components/OnboardingPage.tsx` — Warm cards, left-aligned form
- `frontend/src/components/ProjectsPage.tsx` — Warm cards, progress bar

### Stage Components
- `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx` — Warm card + badges
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/index.tsx` — Panel divider color
- `frontend/src/components/BriefBuilder/SplitBriefBuilder/ResearchPanel/ResearchChat.tsx` — Warm status
- `frontend/src/components/BriefBuilder/RoundForms/AngleSelectionForm.tsx` — Warm selection cards
- `frontend/src/components/OutlineBuilder/SectionRow.tsx` — Warm border accents
- `frontend/src/components/OutlineBuilder/OutlineBuilder.tsx` — Warm card styling
- `frontend/src/components/DraftBuilder/ProcessingView/ProcessingView.tsx` — Warm progress bars
- `frontend/src/components/DraftBuilder/UserView/PanelCard.tsx` — Warm panel cards
- `frontend/src/components/DraftBuilder/types.ts` — Badge color map update
- `frontend/src/components/ReviewBuilder/ReviewCard.tsx` — Warm hover-to-edit cards
- `frontend/src/components/ReviewBuilder/UserView.tsx` — Stats bar, PDF styles

### Chat & Modals
- `frontend/src/components/EnhancedChatbot.tsx` — Warm chat theme
- `frontend/src/components/SatisfactionRatingModal.tsx` — Warm overlay + modal

### UI Primitives (if needed)
- `frontend/src/components/ui/button.tsx` — May need warm variant adjustments
- `frontend/src/components/ui/badge.tsx` — Warm color variants
- `frontend/src/components/ui/input.tsx` — Focus ring color
