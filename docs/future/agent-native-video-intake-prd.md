# PRD: Agent-Native Video Intake and Briefing Document Generation

## 1. Summary

Plotline should use one simple composer as the entry point, then dynamically gather the minimum user inputs needed to produce a reliable video briefing document.

The first-principles goal is not routing, not chat, and not a beautiful questionnaire. The goal is:

```text
Gather enough user-confirmed inputs to write the first briefing document for this specific video job.
```

The briefing document is the contract between intake and generation. Once the brief is good enough, Plotline can create the first creative outline draft, then writing/storyboard.

## 2. First Principles

To generate a good video, the system needs to know:

1. What is this video supposed to accomplish for the viewer?
2. What kind of creative artifact is the user actually asking for?
3. What information, constraints, and source material are necessary for this specific artifact?
4. Which assumptions can the system safely make?
5. Which assumptions are too risky and must be clarified by the user?

The intake system exists to answer those questions with the fewest useful interactions.

### Product Rule

Questions are generated from uncertain high-impact slots, not from hardcoded video types.

### Compositional Taxonomy

Plotline should use two different levels of structure:

1. **Video Job**: coarse internal guardrails.
2. **Pattern Grammar**: reusable slot packs and outline moves.

The user should never see either as a required picker.

Video Job stays small and close to the original product logic:

- `product_demo`
- `product_release`
- `explainer`
- `lifestyle`
- `creative_writing`

Pattern Grammar can be more granular:

- `quick_win_tutorial`
- `academy_micro_lesson`
- `business_analyst_career_diary`
- `evidence_based_self_improvement_essay`
- `relocation_soft_life_vlog`
- `feature_launch_story`
- etc.

Pattern Grammar must not create a separate intake route. But it must materially change the generated schema. Each pattern contributes:

- `slot_pack`: extra slots or slot priority boosts.
- `question_pack`: question strategies and control suggestions.
- `outline_move_pack`: content moves and section emphasis.
- `media_grammar_pack`: likely visual grammar.
- `anti_pattern_pack`: mistakes the output should avoid.

The final intake schema is composed, not chosen:

```text
dynamic_schema =
  universal_slots
  + video_job_guardrail_slots
  + primary_pattern.slot_pack
  + secondary_pattern.slot_pack
  + source/artifact slot packs
```

Example:

```json
{
  "video_job": "product_demo",
  "primary_pattern": "quick_win_tutorial",
  "secondary_patterns": ["capability_demo"],
  "composed_schema": {
    "guardrail_slots": ["problem", "core_interaction_steps", "success_state"],
    "pattern_added_slots": ["time_to_value", "before_after_artifact", "feature_behavior", "demo_scenario"],
    "pattern_boosted_slots": ["result_check", "starting_point", "demo_asset"]
  }
}
```

For the full interaction path from one raw prompt to labels, questions, briefing document, and outline, see:

- `docs/future/dynamic-intake-interaction-tree.md`

### What This Means

The system does not ask:

```text
What video type is this?
```

It asks:

```text
Which missing decision would most change the briefing document and the first outline?
```

Then it turns that missing decision into a natural question, chip set, slider, or assumption confirmation.

## 3. Background

The original system had multiple video flows:

- Product Release
- How-to Demo / Product Demo
- Knowledge Share

Those flows existed in archived prompts such as:

- `prompts/archive/Video storyboard generator hackathon.md`
- `prompts/archive/storyboard_director_prompt.md`
- `prompts/archive/storyboard_director_prompt_v0308.md`

Later, the product was simplified into a Knowledge Share-only flow. That made the front page simpler, but it also removed nuance between different creative jobs.

There was also earlier logic that attempted to directly complete missing brief information, and another search/research agent path between outline and writing. Those should not be restored as-is. They create latency, source drift, and overconfident assumptions before the creator has clarified intent.

The new target is:

```text
single composer -> slot extraction -> ambiguity detection -> dynamic clarification -> briefing document -> outline -> writing
```

## 4. Product Goals

### Goals

