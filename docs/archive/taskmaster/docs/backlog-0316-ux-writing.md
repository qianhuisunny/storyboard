# Better UX Writing Across All Steps

**Date:** 2026-03-16

## Problem

Field labels, descriptions, placeholders, and button copy across the brief builder steps need a UX writing pass. Current labels are either too technical, too vague, or don't guide the user toward the right kind of input.

## Examples of Issues Found

- `viewer_outcome` was labeled "Viewer outcome: know, do, believe" — too terse, user doesn't understand what to write. Changed to a full question with tooltip explaining know/do/believe.
- `viewer_next_action` was redundant with `viewer_outcome` — removed entirely.
- Field placeholders repeat the label ("Enter viewer outcome...") instead of showing a concrete example.

## Scope

Audit and improve UX writing for:
- **Round 1 (Core Intent)**: Field labels, placeholders, helper text
- **Round 2 (Delivery & Format)**: Option labels, descriptions
- **Round 3 (Content Spine)**: POV guidance, generated field labels
- **Review step**: Section headers, approve/edit button copy
- **Progress bar**: Step names, tooltips
- **Error messages**: Make actionable, not generic
- **Loading states**: Specific to what's happening ("Generating content spine..." not "Processing...")

## Principles

- Labels should be questions when the user needs to provide input
- Placeholders should show concrete examples, not restate the label
- Tooltips for any non-obvious concept (like know/do/believe)
- Button copy should say what happens next, not just "Confirm"
- Keep it conversational, not formal
