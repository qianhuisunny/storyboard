"""
Gold Set Evaluation Util

Runs Director and Writer against gold standard videos, computes deterministic
analysis, caches results. Called from API endpoints.
"""

import json
import re
from collections import Counter
from datetime import datetime
from pathlib import Path
from typing import Optional

# Resolve paths
REPO_ROOT = Path(__file__).parent.parent.parent.parent
GOLD_SETS_DIR = REPO_ROOT / "data" / "gold_sets"

# Filler phrases to detect in writer output
FILLER_PHRASES = [
    "let's explore",
    "let's dive",
    "stay tuned",
    "stay curious",
    "thanks for watching",
    "in this video",
    "welcome back",
    "as we wrap up",
    "without further ado",
    "buckle up",
    "are you ready",
    "let's get started",
    "let's break down",
    "unlock the secrets",
    "in today's video",
]


def get_current_prompt_versions() -> dict:
    """Return current prompt filenames used by Director and Writer."""
    from app.services.agents.storyboard_director import StoryboardDirector
    from app.services.agents.storyboard_writer import StoryboardWriter
    return {
        "director": StoryboardDirector.prompt_file,
        "writer": StoryboardWriter.prompt_file,
    }


class _MockState:
    """Minimal state object that agents expect."""
    def __init__(self, story_brief=None, screen_outline=None,
                 evidence_research=None, project_id=None):
        self.story_brief = story_brief
        self.screen_outline = screen_outline
        self.evidence_research = evidence_research
        self.project_id = project_id


# ---------------------------------------------------------------------------
# Data loading / conversion
# ---------------------------------------------------------------------------

def list_gold_sets() -> list[str]:
    """Return names of available gold sets."""
    if not GOLD_SETS_DIR.exists():
        return []
    return [
        d.name for d in GOLD_SETS_DIR.iterdir()
        if d.is_dir() and (d / "gold_standard.json").exists()
    ]


def load_gold_set(name: str) -> dict:
    gold_path = GOLD_SETS_DIR / name / "gold_standard.json"
    if not gold_path.exists():
        raise FileNotFoundError(f"Gold set not found: {gold_path}")
    return json.loads(gold_path.read_text())


def brief_to_story_brief(brief: dict) -> dict:
    """Convert gold set brief format to agent-expected format."""
    return {
        "viewer_outcome": brief["viewer_outcome"],
        "target_audience": brief["target_audience"],
        "audience_level": brief["audience_level"],
        "duration": str(brief["total_duration_sec"]),
        "platform": brief["platform"],
        "delivery_tone": brief["delivery_tone"],
        "on_camera_presence": brief["on_camera_presence"],
        "broll_type": brief["broll_type"],
        "core_talking_points": brief["core_talking_points"],
        "selected_angle": brief["selected_angle"],
        "misconceptions": brief["misconceptions"],
        "must_avoid": brief["must_avoid"],
    }


def gold_outline_to_director_text(outline: list) -> str:
    """Convert gold outline JSON to Director-style plain text."""
    lines = []
    for section in outline:
        n = section["section_number"]
        title = section["section_title"]
        lines.append(f"Section {n} — {title}")
        lines.append("")
        lines.append("Purpose")
        lines.append(section["purpose"])
        lines.append("")
        lines.append("Entry assumption")
        lines.append(section["entry_assumption"])
        lines.append("")
        lines.append("Exit state")
        lines.append(section["exit_state"])
        lines.append("")
        lines.append("Misconception to preempt")
        lines.append(section["misconception_to_preempt"] or "None")
        lines.append("")
        lines.append("Duration")
        lines.append(f"{section['duration_sec']} seconds")
        lines.append("")
        lines.append("Talking points")
        for tp in section["talking_points"]:
            lines.append(f"- {tp}")
        lines.append("")
        lines.append("Evidence needed")
        evidence = section.get("evidence_used") or []
        if evidence:
            for ev in evidence:
                lines.append(f"- {ev}")
        else:
            lines.append("- None")
        lines.append("")
        lines.append("Visual intent")
        for vi in section["visual_intent"]:
            lines.append(f"- {vi}")
        lines.append("")
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

def _run_director(story_brief: dict) -> str:
    from app.services.agents.storyboard_director import StoryboardDirector
    director = StoryboardDirector()
    state = _MockState(story_brief=story_brief, project_id="gold_eval")
    return director.run(state)


def _run_writer(outline_text: str, story_brief: dict) -> list:
    from app.services.agents.storyboard_writer import StoryboardWriter
    writer = StoryboardWriter()
    state = _MockState(
        story_brief=story_brief,
        screen_outline=outline_text,
        evidence_research={},
        project_id="gold_eval",
    )
    return writer.run(state)


# ---------------------------------------------------------------------------
# Deterministic analysis
# ---------------------------------------------------------------------------

def _count_words(text: str) -> int:
    return len(text.split()) if text else 0


def _screen_type_dist(screens: list) -> dict:
    return dict(Counter(s.get("screen_type", "unknown") for s in screens))


