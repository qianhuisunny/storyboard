"""
Batch evaluation: LLM-as-judge, batch runner, aggregate report.

Depends on offline_prompt_bench_gold.py for per-video eval and data loading.
"""

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.services.offline_prompt_bench_gold import (
    GOLD_SETS_DIR,
    get_current_prompt_versions,
    gold_outline_to_director_text,
    list_gold_sets,
    load_gold_set,
    run_eval,
    get_cached_eval,
    _save_cache,
)

BATCH_REPORT_PATH = GOLD_SETS_DIR / "batch_report.json"

# Resolve prompt path (same approach as BaseAgent)
_PROMPTS_DIR = Path(__file__).parent.parent.parent.parent / "prompts"


# ---------------------------------------------------------------------------
# LLM-as-Judge
# ---------------------------------------------------------------------------

def _load_judge_prompt() -> str:
    path = _PROMPTS_DIR / "archive" / "OFFLINE_BENCH_JUDGE.md"
    return path.read_text()


def _get_llm_model() -> str:
    """Read primary model from llm_config.json."""
    config_path = Path(__file__).parent.parent.parent / "config" / "llm_config.json"
    try:
        config = json.loads(config_path.read_text())
        return config["config_list"][0]["model"]
    except Exception:
        return "gpt-4o"  # fallback


def _call_judge_llm(system_prompt: str, user_prompt: str) -> dict:
    """Call LLM for judge evaluation, return parsed JSON."""
    from app.infra.llm_gateway import llm
    return llm.chat_json(
        category="eval",
        label="judge",
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        model=_get_llm_model(),
        temperature=0.1,
        max_tokens=2000,
    )


def run_llm_judge_outline(gold: dict, ai_director_output: str) -> dict:
    """Judge AI outline quality against gold standard."""
    system_prompt = _load_judge_prompt()
    gold_brief_str = json.dumps(gold["brief"], indent=2, ensure_ascii=False)
    gold_outline_str = json.dumps(gold["outline"], indent=2, ensure_ascii=False)

    user_prompt = f"""## Evaluation Mode: OUTLINE

## Gold Brief
{gold_brief_str}

## Gold Outline (reference)
{gold_outline_str}

## AI Outline (to evaluate)
{ai_director_output}

Evaluate the AI outline against the gold outline across all 5 outline quality dimensions. Return JSON."""

    try:
        return _call_judge_llm(system_prompt, user_prompt)
    except Exception as e:
        return {
            "outline_quality": {
                dim: {"tags": [], "notes": f"Judge error: {e}"}
                for dim in ["flow_coherence", "talking_point_sharpness",
                           "evidence_fitness", "brief_pov_alignment", "section_necessity"]
            }
        }


def run_llm_judge_storyboard(gold: dict, ai_storyboard: list) -> dict:
    """Judge AI storyboard quality against gold standard."""
    system_prompt = _load_judge_prompt()
    gold_brief_str = json.dumps(gold["brief"], indent=2, ensure_ascii=False)
    gold_outline_str = json.dumps(gold["outline"], indent=2, ensure_ascii=False)
    gold_sb_str = json.dumps(gold["storyboard"], indent=2, ensure_ascii=False)
    ai_sb_str = json.dumps(ai_storyboard, indent=2, ensure_ascii=False)

    user_prompt = f"""## Evaluation Mode: STORYBOARD

## Gold Brief (context)
{gold_brief_str}

## Gold Outline (context)
{gold_outline_str}

## Gold Storyboard (reference)
{gold_sb_str}

## AI Storyboard (to evaluate)
{ai_sb_str}

Evaluate the AI storyboard against the gold storyboard across all 5 storyboard quality dimensions. Return JSON."""

    try:
        return _call_judge_llm(system_prompt, user_prompt)
    except Exception as e:
        return {
            "storyboard_quality": {
                dim: {"tags": [], "notes": f"Judge error: {e}"}
                for dim in ["instructional_progression", "context_rot",
                           "specificity_retention", "source_fidelity", "redundancy"]
            }
        }


