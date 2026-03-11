# Green Theme Component Polish — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match every component's font-size, font-weight, padding, gap, border-radius, and layout to the reference mockup at `/Users/qianhuisun/Desktop/plotline-green-lightnav.html`.

**Architecture:** The color palette (green-tinted sage scale) is already correct. This plan fixes the *component-level* styling: exact pixel sizes, font weights, padding, border-radius, and layout structure — the details that make the app look like the mockup instead of "close but wrong." Each task targets one component file.

**Tech Stack:** React, Tailwind CSS v4, CSS custom properties, Fraunces + Nunito fonts (Google Fonts)

**Reference:** All pixel values come from the mockup CSS. When the plan says "mockup: X", it means the exact CSS value from `plotline-green-lightnav.html`.

---

## Chunk 1: Foundation + Chrome

### Task 1: Base font-size and body styles

**Files:**
- Modify: `frontend/src/index.css`

The mockup sets `body { font-size: 13.5px }`. Currently we use Tailwind's default (16px). This affects every `text-sm` / `text-xs` relative size in the app.

- [ ] **Step 1: Add explicit body font-size**

In `frontend/src/index.css`, inside the `@layer base` block, change the `body` rule:

```css
body {
  @apply bg-background text-foreground antialiased;
  font-family: var(--font-body);
  font-size: 13.5px;
  line-height: 1.6;
}
```

- [ ] **Step 2: Adjust heading styles**

Mockup headings use `font-weight: 400` (light) for h1, not 600. Update:

```css
h1 {
  font-family: var(--font-heading);
  font-weight: 400;
  letter-spacing: -0.6px;
  line-height: 1.15;
}
h2 {
  font-family: var(--font-heading);
  font-weight: 400;
  letter-spacing: -0.3px;
}
h3, h4, h5, h6 {
  font-family: var(--font-heading);
  font-weight: 600;
  letter-spacing: -0.3px;
}
```

- [ ] **Step 3: Add custom scrollbar styles**

Mockup has thin scrollbars. Add after the `@layer base` block:

```css
/* Custom scrollbar */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #BFC6B5; border-radius: 2px; }
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -3`
Expected: `✓ built in Xs`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/index.css
git commit -m "style: set body font-size 13.5px, heading weights, custom scrollbar"
```

---

### Task 2: Nav bar (App.tsx header)

**Files:**
- Modify: `frontend/src/App.tsx:36-79`

**Mockup reference:**
- Nav height: 54px, padding: `0 22px`
- Logo: Fraunces 20px, weight 400, color `#3A6B47`, letter-spacing -0.3px
- Beta badge: 9.5px, weight 600, color `#8D9885`, bg `#F3F5F0`, border `#D9DDD2`, padding `2px 6px`, border-radius 4px, uppercase, letter-spacing 0.6px
- Nav links: 13px, weight 400, color `#5A6352`, padding `6px 11px`, border-radius 6px, hover: bg `#EEF1E9` + color `#1C2118`

- [ ] **Step 1: Update header container**

Change the header className:
```
From: className="bg-[var(--header-background)] text-[var(--header-foreground)] border-b border-[var(--header-border)] px-4 py-3.5 flex-shrink-0"
To:   className="bg-[var(--header-background)] text-[var(--header-foreground)] border-b border-[var(--header-border)] flex-shrink-0 flex items-center" style={{ height: "54px", padding: "0 22px" }}
```

Remove the inner `<div className="flex items-center justify-between">` wrapper — the header itself is now the flex container with `justify-between` from the Link and nav-links.

- [ ] **Step 2: Update logo and beta badge**

Logo h1 should be:
```tsx
<h1 className="text-[20px] text-[#3A6B47]" style={{ fontFamily: "'Fraunces', serif", fontWeight: 400, letterSpacing: "-0.3px" }}>
  Plotline
</h1>
```

Beta badge should be:
```tsx
<span className="text-[9.5px] font-semibold text-[#8D9885] bg-[#F3F5F0] border border-[#D9DDD2] rounded uppercase relative -top-px" style={{ padding: "2px 6px", letterSpacing: "0.6px" }}>
  Beta
</span>
```