def _find_filler(screens: list) -> list[str]:
    found = []
    for s in screens:
        vo = (s.get("voiceover_text") or "").lower()
        for phrase in FILLER_PHRASES:
            if phrase in vo:
                found.append(f"Screen {s.get('screen_number', '?')}: \"{phrase}\"")
    return found


def _extract_section_field(block: str, field_name: str) -> str:
    """Extract a single-line field value from a Director section block."""
    # Known field headers in order they appear in Director output
    all_fields = [
        "Purpose", "Entry assumption", "Exit state",
        "Misconception to preempt", "Misconception",
        "Duration", "Approx. duration",
        "Talking points", "Evidence needed", "Evidence",
        "Visual intent", "Visual", "Research queries",
    ]
    # Find all field positions in the block
    positions = []
    for f in all_fields:
        pattern = rf"^(?:\*\*)?{re.escape(f)}(?:\*\*)?\s*$"
        m = re.search(pattern, block, re.MULTILINE | re.IGNORECASE)
        if m:
            positions.append((m.start(), m.end(), f))
    positions.sort(key=lambda x: x[0])

    for idx, (start, end, name) in enumerate(positions):
        if name.lower() == field_name.lower():
            content_start = end
            content_end = positions[idx + 1][0] if idx < len(positions) - 1 else len(block)
            return block[content_start:content_end].strip()
    return ""


def _extract_section_bullets(block: str, field_name: str) -> list[str]:
    """Extract bullet list from a Director section block."""
    content = _extract_section_field(block, field_name)
    if not content:
        return []
    return [
        line.lstrip("- *").strip()
        for line in content.split("\n")
        if line.strip().startswith("-") or line.strip().startswith("*")
    ]


def _parse_ai_sections(director_text: str) -> list[dict]:
    """Parse AI Director output into full section dicts for comparison."""
    pattern = r"^Section\s+(\d+)\s*[—–\-]\s*(.+)$"
    headers = [
        (m.start(), int(m.group(1)), m.group(2).strip())
        for m in re.finditer(pattern, director_text, re.MULTILINE)
    ]
    sections = []
    for i, (start, num, title) in enumerate(headers):
        end = headers[i + 1][0] if i < len(headers) - 1 else len(director_text)
        block = director_text[start:end]

        sections.append({
            "section_number": num,
            "title": title,
            "purpose": _extract_section_field(block, "Purpose"),
            "entry_assumption": _extract_section_field(block, "Entry assumption"),
            "exit_state": _extract_section_field(block, "Exit state"),
            "misconception_to_preempt": _extract_section_field(block, "Misconception to preempt") or _extract_section_field(block, "Misconception"),
            "duration_str": _extract_section_field(block, "Duration") or _extract_section_field(block, "Approx. duration"),
            "talking_points": _extract_section_bullets(block, "Talking points"),
            "evidence_needed": _extract_section_bullets(block, "Evidence needed") or _extract_section_bullets(block, "Evidence"),
            "visual_intent": _extract_section_bullets(block, "Visual intent") or _extract_section_bullets(block, "Visual"),
        })
    return sections


def _estimate_ai_duration_range(sections: list[dict]) -> str:
    """Estimate total duration from AI section duration strings."""
    total_min = 0
    total_max = 0
    for s in sections:
        dur = s.get("duration_str", "")
        # Parse "1:30–2:00" or "2:30–3:00" or "90–120"
        parts = re.split(r"[—–\-]", dur)
        for j, part in enumerate(parts):
            part = part.strip()
            if ":" in part:
                pieces = part.split(":")
                try:
                    secs = int(pieces[0]) * 60 + int(pieces[1])
                except ValueError:
                    secs = 120
            elif "min" in part.lower():
                try:
                    secs = int(float(re.sub(r"[^\d.]", "", part)) * 60)
                except ValueError:
                    secs = 120
            else:
                try:
                    secs = int(float(part))
                except ValueError:
                    secs = 120
            if j == 0:
                total_min += secs
            else:
                total_max += secs
    if total_max == 0:
        total_max = total_min
    return f"{total_min // 60}:{total_min % 60:02d}–{total_max // 60}:{total_max % 60:02d}"


