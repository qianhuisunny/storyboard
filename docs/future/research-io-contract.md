# Research I/O Contract

## Status

`Researcher` / `EvidenceResearcher` is intentionally deferred for the MVP.

This document defines the contract it must satisfy before it is reintroduced.
The goal is to preserve a clean seam now, so future workflow work does not
recreate the old placeholder drift.

---

## Why This Exists

The old research path mixed three different concerns:

1. user-facing progress UX
2. LLM evidence generation
3. writer handoff format

The result was a fragile contract:

- research could be triggered from ad hoc endpoints
- research data was matched back to outline sections by title text
- the writer consumed whatever shape happened to be available

When research comes back, it should return as a proper stage contract:

`OutlineDocument -> ResearchBundle -> WriterInput`

---

## Placement In The Pipeline

Recommended future flow:

`Briefing -> Outline -> optional Research -> Writer -> Review`

The research stage should sit **after outline approval** and **before writer
generation**.

Reason:

- the outline defines what needs evidence
- the writer should not guess evidence needs from raw brief text
- research should attach to stable outline sections, not free text blobs

---

## Canonical Stage Boundaries

### Upstream dependency

Research consumes:

- approved brief context
- approved outline structure
- optional source corpus references

### Downstream dependency

Research produces:

- section-keyed evidence for the writer
- source attribution that can survive user review
- enough metadata for observability and reruns

---

## Input Contract

The future Researcher should accept one canonical input object.

```json
{
  "project_id": "proj_123",
  "brief": {
    "viewer_outcome": "Help PMs explain why agent workflows need hard contracts.",
    "target_audience": "Product and engineering leads",
    "audience_level": "intermediate",
    "delivery_tone": "clear, pragmatic",
    "duration_sec": 300,
    "point_of_view": "Workflow composition gets brittle when stage I/O is implicit."
  },
  "outline": {
    "outline_id": "outline_v1",
    "sections": [
      {
        "section_id": "sec_1",
        "section_number": 1,
        "title": "Why hidden contracts fail",
        "purpose": "Establish the core problem",
        "entry_assumption": "Viewer thinks prompt quality is the main issue",
        "exit_state": "Viewer sees workflow contracts as the real bottleneck",
        "duration_range_sec": { "min": 45, "max": 60 },
        "talking_points": [
          "Text-only handoffs lose structure",
          "Downstream agents re-parse unstable prose"
        ],
        "evidence_needs": [
          "Examples of workflow breakage caused by ambiguous I/O",
          "A concrete comparison between free text and structured contracts"
        ]
      }
    ]
  },
  "source_context": {
    "uploads": [],
    "links": [],
    "constraints": {
      "freshness_expectation": "current best practices",
      "must_avoid": []
    }
  }
}
```

### Required input rules

1. `outline.sections[*].section_id` is mandatory.
2. Section matching must use `section_id`, never title text.
3. Duration must already be normalized to numeric seconds.
4. `evidence_needs` must be explicit. Research should not invent the target of
   the search from scratch.
5. Research may read user uploads and fetched links, but those are supporting
   context, not the primary stage contract.

---

## Output Contract

The future Researcher should return one canonical bundle.

```json
{
  "research_id": "research_v1",
  "outline_id": "outline_v1",
  "status": "complete",
  "sections": [
    {
      "section_id": "sec_1",
      "section_title": "Why hidden contracts fail",
      "coverage_status": "complete",
      "evidence_items": [
        {
          "evidence_id": "ev_1",
          "evidence_needed": "Examples of workflow breakage caused by ambiguous I/O",
          "research_blocks": [
            {
              "research_question": "What failure modes appear when downstream steps must re-parse prose?",
              "storyboard_usable_phrasing": [
                "When a downstream step must reconstruct structure from prose, every edit becomes a schema migration in disguise."
              ],
              "full_answer": "Ambiguous prose creates drift in parsing, missing fields, and unstable retries across stages.",
              "sources": [
                {
                  "title": "Workflow Contracts",
                  "url": "https://example.com/workflow-contracts",
                  "publisher": "Example Publisher",
                  "published_at": "2026-04-01",
                  "source_type": "article"
                }
              ],
              "confidence": "high"
            }
          ]
        }
      ]
    }
  ],
  "meta": {
    "model": "tbd",
    "generated_at": "2026-04-19T12:00:00Z",
    "warnings": []
  }
}
```

### Required output rules

1. Every section in the input outline must appear once in the output.
2. `section_id` is the primary join key.
3. `coverage_status` must be explicit: `complete`, `partial`, or `empty`.
4. Every `research_block` must preserve source attribution.
5. `storyboard_usable_phrasing` is optional guidance for the writer, not a
   replacement for source-backed evidence.

---

## Persistence Contract

When research is reintroduced, these state slots should be used consistently:

- `state.evidence_research`
  - canonical machine-readable evidence bundle for writer handoff
- `state.research_details`
  - orchestration metadata, progress logs, timings, search traces, debug info

The split matters:

- `evidence_research` is product-facing stage output
- `research_details` is operational metadata

Do not mix them.

---

## Ownership Rules

### Backend owns

- the initial research generation
- the canonical stored `evidence_research` bundle
- the mapping from approved outline version to research version

### Frontend owns

- temporary user filtering of evidence snippets
- presentational grouping and review UI state

### Handoff rule

If the user edits or filters evidence in the frontend, the frontend must send
the filtered bundle back on approve. The backend must not silently reuse an old
stored copy.

This follows the same ownership rule already used for:

- `current_story_brief`
- `current_outline`
- `current_storyboard`

---

## Workflow Events

Recommended future event semantics:

- `gate2 -> run_research`
  - input: approved current outline plus optional explicit source context
  - output: transition to `outline_research`
- `outline_research -> approve`
  - input: `current_outline` plus `evidence_research`
  - output: writer generation
- `outline_research -> edit`
  - go back to `gate2` and invalidate research if the outline changed materially

### Invalidation rule

Any change to:

- section order
- section count
- section ids
- talking points
- duration budgets

must invalidate the stored research bundle unless a migration step explicitly
rewrites the section mapping.

---

## Non-Goals

This contract does not decide:

- whether research uses web search, RAG, uploaded docs, or all three
- whether research runs in one batch or progressively per section
- whether the UX is chat, panel, or background job

Those are implementation choices.
The I/O contract above must stay stable regardless.

---

## What Must Be True Before Reintroduction

Do not re-enable research until all of these are true:

1. Outline has a stable machine-readable section schema with `section_id`.
2. Writer input can consume section-keyed evidence without fuzzy title matching.
3. The state machine clearly distinguishes:
   - no research
   - research running
   - research complete
   - research invalidated
4. Frontend review can send filtered evidence back on approve.
5. Observability for research generation is written to `research_details`, not
   mixed into the product payload.

---

## Short Version

When Researcher returns, it should not come back as “some helpful extra data.”

It should come back as:

- a real pipeline stage
- with one explicit input object
- one explicit output object
- stable section IDs
- clean ownership rules
- and a deterministic writer handoff