- [ ] **Step 3: Update nav link styling**

Each nav link (My Projects, Analytics, Eval) should be:
```tsx
className="text-[13px] font-normal text-[#5A6352] rounded-md transition-all hover:bg-[#EEF1E9] hover:text-[#1C2118]"
style={{ padding: "6px 11px" }}
```

- [ ] **Step 4: Verify build**

Run: `cd frontend && npx vite build 2>&1 | tail -3`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "style: match nav bar to mockup — 54px height, link padding, Fraunces logo"
```

---

### Task 3: Sidebar (StageNavigation.tsx)

**Files:**
- Modify: `frontend/src/components/StageNavigation.tsx`

**Mockup reference:**
- Sidebar: width 220px, bg `#FAFBF8`, border-right, padding `22px 0`
- Section label: 10px, weight 700, letter-spacing 0.9px, uppercase, color `#8D9885`, padding `0 18px 10px`
- Stage item: padding `10px 18px`, gap 11px, NO border-radius, transition 0.12s
- Active item: bg `#E8F0E9`, left border via `::before` pseudo (3px wide, rounded ends)
- Stage num circle: 24px × 24px, border `1.5px solid #BFC6B5`, text 11px Fraunces weight 600, color `#8D9885`
- Active circle: bg `#3A6B47`, border-color `#3A6B47`, white text
- Stage name: 13px, weight 500, color `#1C2118`. Active: color `#3A6B47`, weight 600
- Status sub: 11px, color `#8D9885`, margin-top 2px
- Divider: 1px solid `#D9DDD2`, margin `14px 18px`
- My Projects link: padding `8px 18px`, gap 8px, 13px, color `#5A6352`, hover bg `#EEF1E9`

- [ ] **Step 1: Update nav wrapper**

```tsx
<nav className="h-full border-r border-border bg-[#FAFBF8] flex-shrink-0 overflow-y-auto flex flex-col" style={{ width: "220px", padding: "22px 0" }}>
```

- [ ] **Step 2: Update section label**

```tsx
<h2 className="uppercase text-[#8D9885]" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.9px", padding: "0 18px 10px" }}>
  Stages
</h2>
```

- [ ] **Step 3: Update stage item buttons**

Remove `rounded-md` from buttons. Change padding/gap. Each button:
```tsx
className={cn(
  "w-full text-left transition-colors relative",
  "flex items-center",
  isActive
    ? "bg-[#E8F0E9]"
    : isClickable
    ? "hover:bg-[#EEF1E9]"
    : "text-[#8D9885] cursor-not-allowed opacity-50"
)}
style={{ padding: "10px 18px", gap: "11px" }}
```

Add a `::before`-style left accent for active state via an absolutely positioned div:
```tsx
{isActive && (
  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#3A6B47] rounded-r-sm" />
)}
```

- [ ] **Step 4: Update stage number circle**

Inactive (default):
```tsx
style={{ width: "24px", height: "24px", border: "1.5px solid #BFC6B5", fontSize: "11px", fontWeight: 600, fontFamily: "'Fraunces', serif" }}
className="rounded-full flex items-center justify-center text-[#8D9885] flex-shrink-0"
```

Active:
```tsx
style={{ width: "24px", height: "24px", border: "1.5px solid #3A6B47", fontSize: "11px", fontWeight: 600, fontFamily: "'Fraunces', serif" }}
className="rounded-full flex items-center justify-center bg-[#3A6B47] text-white flex-shrink-0"
```

- [ ] **Step 5: Update stage name + sub text**

Name:
```tsx
<span className={cn("truncate", isActive ? "text-[#3A6B47]" : "text-[#1C2118]")} style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, lineHeight: "1.2" }}>
  {stage.name}
</span>
```

Sub text (only shown when active):
```tsx
<span className="block text-[#8D9885]" style={{ fontSize: "11px", marginTop: "2px" }}>
  {statusLabels[stage.status]}
</span>
```

- [ ] **Step 6: Update divider + My Projects link**

