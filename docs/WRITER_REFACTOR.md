# Storyboard Pipeline Refactor

## Status

| Component | Status | Branch |
|-----------|--------|--------|
| Director | ✅ Done | `new-director` |
| Writer | 🔲 Planned | - |

---

## Director Changes (Completed)

**Voiceover-first approach with simplified 4-field output:**

```json
{
  "screen_number": 1,
  "screen_type": "stock video",
  "voiceover_text": "U.S. hospitals waste five hundred thousand dollars annually...",
  "target_duration_sec": 6.5
}
```

**Key changes:**
- Duration calculated inline (no DurationCalculator agent)
- Voiceover written with numbers spelled out
- Dropped: purpose, rough_duration, visual_direction, notes

---

## Writer Changes (TODO)

### Goal
Simplify Writer to only add visual assets. Remove redundant processing.

### What to Remove
- DurationCalculator calls (Director does this now)
- Voiceover refinement (Director does this now)
- visual_direction transformation (field dropped)
- action_notes synthesis (field dropped)

### New Output (5 fields)
```json
{
  "screen_number": 1,
  "screen_type": "stock video",
  "target_duration_sec": 6.5,
  "voiceover_text": "...",
  "on_screen_visual": "..."
}
```

### Visual Asset Strategy

| Screen Type | Strategy |
|-------------|----------|
| `talking head` | Placeholder: `PLACEHOLDER: talking-head` |
| `screencast` | Placeholder: `PLACEHOLDER: demo-screen` |
| `CTA` | Placeholder: `PLACEHOLDER: cta-template` |
| `slides/text overlay` | HTML generation via Claude |
| `whiteboard` | HTML generation via Claude |
| `stock video` | API search (existing Google CSE) |

### Files to Modify
- `backend/app/services/agents/storyboard_writer.py`
- `prompts/storyboard_writer_prompt_2.md`

---

## Image API Options

| API | Cost | Quality | Notes |
|-----|------|---------|-------|
| Pexels | Free | Good | No attribution required |
| Unsplash | Free | Great | Attribution required |
| Pixabay | Free | Good | No attribution |
| Google CSE | Limited free | Varies | Already integrated |

**Recommendation:** Use existing Google CSE for stock video, placeholders for others.

---

## HTML Visual Generation

For slides/whiteboard, use Claude to generate simple HTML:

```python
def _generate_html_visual(self, voiceover: str, screen_type: str) -> str:
    """Generate HTML visual from voiceover content."""
    prompt = f"""
    Create a simple HTML visual (400x300px) for:
    "{voiceover}"

    Style: {screen_type}
    Return only HTML with inline CSS.
    """
    # Call Claude API
    return html_response
```

---

## Next Steps

1. [ ] Update `storyboard_writer.py` - remove DurationCalculator, simplify processing
2. [ ] Add `_get_visual_asset()` method with strategy by screen_type
3. [ ] Add `_generate_html_visual()` for slides/whiteboard
4. [ ] Update `storyboard_writer_prompt_2.md`
5. [ ] Test end-to-end pipeline
