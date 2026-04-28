"""
Dump all 10 test case data for visualization.
Runs each scenario and captures state at every pipeline stage.
"""
import asyncio
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from app.services.orchestrator import StoryboardOrchestrator
from app.services.agents.storyboard_writer import StoryboardWriter
from app.services.agents.duration_calculator import DurationCalculator
from app.services.state import StateManager
from app.infra.quality_log import QualityLog
from app.test.conftest import MockBriefBuilder, MockQualityGate
from app.test.test_duration_matrix import (
    words_for_duration, make_outline, make_screens, make_brief,
    _make_n_screens, FixedDirector, _CALC, query_qlog,
)


def _build_orch(outline_text, screen_responses, tmp_dir):
    writer = StoryboardWriter()
    call_counter = {"i": 0}
    original_call = writer._call_storyboard_llm

    def fake_call(prompt, project_id=None):
        idx = call_counter["i"]
        call_counter["i"] += 1
        if idx < len(screen_responses):
            return list(screen_responses[idx])
        return list(screen_responses[-1])

    writer._call_storyboard_llm = fake_call

    orch = StoryboardOrchestrator()
    orch.agents = {
        "brief_builder": MockBriefBuilder(),
        "director": FixedDirector(outline_text),
        "writer": writer,
    }
    qg = MockQualityGate()
    qg.model = "gpt-4o-test"
    orch.quality_gate = qg
    return orch, call_counter


async def run_ks_to_gate2(orch, project_id, duration_seconds):
    await orch.process_event(project_id, "submit_knowledge_share", {
        "intake_form": {
            "topic": "Test Topic", "video_type": "knowledge_sharing",
            "target_audience": "Engineers", "duration_minutes": duration_seconds / 60,
        }
    })
    r = await orch.process_event(project_id, "chat_brief_approve", {
        "all_fields": {
            "topic": {"value": "Test Topic", "source": "extracted", "confirmed": True},
            "viewer_outcome": {"value": "Understand concept", "source": "extracted", "confirmed": True},
            "target_audience": {"value": "Engineers", "source": "extracted", "confirmed": True},
            "duration": {"value": str(duration_seconds), "source": "extracted", "confirmed": True},
            "audience_level": {"value": "intermediate", "source": "extracted", "confirmed": True},
            "platform": {"value": "youtube", "source": "extracted", "confirmed": True},
            "on_camera_presence": {"value": "yes", "source": "extracted", "confirmed": True},
            "broll_type": {"value": ["slides", "talking_head"], "source": "extracted", "confirmed": True},
            "delivery_tone": {"value": "educational", "source": "extracted", "confirmed": True},
            "point_of_view": {"value": "Practical perspective", "source": "extracted", "confirmed": True},
            "core_talking_points": {"value": ["Point A", "Point B", "Point C"], "source": "generated", "confirmed": True},
        }
    })
    return await orch.process_event(project_id, "approve", {}) if r.get("success") else r


SCENARIOS = []


def register(name, target, outline_sections, screen_section_specs, description,
             screen_responses_override=None, expect_error=False):
    SCENARIOS.append({
        "name": name, "target": target,
        "outline_sections": outline_sections,
        "screen_section_specs": screen_section_specs,
        "description": description,
        "screen_responses_override": screen_responses_override,
        "expect_error": expect_error,
    })


# Test 1
register("short_60s", 60,
    [{"number": 1, "title": "Hook and Context", "duration_range": "0:10\u20130:15",
      "talking_points": ["Set the stage for the concept"]},
     {"number": 2, "title": "Core Idea and Takeaway", "duration_range": "0:40\u20130:50",
      "talking_points": ["Explain the main idea", "Action step"]}],
    [(1, 2, 7.5), (2, 6, 7.5)],
    "Short video, 2 sections, ~8 screens")

