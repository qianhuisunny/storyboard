# Edge Case: B-Roll Type Selection May Not Match Outline Needs

**Date:** 2026-03-16

## Problem

User selects B-roll types in Round 2 (Delivery & Format) before the outline exists. After the Director generates the outline, the actual content may require B-roll types the user didn't select — or the AI may have better suggestions based on the specific sections.

Examples:
- User picks "slides" and "screen_recording", but a section about a historical anecdote would be better served by "stock_footage"
- Outline has a code walkthrough section but user didn't select "code_editor"
- AI discovers that "whiteboard_animation" would explain a concept better than the user's chosen "slides"

## Current Flow

Round 2 (user selects broll_type) → Round 3 (content spine) → Brief Approve → Director generates outline → Writer uses broll_type from brief

The Writer is constrained to the user's pre-outline selections, which may not be optimal.

## Possible Solutions

1. **Post-outline B-roll review**: After Director generates the outline, surface a step where AI suggests B-roll types per section based on content, and the user approves/overrides.
2. **Writer flexibility**: Allow the Writer to use B-roll types outside the user's selection if strongly justified, but flag them for user review.
3. **Move B-roll selection post-outline**: Ask the user to select B-roll types after seeing the outline sections, so they can make informed choices per section.
4. **Hybrid**: Keep the Round 2 selection as a "preference" but let Director/Writer suggest overrides that the user approves at Gate 2.