- Preserve a one-box front page.
- Avoid user-facing video type selection.
- Generate a briefing document before outline generation.
- Use schema-grounded dynamic clarification instead of fixed questionnaires.
- Ask only questions that materially affect the brief, outline, or writing.
- Support explainers, demos, talking scripts, product launches, planner/lifestyle videos, and creative narrative videos without locking the user into one route.
- Keep source/search optional and policy-driven, not automatic between outline and writing.
- Make every project converge into one downstream contract: `BriefingDocument`.

### Non-goals

- Do not bring back a visible video type picker.
- Do not use rigid route-first branching as the main product logic.
- Do not auto-complete high-impact brief fields without user confirmation.
- Do not run a default search agent between outline and writing.
- Do not ask a long fixed questionnaire.
- Do not make prompts carry all product rules.

## 5. Target User Experience

### 5.1 Front Page

The front page has one composer.

The user can:

- describe the video idea,
- attach sources,
- add optional constraints such as duration or platform,
- press generate.

The page should not ask for video type.

### 5.2 Smart Intake Screen

After submit, Plotline shows a generated intake screen.

The screen should feel like:

- "I read your intent."
- "Here are the decisions that will actually change the brief."
- "Some assumptions are safe; some need your answer."

The screen should not feel like:

- a category picker,
- a generic form,
- a chat transcript with too many turns,
- a hidden auto-fill system pretending it knows everything.

### 5.3 Question Style

Questions should be brief, concrete, and consequential.

Bad:

```text
What is your video type?
What is your target audience?
What tone do you want?
```

Good:

```text
Should viewers mainly understand when to use this, or be able to do the workflow themselves?
```

```text
What would make the first outline wrong: missing steps, missing proof, or missing the emotional reason?
```

```text
Should this feel like a practical walkthrough, a persuasive point of view, or a lived process?
```

Each question should map back to a specific briefing slot and a specific downstream decision.

## 6. Briefing Document Contract

The briefing document is the first durable output of intake. It should be human-readable, editable, and structured enough for the outline and writing agents.

### 6.1 Required Universal Brief Fields

Every video brief should contain:

- `raw_intent`: the user's original request.
- `working_title`: a descriptive title.
- `viewer_job`: what the viewer should understand, do, feel, believe, or decide.
- `creator_goal`: what the creator wants the video to accomplish.
- `target_audience`: who the video is for and what they already know.
- `artifact_expectation`: what kind of deliverable the user expects: outline, script, storyboard, slides, short-form script, long-form video, etc.
- `duration_shape`: short, medium, long, or exact duration if known.
- `platform_context`: YouTube, Shorts, TikTok, LinkedIn, internal training, sales demo, etc.
- `point_of_view`: the central claim, promise, question, or emotional through-line.
- `content_spine`: the major beats the outline should cover.
- `media_grammar`: what the viewer should see: talking head, screen recording, slides, real-world footage, planner pages, product UI, b-roll, etc.
- `voice_and_tone`: how the video should sound.
- `source_policy`: whether to use provided sources only, no research, optional examples, or source-backed claims.
- `must_include`: required ideas, claims, examples, shots, or lines.
- `must_avoid`: things that would make the video wrong.
- `open_assumptions`: assumptions the system is still making.
- `brief_ready_level`: whether the brief is ready for outline, ready with assumptions, or blocked.

### 6.2 Example Briefing Document

```json
{
  "raw_intent": "I want to make a video about how to use our dashboard for weekly reporting.",
  "working_title": "Create a Weekly Report from the Dashboard",
  "viewer_job": "Create a weekly report without needing help from the ops team.",
  "creator_goal": "Teach a practical workflow while preventing a feature-tour feel.",
  "target_audience": "Team leads who use the dashboard occasionally.",
  "artifact_expectation": "medium-form tutorial script and storyboard",
  "duration_shape": "5-7 minutes",
  "platform_context": "YouTube or internal enablement",
  "point_of_view": "The dashboard is useful only if the viewer starts with the decision they need to make, not with the export button.",
  "content_spine": [
    "Start with the weekly business question",
    "Set filters around that question",
    "Generate the report",
    "Check whether the report answers the decision",
    "Avoid exporting too early"
  ],
  "media_grammar": ["screen_recording", "voiceover", "callouts"],
  "voice_and_tone": "clear, practical, slightly opinionated",
  "source_policy": "use provided product material only",
  "must_include": [],
  "must_avoid": ["Do not become a feature tour"],
  "open_assumptions": ["Exact UI steps need source confirmation"],
  "brief_ready_level": "ready_with_assumptions"
}
```

