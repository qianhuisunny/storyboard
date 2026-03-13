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
        lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Agent runners
# ---------------------------------------------------------------------------

def _run_director(story_brief: dict, model: str = None) -> str:
    from app.services.agents.storyboard_director import StoryboardDirector
    director = StoryboardDirector()
    if model:
        director.default_model = model
    state = _MockState(story_brief=story_brief, project_id="gold_eval")
    return director.run(state)


def _run_writer(outline_text: str, story_brief: dict, model: str = None) -> list:
    from app.services.agents.storyboard_writer import StoryboardWriter
    writer = StoryboardWriter()
    if model:
        writer.default_model = model
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


def _parse_ai_sections(director_text: str) -> list[dict]:
    """Parse AI Director plain text output into section dicts for comparison."""
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
            "purpose": _extract_text_field(block, "Purpose"),
            "entry_assumption": _extract_text_field(block, "Entry assumption"),
            "exit_state": _extract_text_field(block, "Exit state"),
            "duration_str": _extract_text_field(block, "Duration") or _extract_text_field(block, "Approx. duration"),
            "talking_points": _extract_text_bullets(block, "Talking points"),
            "evidence_needed": _extract_text_bullets(block, "Evidence needed") or _extract_text_bullets(block, "Evidence"),
        })
    return sections


def _extract_text_field(block: str, field_name: str) -> str:
    """Extract a single-line field value from a plain text section block."""
    all_fields = [
        "Purpose", "Entry assumption", "Exit state",
        "Duration", "Approx. duration",
        "Talking points", "Evidence needed", "Evidence",
        "Research queries",
    ]
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


def _extract_text_bullets(block: str, field_name: str) -> list[str]:
    """Extract bullet list from a plain text section block."""
    content = _extract_text_field(block, field_name)
    if not content:
        return []
    return [
        line.lstrip("- *").strip()
        for line in content.split("\n")
        if line.strip().startswith("-") or line.strip().startswith("*")
    ]


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
# Ingestion
# ---------------------------------------------------------------------------

_SPONSOR_KEYWORDS = ["sponsor", "pitch", "ad ", "cta", "call to action", "advertisement"]


def _strip_sponsor_sections(outline: list, storyboard: list) -> tuple[list, list]:
    """Remove sponsor/CTA sections and their screens, renumber sequentially."""
    kept_section_nums = set()
    new_outline = []
    for s in outline:
        purpose_lower = s.get("purpose", "").lower()
        if any(kw in purpose_lower for kw in _SPONSOR_KEYWORDS):
            continue
        kept_section_nums.add(s["section_number"])
        new_outline.append(s)

    # Renumber sections
    for i, s in enumerate(new_outline, 1):
        s["section_number"] = i

    # Filter and renumber screens
    new_sb = [s for s in storyboard if s.get("section_number") in kept_section_nums]
    # Remap section numbers
    old_to_new = {}
    for i, orig_num in enumerate(sorted(kept_section_nums), 1):
        old_to_new[orig_num] = i
    for s in new_sb:
        s["section_number"] = old_to_new[s["section_number"]]
    for i, s in enumerate(new_sb, 1):
        s["screen_number"] = i

    return new_outline, new_sb


def _slugify(title: str) -> str:
    """Convert video title to directory-safe slug."""
    slug = title.lower().strip()
    slug = re.sub(r"[-]+", " ", slug)    # dashes to spaces (before stripping)
    slug = re.sub(r"[^\w\s]", "", slug)  # remove non-alphanumeric
    slug = re.sub(r"\s+", "_", slug)     # spaces to underscores
    slug = re.sub(r"_+", "_", slug)      # collapse multiple underscores
    return slug.strip("_")


def auto_compute_meta(outline: list, total_duration_sec: int) -> dict:
    """Auto-compute meta fields from outline data."""
    # Duration bucket
    if total_duration_sec < 600:
        bucket = "short"
    elif total_duration_sec < 1200:
        bucket = "medium"
    else:
        bucket = "long"

    # Narrative opening — keyword heuristic on Section 1
    opening = "direct_framework"
    if outline:
        s1 = outline[0]
        text = (s1.get("section_title", "") + " " + s1.get("purpose", "")).lower()
        story_keywords = ["story", "anecdote", "tale", "narrative", "parable", "once upon"]
        problem_keywords = ["problem", "challenge", "mistake", "struggle", "failing", "wrong"]
        if any(kw in text for kw in story_keywords):
            opening = "story_hook"
        elif any(kw in text for kw in problem_keywords):
            opening = "problem_statement"

    return {
        "duration_bucket": bucket,
        "structure": "linear",
        "narrative_opening": opening,
    }