Divider: `<div className="bg-[#D9DDD2]" style={{ height: "1px", margin: "14px 18px" }} />`

My Projects link:
```tsx
className="flex items-center text-[#5A6352] hover:bg-[#EEF1E9] hover:text-[#1C2118] transition-all"
style={{ padding: "8px 18px", gap: "8px", fontSize: "13px" }}
```

Remove the existing `<div className="pt-4 border-t border-border mt-4">` wrapper — use the divider approach instead.

- [ ] **Step 7: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/StageNavigation.tsx
git commit -m "style: match sidebar to mockup — 220px width, exact padding/gaps, ::before accent"
```

---

## Chunk 2: Brief Builder Components

### Task 4: Progress bar (KnowledgeShareBriefBuilder.tsx)

**Files:**
- Modify: `frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx` (progress bar section, ~lines 379–430)

**Mockup reference:**
- Progress bar: bg `#FAFBF8`, border `1px solid #D9DDD2`, border-radius 10px, overflow hidden, margin-bottom 28px
- Step segment: flex 1, gap 9px, padding `11px 16px`, border-right `1px solid #D9DDD2` (except last)
- Active step: bg `#E8F0E9`. Done step: opacity 0.55
- Step circle: 26px, border `1.5px solid #BFC6B5`, font 12px Fraunces weight 700, color `#8D9885`
- Active circle: bg `#3A6B47`, border `#3A6B47`, white
- Done circle: bg `#E6F2EB`, border `#2D6A4F`, text `#2D6A4F`
- Step label: 10.5px, color `#8D9885`, letter-spacing 0.2px
- Step name: 13px, weight 600. Active: color `#3A6B47`

- [ ] **Step 1: Update progress bar wrapper**

Change the outer `<div className="flex-shrink-0 px-4 py-3">` and inner flex to:
```tsx
<div className="flex-shrink-0" style={{ padding: "0 38px", marginBottom: "0" }}>
  <div className="flex items-stretch bg-[#FAFBF8] border border-[#D9DDD2] overflow-hidden" style={{ borderRadius: "10px", marginBottom: "28px" }}>
```

- [ ] **Step 2: Update each step segment**

```tsx
<div
  key={String(round)}
  className={cn(
    "flex-1 flex items-center cursor-pointer transition-colors",
    index < 4 && "border-r border-[#D9DDD2]",
    isActive && "bg-[#E8F0E9]",
    !isActive && "hover:bg-[#EEF1E9]",
    (isPast && !isActive) && "opacity-55"
  )}
  style={{ gap: "9px", padding: "11px 16px" }}
>
```

- [ ] **Step 3: Update step circle**

```tsx
<div
  className={cn(
    "flex-shrink-0 rounded-full flex items-center justify-center",
    isActive && "bg-[#3A6B47] text-white",
    (isCompleted || isPast) && !isActive && "bg-[#E6F2EB] text-[#2D6A4F]",
    !isActive && !isCompleted && !isPast && "text-[#8D9885]"
  )}
  style={{
    width: "26px", height: "26px",
    border: isActive ? "1.5px solid #3A6B47" : (isCompleted || isPast) ? "1.5px solid #2D6A4F" : "1.5px solid #BFC6B5",
    fontSize: "12px", fontWeight: 700, fontFamily: "'Fraunces', serif"
  }}
>
  {isCompleted || isPast ? "✓" : round === "review" ? "R" : round === "angle_selection" ? "A" : round}
</div>
```

- [ ] **Step 4: Update step labels**

```tsx
<div>
  <div className="text-[#8D9885]" style={{ fontSize: "10.5px", letterSpacing: "0.2px", lineHeight: "1.3" }}>Step {index + 1}</div>
  <div className={cn("text-[#1C2118]", isActive && "text-[#3A6B47]")} style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.3" }}>{stepNames[index]}</div>
</div>
```

- [ ] **Step 5: Update error banner**

Already close, but ensure: `padding: 11px 16px`, `font-size: 13px`, `font-weight: 500`, `border-radius: 8px`, `margin-bottom: 22px`.