## 7. Slot Schema

Dynamic intake is grounded in slots. A slot is a piece of information that may be required to produce the brief.

Each slot should carry metadata:

```json
{
  "slot": "viewer_job",
  "description": "What should the viewer be able to understand, do, feel, believe, or decide?",
  "value": "complete_a_process",
  "status": "inferred",
  "confidence": 0.62,
  "required_for": ["brief", "outline_structure", "writing_goal"],
  "impact_if_wrong": "high",
  "can_default": false,
  "question_strategy": "disambiguate outcome, not video type",
  "ask_priority": 1
}
```

### 7.1 Slot Status

Allowed statuses:

- `provided`: the user directly supplied it.
- `inferred`: the system inferred it with enough confidence.
- `ambiguous`: multiple plausible values would change the brief.
- `missing`: no reliable value exists.
- `accepted_assumption`: the user accepted the system's default.
- `blocked`: the brief cannot proceed credibly without it.

### 7.2 Slot Priority

Ask priority should be computed from:

- downstream impact,
- confidence,
- risk if wrong,
- whether the value can be inferred from source material,
- answer cost for the user,
- whether the first outline can proceed without it.

High priority means:

```text
If this is wrong, the briefing document or outline will take the wrong shape.
```

Low priority means:

```text
This can be refined after the first outline.
```

## 8. Universal Slots

These slots apply to most projects, but not all should be asked every time.

| Slot | Why it matters | Ask when |
| --- | --- | --- |
| `viewer_job` | Determines the purpose of the whole video | Prompt could mean understand, do, feel, believe, or decide |
| `creator_goal` | Separates education, persuasion, expression, and enablement | User intent is broad or mixed |
| `target_audience` | Controls assumptions, examples, and depth | Audience cannot be inferred |
| `artifact_expectation` | Controls whether output should be outline, script, storyboard, deck, etc. | User says "video" but desired artifact is unclear |
| `duration_shape` | Controls detail, pacing, and number of outline sections | Missing and likely to affect scope |
| `platform_context` | Controls pacing, hook, CTA, format | Missing and output may differ by platform |
| `point_of_view` | Prevents generic topic coverage | Topic is known but stance/promise is weak |
| `content_spine` | Defines major beats | The system cannot infer enough structure |
| `media_grammar` | Controls visual/storyboard strategy | Visual format is ambiguous |
| `voice_and_tone` | Controls writing style | Tone is high-impact for this request |
| `source_policy` | Prevents unwanted research or unsupported claims | Claims require evidence or user gave sources |
| `must_include` | Prevents missing required material | User mentions documents, product details, or story facts |
| `must_avoid` | Prevents common wrong outputs | The video could easily become generic or off-brand |
| `success_criteria` | Defines "good enough" for first draft | The user has a specific use case or audience |

## 9. Video Job Guardrails

The system should not ask the user to choose these groups. It should infer one coarse video job and use it as a guardrail.

Important: Video Job does not define the whole intake schema. It only defines:

- minimum required slots,
- blocked-if-missing slots,
- source mapping rules,
- outline invariants.

Pattern Grammar adds the rest.

### 9.1 Product Demo

Use when the viewer needs to see how a product, tool, feature, or workflow solves a specific problem.

Critical slots:

- `problem`: what specific problem this demo solves.
- `core_interaction_steps`: the concrete step-by-step product or workflow actions.
- `success_state`: what successful completion looks like.
- `starting_point`: what the viewer has before the demo starts.
- `common_pitfalls`: what goes wrong without the product or when using it badly.
- `demo_asset`: what screen, product surface, file, or example should be shown.
- `viewer_context`: who is trying to do this and why.

