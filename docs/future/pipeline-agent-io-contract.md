# Briefing, Outline, Writer I/O Contract

## Purpose

This document defines the current and recommended I/O contracts for the three
core creative stages:

1. Briefing
2. Outline
3. Writer

The main goal is workflow composability.

Right now the pipeline works, but the machine-readable contract is not fully
continuous:

`Brief JSON -> Outline plain text -> Writer reparses text -> Storyboard JSON`

That break in representation is the biggest reason downstream workflow assembly
is brittle.

---

## Design Rule

For every stage, keep these distinct:

1. canonical machine contract
2. user-editable representation
3. persisted state slot
4. handoff payload between frontend and backend

If those four blur together, state drift comes back.

---

## Current Pipeline Snapshot

### Persisted state slots

- `state.intake_form`
- `state.story_brief`
- `state.screen_outline`
- `state.storyboard`
- `state.evidence_research` (reserved/future)

### Current event-time override payloads

These already exist and are important:

- gate 1 approve accepts `payload.current_story_brief`
- gate 2 approve accepts `payload.current_outline`
- gate 2 approve may also accept `payload.evidence_research`
- review approve accepts `payload.current_storyboard`

This means ownership already shifts to the frontend after user edits.
The contracts below formalize that behavior instead of treating it as a patch.

---

## Stage 1: Briefing

### Current role

Turn intake plus user clarification into a structured brief that downstream
agents can use.

### Current input

Canonical backend inputs today:

- `state.intake_form`
- `state.confirmed_fields`
- `revision_feedback` for Round 3 regeneration

There are currently two entry paths:

1. progressive 3-round briefing flow
2. chat-brief flow that converges into the same `story_brief.fields` shape

### Current output

`BriefBuilder.run()` returns:

```json
{
  "round": 3,
  "fields": {
    "viewer_outcome": {
      "value": "Explain why workflow contracts matter",
      "source": "extracted",
      "confirmed": true
    },
    "core_talking_points": {
      "value": [
        "Hidden contracts create drift",
        "Text reparsing causes brittle workflows"
      ],
      "source": "inferred",
      "confirmed": false
    }
  }
}
```

### Current field envelope

Every brief field uses:

```json
{
  "value": "...",
  "source": "extracted | inferred | empty",
  "confirmed": true
}
```

### Current effective brief schema

The union of fields currently used across the stage:

- `video_type`
- `viewer_outcome`
- `target_audience`
- `duration`
- `audience_level`
- `platform`
- `on_camera_presence`
- `broll_type`
- `delivery_tone`
- `freshness_expectation`
- `point_of_view`
- `core_talking_points`
- `misconceptions`
- `must_avoid` is conceptually present but not active in the current builder UI

### Current owner

- backend owns the initial generated brief
- frontend becomes owner after user edits
- backend regains an updated snapshot only when approve sends
  `current_story_brief`

### Current state slot

- persisted in `state.story_brief`
- user-confirmed accumulation also lives in `state.confirmed_fields`

### Current problems

1. The stage contract is coupled to UI rounds.
2. `story_brief` and `confirmed_fields` overlap in responsibility.
3. Some fields are optional in practice but required downstream by convention.
4. `must_avoid` exists as a downstream idea but is not consistently present in
   the canonical output.

### Recommended canonical contract

The briefing stage should publish one canonical `BriefPacket`, regardless of
which UI flow created it.

```json
{
  "brief_id": "brief_v1",
  "video_type": "knowledge_share",
  "fields": {
    "viewer_outcome": { "value": "...", "source": "extracted", "confirmed": true },
    "target_audience": { "value": "...", "source": "extracted", "confirmed": true },
    "duration_sec": { "value": 300, "source": "extracted", "confirmed": true },
    "audience_level": { "value": "intermediate", "source": "extracted", "confirmed": true },
    "platform": { "value": "linkedin", "source": "extracted", "confirmed": true },
    "on_camera_presence": { "value": "some", "source": "extracted", "confirmed": true },
    "broll_type": { "value": ["slides", "screen_recording"], "source": "extracted", "confirmed": true },
    "delivery_tone": { "value": "clear, pragmatic", "source": "extracted", "confirmed": true },
    "freshness_expectation": { "value": "current", "source": "extracted", "confirmed": true },
    "point_of_view": { "value": "...", "source": "extracted", "confirmed": true },
    "core_talking_points": { "value": ["..."], "source": "inferred", "confirmed": true },
    "misconceptions": { "value": "...", "source": "inferred", "confirmed": true },
    "must_avoid": { "value": [], "source": "inferred", "confirmed": true }
  }
}
```