- [ ] **Step 6: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx
git commit -m "style: match progress bar + error banner to mockup exact values"
```

---

### Task 5: Field card (FieldCard.tsx)

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx`

**Mockup reference:**
- Card: bg `#FAFBF8`, border `1px solid #D9DDD2`, border-radius 10px, padding `15px 18px`, hover: border-color `#BFC6B5`
- Confirmed card: border `#A8CBAF`, bg `#F7FBF7`
- Field top: flex, justify-content space-between, align-items center, margin-bottom 10px, gap 10px
- Label: 13px, weight 600, color `#1C2118`
- Badge: 10px, weight 700, letter-spacing 0.3px, padding `2px 7px`, border-radius 20px, uppercase
  - confirmed: bg `#E6F2EB`, text `#2D6A4F`
  - needs: bg `#F7F0E0`, text `#7A5C1E`
  - provided: bg `#E6EFF7`, text `#2E5F8A`
  - required: bg transparent, text `#8D9885`, border `1px solid #BFC6B5`
- Confirm button: 12px, weight 600, color `#3A6B47`, bg `#E8F0E9`, border `1px solid #A8C8AD`, padding `5px 13px`, border-radius 6px. Hover: bg `#3A6B47`, border `#3A6B47`, white text
- Field input: 13.5px, bg `#F3F5F0`, border `1px solid #D9DDD2`, border-radius 6px, padding `9px 12px`, Nunito. Focus: border `#3A6B47`, box-shadow `0 0 0 3px rgba(58,107,71,0.1)`
- Textarea: same as input, min-height 70px
- Select: same as input, padding-right 36px for custom chevron

- [ ] **Step 1: Update COLOR_CLASSES**

All badge colors use light bg + text color (already done), but verify padding/letter-spacing in the JSX.

- [ ] **Step 2: Update card wrapper**

```tsx
<div
  className={cn(
    "border transition-colors hover:border-[#BFC6B5]",
    color === "green" ? "border-[#A8CBAF] bg-[#F7FBF7]" : "border-[#D9DDD2] bg-[#FAFBF8]"
  )}
  style={{ borderRadius: "10px", padding: "15px 18px" }}
>
```

- [ ] **Step 3: Update field-top header layout**

```tsx
<div className="flex items-center justify-between" style={{ marginBottom: "10px", gap: "10px" }}>
  <div className="flex items-center flex-wrap" style={{ gap: "7px" }}>
    <span style={{ fontSize: "13px", fontWeight: 600, color: "#1C2118" }}>{label}</span>
    <span
      className={colorClasses.badge}
      style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px", padding: "2px 7px", borderRadius: "20px", textTransform: "uppercase" }}
    >
      {COLOR_LABELS[color]}
    </span>
    {isRequired && (
      <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px", padding: "2px 7px", borderRadius: "20px", textTransform: "uppercase", color: "#8D9885", border: "1px solid #BFC6B5" }}>
        Required
      </span>
    )}
  </div>
  {/* Confirm / Edit buttons */}
</div>
```

- [ ] **Step 4: Update confirm button**

```tsx
<button
  onClick={onConfirm}
  disabled={!hasContent}
  className="transition-all flex-shrink-0"
  style={{
    fontSize: "12px", fontWeight: 600,
    color: hasContent ? "#3A6B47" : "#8D9885",
    background: hasContent ? "#E8F0E9" : "#EEF1E9",
    border: hasContent ? "1px solid #A8C8AD" : "1px solid #D9DDD2",
    padding: "5px 13px", borderRadius: "6px",
    cursor: hasContent ? "pointer" : "not-allowed",
    opacity: hasContent ? 1 : 0.5,
  }}
  onMouseEnter={(e) => { if (hasContent) { e.currentTarget.style.background = "#3A6B47"; e.currentTarget.style.borderColor = "#3A6B47"; e.currentTarget.style.color = "white"; }}}
  onMouseLeave={(e) => { if (hasContent) { e.currentTarget.style.background = "#E8F0E9"; e.currentTarget.style.borderColor = "#A8C8AD"; e.currentTarget.style.color = "#3A6B47"; }}}
>
  Confirm
</button>
```

