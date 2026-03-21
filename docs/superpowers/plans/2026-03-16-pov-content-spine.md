# POV-Driven Content Spine Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken Angle step with a user-authored POV that drives AI-generated content spine (talking points, misconceptions, must_avoid).

**Architecture:** Round 3 becomes two-phase: Phase 1 (user writes POV claim) → Phase 2 (AI generates argument structure). The `angle_selection` state is removed. Progress bar shrinks from 5 to 4 steps and becomes clickable.

**Tech Stack:** React/TypeScript frontend, FastAPI/Python backend, OpenAI LLM calls via BaseAgent

**Spec:** `docs/superpowers/specs/2026-03-16-pov-content-spine-redesign.md`

---

## Chunk 1: Backend — State Machine & Orchestrator

### Task 1: Update State Machine

**Files:**
- Modify: `backend/app/services/state.py:24-111`

- [ ] **Step 1: Remove `angle_selection` from phase literals**

In `state.py` line 31, delete:
```python
        "angle_selection", # NEW: Perspective/angle selection after Section 3
```

- [ ] **Step 2: Update TRANSITIONS dict**

Replace lines 101-102:
```python
        ("brief_round3", "round3_confirm"): "angle_selection",       # Section 3 -> Angle selection
        ("angle_selection", "approve_angle"): "brief_review",         # Angle approved -> Final review
```
With:
```python
        ("brief_round3", "generate_content_spine"): "brief_round3",   # POV submitted -> stay, generate fields
        ("brief_round3", "round3_confirm"): "brief_review",           # Section 3 confirmed -> Final review
```

- [ ] **Step 3: Remove dead state fields**

Delete lines 56-58:
```python
    pending_perspectives: Optional[list] = None  # Generated perspective options
    selected_perspective: Optional[str] = None  # User's selected perspective
    pending_talking_points: Optional[list] = None  # Generated talking points awaiting confirmation
```

- [ ] **Step 4: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && ./venv/bin/python -c "from app.services.state import StoryboardState, StateManager; print('OK')"`
Expected: `OK`

- [ ] **Step 5: Commit**
```bash
git add backend/app/services/state.py
git commit -m "refactor(state): remove angle_selection phase, add generate_content_spine transition"
```

---

### Task 2: Update Orchestrator — Remove Old Handlers, Add New

**Files:**
- Modify: `backend/app/services/orchestrator.py:444-749`

- [ ] **Step 1: Clean `_serialize_state`**

At lines 464-465, remove:
```python
            "pending_perspectives": state.pending_perspectives,
            "selected_perspective": state.selected_perspective,
```

- [ ] **Step 2: Update `_handle_round2_confirm` — stop pre-generating Round 3**

Replace lines 683-698 (the Round 3 generation block) with just the transition:
```python
        # Transition to brief_round3 — Round 3 fields generated after user provides POV
        state = manager.transition(state, "round2_confirm")
        state.brief_round = 3

        result["message"] = "Section 2 confirmed. Moving to Section 3: Content Spine."
        result["brief_fields"] = {}  # No pre-generated fields; user enters POV first
        result["round"] = 3
        result["research_status"] = "complete" if state.research_complete else "failed"

        return state, result