### Recommended rules

1. Round structure stays in UI state, not in the canonical brief contract.
2. Duration should be normalized to numeric `duration_sec`.
3. Downstream required fields should be explicit and validated before outline
   generation.
4. `state.story_brief` should be the only canonical brief payload.
   `confirmed_fields` can remain a transient helper, but not a second source of
   truth.

---

## Stage 2: Outline

### Current role

Turn the approved brief into a structured narrative outline for the writer.

### Current input

`StoryboardDirector.run()` consumes:

- `state.story_brief`

It reads both:

- new nested format: `story_brief.fields.<field>.value`
- legacy flat format: `story_brief.<field>`

### Current output

The Director returns one **plain text outline string**.

The writer currently expects that text to contain sections in this shape:

```text
Section 1 — Why hidden contracts fail
Purpose
...
Entry assumption
...
Exit state
...
Duration
0:45–1:00
Talking points
- ...
- ...
```

### Current machine-readable outline contract

This is not emitted directly by the Director.
It is reconstructed later by the Writer parser into:

```json
{
  "section_number": 1,
  "title": "Why hidden contracts fail",
  "purpose": "Establish the core problem",
  "entry_assumption": "Viewer thinks prompt quality is the bottleneck",
  "exit_state": "Viewer understands hidden workflow contracts are the real issue",
  "duration_range": "0:45–1:00",
  "talking_points": ["...", "..."]
}
```

### Current owner

- backend owns the first generated outline text
- frontend becomes owner after inline editing
- backend uses `payload.current_outline` at gate 2 approve

### Current state slot

- persisted in `state.screen_outline`
- today this is usually plain text, though the type still allows `list`
  for legacy compatibility

### Current problems

1. The canonical representation is human prose, not structured data.
2. Writer has to re-parse the outline every time.
3. Research and writer handoff both depend on section title text instead of
   stable IDs.
4. Duration exists as a string, so every downstream stage repeats normalization.
5. Outline refinement methods also operate on text, which keeps machine state
   implicit.

### Recommended canonical contract

The Director should own and persist one `OutlineDocument` as the machine source
of truth.

```json
{
  "outline_id": "outline_v1",
  "brief_id": "brief_v1",
  "sections": [
    {
      "section_id": "sec_1",
      "section_number": 1,
      "title": "Why hidden contracts fail",
      "purpose": "Establish the core problem",
      "entry_assumption": "Viewer thinks prompt quality is the main issue",
      "exit_state": "Viewer sees workflow contracts as the bottleneck",
      "duration_range_sec": { "min": 45, "max": 60 },
      "talking_points": [
        "Hidden contracts create drift",
        "Text reparsing breaks workflow composition"
      ]
    }
  ],
  "rendered_text": "Section 1 — Why hidden contracts fail\n..."
}
```

### Recommended rules

1. `sections[*].section_id` must be stable across edits unless the section is
   materially replaced.
2. `rendered_text` is an editable view, not the canonical machine payload.
3. Writer and Researcher should consume `sections`, not reparsed text.
4. Refinement can still use natural-language instructions, but it should return
   an updated `OutlineDocument`, not only a new text blob.

---

## Stage 3: Writer

### Current role

Expand the approved outline into a screen-by-screen production storyboard.

### Current input

`StoryboardWriter.run()` consumes:

- `state.screen_outline`
- `state.story_brief`
- optional `state.evidence_research`

Current writer behavior:

1. parse outline text into section dicts
2. extract brief context
3. derive allowed screen types
4. pull evidence by fuzzy section-title match
5. generate full storyboard in one LLM call
6. post-process durations and placeholder visuals

### Current LLM output contract

The writer prompt asks the model for a JSON array where each screen has exactly
7 fields:

- `screen_number`
- `section_number`
- `section_title`
- `screen_type`
- `voiceover_text`
- `visual_direction`
- `action_notes`

### Current final backend output

After post-processing, each screen effectively contains:

```json
{
  "screen_number": 1,
  "section_number": 1,
  "section_title": "Why hidden contracts fail",
  "screen_type": "slides",
  "voiceover_text": "When every stage passes prose instead of structure...",
  "visual_direction": ["workflow diagram", "highlighted handoff labels"],
  "action_notes": "Show the contract break clearly.",
  "duration": 7.2,
  "on_screen_visual": "/placeholders/slides_and_diagrams.png"
}
```

### Current owner

- backend owns the first generated storyboard
- frontend becomes owner after editing/reordering
- backend uses `payload.current_storyboard` at final approve

### Current state slot

- persisted in `state.storyboard`

### Current problems

1. Writer depends on reparsing outline text instead of consuming a typed outline.
2. Evidence joins use fuzzy title matching instead of `section_id`.
3. The LLM returns one screen schema, but the persisted backend output adds more
   fields afterward.
4. Screen IDs are positional only. Reordering and diffing are harder than they
   should be.
5. Duration alignment is validated after generation instead of being grounded in
   typed section budgets from the start.

### Recommended canonical contract

Writer should consume a typed `WriterInput` and emit a typed `StoryboardDocument`.

```json
{
  "writer_input": {
    "brief_id": "brief_v1",
    "outline_id": "outline_v1",
    "sections": [
      {
        "section_id": "sec_1",
        "section_number": 1,
        "title": "Why hidden contracts fail",
        "duration_range_sec": { "min": 45, "max": 60 },
        "talking_points": ["...", "..."]
      }
    ],
    "allowed_screen_types": ["slides", "screen_recording", "talking_head"],
    "evidence_research": {
      "sections": []
    }
  }
}
```

```json
{
  "storyboard_id": "storyboard_v1",
  "outline_id": "outline_v1",
  "screens": [
    {
      "screen_id": "scr_1",
      "screen_number": 1,
      "section_id": "sec_1",
      "section_number": 1,
      "section_title": "Why hidden contracts fail",
      "screen_type": "slides",
      "voiceover_text": "...",
      "duration_sec": 7.2,
      "visual_direction": ["workflow diagram", "handoff labels"],
      "action_notes": "Explain the failure mode visually.",
      "on_screen_visual": "/placeholders/slides_and_diagrams.png"
    }
  ]
}
```

### Recommended rules

1. `section_id` must be the primary join key from outline to storyboard.
2. `screen_id` must be stable and explicit.
3. `duration_sec` should be the canonical numeric field name.
4. Post-processing fields should be part of the formal output contract, not
   hidden enrichments.
5. Evidence handoff should join on `section_id`, never title text.

---

## Cross-Stage Contract Rules

These rules should govern all future workflow work.

### 1. One canonical payload per stage

Each stage gets one canonical machine-readable output.
UI-specific round state or display text should not become the system contract.

### 2. Editable text is not the only source of truth

If humans edit prose, the system may keep a rendered text view.
But downstream agents should consume structured payloads, not re-parse prose.

### 3. IDs begin at Outline

Stable IDs should exist at least from outline onward:

- `brief_id`
- `outline_id`
- `section_id`
- `storyboard_id`
- `screen_id`

### 4. Frontend ownership after edit must be explicit

Once the user edits a stage, the frontend owns the freshest version.
Approve events must carry that version back explicitly.

### 5. Validation belongs at stage boundaries

Each stage should validate:

- required input fields
- normalized duration types
- schema completeness
- version compatibility

before invoking the next generator.

---

## Recommended Next Refactors

If we want workflow composition to become materially easier, the highest-leverage
sequence is:

1. Introduce a canonical `BriefPacket` independent of UI rounds.
2. Change Director output from text-only to `OutlineDocument + rendered_text`.
3. Update Writer to consume `OutlineDocument.sections` directly.
4. Introduce `section_id` everywhere before reintroducing Researcher.
5. Promote `duration_sec` and `duration_range_sec` to normalized numeric fields
   across all stages.

---

## Short Version

Today the pipeline mostly works because each stage knows how to recover missing
structure from the previous one.

That is exactly what makes future workflow composition hard.

The clean version is:

`IntakeForm -> BriefPacket -> OutlineDocument -> ResearchBundle -> StoryboardDocument`

with editable text views attached where needed, but never replacing the machine
contract.