def ingest_gold_set(raw_json: dict) -> dict:
    """Process raw Gemini JSON into a gold standard file."""
    brief = raw_json["brief"]
    outline = raw_json["outline"]
    storyboard = raw_json["storyboard"]

    outline, storyboard = _strip_sponsor_sections(outline, storyboard)
    total_duration = sum(s.get("duration_sec", 0) for s in outline)
    brief["total_duration_sec"] = total_duration
    meta = auto_compute_meta(outline, total_duration)

    gold_set = {
        "meta": meta,
        "brief": brief,
        "outline": outline,
        "storyboard": storyboard,
    }

    title = brief.get("video_title", "untitled")
    slug = _slugify(title)
    save_dir = GOLD_SETS_DIR / slug
    save_dir.mkdir(parents=True, exist_ok=True)
    save_path = save_dir / "gold_standard.json"
    save_path.write_text(json.dumps(gold_set, indent=2, ensure_ascii=False))

    return {"slug": slug, "gold_set": gold_set}


# ---------------------------------------------------------------------------
# Cache
# ---------------------------------------------------------------------------

def _cache_path(name: str, model: str = "gpt-4o") -> Path:
    safe_model = model.replace("/", "_")
    return GOLD_SETS_DIR / name / f"cached_eval_{safe_model}.json"


def _migrate_legacy_cache(name: str):
    """One-time migration: rename cached_eval.json → cached_eval_gpt-4o.json."""
    legacy = GOLD_SETS_DIR / name / "cached_eval.json"
    if not legacy.exists():
        return
    target = _cache_path(name, "gpt-4o")
    if not target.exists():
        legacy.rename(target)
    else:
        legacy.unlink()


def get_cached_eval(name: str, model: str = "gpt-4o") -> Optional[dict]:
    _migrate_legacy_cache(name)
    path = _cache_path(name, model)
    if path.exists():
        return json.loads(path.read_text())
    return None


def _save_cache(name: str, result: dict):
    model = result.get("model_used", "gpt-4o")
    path = _cache_path(name, model)
    path.write_text(json.dumps(result, indent=2, ensure_ascii=False))


def list_cached_models(name: str) -> list[dict]:
    """List all cached model runs for a gold set, sorted by timestamp descending."""
    _migrate_legacy_cache(name)
    gs_dir = GOLD_SETS_DIR / name
    if not gs_dir.exists():
        return []
    results = []
    for f in gs_dir.glob("cached_eval_*.json"):
        model_id = f.stem.replace("cached_eval_", "")
        try:
            data = json.loads(f.read_text())
            results.append({
                "model": model_id,
                "timestamp": data.get("timestamp"),
            })
        except (json.JSONDecodeError, OSError):
            continue
    return sorted(results, key=lambda x: x["timestamp"] or "", reverse=True)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_eval(name: str, force: bool = False, model: str = None) -> dict:
    """Run full gold set evaluation: Director + Writer (both paths).

    If force=False, returns cached result if cache exists and prompt
    versions match current prompts. Otherwise re-runs.

    Path B (gold outline → Writer) runs in parallel with Director,
    then Path A (AI outline → Writer) runs after Director completes.
    """
    from concurrent.futures import ThreadPoolExecutor

    prompt_versions = get_current_prompt_versions()

    # Check cache validity (skip if model differs from cached)
    effective_model = model or "gpt-4o"
    if not force:
        cached = get_cached_eval(name, effective_model)
        if cached and cached.get("prompt_versions") == prompt_versions:
            return cached

    gold = load_gold_set(name)
    story_brief = brief_to_story_brief(gold["brief"])
    gold_outline_text = gold_outline_to_director_text(gold["outline"])

    # Run Director and Path B (gold outline → Writer) in parallel
    with ThreadPoolExecutor(max_workers=2) as pool:
        director_future = pool.submit(_run_director, story_brief, model)
        writer_b_future = pool.submit(_run_writer, gold_outline_text, story_brief, model)

        director_output = director_future.result()
        writer_output_b = writer_b_future.result()

    # Path A: AI outline → Writer (must wait for Director output)
    writer_output_a = _run_writer(director_output, story_brief, model=model)

    # Analysis
    analysis = compute_analysis(gold, director_output, writer_output_b, writer_output_a)

    result = {
        "gold_set_name": name,
        "timestamp": datetime.now().isoformat(),
        "prompt_versions": prompt_versions,
        "model_used": model or "gpt-4o",
        "gold": gold,
        "director_output": director_output,
        "writer_output_path_b": writer_output_b,
        "writer_output_path_a": writer_output_a,
        "analysis": analysis,
    }

    _save_cache(name, result)
    return result
