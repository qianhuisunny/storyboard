# Section Grouping in Storyboard Draft View

**Date:** 2026-03-16
**Priority:** High — directly impacts usability

## Problem

Storyboard Draft shows a flat list of 19+ screens with no visual indication of which screens belong to which section. User has to mentally map screen numbers to sections from the outline. This breaks the connection between outline structure and draft output.

## Data Available

Each screen already has `section_number` and `section_title` from the Writer output (7-field schema). The data is there — just not surfaced in the UI.

## Required Design

**NOT**: a small metadata field inside each screen card that can be ignored.

**YES**: a clear visual section header/divider that groups screens by section. The user must be able to instantly see "these 3 screens are Section 2 — The Problem" without reading individual cards.

Approaches:
1. **Section header row** between groups — full-width bar with section number + title, screens nested below. Like a table with grouped rows.
2. **Left border accent** per section — each section gets a distinct left-border color, with a floating section label at the first screen of each group.
3. **Collapsible section groups** — each section is a collapsible container (like the outline sections), with screens inside. Shows section title + screen count + total duration in the header.

Option 3 is probably best — mirrors the outline structure, lets user focus on one section at a time, and provides section-level summary stats.