# Test 2
register("standard_120s", 120,
    [{"number": 1, "title": "Introduction", "duration_range": "0:25\u20130:35",
      "talking_points": ["Why this matters"]},
     {"number": 2, "title": "Deep Dive", "duration_range": "0:50\u20131:00",
      "talking_points": ["Core concept explained", "Example walkthrough"]},
     {"number": 3, "title": "Wrap Up", "duration_range": "0:30\u20130:40",
      "talking_points": ["Key takeaway", "Next steps"]}],
    [(1, 4, 8.0), (2, 6, 9.0), (3, 4, 8.5)],
    "Standard 2-min video, 3 sections")

# Test 3
register("medium_180s", 180,
    [{"number": 1, "title": "The Problem", "duration_range": "25\u201335",
      "talking_points": ["Problem statement"]},
     {"number": 2, "title": "The Approach", "duration_range": "45\u201355",
      "talking_points": ["Methodology", "Tools"]},
     {"number": 3, "title": "Results", "duration_range": "50\u201360",
      "talking_points": ["Findings", "Data"]},
     {"number": 4, "title": "Next Steps", "duration_range": "40\u201350",
      "talking_points": ["Action items"]}],
    [(1, 4, 7.5), (2, 6, 8.5), (3, 6, 9.0), (4, 5, 9.0)],
    "Medium 3-min, 4 sections, seconds format")

# Test 4
register("long_300s", 300,
    [{"number": 1, "title": "Context Setting", "duration_range": "0:30\u20130:40",
      "talking_points": ["Background"]},
     {"number": 2, "title": "First Pillar", "duration_range": "0:55\u20131:05",
      "talking_points": ["Pillar one explained"]},
     {"number": 3, "title": "Second Pillar", "duration_range": "1:10\u20131:20",
      "talking_points": ["Pillar two explained"]},
     {"number": 4, "title": "Third Pillar", "duration_range": "0:55\u20131:05",
      "talking_points": ["Pillar three explained"]},
     {"number": 5, "title": "Synthesis", "duration_range": "0:50\u20131:00",
      "talking_points": ["Bringing it together"]}],
    [(1, 4, 8.5), (2, 7, 8.5), (3, 9, 8.5), (4, 7, 8.5), (5, 8, 9.0)],
    "Long 5-min, 5 sections, mm:ss format")

# Test 5
register("very_long_600s", 600,
    [{"number": i, "title": f"Topic {i}", "duration_range": f"{lo}\u2013{hi}",
      "talking_points": [f"Concept {i}"]}
     for i, (lo, hi) in enumerate([
         ("0:40","0:55"),("1:10","1:25"),("1:20","1:35"),
         ("1:30","1:45"),("1:10","1:25"),("1:20","1:35"),("1:40","1:55")], 1)],
    [(1,6,8.5),(2,9,9.0),(3,10,9.0),(4,11,9.0),(5,9,9.0),(6,10,9.0),(7,12,9.0)],
    "Very long 10-min, 7 sections")

# Test 6 - overlong voiceover
register("overlong_split", 60,
    [{"number": 1, "title": "Hook", "duration_range": "0:10\u20130:15",
      "talking_points": ["Set the stage"]},
     {"number": 2, "title": "Main Content", "duration_range": "0:40\u20130:50",
      "talking_points": ["Core idea"]}],
    None,  # custom screens
    "Overlong voiceover triggers split_voiceover",
    screen_responses_override="overlong")

# Test 7 - retry succeeds
register("retry_succeeds", 60,
    [{"number": 1, "title": "Hook", "duration_range": "0:10\u20130:15",
      "talking_points": ["Set the stage"]},
     {"number": 2, "title": "Main", "duration_range": "0:40\u20130:50",
      "talking_points": ["Core idea"]}],
    None,
    "Duration drift, retry succeeds on 2nd attempt",
    screen_responses_override="retry_ok")

# Test 8 - retry fails
register("retry_fails", 60,
    [{"number": 1, "title": "Hook", "duration_range": "0:10\u20130:15",
      "talking_points": ["Set the stage"]},
     {"number": 2, "title": "Main", "duration_range": "0:40\u20130:50",
      "talking_points": ["Core idea"]}],
    None,
    "Duration drift, both attempts fail",
    screen_responses_override="retry_fail",
    expect_error=True)