```

- [ ] **Step 3: Add `_handle_generate_content_spine` handler**

Add new method after `_handle_round2_confirm`:
```python
    async def _handle_generate_content_spine(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle POV submission: store POV, generate content spine fields via BriefBuilder.
        Does NOT transition state — stays in brief_round3.
        """
        point_of_view = payload.get("point_of_view", "")
        if not point_of_view:
            raise ValueError("point_of_view is required in payload")

        # Store POV in confirmed fields
        state.confirmed_fields["point_of_view"] = {
            "value": point_of_view,
            "source": "extracted",
            "confirmed": True,
        }

        # Self-loop transition (stays in brief_round3)
        state = manager.transition(state, "generate_content_spine")

        # Generate content spine from POV
        round3_result = self.agents["brief_builder"].run(
            state,
            round=3,
            confirmed_fields=state.confirmed_fields
        )

        # Update story_brief with generated fields
        if state.story_brief:
            state.story_brief["round"] = 3
            state.story_brief["fields"] = {
                **state.story_brief.get("fields", {}),
                **round3_result.get("fields", {}),
                "point_of_view": {
                    "value": point_of_view,
                    "source": "extracted",
                    "confirmed": True,
                },
            }
        else:
            fields = round3_result.get("fields", {})
            fields["point_of_view"] = {
                "value": point_of_view,
                "source": "extracted",
                "confirmed": True,
            }
            state.story_brief = {"round": 3, "fields": fields}

        result["message"] = "Content spine generated. Review and edit before confirming."
        result["brief_fields"] = round3_result.get("fields", {})
        result["round"] = 3

        return state, result
```

- [ ] **Step 4: Rewrite `_handle_round3_confirm` — remove perspective generation, go to review**

Replace lines 707-749 with:
```python
    async def _handle_round3_confirm(
        self,
        state: StoryboardState,
        manager: StateManager,
        payload: dict,
        result: dict
    ) -> tuple:
        """
        Handle Round 3 confirmation. Stores all Content Spine fields and transitions to brief_review.
        """
        confirmed_fields = payload.get("confirmed_fields", {})

        # Merge confirmed fields
        state.confirmed_fields = {
            **state.confirmed_fields,
            **confirmed_fields
        }

        # Transition to brief_review (direct, no angle_selection)
        state = manager.transition(state, "round3_confirm")
        state.brief_round = 4  # Review phase

        # Update story_brief with confirmed fields from Round 3
        if state.story_brief:
            state.story_brief["round"] = "review"
            for key, field in state.story_brief.get("fields", {}).items():
                if key in state.confirmed_fields:
                    field["confirmed"] = True
                    field["value"] = state.confirmed_fields[key].get("value", field.get("value"))

        result["message"] = "Section 3 confirmed. Review complete brief before proceeding."
        result["full_brief"] = state.story_brief
        result["confirmed_fields"] = state.confirmed_fields
        result["round"] = "review"

        return state, result
```

- [ ] **Step 5: Delete `_handle_approve_angle`**

Delete lines 607-658 (the entire `_handle_approve_angle` method).

- [ ] **Step 6: Register new handler in `process_event`**

Find the event handler dispatch section in `process_event` (search for `"round3_confirm"` and `"approve_angle"`). Add routing for `generate_content_spine` and remove `approve_angle`:
```python
        elif event == "generate_content_spine":
            state, result = await self._handle_generate_content_spine(state, manager, payload, result)
```
Remove:
```python
        elif event == "approve_angle":
            state, result = await self._handle_approve_angle(state, manager, payload, result)
```

- [ ] **Step 7: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && ./venv/bin/python -c "from app.services.orchestrator import Orchestrator; print('OK')"`
Expected: `OK`

- [ ] **Step 8: Commit**
```bash
git add backend/app/services/orchestrator.py
git commit -m "refactor(orchestrator): replace angle_selection with generate_content_spine handler"
```

---

### Task 3: Update main.py available_events

**Files:**
- Modify: `backend/app/main.py:815-827`

- [ ] **Step 1: Update available_events dict**

Replace lines 819-820:
```python
            "brief_round3": ["round3_confirm"],
            "angle_selection": ["approve_angle"],
```
With:
```python
            "brief_round3": ["generate_content_spine", "round3_confirm"],
```

- [ ] **Step 2: Commit**
```bash
git add backend/app/main.py
git commit -m "refactor(api): update available_events for content spine flow"
```

---

### Task 4: Rewrite BriefBuilder Round 3 — POV-Centered Generation

**Files:**
- Modify: `backend/app/services/agents/brief_builder.py:179-305`

- [ ] **Step 1: Rewrite `_generate_round3` with POV-centered chained generation**

Replace lines 179-305 with:
```python
    def _generate_round3(
        self,
        intake_form: dict,
        confirmed_fields: dict,
        research_results: dict
    ) -> dict:
        """
        Generate Section 3: Content Spine fields from user's Point of View.

        Uses chained generation order:
        1. core_talking_points ← POV + audience + brief context (argument beats)
        2. misconceptions ← POV + talking_points + audience (counter-assumptions)
        3. must_avoid ← POV + talking_points + misconceptions (claim guardrails)

        POV is the source of truth. All fields are downstream derivations.
        """
        # Extract confirmed field values for context
        def get_val(key: str, default: str = "") -> str:
            field = confirmed_fields.get(key, {})
            if isinstance(field, dict) and "value" in field:
                v = field["value"]
                return ", ".join(v) if isinstance(v, list) else str(v)
            return str(field) if field else default

        point_of_view = get_val("point_of_view")
        viewer_outcome = get_val("viewer_outcome")
        target_audience = get_val("target_audience")
        audience_level = get_val("audience_level", "intermediate")
        duration = get_val("duration", "300")
        platform = get_val("platform")
        viewer_next_action = get_val("viewer_next_action")
        delivery_tone = get_val("delivery_tone")
        freshness = get_val("freshness_expectation")

        prompt = f"""## TASK: Generate Content Spine from Point of View

The user has provided a central claim (Point of View) that this video will build and defend.
Your job is to generate the argument structure that supports this claim.

## POINT OF VIEW (source of truth)
{point_of_view}

## BRIEF CONTEXT
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Viewer Outcome: {viewer_outcome}
- Duration: {duration} seconds
- Platform: {platform}
- Viewer Next Action: {viewer_next_action}
- Delivery Tone: {delivery_tone}
- Freshness: {freshness}

## GENERATION INSTRUCTIONS

Generate three fields in this exact dependency order:

### 1. core_talking_points (3-5 items)
These are the major ARGUMENT BEATS required to make the POV convincing.
- Each point is a reasoning step that builds the case for the claim
- They should create progression: point N builds on point N-1
- Do NOT list subtopics or generic bullet points — list the steps of the argument

### 2. misconceptions (2-3 items)
These are the ASSUMPTIONS or DEFAULT FRAMINGS this POV pushes against.
- What does the audience typically get wrong or oversimplify about this topic?
- These create tension against the POV — they are what make the claim non-obvious
- Do NOT restate talking points in negative form

### 3. must_avoid (1-3 items)
These are what would make THIS SPECIFIC POV weaker, blurrier, or less credible.
- Identify traps specific to this argument that would dilute the thesis
- Be specific to this POV, not generic writing advice
- Example format: "Don't retreat to [safe framing] — this POV claims [specific insight]"

## QUALITY CHECK
Before returning, verify:
1. Each talking point directly advances the case for the POV
2. Each misconception identifies a genuine counter-assumption, not a mirror-phrased talking point
3. Each must_avoid is specific to this POV, not generic advice like "don't be vague"
4. The three fields are functionally distinct — no paraphrases of one another

## OUTPUT FORMAT
Return a JSON object with exactly these 3 keys:
{{
  "core_talking_points": ["argument beat 1", "argument beat 2", "argument beat 3"],
  "misconceptions": ["counter-assumption 1", "counter-assumption 2"],
  "must_avoid": ["POV-specific guardrail 1"]
}}"""

        # Call LLM to generate content spine
        try:
            response = self.call_llm(prompt, max_tokens=2000, temperature=0.7)
            parsed = self._extract_json(response)
        except Exception as e:
            print(f"[BriefBuilder] Round 3 LLM call failed: {e}")
            parsed = None

        # Build fields from LLM response or fallback to empty
        if parsed and isinstance(parsed, dict):
            talking_points = parsed.get("core_talking_points", [])
            misconceptions = parsed.get("misconceptions", [])
            must_avoid = parsed.get("must_avoid", [])

            # Ensure they're lists
            if isinstance(talking_points, str):
                talking_points = [talking_points]
            if isinstance(misconceptions, str):
                misconceptions = [misconceptions]
            if isinstance(must_avoid, str):
                must_avoid = [must_avoid]

            fields = {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": misconceptions,
                    "source": "inferred",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": must_avoid,
                    "source": "inferred",
                    "confirmed": False,
                },
            }
        else:
            # Fallback: empty fields for user input
            fields = {
                "core_talking_points": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
            }

        return {"round": 3, "fields": fields}
```

- [ ] **Step 2: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && ./venv/bin/python -c "from app.services.agents.brief_builder import BriefBuilder; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**
```bash
git add backend/app/services/agents/brief_builder.py
git commit -m "feat(brief-builder): POV-centered chained generation for content spine"
```

---

### Task 5: Rename selected_angle → point_of_view in Backend + Prompts

**Files:**
- Modify: `backend/app/services/agents/storyboard_director.py:105,142`
- Modify: `backend/app/services/agents/storyboard_writer.py:302,462`
- Modify: `backend/app/services/eval_gold_set.py:94`
- Modify: `prompts/storyboard_director_prompt_v0312.md:20,91,134`
- Modify: `prompts/EVAL_JUDGE_PROMPT.md:22`
- Modify: `goldsets/video2/gold_standard.json:28`
- Modify: `goldsets/video3/gold_standard.json:29`

- [ ] **Step 1: storyboard_director.py**

At line 105, replace:
```python
        selected_angle = self._extract_brief_field(story_brief, "selected_angle") or ""
```
With:
```python
        point_of_view = self._extract_brief_field(story_brief, "point_of_view") or ""
```

At line 142, replace `selected_angle` variable and label:
```python
SELECTED ANGLE
{selected_angle}
```
With:
```python
POINT OF VIEW
{point_of_view}
```

- [ ] **Step 2: storyboard_writer.py**

At line 302 in `_extract_brief_context`, replace:
```python
            "selected_angle": self._extract_brief_field(story_brief, "selected_angle", ""),
```
With:
```python
            "point_of_view": self._extract_brief_field(story_brief, "point_of_view", ""),
```

At line 462 in `_build_full_storyboard_prompt`, replace:
```python
Angle: {brief_context['selected_angle']}
```
With:
```python
Point of View: {brief_context['point_of_view']}
```

- [ ] **Step 3: eval_gold_set.py**

At line 94, replace:
```python
        "selected_angle": brief["selected_angle"],
```
With:
```python
        "point_of_view": brief.get("point_of_view", brief.get("selected_angle", "")),
```
(backward-compatible fallback for existing gold sets)

- [ ] **Step 4: storyboard_director_prompt_v0312.md**

At line 20, replace:
```
- **selected_angle**: The chosen perspective/angle for the video
```
With:
```
- **point_of_view**: The central claim this video builds and defends
```

At line 91, replace:
```
- Use the selected_angle to shape the framing
```
With:
```
- Use the point_of_view to shape the framing
```

At line 134, replace:
```
- [ ] selected_angle shapes the narrative framing throughout
```
With:
```
- [ ] point_of_view shapes the narrative framing throughout
```

- [ ] **Step 5: EVAL_JUDGE_PROMPT.md**

At line 22, replace:
```
Does the outline serve the brief's `viewer_outcome` and `selected_angle`?
```
With:
```
Does the outline serve the brief's `viewer_outcome` and `point_of_view`?
```

- [ ] **Step 6: Gold standard JSON files**

In `goldsets/video2/gold_standard.json` line 28, rename key:
```json
"selected_angle": "Reframing interview questions..."
```
→
```json
"point_of_view": "Reframing interview questions..."
```

In `goldsets/video3/gold_standard.json` line 29, same rename.

- [ ] **Step 7: Verify backend starts**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && ./venv/bin/python -c "from app.services.agents.storyboard_director import StoryboardDirector; from app.services.agents.storyboard_writer import StoryboardWriter; print('OK')"`
Expected: `OK`

- [ ] **Step 8: Commit**
```bash
git add backend/app/services/agents/storyboard_director.py backend/app/services/agents/storyboard_writer.py backend/app/services/eval_gold_set.py prompts/storyboard_director_prompt_v0312.md prompts/EVAL_JUDGE_PROMPT.md goldsets/
git commit -m "refactor: rename selected_angle to point_of_view across backend and prompts"
```

---

## Chunk 2: Frontend — Types, Forms, Progress Bar

### Task 6: Update types.ts — Fields, Labels, Required

**Files:**
- Modify: `frontend/src/components/BriefBuilder/types.ts:77,92-157,214-246`

- [ ] **Step 1: Update BriefRound type**

At line 77, replace:
```typescript
export type BriefRound = 1 | 2 | 3 | "angle_selection" | "review";
```
With:
```typescript
export type BriefRound = 1 | 2 | 3 | "review";
```

- [ ] **Step 2: Update KNOWLEDGE_SHARE_REQUIRED_FIELDS**

At lines 108-111, replace:
```typescript
  3: [
    "core_talking_points",
    "misconceptions",
  ],
```
With:
```typescript
  3: [
    "point_of_view",
    "core_talking_points",
    "misconceptions",
  ],
```

- [ ] **Step 3: Update KNOWLEDGE_SHARE_FIELD_LABELS**

At lines 131-135, replace:
```typescript
  // Section 3: Content Spine
  must_avoid: "Anything we should absolutely avoid?",
  core_talking_points: "Proposed framework/method/key talking points",
  misconceptions: "Common misconceptions to address",
  additional_notes: "Anything to highlight that's not included in this form?",
```
With:
```typescript
  // Section 3: Content Spine
  point_of_view: "Your point of view",
  core_talking_points: "Argument beats",
  misconceptions: "Counter-assumptions",
  must_avoid: "What would weaken this POV?",
```

- [ ] **Step 4: Update KNOWLEDGE_SHARE_FIELD_TYPES**

At lines 153-156, replace:
```typescript
  must_avoid: "list",
  core_talking_points: "editable-list",
  misconceptions: "editable-list",
  additional_notes: "textarea",
```
With:
```typescript
  point_of_view: "textarea",
  core_talking_points: "editable-list",
  misconceptions: "editable-list",
  must_avoid: "list",
```

- [ ] **Step 5: Update createInitialKnowledgeShareFields**

At lines 229-231, replace:
```typescript
  const section3Fields = [
    "must_avoid", "core_talking_points", "misconceptions", "additional_notes"
  ];
```
With:
```typescript
  const section3Fields = [
    "point_of_view", "core_talking_points", "misconceptions", "must_avoid"
  ];
```

- [ ] **Step 6: Verify build**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build 2>&1 | head -30`
Expected: May have errors from components still referencing old types — that's fine, we fix those next.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/components/BriefBuilder/types.ts
git commit -m "refactor(types): add point_of_view, remove source_assets/selected_angle/additional_notes"
```

---

### Task 7: Rewrite RoundThreeForm — Two-Phase POV → Content Spine

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx`

- [ ] **Step 1: Rewrite the entire file**

```typescript
/**
 * RoundThreeForm - Section 3: Content Spine (Two-Phase)
 * Phase 1: User writes their Point of View (the claim the video will defend)
 * Phase 2: AI generates argument structure → user reviews/edits
 */

import { useState } from "react";
import FieldCard from "./FieldCard";
import type { BriefField } from "../types";
import { KNOWLEDGE_SHARE_REQUIRED_FIELDS, areRequiredFieldsFilled } from "../types";
import { cn } from "@/lib/utils";
import { Info, Loader2 } from "lucide-react";

interface BriefContext {
  audience: string;
  topic: string;
  goal: string;
}

interface RoundThreeFormProps {
  fields: Record<string, BriefField>;
  onFieldChange: (key: string, value: string | string[] | boolean) => void;
  onFieldConfirm: (key: string) => void;
  onFieldUnconfirm?: (key: string) => void;
  onSectionConfirm: () => void;
  onGenerateContentSpine?: (pov: string) => Promise<void>;
  briefContext?: BriefContext;
  disabled?: boolean;
  researchComplete?: boolean;
  showConfirmButton?: boolean;
}

const GENERATED_FIELDS = [
  "core_talking_points",
  "misconceptions",
  "must_avoid",
];

function PovTooltip() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="What is a point of view?"
      >
        <Info className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-[380px] bg-white border border-border rounded-lg shadow-lg p-4 text-sm space-y-3">
          <div>
            <p className="font-medium text-foreground mb-1">What this is</p>
            <p className="text-muted-foreground">
              A point of view is the core claim your video is trying to make convincing.
              It gives the video direction and makes it feel different from generic content on the same topic.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">A useful way to frame it</p>
            <p className="text-muted-foreground italic">
              "For [audience], [topic] isn't about [common assumption]; it's about [your insight]."
            </p>
            <p className="text-muted-foreground text-xs mt-1">You don't need to follow this exactly.</p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Weak vs. stronger</p>
            <div className="space-y-2 text-muted-foreground">
              <div>
                <p><span className="text-[#A63228] font-medium">Weak:</span> "AI can help marketers work faster."</p>
                <p><span className="text-[#3A6B47] font-medium">Stronger:</span> "For product marketers, AI is not most valuable for writing copy faster; it is most valuable for turning scattered inputs into sharper strategic angles."</p>
              </div>
              <div>
                <p><span className="text-[#A63228] font-medium">Weak:</span> "Startup exits are hard."</p>
                <p><span className="text-[#3A6B47] font-medium">Stronger:</span> "For first-time founders, startup exits are not mainly about finding a buyer; they are about surviving the 18-month dead zone when neither growth nor M&A interest is strong enough."</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RoundThreeForm({
  fields,
  onFieldChange,
  onFieldConfirm,
  onFieldUnconfirm,
  onSectionConfirm,
  onGenerateContentSpine,
  briefContext,
  disabled = false,
  researchComplete = true,
  showConfirmButton = true,
}: RoundThreeFormProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Determine phase: if generated fields have values, we're in Phase 2
  const hasGeneratedFields = GENERATED_FIELDS.some(
    (key) => {
      const val = fields[key]?.value;
      return Array.isArray(val) ? val.length > 0 : Boolean(val);
    }
  );
  const phase: "pov" | "spine" = hasGeneratedFields ? "spine" : "pov";

  const povValue = typeof fields.point_of_view?.value === "string" ? fields.point_of_view.value : "";

  const handleGenerate = async () => {
    if (!onGenerateContentSpine || !povValue.trim()) return;
    setIsGenerating(true);
    setGenerateError(null);
    try {
      await onGenerateContentSpine(povValue.trim());
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Failed to generate content spine");
    } finally {
      setIsGenerating(false);
    }
  };

  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[3];
  const canConfirm = phase === "spine" && areRequiredFieldsFilled(fields, 3);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div style={{ marginBottom: "22px" }}>
        <h2
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "28px",
            fontWeight: 400,
            color: "#1C2118",
            letterSpacing: "-0.6px",
            lineHeight: "1.15",
            marginBottom: "5px",
          }}
        >
          Section 3: Content Spine
        </h2>
        <p style={{ fontSize: "13.5px", fontWeight: 300, color: "#5A6352" }}>
          Start with your point of view — the one claim this video will build and defend.
        </p>
      </div>

      {/* Context Reminder */}
      {briefContext && (phase === "pov" || !hasGeneratedFields) && (
        <div className="flex gap-4 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
          {briefContext.audience && (
            <span><span className="font-medium text-foreground">For:</span> {briefContext.audience}</span>
          )}
          {briefContext.topic && (
            <span><span className="font-medium text-foreground">Topic:</span> {briefContext.topic}</span>
          )}
          {briefContext.goal && (
            <span><span className="font-medium text-foreground">Goal:</span> {briefContext.goal}</span>
          )}
        </div>
      )}

      {/* POV Input — always visible */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <label
            className="text-sm font-medium text-foreground"
            htmlFor="pov-input"
          >
            Your point of view <span className="text-[#A63228]">*</span>
          </label>
          <PovTooltip />
        </div>
        <textarea
          id="pov-input"
          value={povValue}
          onChange={(e) => onFieldChange("point_of_view", e.target.value)}
          disabled={disabled || isGenerating || (phase === "spine" && !generateError)}
          placeholder="e.g. For product marketers, AI is not most valuable for writing copy faster; it is most valuable for turning scattered inputs into sharper strategic angles."
          className={cn(
            "w-full rounded-lg border border-border bg-white px-3 py-2.5 text-sm min-h-[80px] resize-y",
            "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "placeholder:text-muted-foreground/50"
          )}
          rows={3}
        />
      </div>

      {/* Generate Error */}
      {generateError && (
        <div className="flex items-center gap-2 bg-[#FBEAE8] border border-[#E8C0BC] text-[#A63228] rounded-lg px-3 py-2 text-xs">
          {generateError}
        </div>
      )}

      {/* Phase 1: Generate button */}
      {phase === "pov" && showConfirmButton && (
        <div className="border-t pt-4">
          <button
            onClick={handleGenerate}
            disabled={!povValue.trim() || disabled || isGenerating}
            className={cn(
              "w-full py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center gap-2",
              povValue.trim() && !disabled && !isGenerating
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating content spine...
              </>
            ) : (
              "Generate Content Spine →"
            )}
          </button>
        </div>
      )}

      {/* Phase 2: Generated field cards */}
      {phase === "spine" && (
        <div className="space-y-4">
          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground mb-3">
              Generated from your point of view. Edit any field before confirming.
            </p>
          </div>
          {GENERATED_FIELDS.map((key) => {
            const field = fields[key];
            if (!field) return null;
            return (
              <FieldCard
                key={key}
                fieldKey={key}
                field={field}
                isRequired={requiredFields.includes(key)}
                onChange={(value) => onFieldChange(key, value)}
                onConfirm={() => onFieldConfirm(key)}
                onUnconfirm={
                  onFieldUnconfirm ? () => onFieldUnconfirm(key) : undefined
                }
                disabled={disabled}
              />
            );
          })}
        </div>
      )}

      {/* Phase 2: Confirm button */}
      {phase === "spine" && showConfirmButton && (
        <div className="border-t pt-4">
          <button
            onClick={onSectionConfirm}
            disabled={!canConfirm || disabled}
            className={cn(
              "w-full py-3 px-4 rounded-lg font-medium transition-colors",
              canConfirm && !disabled
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {canConfirm
              ? "Confirm Section 3 →"
              : "Fill all required fields to continue"}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx
git commit -m "feat(round3): two-phase POV input with context reminder and tooltip"
```

---

### Task 8: Update BriefReview, Delete AngleSelectionForm, Update Index

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx:34-39`
- Delete: `frontend/src/components/BriefBuilder/RoundForms/AngleSelectionForm.tsx`
- Modify: `frontend/src/components/BriefBuilder/RoundForms/index.ts:10`

- [ ] **Step 1: Update BriefReview SECTION_3_FIELDS**

At lines 34-39, replace:
```typescript
const SECTION_3_FIELDS = [
  "source_assets",
  "must_avoid",
  "core_talking_points",
  "misconceptions",
];
```
With:
```typescript
const SECTION_3_FIELDS = [
  "point_of_view",
  "core_talking_points",
  "misconceptions",
  "must_avoid",
];
```

- [ ] **Step 2: Delete AngleSelectionForm.tsx**

```bash
rm frontend/src/components/BriefBuilder/RoundForms/AngleSelectionForm.tsx
```

- [ ] **Step 3: Update index.ts**

Replace line 10:
```typescript
export { default as AngleSelectionForm } from "./AngleSelectionForm";
```
Remove it entirely. Final `index.ts`:
```typescript
/**
 * RoundForms - Components for the 3-round briefing flow.
 */

export { default as FieldCard } from "./FieldCard";
export { default as RoundOneForm } from "./RoundOneForm";
export { default as RoundTwoForm } from "./RoundTwoForm";
export { default as RoundThreeForm } from "./RoundThreeForm";
export { default as BriefReview } from "./BriefReview";
export { default as CollapsibleSection } from "./CollapsibleSection";
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/BriefBuilder/RoundForms/
git commit -m "refactor(forms): update BriefReview fields, delete AngleSelectionForm"
```

---

### Task 9: Rewrite KnowledgeShareBriefBuilder — 4-Step Progress Bar + Clickable Nav

**Files:**
- Modify: `frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx`

- [ ] **Step 1: Remove AngleSelectionForm import and Perspective interface**

At line 7, replace:
```typescript
import { RoundOneForm, RoundTwoForm, RoundThreeForm, BriefReview, AngleSelectionForm, CollapsibleSection } from "./RoundForms";
```
With:
```typescript
import { RoundOneForm, RoundTwoForm, RoundThreeForm, BriefReview, CollapsibleSection } from "./RoundForms";
```

Delete lines 12-16 (the `Perspective` interface).

- [ ] **Step 2: Update props interface**

Replace the interface (around lines 18-30) — remove `perspectives`, `onAngleApprove`, add `onGenerateContentSpine`:
```typescript
interface KnowledgeShareBriefBuilderProps {
  projectId: string;
  initialFields?: Record<string, BriefField>;
  initialRound?: BriefRound;
  researchComplete?: boolean;
  isResearchRunning?: boolean;
  isAlreadyApproved?: boolean;
  onRoundConfirm: (round: number, confirmedFields: Record<string, BriefField>) => Promise<Record<string, BriefField>>;
  onGenerateContentSpine: (pov: string) => Promise<Record<string, BriefField>>;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}
```

- [ ] **Step 3: Update component destructuring**

Remove `perspectives: initialPerspectives`, `onAngleApprove`. Add `onGenerateContentSpine`.

- [ ] **Step 4: Remove perspectives state**

Delete line 57 (`const [perspectives, setPerspectives] = useState...`) and the useEffect syncing perspectives (lines 80-84).

- [ ] **Step 5: Remove `angle_selection` from completedRounds logic**

In both `useState` initializer (lines 87-105) and useEffect (lines 108-128), remove all `angle_selection` cases. Update to only handle `1 | 2 | 3 | "review"`.

- [ ] **Step 6: Update handleSectionConfirm — Round 3 goes to review after content spine**

At line 203, replace:
```typescript
        } else if (round === 3) {
          // Round 3 returns perspectives; move to angle selection
          setCurrentRound("angle_selection");
        }
```
With:
```typescript
        } else if (round === 3) {
          setCurrentRound("review");
        }
```

- [ ] **Step 7: Add handleGenerateContentSpine**

Add after `handleSectionConfirm`:
```typescript
  // Handle content spine generation from POV
  const handleGenerateContentSpine = useCallback(
    async (pov: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const newFields = await onGenerateContentSpine(pov);
        setFields((prev) => ({
          ...prev,
          ...newFields,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate content spine");
        throw err; // Re-throw so RoundThreeForm can handle it too
      } finally {
        setIsLoading(false);
      }
    },
    [onGenerateContentSpine]
  );
```

- [ ] **Step 8: Remove handleAngleApprove**

Delete lines 218-233 (the entire `handleAngleApprove` callback).

- [ ] **Step 9: Update progress bar — 4 steps, clickable**

Replace the progress bar section (lines 385-429) with:
```typescript
        {([1, 2, 3, "review"] as const).map((round, index) => {
            const isActive = currentRound === round;
            const stepOrder = [1, 2, 3, "review"] as const;
            const currentIndex = stepOrder.indexOf(currentRound as typeof stepOrder[number]);
            const roundIndex = stepOrder.indexOf(round);
            const isPast = currentIndex > roundIndex;
            const isCompleted =
              typeof round === "number" && completedRounds.has(round);
            const stepNames = ["Core Intent", "Delivery", "Content Spine", "Review"];
            const canNavigate = isPast || isCompleted;

            return (
              <div
                key={String(round)}
                onClick={() => {
                  if (canNavigate && !isActive) {
                    setCurrentRound(round);
                  }
                }}
                className={cn(
                  "flex-1 flex items-center transition-colors",
                  canNavigate && !isActive ? "cursor-pointer" : "cursor-default",
                  index < 3 && "border-r border-[#D9DDD2]",
                  isActive && "bg-[#E8F0E9]",
                  !isActive && canNavigate && "hover:bg-[#EEF1E9]",
                  (isPast && !isActive) && "opacity-55"
                )}
                style={{ gap: "9px", padding: "11px 16px" }}
              >
                <div
                  className={cn(
                    "flex-shrink-0 rounded-full flex items-center justify-center",
                    isActive && "bg-[#3A6B47] text-white",
                    (isCompleted || isPast) && !isActive && "bg-[#E6F2EB] text-[#2D6A4F]",
                    !isActive && !isCompleted && !isPast && "text-[#626B58]"
                  )}
                  style={{
                    width: "26px", height: "26px",
                    border: isActive ? "1.5px solid #3A6B47" : (isCompleted || isPast) ? "1.5px solid #2D6A4F" : "1.5px solid #BFC6B5",
                    fontSize: "12px", fontWeight: 700, fontFamily: "'Fraunces', serif"
                  }}
                >
                  {isCompleted || isPast ? "\u2713" : round === "review" ? "R" : round}
                </div>
                <div>
                  <div className="text-[#626B58]" style={{ fontSize: "10.5px", letterSpacing: "0.2px", lineHeight: "1.3" }}>Step {index + 1}</div>
                  <div className={cn("text-[#1C2118]", isActive && "text-[#3A6B47]")} style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.3" }}>{stepNames[index]}</div>
                </div>
              </div>
            );
          })}
```

- [ ] **Step 10: Remove AngleSelectionForm from renderCurrentForm**

Delete lines 330-337 (the `angle_selection` case).

- [ ] **Step 11: Update RoundThreeForm rendering — pass new props**

In the `case 3:` block of `renderCurrentForm`, add the new props. Extract briefContext from Round 1 fields:
```typescript
      case 3: {
        const briefContext = {
          audience: String(fields.target_audience?.value || ""),
          topic: String(fields.viewer_outcome?.value || ""),
          goal: String(fields.viewer_next_action?.value || ""),
        };
        return (
          <RoundThreeForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => handleSectionConfirm(3)}
            onGenerateContentSpine={handleGenerateContentSpine}
            briefContext={briefContext}
            disabled={isLoading}
            researchComplete={researchComplete}
          />
        );
      }
```

- [ ] **Step 12: Commit**
```bash
git add frontend/src/components/BriefBuilder/KnowledgeShareBriefBuilder.tsx
git commit -m "feat(brief-builder): 4-step progress bar, clickable nav, content spine handler"
```

---

### Task 10: Update StageContent — Remove Angle, Add Content Spine Handler

**Files:**
- Modify: `frontend/src/components/StageContent.tsx`

- [ ] **Step 1: Remove knowledgeSharePerspectives state**

Find and remove the `knowledgeSharePerspectives` state declaration (around line 131) and any usage.

- [ ] **Step 2: Remove handleKnowledgeShareAngleApprove**

Delete the `handleKnowledgeShareAngleApprove` handler (lines 424-459).

- [ ] **Step 3: Add handleGenerateContentSpine handler**

Add near the other brief handlers:
```typescript
  const handleGenerateContentSpine = useCallback(
    async (pov: string): Promise<Record<string, any>> => {
      const body = {
        event: "generate_content_spine",
        payload: { point_of_view: pov },
      };
      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to generate content spine");
      }
      const data = await response.json();
      // Return the generated brief fields
      return data.brief_fields || {};
    },
    [projectId]
  );
```

- [ ] **Step 4: Update KnowledgeShareBriefBuilder prop passing**

Find where `KnowledgeShareBriefBuilder` is rendered (around line 786). Replace `onAngleApprove` and `perspectives` props:

Remove:
```typescript
            onAngleApprove={handleKnowledgeShareAngleApprove}
            perspectives={knowledgeSharePerspectives}
```

Add:
```typescript
            onGenerateContentSpine={handleGenerateContentSpine}
```

- [ ] **Step 5: Verify build**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds (or only unrelated pre-existing errors).

- [ ] **Step 6: Commit**
```bash
git add frontend/src/components/StageContent.tsx
git commit -m "feat(stage-content): replace angle approve with content spine generation"
```

---

### Task 11: Update GoldSetEval + Final Build Verification

**Files:**
- Modify: `frontend/src/components/admin/GoldSetEval.tsx:453`

- [ ] **Step 1: Update GoldSetEval display**

At line 453, replace:
```typescript
<span>{String(b.selected_angle)}</span>
```
With:
```typescript
<span>{String(b.point_of_view || b.selected_angle)}</span>
```
(backward-compatible with old gold sets)

Also update the label from "Angle:" to "POV:".

- [ ] **Step 2: Full frontend build**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/frontend && npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Full backend verify**

Run: `cd /Users/qianhuisun/Desktop/SB/storyboard-hackathon/backend && ./venv/bin/python -c "from app.main import app; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**
```bash
git add frontend/src/components/admin/GoldSetEval.tsx
git commit -m "refactor(eval): rename selected_angle display to point_of_view"
```

- [ ] **Step 5: Final commit with all remaining changes**
```bash
git add -A
git status
git commit -m "feat: POV-driven content spine redesign — complete implementation"
```