Suggested source mapping:

- `problem`: `research_data.typical_workflows.traditional_process` or user pain points in `product_context`.
- `core_interaction_steps`: `research_data.typical_workflows.optimized_process`.
- `common_pitfalls`: `research_data.typical_workflows.traditional_process`.

Dynamic intake behavior:

- If `core_interaction_steps` are missing or vague, ask the user. This is blocking.
- If `problem` is inferred but broad, ask a challenge question.
- If `common_pitfalls` are not clear, leave them null unless the product/demo angle depends on avoiding mistakes.

High-value questions:

- "What specific problem is this demo solving?"
- "What are the exact steps the viewer should see?"
- "What does success look like on screen?"
- "Where do users usually get stuck without this product?"

Outline shape:

- Problem / before-state.
- Show the desired outcome.
- Setup and starting point.
- Step-by-step interaction.
- Pitfall or contrast with old workflow.
- Result check.
- CTA or next action.

### 9.2 Product Release

Use when the creator is announcing a product, feature, update, launch, or business milestone.

Critical slots:

- `new_capability`
- `target_persona`
- `pain_or_opportunity`
- `why_now`
- `value_proposition`
- `proof_or_demo_moment`
- `claim_boundaries`
- `cta`

Dynamic intake behavior:

- If `new_capability`, `target_persona`, or `cta` is missing, ask.
- If the claim is strong but unsupported, create a source-gap question.
- If the title/prompt looks like a demo but the real job is announcement, ask whether the video should optimize for launch excitement or hands-on usage.

Outline shape:

- What changed.
- Who should care.
- Why this matters now.
- Product/feature reveal.
- Proof or demo moment.
- Value by use case.
- CTA.

### 9.3 Explainer / Former Knowledge Share

Use when the viewer needs to understand a concept, argument, framework, trend, or question.

Important slots:

- `central_question`
- `thesis_or_pov`
- `viewer_misconception`
- `audience_baseline`
- `explanatory_depth`
- `examples_or_cases`
- `evidence_requirement`
- `decision_or_reframe`

High-value questions:

- "What should the viewer stop misunderstanding by the end?"
- "Is this trying to explain a concept, argue a point, or help someone make a decision?"
- "What would make this feel generic?"

### 9.4 Lifestyle

Use when the video is about planning, routines, life organization, lifestyle process, reset videos, desk/planner setups, habits, soft-life work, relocation, or a lived process.

Important slots:

- `life_moment_or_context`
- `emotional_payoff`
- `routine_or_process`
- `visual_artifacts`
- `friction_point`
- `practical_takeaway`
- `pacing_and_mood`

High-value questions:

- "Is the payoff emotional reset, practical planning, or aesthetic inspiration?"
- "Where does the friction happen in the routine?"
- "What real object or moment should carry the video visually?"

Outline shape:

- Relatable lived opening.
- Current friction or desire.
- Process/routine/planning beats.
- Real-world interruption or emotional turn.
- Practical reset/takeaway.
- Closing feeling or next ritual.

### 9.5 Creative Writing

Use when the output is more story, voiceover, essay, poetic narration, POV script, or emotional arc than instruction.

Important slots:

- `premise`
- `narrator_pov`
- `opening_image`
- `scene_or_memory_beats`
- `emotional_turn`
- `ending_feeling`
- `voice_reference`
- `must_include_lines`

High-value questions:

- "What image should the video open on?"
- "What is the emotional turn?"
- "Should the ending feel resolved, open, or unresolved?"
- "Is this meant to sound personal, cinematic, funny, essayistic, or intimate?"

Outline shape:

- Opening image or line.
- Setup of emotional question.
- Scene/argument progression.
- Turn or realization.
- Final image, line, or feeling.

## 10. Pattern Grammar Packs

Pattern Grammar is where the fine-grained channel/category learning should live.

Each pattern should be stored as a composable pack:

```json
{
  "pattern": "quick_win_tutorial",
  "slot_pack": {
    "time_to_value": {
      "description": "How quickly should the viewer see useful progress?",
      "boost": 0.35
    },
    "before_after_artifact": {
      "description": "What finished output should be shown early?",
      "boost": 0.4
    },
    "minimum_prerequisites": {
      "description": "What must the viewer already have before starting?",
      "boost": 0.25
    }
  },
  "question_pack": [
    "What should the viewer be able to make or do by the end?",
    "What should we show in the first 20 seconds so they trust the tutorial?"
  ],
  "outline_move_pack": [
    "show finished outcome early",
    "compress setup",
    "use visible progress markers",
    "end with result check"
  ],
  "media_grammar_pack": ["screen recording", "before/after", "callouts"],
  "anti_pattern_pack": ["do not spend too long on abstract context before showing the result"]
}
```

### 10.1 Pattern Pack Examples

For `capability_demo`:

```json
{
  "slot_pack": {
    "feature_behavior": {"boost": 0.45},
    "demo_scenario": {"boost": 0.35},
    "capability_boundary": {"boost": 0.3}
  },
  "outline_move_pack": [
    "open with capability in action",
    "explain interaction model",
    "show realistic scenario",
    "name limitation or boundary"
  ]
}
```

For `use_case_solution_playbook`:

```json
{
  "slot_pack": {
    "business_context": {"boost": 0.35},
    "user_role": {"boost": 0.3},
    "success_metric": {"boost": 0.3},
    "deployment_context": {"boost": 0.2}
  },
  "outline_move_pack": [
    "name use-case pain",
    "show desired output",
    "walk through workflow",
    "connect result to business value"
  ]
}
```

For `business_analyst_career_diary`:

```json
{
  "slot_pack": {
    "workplace_context": {"boost": 0.4},
    "project_type": {"boost": 0.35},
    "career_lesson": {"boost": 0.35},
    "personal_reaction": {"boost": 0.25}
  },
  "outline_move_pack": [
    "open with lived work situation",
    "show the actual project/problem",
    "explain what the role requires",
    "land the career lesson"
  ]
}
```

## 11. Dynamic Clarification Engine

### 11.1 Pipeline

```text
Single Composer
  -> Coarse Video Job Inference
  -> Slot Extractor
  -> Pattern Grammar Hinting
  -> Slot Confidence Map
  -> Ambiguity Detector
  -> Decision-Value Scorer
  -> Question Generator
  -> Smart Intake UI
  -> Briefing Document Synthesizer
  -> Creative Outline Architect
  -> Writing / Storyboard Agent
```

### 11.2 How Dynamic Intake Should Work

Dynamic intake should not render one fixed form per pattern. It should:

1. Infer one coarse `video_job`.
2. Select `primary_pattern` and optional `secondary_patterns`.
3. Compose a dynamic schema from universal slots + job guardrails + pattern packs + source/artifact packs.
4. Auto-fill safe slots from source material.
5. Score all candidate slots by impact, confidence, and answer cost.
6. Ask only the unresolved high-impact slots.
7. Mark each slot as `provided`, `inferred`, `auto_filled_from_research`, `accepted_assumption`, `missing`, or `blocked`.

For Product Demo:

```json
{
  "video_job": "product_demo",
  "primary_pattern": "quick_win_tutorial",
  "secondary_patterns": ["capability_demo"],
  "composed_slots": {
    "problem": {
      "from": "video_job_guardrail",
      "source": "research_data.typical_workflows.traditional_process OR product_context.user_pain_points",
      "status": "auto_filled_from_research",
      "ask_if": "missing_or_too_broad"
    },
    "core_interaction_steps": {
      "from": "video_job_guardrail",
      "source": "research_data.typical_workflows.optimized_process",
      "status": "blocked_if_missing",
      "ask_if": "missing_or_vague"
    },
    "time_to_value": {
      "from": "quick_win_tutorial.slot_pack",
      "status": "inferred",
      "ask_if": "unclear_and_duration_is_short"
    },
    "before_after_artifact": {
      "from": "quick_win_tutorial.slot_pack",
      "status": "missing",
      "ask_if": "needed_to_show_outcome_early"
    },
    "feature_behavior": {
      "from": "capability_demo.slot_pack",
      "status": "missing",
      "ask_if": "feature_behavior_is_the_hook"
    },
    "common_pitfalls": {
      "from": "video_job_guardrail",
      "source": "research_data.typical_workflows.traditional_process",
      "status": "optional",
      "ask_if": "only_if_demo_angle_depends_on_mistake_prevention"
    }
  }
}
```