def compute_analysis(gold: dict, director_output: str,
                     writer_b: list, writer_a: list) -> dict:
    """Compute deterministic analysis comparing AI output to gold standard."""
    gold_outline = gold["outline"]
    gold_storyboard = gold["storyboard"]

    # Parse AI Director sections
    ai_sections = _parse_ai_sections(director_output)
    ai_duration_estimate = _estimate_ai_duration_range(ai_sections)

    # Gold stats
    gold_total_sec = sum(s["duration_sec"] for s in gold_outline)
    gold_screen_words = [_count_words(s.get("voiceover_text", "")) for s in gold_storyboard]
    gold_total_words = sum(gold_screen_words)
    gold_avg_words = gold_total_words // len(gold_storyboard) if gold_storyboard else 0

    # Writer Path B stats
    b_screen_words = [_count_words(s.get("voiceover_text", "")) for s in writer_b]
    b_total_words = sum(b_screen_words)
    b_avg_words = b_total_words // len(writer_b) if writer_b else 0
    b_total_duration = sum(s.get("duration", 0) for s in writer_b)

    # Writer Path A stats
    a_screen_words = [_count_words(s.get("voiceover_text", "")) for s in writer_a]
    a_total_words = sum(a_screen_words)
    a_avg_words = a_total_words // len(writer_a) if writer_a else 0
    a_total_duration = sum(s.get("duration", 0) for s in writer_a)

    # Build summary bullets
    summary = []

    # Director issues
    sec_diff = len(ai_sections) - len(gold_outline)
    if sec_diff != 0:
        summary.append(f"Director: {len(ai_sections)} sections vs {len(gold_outline)} gold ({'+' if sec_diff > 0 else ''}{sec_diff})")
    summary.append(f"Director: estimated duration {ai_duration_estimate} vs {gold_total_sec}s gold")

    # Check if first section looks like a narrative hook
    if ai_sections:
        first_title = ai_sections[0].get("title", "").lower()
        generic_openers = ["introduction", "overview", "illusion", "setting the stage", "opening"]
        is_generic = any(g in first_title for g in generic_openers)
        if is_generic:
            summary.append(f"Director: generic opener \"{ai_sections[0]['title']}\" — no narrative hook")

    # Writer Path B issues
    if writer_b:
        summary.append(f"Writer (Path B): {len(writer_b)} screens vs {len(gold_storyboard)} gold")
        summary.append(f"Writer (Path B): avg {b_avg_words} words/screen vs {gold_avg_words} gold")
        filler_b = _find_filler(writer_b)
        if filler_b:
            summary.append(f"Writer (Path B): {len(filler_b)} filler phrases found")

    # Writer Path A issues
    if writer_a:
        summary.append(f"Writer (Path A): {len(writer_a)} screens vs {len(gold_storyboard)} gold")
        summary.append(f"Writer (Path A): avg {a_avg_words} words/screen vs {gold_avg_words} gold")
        filler_a = _find_filler(writer_a)
        if filler_a:
            summary.append(f"Writer (Path A): {len(filler_a)} filler phrases found")

    return {
        "director": {
            "section_count": {"gold": len(gold_outline), "ai": len(ai_sections)},
            "ai_sections": ai_sections,
            "ai_duration_estimate": ai_duration_estimate,
            "gold_duration_sec": gold_total_sec,
        },
        "writer_path_b": {
            "screen_count": {"gold": len(gold_storyboard), "ai": len(writer_b)},
            "total_words": {"gold": gold_total_words, "ai": b_total_words},
            "avg_words_per_screen": {"gold": gold_avg_words, "ai": b_avg_words},
            "screen_types": {"gold": _screen_type_dist(gold_storyboard), "ai": _screen_type_dist(writer_b)},
            "filler_phrases": _find_filler(writer_b),
            "ai_total_duration_sec": round(b_total_duration, 1),
        },
        "writer_path_a": {
            "screen_count": {"gold": len(gold_storyboard), "ai": len(writer_a)},
            "total_words": {"gold": gold_total_words, "ai": a_total_words},
            "avg_words_per_screen": {"gold": gold_avg_words, "ai": a_avg_words},
            "screen_types": {"gold": _screen_type_dist(gold_storyboard), "ai": _screen_type_dist(writer_a)},
            "filler_phrases": _find_filler(writer_a),
            "ai_total_duration_sec": round(a_total_duration, 1),
        },
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _cache_path(name: str) -> Path:
    return GOLD_SETS_DIR / name / "cached_eval.json"


def get_cached_eval(name: str) -> Optional[dict]:
    path = _cache_path(name)
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_cache(name: str, result: dict):
    path = _cache_path(name)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_eval(name: str, force: bool = False) -> dict:
    """Run full gold set evaluation: Director + Writer (both paths).

    If force=False, returns cached result if cache exists and prompt
    versions match current prompts. Otherwise re-runs.
    """
    prompt_versions = get_current_prompt_versions()

    # Check cache validity
    if not force:
        cached = get_cached_eval(name)
        if cached and cached.get("prompt_versions") == prompt_versions:
            return cached

    gold = load_gold_set(name)
    story_brief = brief_to_story_brief(gold["brief"])
    gold_outline_text = gold_outline_to_director_text(gold["outline"])

    # Path A: Brief → Director
    director_output = _run_director(story_brief)

    # Path B: Gold outline → Writer
    writer_output_b = _run_writer(gold_outline_text, story_brief)

    # Path A+: AI outline → Writer
    writer_output_a = _run_writer(director_output, story_brief)

    # Analysis
    analysis = compute_analysis(gold, director_output, writer_output_b, writer_output_a)

    result = {
        "gold_set_name": name,
        "timestamp": datetime.now().isoformat(),
        "prompt_versions": prompt_versions,
        "gold": gold,
        "director_output": director_output,
        "writer_output_path_b": writer_output_b,
        "writer_output_path_a": writer_output_a,
        "analysis": analysis,
    }

    _save_cache(name, result)
    return result