# Test 9 - missing duration
register("missing_duration", 60,
    None,  # custom outline
    [(1, 4, 8.0)],
    "Missing Duration field fails fast",
    expect_error=True)

# Test 10 - mixed formats
register("mixed_formats", 300,
    [{"number": 1, "title": "Part A", "duration_range": "1:30\u20132:00",
      "talking_points": ["Concept A"]},
     {"number": 2, "title": "Part B", "duration_range": "1.5\u20132 min",
      "talking_points": ["Concept B"]},
     {"number": 3, "title": "Part C", "duration_range": "90\u2013120",
      "talking_points": ["Concept C"]}],
    [(1, 12, 8.5), (2, 12, 8.5), (3, 11, 8.5)],
    "Mixed duration formats (mm:ss, minutes, seconds)")


async def run_all():
    results = []
    tmp = Path(tempfile.mkdtemp())
    test_qlog = QualityLog(db_path=tmp / "qlog.db")

    for idx, sc in enumerate(SCENARIOS):
        pid = f"test-{idx+1}-{sc['name']}"
        entry = {
            "id": idx + 1,
            "name": sc["name"],
            "target_seconds": sc["target"],
            "description": sc["description"],
            "expect_error": sc["expect_error"],
        }

        # Build outline
        if sc["outline_sections"] is None:
            outline_text = (
                "Section 1 \u2014 Introduction\n\n"
                "Purpose\nTeach the concept.\n\n"
                "Entry assumption\nViewer knows basics.\n\n"
                "Exit state\nViewer understands.\n\n"
                "Talking points\n- Key concept\n"
            )
            entry["outline_sections"] = [{"title": "Introduction", "duration_range": "(MISSING)", "talking_points": ["Key concept"]}]
        else:
            outline_text = make_outline(sc["outline_sections"])
            entry["outline_sections"] = [
                {"title": s["title"], "duration_range": s["duration_range"],
                 "talking_points": s.get("talking_points", [])}
                for s in sc["outline_sections"]
            ]

        # Build screens
        if sc["screen_responses_override"] == "overlong":
            overlong_vo = " ".join(f"word{i}" for i in range(60))
            raw_screens = [
                {"screen_number": 1, "section_number": 1, "section_title": "Hook",
                 "screen_type": "slides", "voiceover_text": words_for_duration(7.5, "slides"),
                 "visual_direction": ["V1","V2"], "action_notes": "Hook."},
                {"screen_number": 2, "section_number": 2, "section_title": "Main Content",
                 "screen_type": "slides", "voiceover_text": overlong_vo,
                 "visual_direction": ["V1","V2"], "action_notes": "Core."},
                {"screen_number": 3, "section_number": 2, "section_title": "Main Content",
                 "screen_type": "talking_head", "voiceover_text": words_for_duration(7.5, "talking_head"),
                 "visual_direction": ["V1","V2"], "action_notes": "Wrap."},
            ]
            screen_responses = [raw_screens]
            entry["input_screens"] = [
                {"screen_number": s["screen_number"], "screen_type": s["screen_type"],
                 "word_count": len(s["voiceover_text"].split()),
                 "voiceover_preview": s["voiceover_text"][:60] + "..."}
                for s in raw_screens
            ]
        elif sc["screen_responses_override"] == "retry_ok":
            a1 = _make_n_screens([(1, 2, 10.0), (2, 6, 10.0)])
            a2 = _make_n_screens([(1, 2, 7.5), (2, 6, 8.0)])
            screen_responses = [a1, a2]
            entry["input_screens"] = [
                {"attempt": 1, "count": len(a1), "total_dur": sum(_CALC.calculate(s["voiceover_text"], s["screen_type"])["duration"] for s in a1)},
                {"attempt": 2, "count": len(a2), "total_dur": sum(_CALC.calculate(s["voiceover_text"], s["screen_type"])["duration"] for s in a2)},
            ]
        elif sc["screen_responses_override"] == "retry_fail":
            a1 = _make_n_screens([(1, 3, 10.0), (2, 6, 9.5)])
            a2 = _make_n_screens([(1, 2, 10.0), (2, 6, 10.0)])
            screen_responses = [a1, a2]
            entry["input_screens"] = [
                {"attempt": 1, "count": len(a1), "total_dur": sum(_CALC.calculate(s["voiceover_text"], s["screen_type"])["duration"] for s in a1)},
                {"attempt": 2, "count": len(a2), "total_dur": sum(_CALC.calculate(s["voiceover_text"], s["screen_type"])["duration"] for s in a2)},
            ]
        elif sc["screen_section_specs"]:
            screens = _make_n_screens(sc["screen_section_specs"])
            screen_responses = [screens]
            entry["input_screens"] = [
                {"screen_number": s["screen_number"], "section_number": s["section_number"],
                 "screen_type": s["screen_type"],
                 "word_count": len(s["voiceover_text"].split()),
                 "computed_duration": _CALC.calculate(s["voiceover_text"], s["screen_type"])["duration"]}
                for s in screens
            ]
        else:
            screens = _make_n_screens([(1, 4, 8.0)])
            screen_responses = [screens]
            entry["input_screens"] = []

        # Patch StateManager to use tmp dir
        orig_init = StateManager.__init__
        def patched_init(self, project_id, data_dir=None, _tmp=tmp):
            orig_init(self, project_id, data_dir=_tmp)
        StateManager.__init__ = patched_init

        # Patch qlog
        import app.infra.quality_log as ql_mod
        old_qlog = ql_mod.qlog
        ql_mod.qlog = test_qlog

        try:
            orch, counter = _build_orch(outline_text, screen_responses, tmp)
            gate2_result = await run_ks_to_gate2(orch, pid, sc["target"])

            entry["gate2_phase"] = gate2_result.get("phase")
            entry["outline_text"] = gate2_result.get("screen_outline", "")[:500]
            entry["outline_eval"] = gate2_result.get("outline_eval")

            # Now approve at gate2 to run writer
            r = await orch.process_event(pid, "approve", {})
            entry["final_phase"] = r.get("phase")
            entry["success"] = r.get("success", False)
            entry["error"] = r.get("error")
            entry["llm_calls"] = counter["i"]

            if r.get("storyboard"):
                sb = r["storyboard"]
                entry["storyboard_screen_count"] = len(sb)
                entry["storyboard_total_duration"] = round(sum(s.get("duration", 0) for s in sb), 1)
                entry["storyboard_screens"] = [
                    {"screen_number": s["screen_number"],
                     "section_number": s.get("section_number"),
                     "screen_type": s.get("screen_type"),
                     "duration": s.get("duration"),
                     "word_count": len(s.get("voiceover_text", "").split()),
                     "has_auto_split": "Auto-split" in s.get("action_notes", "")}
                    for s in sb
                ]
                entry["duration_deviation"] = round(
                    abs(entry["storyboard_total_duration"] - sc["target"]) / sc["target"] * 100, 1)
            else:
                entry["storyboard_screens"] = []

            # Quality log
            logs = query_qlog(test_qlog._db_path, pid)
            entry["quality_log"] = [
                {"id": l["id"], "event": l["event"], "stage": l["stage"],
                 "scope": l["scope"], "attempt": l["attempt"],
                 "model": l["model"], "prompt_ref": l["prompt_ref"]}
                for l in logs
            ]

        except Exception as e:
            entry["success"] = False
            entry["error"] = str(e)
            entry["final_phase"] = "error"

        finally:
            StateManager.__init__ = orig_init
            ql_mod.qlog = old_qlog

        results.append(entry)

    return results


if __name__ == "__main__":
    results = asyncio.run(run_all())
    print(json.dumps(results, indent=2, ensure_ascii=False))