The UI should show the generated questions, not the schema.

### 11.3 How Outline Should Work

The outline stage should use the approved `BriefingDocument`, not rerun intake.

The outline agent receives:

- `video_job`: coarse job and required outline contract.
- `primary_pattern`: soft grammar hint.
- `secondary_patterns`: optional grammar hints.
- `briefing_slots`: user-provided, inferred, and unresolved slots.
- `source_policy`: whether source gaps remain.

Then it builds sections with a job-specific skeleton plus pattern-specific moves.

For Product Demo:

```text
Required skeleton:
1. Problem / before-state
2. Desired outcome
3. Setup / starting point
4. Core interaction steps
5. Pitfall or old-workflow contrast
6. Result check
7. CTA / next action

Pattern grammar may modify this:
- quick_win_tutorial: compress setup, show outcome earlier
- capability_demo: spend more time on feature behavior
- use_case_solution_playbook: add business scenario/context
```

Pattern grammar can reorder emphasis, but it cannot remove required critical slots from the video job.

### 11.4 Slot Extractor

Reads the prompt and attached sources to populate candidate slot values.

It should not treat inferred values as confirmed when the risk is high.

### 11.5 Ambiguity Detector

Detects when multiple interpretations would produce different briefs.

Example:

```text
"How to use our dashboard"
```

Could mean:

- teach a workflow,
- explain when the dashboard is useful,
- sell a product feature,
- create internal training.

The ambiguity detector should not ask "what type is this?" It should ask which viewer job matters most.

### 11.6 Decision-Value Scorer

Ranks missing/ambiguous slots by how much they affect:

- briefing document correctness,
- outline structure,
- writing voice,
- media grammar,
- source/search policy.

### 11.7 Question Generator

Turns high-priority slot gaps into natural questions and controls.

Output:

```json
{
  "questions": [
    {
      "slot": "viewer_job",
      "question": "Should viewers understand when to use this dashboard, or be able to create the report themselves?",
      "why_it_matters": "This changes whether the brief is explanation-led or demo-led.",
      "input_type": "single_select",
      "options": [
        "Understand when to use it",
        "Create the report themselves",
        "Both, but demo first"
      ],
      "default": "Create the report themselves",
      "required": true
    }
  ],
  "accepted_assumptions": [
    {
      "slot": "media_grammar",
      "value": ["screen_recording", "voiceover"],
      "confidence": 0.83
    }
  ],
  "minimum_answers_needed": 3,
  "can_draft_with_assumptions": true
}
```

## 12. Source and Search Policy

Search should not run by default between outline and writing.

Reasons:

- It can add latency after the user thinks the structure is already set.
- It can introduce new facts that change the approved outline.
- It can cause source drift between outline and writing.
- It can make the writer optimize for found material instead of the user's intent.

Use source/search only when:

- the user attaches sources,
- the user explicitly asks for research,
- the topic is time-sensitive,
- the system identifies a source gap that blocks a credible brief,
- the brief requires claims, examples, or proof that are missing.

If source/search is needed, surface it before outline approval as a source-gap decision.

Example:

```text
This brief makes a product claim, but no source confirms it. Should I use only your attached material, ask you for proof, or draft with the claim marked as unverified?
```

## 13. Smart Intake UI Behavior

The UI should render the generated question plan from the backend.

The UI should not know whether a question came from a video job guardrail or a pattern pack. It should receive a composed plan where each question includes provenance for debugging, but only shows the user the natural question and controls.

Each card should show:

- question,
- answer control,
- inferred default if available,
- optional "why this matters",
- optional provenance in debug mode: `video_job_guardrail`, `primary_pattern`, `secondary_pattern`, `source_policy`,
- skip or accept-default behavior only when safe.

Possible controls:

- single-select chips,
- multi-select chips,
- text input,
- sliders,
- assumption chips,
- source-gap cards,
- must-avoid tags.

The UI can group cards by:

- Outcome
- Shape
- Proof / Sources
- Voice
- Visuals
- Constraints

Groups should be derived from slot metadata, not hardcoded video type.

Footer behavior:

- show answered count,
- show accepted assumptions count,
- enable "Build brief" when minimum high-impact slots are resolved,
- show "Draft with assumptions" only when safe.

## 14. Brief Synthesis

The Briefing Document Synthesizer converts:

- extracted slots,
- pattern-added slots,
- user answers,
- accepted assumptions,
- attached sources,
- source policy,
- unresolved assumptions,

into the `BriefingDocument`.

It should:

- clearly distinguish user-provided facts from inferred assumptions,
- avoid pretending uncertain inputs are known,
- mark unresolved high-impact assumptions,
- decide whether the brief is ready for outline.

Readiness levels:

- `ready`: enough user-confirmed inputs exist.
- `ready_with_assumptions`: some assumptions remain, but drafting is safe.
- `blocked`: at least one high-impact slot must be answered.

## 15. Outline Generation

The first generated creative artifact should be an outline draft.

It should use the `BriefingDocument` as the source of truth.

Each outline section should include:

- section title,
- purpose,
- viewer entry assumption,
- viewer exit state,
- duration,
- talking points,
- visual job,
- source dependency,
- unresolved assumption note if needed.

The outline should not invent facts to hide missing inputs.

## 16. Writing / Storyboard Stage

Writing starts only after the outline has been generated and approved or edited.

The writer should use the approved outline as source of truth.

It should not:

- rerun intent clarification,
- introduce a new route,
- search by default,
- use stale backend outline state when the frontend has user edits.

It should:

- preserve the approved section strategy,
- adapt voice and visual style to the briefing document,
- generate panels/script beats,
- mark any unresolved assumption clearly.

## 17. Prompt Strategy

Prompts should be short and role-specific.

Suggested prompt files:

- `SLOT_EXTRACTION_PROMPT_v0603.md`
- `QUESTION_GENERATION_PROMPT_v0603.md`
- `BRIEF_SYNTHESIS_PROMPT_v0603.md`
- `OUTLINE_ARCHITECT_PROMPT_v0603.md`
- `STORYBOARD_WRITER_PROMPT_v0603.md`

Code should own:

- slot schemas,
- slot status/confidence types,
- ask-priority scoring,
- UI input types,
- persistence,
- minimum-answer logic,
- source/search policy,
- stage transitions,
- tests.

Prompts should own:

- slot extraction judgment,
- question phrasing,
- creative synthesis,
- outline strategy,
- writing craft.

## 18. Proposed Backend Work

1. Add slot schema definitions.
   - Suggested file: `backend/app/services/intake_slots.py`
   - Define universal slots, job-specific slots, status, confidence, and priority metadata.

2. Add pattern grammar pack registry.
   - Suggested file: `backend/app/services/pattern_grammar.py`
   - Define pattern `slot_pack`, `question_pack`, `outline_move_pack`, `media_grammar_pack`, and `anti_pattern_pack`.

3. Add dynamic schema composer.
   - Suggested file: `backend/app/services/intake_schema_composer.py`
   - Input: universal slots, video job guardrail, selected patterns, source/artifact context.
   - Output: composed candidate slots with provenance and priority boosts.

4. Add Slot Extraction service.
   - Suggested file: `backend/app/services/slot_extractor.py`
   - Input: raw prompt, source metadata, optional constraints.
   - Output: slot confidence map.

5. Add Clarification Planner.
   - Suggested file: `backend/app/services/clarification_planner.py`
   - Input: slot confidence map.
   - Output: question plan.

6. Add Brief Synthesizer.
   - Suggested file: `backend/app/services/brief_synthesizer.py`
   - Input: slots, answers, accepted assumptions.
   - Output: briefing document.

7. Keep current route inference only as compatibility/debug metadata.
   - It can help load old projects and inspect behavior.
   - It should not be the main branching mechanism.