- [ ] **Step 5: Update input/textarea/select styles**

All text inputs should share these base styles:
```tsx
style={{
  fontSize: "13.5px", color: "#1C2118",
  background: "#F3F5F0", border: "1px solid #D9DDD2",
  borderRadius: "6px", padding: "9px 12px",
  width: "100%", fontFamily: "'Nunito', sans-serif",
}}
```

Textarea additionally: `minHeight: "70px"`, `resize: "vertical"`

Focus ring: `focus:border-[#3A6B47] focus:ring-[3px] focus:ring-[#3A6B47]/10`

- [ ] **Step 6: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/BriefBuilder/RoundForms/FieldCard.tsx
git commit -m "style: match field card to mockup — exact padding, badge sizes, confirm button"
```

---

### Task 6: StatusBadge (StatusBadge.tsx)

**Files:**
- Modify: `frontend/src/components/BriefBuilder/UserView/StatusBadge.tsx`

**Mockup reference:** Same badge spec as FieldCard badges.

- [ ] **Step 1: Update badge base styles**

Change the span className from:
```
inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border
```
to use inline style for exact sizes:
```tsx
<span
  className={cn("inline-flex items-center border", config.className)}
  style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px", padding: "2px 7px", borderRadius: "20px", textTransform: "uppercase", gap: "4px" }}
>
```

- [ ] **Step 2: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/BriefBuilder/UserView/StatusBadge.tsx
git commit -m "style: match status badge to mockup — 10px font, 700 weight, exact padding"
```

---

### Task 7: Section headers (RoundOneForm, RoundTwoForm, RoundThreeForm)

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/RoundOneForm.tsx`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/RoundTwoForm.tsx`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx`

**Mockup reference:**
- Section h1: Fraunces, 28px, weight 400, color `#1C2118`, letter-spacing -0.6px, line-height 1.15, margin-bottom 5px
- Section p: 13.5px, weight 300, color `#5A6352`
- Section wrapper: margin-bottom 22px

- [ ] **Step 1: Update all three form headers**

In each file, the header section should be:
```tsx
<div style={{ marginBottom: "22px" }}>
  <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 400, color: "#1C2118", letterSpacing: "-0.6px", lineHeight: "1.15", marginBottom: "5px" }}>
    Section N: Title
  </h2>
  <p style={{ fontSize: "13.5px", fontWeight: 300, color: "#5A6352" }}>
    Subtitle text
  </p>
</div>
```

Remove the current `border-b pb-4` wrapper and Tailwind classes — use exact inline styles instead.

- [ ] **Step 2: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/BriefBuilder/RoundForms/RoundOneForm.tsx frontend/src/components/BriefBuilder/RoundForms/RoundTwoForm.tsx frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx
git commit -m "style: match section headers to mockup — Fraunces 28px weight 400"
```

---

## Chunk 3: Main Content + Chat

### Task 8: Main content area padding (StageLayout.tsx)

**Files:**
- Modify: `frontend/src/components/StageLayout.tsx:560`

**Mockup reference:** Main area `padding: 30px 38px`, `min-width: 0`

- [ ] **Step 1: Update main content wrapper**

At line 560, the main content div:
```tsx
From: <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
```

The padding should be applied to the scroll content inside StageContent, not StageLayout's wrapper (which is flex layout). Find where the content area renders and ensure it uses `padding: 30px 38px`.

Check `StageContent.tsx` — the `KnowledgeShareBriefBuilder` is rendered inside it. The KnowledgeShareBriefBuilder's main scroll area at line ~449:
```tsx
<div className="flex-1 overflow-auto p-4 space-y-4 relative">
```
Change `p-4` (16px) to the mockup's `padding: 30px 38px`:
```tsx
<div className="flex-1 overflow-auto relative" style={{ padding: "30px 38px" }}>
  <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
```

Note: The `gap: 11px` matches the mockup's `.field-group { gap: 11px }`.

- [ ] **Step 2: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx
git commit -m "style: match main content padding to mockup — 30px 38px"
```