def run_llm_judge_cross_stage(gold: dict, ai_director_output: str,
                              ai_storyboard: list) -> dict:
    """Judge cross-stage handoff integrity: outline → storyboard."""
    system_prompt = _load_judge_prompt()
    gold_brief_str = json.dumps(gold["brief"], indent=2, ensure_ascii=False)
    ai_sb_str = json.dumps(ai_storyboard, indent=2, ensure_ascii=False)

    user_prompt = f"""## Evaluation Mode: CROSS-STAGE

## Gold Brief (context)
{gold_brief_str}

## AI Outline (source stage)
{ai_director_output}

## AI Storyboard (target stage — to evaluate against the outline above)
{ai_sb_str}

Evaluate whether the AI storyboard faithfully realizes the AI outline's teaching jobs, section theses, and required content. Return JSON."""

    try:
        return _call_judge_llm(system_prompt, user_prompt)
    except Exception as e:
        return {
            "cross_stage_quality": {
                "handoff_integrity": {"tags": [], "notes": f"Judge error: {e}"}
            }
        }


# ---------------------------------------------------------------------------
# Batch Runner
# ---------------------------------------------------------------------------

# In-memory batch job state
_batch_job: dict = {"status": "idle", "completed": 0, "total": 0,
                    "started_at": None, "error": None}


def get_batch_status() -> dict:
    return dict(_batch_job)


def run_batch_eval(names: Optional[list[str]] = None, force: bool = False):
    """Run eval on multiple gold sets sequentially."""
    global _batch_job

    if names is None:
        names = list_gold_sets()

    _batch_job = {
        "status": "running",
        "completed": 0,
        "total": len(names),
        "started_at": datetime.now().isoformat(),
        "error": None,
    }

    completed_names = []
    failed_names = []

    for name in names:
        try:
            run_eval(name, force=force)

            cached = get_cached_eval(name)
            if cached and "judge" not in cached:
                gold = load_gold_set(name)
                director_output = cached.get("director_output", "")
                writer_output = cached.get("writer_output_path_a", [])
                judge_outline = run_llm_judge_outline(gold, director_output)
                judge_storyboard = run_llm_judge_storyboard(gold, writer_output)
                judge_cross_stage = run_llm_judge_cross_stage(
                    gold, director_output, writer_output
                )
                cached["judge"] = {
                    **judge_outline,
                    **judge_storyboard,
                    **judge_cross_stage,
                }
                _save_cache(name, cached)

            completed_names.append(name)
        except Exception as e:
            failed_names.append({"name": name, "error": str(e)})

        _batch_job["completed"] = len(completed_names) + len(failed_names)

    try:
        report = compute_batch_report(completed_names, failed_names)
        BATCH_REPORT_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False))
    except Exception as e:
        _batch_job = {"status": "error", "completed": _batch_job["completed"],
                      "total": _batch_job["total"], "started_at": _batch_job["started_at"],
                      "error": f"Report generation failed: {e}"}
        return

    _batch_job["status"] = "done"


# ---------------------------------------------------------------------------
# Batch Report
# ---------------------------------------------------------------------------

