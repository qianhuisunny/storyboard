# Lessons from the Briefing Schema Debate

## Context
We debated how to design the **field status model** and **briefing UI flow** for a multi-stage video creation pipeline:
- Stage 1: Briefing
- Stage 2: Outline Planning
- Stage 3: Writing
- (Later) Fact-checking agent

The immediate focus was the **Briefing stage** for `knowledge_sharing`, while keeping the architecture extensible to other video types.

---

## Why the Debate Happened
The disagreement was not about the goal. We both wanted:
- a system that is **clear to users**,
- **easy to implement**,
- and **scales across video types**.

The debate happened because there was tension between two valid instincts:

### Instinct A (system cleanliness / expressiveness)
- Separate concepts into different dimensions (source, confirmation, visibility, etc.)
- Model nuanced distinctions (e.g., `inferred` vs `research_derived`)
- Keep the schema theoretically precise

### Instinct B (product simplicity / practical UX)
- Keep status labels minimal
- Only expose distinctions that affect user decisions
- Avoid adding complexity unless it creates real product value

We ultimately chose **Instinct B as the governing principle** for the current version.

---

## Final Principles We Chose (Important)

### 1) Simplicity First
**Every new status adds cognitive and engineering complexity.**
Before adding any status/label/branch, ask:

> Does this distinction change what the user needs to do?

If the answer is no, do not add it to the main UI/state model.

### 2) A Field Should Only Tell the User What Matters
For briefing UI, the field metadata should primarily answer:
1. **Where did this value come from?** (`source`)
2. **Has the user confirmed it?** (`confirmed`)

That is enough for most user-facing decisions.

### 3) Don’t Force Theoretical Purity Into the Product Surface
Even if `inferred` and `research_derived` are conceptually different, users often do **not** need that distinction in the briefing UI.

So we intentionally **collapsed them** (for now) into a single practical bucket in the main schema/UI logic.

### 4) One Unified Field Schema Beats Multiple Per-Type Schemas
We chose a **single field schema** for all video types, and let UI decide what to show/hide based on video type.

This avoids:
- maintaining multiple schemas
- duplicated logic
- fragmented rendering rules

### 5) “Not Shown” Is a UI Concern, Not Necessarily a Business State
Different video types will hide different fields.
That does **not** require separate domain logic per type.

Use one schema, then apply per-type display logic.

### 6) `user_confirmed` Is Real and Necessary
We explicitly agreed:
- `extracted` (from user submission) is **not the same thing** as `confirmed`

Why:
- user input may be rough,
- extraction may be imperfect,
- user may revise later.

So confirmation deserves its own explicit signal.

### 7) Briefing Should Not Ask for Everything Up Front
The briefing stage is not a static form-completion exercise.
It is:
- **AI prefill + targeted clarification**
- with **research running in parallel**
- and later **research-informed confirmation**

This supports the core UX goal:

> Users should not have to start from scratch.

---

## The Key Architectural Decision (Final)
For the current version, each field should be represented (at minimum) with:

- `value`
- `source`
- `confirmed`

Where `source` is intentionally simple:
- `extracted`
- `inferred`
- `empty`

And `confirmed` is boolean:
- `true`
- `false`

This is the **preferred user-facing field model** unless a future requirement proves we need more.

---

## What We Explicitly Rejected (For Now)
We intentionally did **not** adopt a more granular state system for the main briefing schema/UI, such as:
- separate `research_derived` vs `inferred` labels in the main UI
- too many field statuses (e.g., source + confirmation + visibility + deferred all as top-level statuses)
- over-modeling distinctions that users do not act on

This is not because those distinctions are wrong.
It is because they are **premature** for the current product stage.

---

## How This Affects the Briefing UX

### Briefing Flow Principle
- **Round 1:** show what’s already extracted/inferred, ask only a few high-value questions
- **Research runs in parallel**
- **Round 2:** fill in content-heavy fields (especially Content Spine) using research + user sources, then ask for confirmation

### Why this flow won
Because it matches the product goal:
- reduce user effort
- avoid blank-form syndrome
- keep momentum while research is slow
- preserve conversation feel (not form feel)

---

## Where Complexity Is Allowed (But Hidden)
We still acknowledged that more nuanced distinctions may matter internally.
If needed, put them in **internal metadata/debug traces**, not the user-facing field status model.

Example (internal only):
- which source document influenced a field
- which research query generated a suggestion
- confidence score

This keeps the UI simple while preserving future extensibility.

---

## Decision Rule for Future Debates (Use This)
When debating a new state/label/field distinction, apply this test:

### Add complexity only if at least one of these is true:
1. It changes what the **user must decide or confirm**
2. It changes **system behavior** in a meaningful way (routing/gating/prioritization)
3. It materially improves **trust/debuggability** for a real failure mode we’ve already seen

