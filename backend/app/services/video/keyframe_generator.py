"""
LLM-based overlay element generation for composition-first scenes.

This module no longer thinks in terms of slide templates or keyframes.
It generates ``overlay_elements`` for a scene described by:

  - screen_type
  - composition
  - design_brief
  - voiceover_script
  - duration_seconds
"""
import json

from app.infra.llm_gateway import llm

SYSTEM_PROMPT = """You are a motion-design planner for narrated videos.

Given a scene's screen_type, composition, design_brief, voiceover_script,
and duration_seconds, generate an overlay_elements JSON array.

Each element should be a plain JSON object with a `kind` plus only the
fields it needs. Typical kinds include:
- headline
- subhead
- stat
- stat_pill
- label
- badge
- icon_card
- screenshot_card
- image_card
- example_card
- arrow
- pros_cons_block

Optional fields:
- text
- title
- value
- items
- zone (`primary` or `sidecar`)
- position
- icon
- t
- dur
- style

Rules:
- Match the requested composition instead of inventing a new layout.
- Prefer 2-6 elements, not clutter.
- For `single_center`, create one dominant focal element.
- For `primary_with_sidecar`, assign supporting elements to `zone=sidecar`.
- For `free_overlay`, use timed text/stat elements directly on the canvas.
- Return ONLY a valid JSON array. No markdown fences.
"""


def generate_overlay_elements(
    voiceover_script: str,
    design_brief: list[str],
    duration_seconds: float,
    screen_type: str,
    composition: str,
) -> list[dict]:
    """Generate overlay elements for a single panel via LLM."""
    user_prompt = json.dumps(
        {
            "voiceover_script": voiceover_script,
            "design_brief": design_brief,
            "duration_seconds": duration_seconds,
            "screen_type": screen_type,
            "composition": composition,
        },
        indent=2,
    )

    raw = llm.chat(
        category="video",
        label="overlay_elements",
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        max_tokens=2000,
    )

    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(raw)
