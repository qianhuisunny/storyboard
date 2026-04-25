"""
LLM-based keyframe auto-generation.

Analyzes voiceover_script + visual_direction to produce
timed overlay elements (stat, badge, quote, label, divider).
"""
import json
import sys
from pathlib import Path
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / "backend" / ".env")

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
    client: OpenAI | None = None,
) -> list[dict]:
    """Generate keyframes for a single panel via LLM."""
    if client is None:
        client = OpenAI()

    user_prompt = json.dumps({
        "voiceover_script": voiceover_script,
        "visual_direction": visual_direction,
        "duration_seconds": duration_seconds,
        "screen_type": screen_type,
    }, indent=2)

    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        temperature=0.3,
        max_tokens=2000,
    )

    raw = response.choices[0].message.content.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]

    return json.loads(raw)


def generate_all_keyframes(storyboard_path: str, output_path: str | None = None):
    """Generate keyframes for all panels and write back to storyboard JSON."""
    sb = json.loads(Path(storyboard_path).read_text())
    client = OpenAI()

    for panel in sb["panels"]:
        if panel.get("keyframes"):
            print(f"  [P{panel['panel_number']:02d}] Skipping (keyframes exist)")
            continue

        print(f"  [P{panel['panel_number']:02d}] Generating keyframes...")
        kfs = generate_keyframes(
            voiceover_script=panel["voiceover_script"],
            visual_direction=panel["visual_direction"],
            duration_seconds=panel["duration_seconds"],
            screen_type=panel["screen_type"],
            client=client,
        )
        panel["keyframes"] = kfs
        print(f"    → {len(kfs)} keyframes")

    out = output_path or storyboard_path
    Path(out).write_text(json.dumps(sb, indent=2, ensure_ascii=False))
    print(f"\nKeyframes written to {out}")


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "storyboard.json"
    generate_all_keyframes(path)
