"""
LLM-based keyframe auto-generation for video overlays.

Analyzes a panel's voiceover_script + visual_direction to produce
timed overlay elements (stat, callout, quote, label, divider) that
render on top of the base video via the Remotion KeyframeOverlay
composition.

Uses llm_gateway for cost tracking and model routing.
"""
import json

from app.infra.llm_gateway import llm

SYSTEM_PROMPT = """You are a video overlay designer. Given a panel's voiceover script, visual direction, duration, and screen type, generate a keyframes array that defines what text elements appear on screen and when.

Rules:
- First element must appear within 2 seconds
- No gap longer than 2 seconds between consecutive elements
- Each keyframe needs: t (start seconds), type, text
- Optional: dur (visibility duration), position, style, accent_word, icon (single emoji)
- Element types:
  - "stat": large centered number (use for percentages, multipliers)
  - "callout": floating dialogue/phrase callout — key phrases the speaker is saying (use for objections, key statements, dialogue)
  - "quote": large serif text with optional accent word (use for impactful phrases)
  - "label": small annotation text
  - "divider": section title card (format text as "Part N | Title", add icon emoji)
- Use "icon" field to add a semantic emoji that matches the content (e.g. 📈 for growth stats, 🏢 for corporate, ⚖️ for legal, 📋 for checklists)
- Calculate timestamps from word position: (word_index / total_words) * duration_seconds
- For talking_head panels: use fewer, punchier elements (badges for key phrases)
- For stock_video panels: badges and labels that reinforce the narration
- For slides panels: stats, quotes, and badges as primary visual content
- Position values: center, top_center, bottom_center, left, right, right_upper, right_lower, row_NofM
- Style object: { "color": hex, "bg": hex, "fontSize": number }

Output ONLY a valid JSON array of keyframe objects. No explanation."""


def generate_keyframes(
    voiceover_script: str,
    visual_direction: list[str],
    duration_seconds: float,
    screen_type: str,
) -> list[dict]:
    """Generate keyframes for a single panel via LLM.

    Returns a list of keyframe dicts ready to pass to
    render_keyframe_overlay() or embed in a storyboard JSON.
    """
    user_prompt = json.dumps({
        "voiceover_script": voiceover_script,
        "visual_direction": visual_direction,
        "duration_seconds": duration_seconds,
        "screen_type": screen_type,
    }, indent=2)

    raw = llm.chat(
        category="video",
        label="keyframe_gen",
        system_prompt=SYSTEM_PROMPT,
        user_prompt=user_prompt,
        temperature=0.3,
        max_tokens=2000,
    )

    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(raw)