def compute_batch_report(completed_names: list[str],
                         failed_names: list[dict]) -> dict:
    """Aggregate per-video results into a batch report."""
    prompt_versions = get_current_prompt_versions()

    outline_stats = {"section_count_gold": [], "section_count_ai": [],
                     "duration_overshoot_pct": []}
    sb_stats = {"screen_count_gold": [], "screen_count_ai": [],
                "avg_wps_gold": [], "avg_wps_ai": [],
                "duration_acc_pct": []}
    tag_freq: dict = {"outline": {}, "storyboard": {}}

    for name in completed_names:
        cached = get_cached_eval(name)
        if not cached or not cached.get("analysis"):
            continue
        analysis = cached["analysis"]

        d = analysis.get("director", {})
        sc = d.get("section_count", {})
        outline_stats["section_count_gold"].append(sc.get("gold", 0))
        outline_stats["section_count_ai"].append(sc.get("ai", 0))
        gold_dur = d.get("gold_duration_sec", 0)
        if gold_dur > 0:
            ai_est = d.get("ai_duration_estimate", "0:00-0:00")
            ai_secs = _parse_duration_midpoint(ai_est)
            overshoot = ((ai_secs - gold_dur) / gold_dur) * 100
            outline_stats["duration_overshoot_pct"].append(round(overshoot, 1))

        wb = analysis.get("writer_path_b", {})
        wsc = wb.get("screen_count", {})
        sb_stats["screen_count_gold"].append(wsc.get("gold", 0))
        sb_stats["screen_count_ai"].append(wsc.get("ai", 0))
        wps = wb.get("avg_words_per_screen", {})
        sb_stats["avg_wps_gold"].append(wps.get("gold", 0))
        sb_stats["avg_wps_ai"].append(wps.get("ai", 0))
        ai_dur = wb.get("ai_total_duration_sec", 0)
        if gold_dur > 0 and ai_dur > 0:
            dur_acc = ((ai_dur - gold_dur) / gold_dur) * 100
            sb_stats["duration_acc_pct"].append(round(dur_acc, 1))

        judge = cached.get("judge", {})
        for layer_key, layer_name in [("outline_quality", "outline"),
                                       ("storyboard_quality", "storyboard"),
                                       ("cross_stage_quality", "cross_stage")]:
            layer = judge.get(layer_key, {})
            for dim_data in layer.values():
                for tag in dim_data.get("tags", []):
                    if tag not in tag_freq[layer_name]:
                        tag_freq[layer_name][tag] = {"count": 0, "videos": []}
                    tag_freq[layer_name][tag]["count"] += 1
                    tag_freq[layer_name][tag]["videos"].append(name)

    def _avg(lst):
        return round(sum(lst) / len(lst), 1) if lst else 0

    report = {
        "timestamp": datetime.now().isoformat(),
        "prompt_versions": prompt_versions,
        "gold_sets_run": completed_names,
        "videos_completed": len(completed_names),
        "videos_failed": len(failed_names),
        "failed_details": failed_names,
        "descriptive_stats": {
            "outline": {
                "section_count": {
                    "gold_avg": _avg(outline_stats["section_count_gold"]),
                    "ai_avg": _avg(outline_stats["section_count_ai"]),
                },
                "duration_overshoot_pct": {
                    "avg": _avg(outline_stats["duration_overshoot_pct"]),
                },
            },
            "storyboard": {
                "screen_count": {
                    "gold_avg": _avg(sb_stats["screen_count_gold"]),
                    "ai_avg": _avg(sb_stats["screen_count_ai"]),
                },
                "avg_words_per_screen": {
                    "gold_avg": _avg(sb_stats["avg_wps_gold"]),
                    "ai_avg": _avg(sb_stats["avg_wps_ai"]),
                },
                "total_duration_accuracy_pct": {
                    "avg": _avg(sb_stats["duration_acc_pct"]),
                },
            },
        },
        "tag_frequency": tag_freq,
        "history": [],
    }

    if BATCH_REPORT_PATH.exists():
        try:
            old = json.loads(BATCH_REPORT_PATH.read_text())
            report["history"] = old.get("history", [])
        except Exception:
            pass

    total_outline_tags = sum(v["count"] for v in tag_freq.get("outline", {}).values())
    total_sb_tags = sum(v["count"] for v in tag_freq.get("storyboard", {}).values())
    top_tags = sorted(
        [(f"{t}:{d['count']}", d["count"])
         for layer in tag_freq.values() for t, d in layer.items()],
        key=lambda x: -x[1]
    )[:5]
    report["history"].append({
        "timestamp": report["timestamp"],
        "prompt_versions": prompt_versions,
        "top_tags": [t[0] for t in top_tags],
        "total_tag_count": {"outline": total_outline_tags, "storyboard": total_sb_tags},
    })

    return report


def _parse_duration_midpoint(duration_str: str) -> int:
    """Parse 'M:SS-M:SS' and return midpoint in seconds."""
    parts = re.split(r"[—–\-]", duration_str)
    secs = []
    for p in parts:
        p = p.strip()
        if ":" in p:
            pieces = p.split(":")
            try:
                secs.append(int(pieces[0]) * 60 + int(pieces[1]))
            except ValueError:
                pass
        else:
            try:
                secs.append(int(float(p)))
            except ValueError:
                pass
    if not secs:
        return 0
    return sum(secs) // len(secs)


def get_batch_report() -> Optional[dict]:
    """Load latest batch report if it exists."""
    if BATCH_REPORT_PATH.exists():
        return json.loads(BATCH_REPORT_PATH.read_text())
    return None