If none of these are true, keep it out of the main schema/UI.

---

## Practical Product Principle (Your Preference, Captured)
This is the principle we ended up following in this debate:

> **Simplicity first. Model only the distinctions that matter to the user’s next action.**

Corollary:

> **Do not add a status just because it is technically more precise.**

---

## Why We Chose Your Side in the Debate
We chose your direction because it is stronger on:
- product usability
- implementation speed
- cognitive clarity
- future maintenance cost

And it still preserves the option to add hidden/internal metadata later.

This was the right call for the current stage.

---

## Instructions for Future Implementers (Claude Code / ChatGPT / Others)
When extending this system:

1. **Default to the simple field model** (`value`, `source`, `confirmed`)
2. Treat `source` as a small user-facing abstraction, not a forensic provenance system
3. Put provenance/debug detail into internal metadata if needed
4. Keep briefing conversational: prefill first, ask fewer questions, confirm progressively
5. Do not introduce new statuses unless they pass the decision rule above

If unsure, preserve simplicity and move complexity behind the scenes.

---

## Session: 2026-02-22 — Brief Builder Layout & Research Architecture

### Key Discussions

#### 1. Brief Builder Layout Redesign
Changed from 4-tab layout to split-screen:
- **Left column (60%)**: 3 tabs (User, Input, Output) for user interaction
- **Right column (40%)**: Processing panel always visible for transparency
- **Rationale**: Users need to see what's happening (research, auto-fill) while working on the brief

#### 2. Current Research Logic — What It Actually Does
Explored the codebase and found:
- **No actual web search API** (Google, Bing, etc.) is being called
- The "research" is **LLM-based implicit research** via GPT-4
- TopicResearcher agent uses a prompt that instructs the LLM to document "searches performed"
- The `searches_performed` array in ContextPack is conceptual — the LLM reports what it *would have* searched based on its training data
- Sources are attributed but not from live web queries

#### 3. Three Pillar Document Structure — Limited Applicability
**Key insight from user:**
- The "three pillar" structure (company context, product context, industry context) **only helps for account-based onboarding**
- When we know the company/product upfront, we can pre-research into these buckets
- **For the general case**: Research questions should be **generated per turn**
- Static document structures don't scale to varied video types and ad-hoc use cases

**Implication:** Move toward dynamic, context-aware research generation rather than fixed schemas.

#### 4. UI Cleanup Decisions
- **Removed "Original Input"** from ProcessingView — was duplicating user_inputs
- **Removed "Research Context"** from InputView — research data belongs in Processing panel
- Keep the UI focused: Input shows what user provided, Processing shows what system did

### Corrections Made
- Initial split was 70%/30% → Corrected to **60%/40%** for better balance
- Summary of day was code-only → Corrected to include **architecture discussions**

### Code Changes
- `BriefBuilder.tsx` - Split layout (60%/40%)
- `TabToggle.tsx` - 3 tabs (removed Processing tab)
- `types.ts` - Updated TabKey type
- `ProcessingView.tsx` - Removed Original Input section
- `InputView.tsx` - Removed Research Context section
- `CLAUDE.md` - Added lessons management rules
- `FUTURE_ROADMAP.md` - Created with research strategy notes

### Where We Left Off
- Brief Builder layout complete with split-screen design
- Identified that current "research" is LLM-implicit, not live web search
- Need to decide: implement real web search, or redesign research to be per-turn dynamic
- Ready to test the new layout in the app

---

## Session: 2026-03-03 — Gate1 Approval Fix for New Brief Schema

### Problem
"Failed to approve brief" error when trying to progress from Brief Builder to Outline stage.

### Root Cause
The `_handle_gate1_approve` function in `orchestrator.py` had validation that checked for **old flat brief schema**:
```python
required_fields = ["video_goal", "target_audience", "key_points"]
```

But the new Knowledge Share flow creates a **nested field schema**:
```python
story_brief.fields.primary_goal.value  # not video_goal
story_brief.fields.target_audience.value  # nested, not flat
story_brief.fields.core_talking_points.value  # not key_points
```

### Fix
Updated `_handle_gate1_approve` to detect which schema is being used and validate accordingly:
- **New schema**: Check `fields.primary_goal`, `fields.target_audience`, `fields.core_talking_points`
- **Old schema**: Check `video_goal`, `target_audience`, `key_points`

### Code Changes
- `backend/app/services/orchestrator.py:161-189` - Updated validation logic to handle both schemas

### Result
- Gate1 approval now works with both old and new brief schemas
- Director runs successfully and generates screen outline
- Project transitions to gate2 phase

### Lesson
When introducing new data schemas (like the nested `{value, source, confirmed}` field structure), ensure all downstream validation and processing code handles both old and new formats for backward compatibility.