---

### Task 9: Chat panel (EnhancedChatbot.tsx + ChatMessage.tsx)

**Files:**
- Modify: `frontend/src/components/EnhancedChatbot.tsx`
- Modify: `frontend/src/components/ChatMessage.tsx`

**Mockup reference — Chat panel:**
- Width: 355px, bg `#FAFBF8`, border-left `1px solid #D9DDD2`, flex, flex-direction column, flex-shrink 0
- Header: padding `18px 20px 15px`, border-bottom, bg `#FAFBF8`
- Header h2: Fraunces, 18px, weight 400, color `#1C2118`, letter-spacing -0.3px
- Header p: 12px, color `#8D9885`, weight 300
- Messages area: flex 1, overflow-y auto, padding 16px, gap 14px
- Footer: border-top, padding `12px 16px`
- Footer status: 12px, muted, italic, Fraunces, weight 300

**Mockup reference — Message bubbles:**
- AI bubble: bg `#F3F5F0`, border `1px solid #D9DDD2`, border-radius `3px 10px 10px 10px`, padding `10px 13px`, font-size 13px, line-height 1.6
- User bubble: bg `#3A6B47`, color white, no border, border-radius `10px 10px 3px 10px`
- Sender label: 10px, weight 700, letter-spacing 0.5px, uppercase, color `#8D9885`
- Timestamp: 10px, color `#8D9885`, margin-top 1px

Note: The chat panel positioning (fixed vs. flex) is a **structural** question beyond pure styling. Do NOT change the positioning model in this plan — only update the visual styling.

- [ ] **Step 1: Update chat panel header**

```tsx
<div style={{ padding: "18px 20px 15px", borderBottom: "1px solid #D9DDD2", background: "#FAFBF8" }}>
  <div className="flex items-center space-x-2">
    <Bot className="w-5 h-5 text-[#3A6B47]" />
    <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: "18px", fontWeight: 400, color: "#1C2118", letterSpacing: "-0.3px" }}>
      Storyboard AI Assistant
    </h3>
  </div>
  <p style={{ fontSize: "12px", color: "#8D9885", fontWeight: 300, marginTop: "2px" }}>
    Edit and iterate your storyboard
  </p>
</div>
```

- [ ] **Step 2: Update ChatMessage bubble styling**

```tsx
// AI bubble
className="text-[#1C2118]"
style={{
  background: "#F3F5F0",
  border: "1px solid #D9DDD2",
  borderRadius: "3px 10px 10px 10px",
  padding: "10px 13px",
  fontSize: "13px",
  lineHeight: "1.6",
}}

// User bubble
style={{
  background: "#3A6B47",
  color: "white",
  border: "none",
  borderRadius: "10px 10px 3px 10px",
  padding: "10px 13px",
  fontSize: "13px",
  lineHeight: "1.6",
}}
```

- [ ] **Step 3: Verify build + commit**

```bash
cd frontend && npx vite build 2>&1 | tail -3
git add frontend/src/components/EnhancedChatbot.tsx frontend/src/components/ChatMessage.tsx
git commit -m "style: match chat panel + message bubbles to mockup exact values"
```

---

## Chunk 4: Visual Verification

### Task 10: Visual diff against mockup

**Files:** None (visual check only)

- [ ] **Step 1: Start dev server**

```bash
cd frontend && npm run dev
```

- [ ] **Step 2: Open the app and compare with mockup**

Open the app in browser. Open the mockup HTML in another tab. Compare:
1. Nav bar: height, logo style, link padding, beta badge
2. Sidebar: padding, stage item spacing, circle style, active state
3. Progress bar: segment padding, circle sizes, label fonts
4. Field cards: card padding, badge sizes/colors, confirm button
5. Section headers: font size/weight
6. Main content: padding
7. Chat panel: header, bubble shapes

- [ ] **Step 3: Fix any remaining pixel-level differences**

Address any remaining visual discrepancies found in step 2.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "style: final visual polish — pixel-level alignment with mockup"
```