8. Add source policy service.
   - Detect whether source/search is needed.
   - Do not run search automatically unless source policy says it is blocking.

9. Add endpoints.
   - `POST /api/project/{id}/intake-plan`
   - `POST /api/project/{id}/brief`
   - `GET /api/project/{id}/brief`

10. Add tests.
   - Slot extraction fixtures.
   - Ambiguity detection fixtures.
   - Pattern pack composition tests.
   - Question priority tests.
   - Brief readiness tests.
   - Source policy tests.
   - Refresh/persistence tests.

## 19. Proposed Frontend Work

1. Front page
   - One composer.
   - Optional upload/source area.
   - Optional lightweight chips for duration/platform.
   - No type selector.

2. Smart Intake
   - Render backend-generated question plan.
   - Support single select, multi select, text, slider, and assumption chips.
   - Show accepted assumptions separately from user-entered answers.
   - Show "why this matters" only when useful.
   - Enable "Build brief" when minimum high-impact slots are resolved.

3. Brief Review
   - Show generated briefing document before outline.
   - Make key fields editable.
   - Mark inferred assumptions and unresolved assumptions.
   - Allow approve, edit, or answer another clarification.

4. Outline
   - Generate from approved brief.
   - Surface unresolved assumptions as editable notes.
   - Let user approve/edit before writing.

5. Writing
   - Use approved outline state.
   - Do not silently alter strategy.

## 20. Acceptance Criteria

- User can start from one composer with no video type selection.
- System extracts a slot confidence map from prompt and sources.
- System composes candidate slots from universal slots, coarse video job guardrails, and pattern grammar packs.
- System generates questions from uncertain high-impact slots after pattern priority boosts.
- Questions are not fixed by hardcoded video type.
- No more than 8 questions appear before first brief generation.
- Every question maps to a briefing slot and downstream decision.
- System can draft a brief with accepted assumptions only when safe.
- Briefing document clearly separates user-provided inputs, inferred assumptions, and unresolved assumptions.
- Search does not run automatically between outline and writing.
- Source gaps are surfaced before outline approval.
- Outline generation uses the approved briefing document.
- Writing uses the approved outline, including user edits.
- Old projects with `knowledge_share`, `product_demo`, or `product_release` metadata still load.
- Tests cover at least:
  - explainer-like prompt,
  - demo-like prompt,
  - talking-script prompt,
  - product-launch prompt,
  - planner/lifestyle prompt,
  - creative narrative prompt,
  - ambiguous prompt where slot clarification matters.

## 21. Example

Input:

```text
I want to make a video about how to use our dashboard for weekly reporting.
```

Slot confidence map:

```json
{
  "viewer_job": {
    "value": "complete_a_process",
    "status": "ambiguous",
    "confidence": 0.62,
    "impact_if_wrong": "high"
  },
  "media_grammar": {
    "value": ["screen_recording", "voiceover"],
    "status": "inferred",
    "confidence": 0.84,
    "impact_if_wrong": "medium"
  },
  "success_state": {
    "value": null,
    "status": "missing",
    "confidence": 0,
    "impact_if_wrong": "high"
  }
}
```

Generated questions:

```json
[
  {
    "slot": "viewer_job",
    "question": "Should viewers understand when to use the dashboard, or be able to create the report themselves?",
    "default": "Create the report themselves"
  },
  {
    "slot": "success_state",
    "question": "What does success look like on screen?",
    "default": null
  },
  {
    "slot": "common_mistakes",
    "question": "Where do users usually get stuck?",
    "default": null
  }
]
```

Briefing document result:

```json
{
  "viewer_job": "Create a weekly report without needing help from the ops team.",
  "creator_goal": "Teach a practical workflow without turning the video into a feature tour.",
  "content_spine": [
    "Start with the weekly business question",
    "Set up dashboard filters around that question",
    "Generate and check the report",
    "Avoid exporting before narrowing the view"
  ],
  "media_grammar": ["screen_recording", "voiceover", "callouts"],
  "brief_ready_level": "ready_with_assumptions"
}
```
