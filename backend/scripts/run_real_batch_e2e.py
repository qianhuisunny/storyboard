#!/usr/bin/env python3
"""
Run 10 real Knowledge Share pipeline cases through the API layer.

This script exercises:
- POST /api/create-project
- POST /api/project/{id}/event
- GET /api/project/{id}/pipeline-state
- GET /api/quality-log/{project_id}

It uses the real orchestrator, agents, quality gate, SQLite persistence,
quality_log, and OpenAI-backed LLM calls. Outputs are written under:
data/batch_runs/<run_id>/
"""

from __future__ import annotations

import asyncio
import copy
import io
import json
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import httpx

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = REPO_ROOT / "data" / "batch_runs"
BACKEND_ROOT = REPO_ROOT / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.db import init_db
from app.infra.llm_gateway import llm
from app.main import app

CASES = [
    {
        "slug": "01-cli",
        "topic": "Why every PM should know a little bit of CLI automation",
        "target_audience": "Product managers at SaaS startups",
        "duration": 60,
        "viewer_outcome": "Understand when lightweight CLI automation saves time without adding process debt.",
        "audience_level": "beginner",
        "platform": "linkedin",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "screen_recording"],
        "delivery_tone": "clear and practical",
        "freshness_expectation": "timeless",
        "point_of_view": "PMs should use tiny automations to remove repetitive work before they buy another tool.",
    },
    {
        "slug": "02-prd",
        "topic": "How to write a PRD that engineers actually want to read",
        "target_audience": "Mid-level product managers",
        "duration": 75,
        "viewer_outcome": "Know how to strip PRDs down to decisions, tradeoffs, and crisp requirements.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "no",
        "broll_type": ["slides", "whiteboard_animation"],
        "delivery_tone": "direct",
        "freshness_expectation": "timeless",
        "point_of_view": "A good PRD is a decision document, not a warehouse for every thought the team had.",
    },
    {
        "slug": "03-retro",
        "topic": "Why most retrospectives feel useless and how to fix them",
        "target_audience": "Engineering managers and tech leads",
        "duration": 90,
        "viewer_outcome": "Be able to redesign retros so they create behavior change instead of ritualized venting.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "real_world"],
        "delivery_tone": "honest and grounded",
        "freshness_expectation": "timeless",
        "point_of_view": "A retro is only valuable if it changes operating habits in the next sprint.",
    },
    {
        "slug": "04-design-review",
        "topic": "How to run design reviews without turning them into opinion fights",
        "target_audience": "Product designers and PMs",
        "duration": 120,
        "viewer_outcome": "Know how to anchor reviews in user goals, constraints, and decision criteria.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "real_world", "whiteboard_animation"],
        "delivery_tone": "facilitative",
        "freshness_expectation": "timeless",
        "point_of_view": "Design reviews go bad when teams debate taste before they agree on the job to be done.",
    },
    {
        "slug": "05-data",
        "topic": "Why dashboard-heavy teams still make bad product decisions",
        "target_audience": "Analytics-minded product teams",
        "duration": 150,
        "viewer_outcome": "Recognize the limits of dashboards and choose better decision inputs for ambiguous problems.",
        "audience_level": "advanced",
        "platform": "youtube",
        "on_camera_presence": "no",
        "broll_type": ["slides", "screen_recording"],
        "delivery_tone": "analytical",
        "freshness_expectation": "timeless",
        "point_of_view": "Dashboards are useful evidence, but they are a weak substitute for causal thinking and direct user context.",
    },
    {
        "slug": "06-onboarding",
        "topic": "How to make developer onboarding faster without more documentation sprawl",
        "target_audience": "Engineering managers",
        "duration": 180,
        "viewer_outcome": "Know how to combine path-based onboarding, live context, and selective docs into a faster ramp.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["screen_recording", "slides"],
        "delivery_tone": "practical",
        "freshness_expectation": "timeless",
        "point_of_view": "Faster onboarding comes from fewer, better paths through the system, not from dumping more docs on new hires.",
    },
    {
        "slug": "07-roadmap",
        "topic": "Roadmaps should show bets, not promises",
        "target_audience": "Startup founders and product leaders",
        "duration": 210,
        "viewer_outcome": "Be able to present roadmaps as strategic bets with confidence levels and learning goals.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "whiteboard_animation"],
        "delivery_tone": "executive and calm",
        "freshness_expectation": "timeless",
        "point_of_view": "A roadmap becomes more trustworthy when it shows uncertainty explicitly instead of pretending certainty exists.",
    },
    {
        "slug": "08-ai-writing",
        "topic": "When AI writing tools help and when they quietly flatten your thinking",
        "target_audience": "Knowledge workers who already use AI tools",
        "duration": 240,
        "viewer_outcome": "Understand where AI drafting accelerates work and where human judgment still has to lead.",
        "audience_level": "mixed",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "screen_recording"],
        "delivery_tone": "reflective",
        "freshness_expectation": "current but durable",
        "point_of_view": "AI is best as a pressure-reducing first pass, but dangerous when it becomes your default thinking substitute.",
    },
    {
        "slug": "09-docs",
        "topic": "The difference between good internal docs and dead internal docs",
        "target_audience": "Cross-functional startup teams",
        "duration": 300,
        "viewer_outcome": "Know how to identify living docs, kill dead docs, and reduce duplicate knowledge surfaces.",
        "audience_level": "beginner",
        "platform": "youtube",
        "on_camera_presence": "no",
        "broll_type": ["slides", "screen_recording", "whiteboard_animation"],
        "delivery_tone": "firm",
        "freshness_expectation": "timeless",
        "point_of_view": "Internal docs only stay alive when they are tied to real workflows, owners, and moments of use.",
    },
    {
        "slug": "10-meetings",
        "topic": "How senior operators cut meeting load without losing alignment",
        "target_audience": "Managers and operators in scaling teams",
        "duration": 360,
        "viewer_outcome": "Be able to redesign recurring meetings around decisions, artifacts, and clear owners.",
        "audience_level": "intermediate",
        "platform": "youtube",
        "on_camera_presence": "yes",
        "broll_type": ["slides", "real_world", "whiteboard_animation"],
        "delivery_tone": "confident",
        "freshness_expectation": "timeless",
        "point_of_view": "The best way to cut meetings is to strengthen the artifacts and decisions around them, not just delete calendar blocks.",
    },
]


class Tee(io.TextIOBase):
    def __init__(self, *streams: io.TextIOBase):
        self.streams = streams

    def write(self, data: str) -> int:
        for stream in self.streams:
            stream.write(data)
            stream.flush()
        return len(data)

    def flush(self) -> None:
        for stream in self.streams:
            stream.flush()


def field(value: Any, source: str = "extracted", confirmed: bool = True) -> dict:
    if value == "" or value == [] or value is None:
        source = "empty"
        confirmed = False
    return {
        "value": value,
        "source": source,
        "confirmed": confirmed,
    }


def build_round1_confirmation(fields: dict, case: dict) -> dict:
    return {
        "video_type": field(fields.get("video_type", {}).get("value", "knowledge_share"), "extracted", True),
        "viewer_outcome": field(case["viewer_outcome"], "extracted", True),
        "target_audience": field(case["target_audience"], "extracted", True),
        "duration": field(str(case["duration"]), "extracted", True),
        "audience_level": field(case["audience_level"], "extracted", True),
        "platform": field(case["platform"], "extracted", True),
    }


def build_round2_confirmation(case: dict) -> dict:
    return {
        "on_camera_presence": field(case["on_camera_presence"], "extracted", True),
        "broll_type": field(case["broll_type"], "extracted", True),
        "delivery_tone": field(case["delivery_tone"], "extracted", True),
        "freshness_expectation": field(case["freshness_expectation"], "extracted", True),
    }


def build_round3_confirmation(fields: dict) -> dict:
    core_points = fields.get("core_talking_points", {}).get("value", [])
    misconception = fields.get("misconceptions", {}).get("value", "")
    if not core_points:
        raise ValueError("Round 3 generation returned empty core_talking_points")
    return {
        "core_talking_points": field(core_points, "inferred", True),
        "misconceptions": field(misconception, "inferred", True),
    }


def snapshot_stats() -> dict[str, dict]:
    return copy.deepcopy(llm._stats)


def diff_stats(before: dict[str, dict], after: dict[str, dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for key in set(before) | set(after):
        b = before.get(key, {})
        a = after.get(key, {})
        delta = {
            "calls": a.get("calls", 0) - b.get("calls", 0),
            "in_tokens": a.get("in_tokens", 0) - b.get("in_tokens", 0),
            "out_tokens": a.get("out_tokens", 0) - b.get("out_tokens", 0),
            "cost": round(a.get("cost", 0.0) - b.get("cost", 0.0), 6),
            "time": round(a.get("time", 0.0) - b.get("time", 0.0), 3),
        }
        if any(delta.values()):
            out[key] = delta
    return dict(sorted(out.items()))


def summarize_storyboard(storyboard: list[dict]) -> dict:
    actual_duration = round(sum(float(screen.get("duration", 0)) for screen in storyboard), 2)
    word_count = sum(len((screen.get("voiceover_text") or "").split()) for screen in storyboard)
    return {
        "screen_count": len(storyboard),
        "actual_duration_sec": actual_duration,
        "voiceover_words": word_count,
    }


async def timed_request(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    *,
    json_body: dict | None = None,
) -> tuple[dict, float, int]:
    start = time.perf_counter()
    response = await client.request(method, url, json=json_body)
    elapsed = round(time.perf_counter() - start, 3)
    response.raise_for_status()
    return response.json(), elapsed, response.status_code


async def run_case(client: httpx.AsyncClient, case: dict, run_id: str) -> dict:
    project_id = f"{run_id}-{case['slug']}"
    intake_form = {
        "topic": case["topic"],
        "video_type": "knowledge_sharing",
        "target_audience": case["target_audience"],
        "duration": case["duration"],
    }

    print(f"\n===== {project_id} | {case['topic']} | {case['duration']}s =====")
    case_start = time.perf_counter()
    stats_before = snapshot_stats()
    steps = []

    create_body = {
        "projectId": project_id,
        "typeId": 1,
        "typeName": "knowledge_sharing",
        "userInput": case["topic"],
        "userId": "codex-batch",
    }
    create_result, elapsed, status = await timed_request(
        client,
        "POST",
        "/api/create-project",
        json_body=create_body,
    )
    steps.append({"step": "create_project", "seconds": elapsed, "status_code": status})
    print(f"[{project_id}] create_project {elapsed:.3f}s")

    event_result, elapsed, status = await timed_request(
        client,
        "POST",
        f"/api/project/{project_id}/event",
        json_body={"event": "submit_knowledge_share", "payload": {"intake_form": intake_form}},
    )
    steps.append({"step": "submit_knowledge_share", "seconds": elapsed, "status_code": status})
    print(f"[{project_id}] submit_knowledge_share {elapsed:.3f}s")
    event_result, elapsed, status = await timed_request(
        client,
        "POST",
        f"/api/project/{project_id}/event",
        json_body={
            "event": "chat_brief_approve",
            "payload": {
                "all_fields": {
                    **build_round1_confirmation(event_result.get("brief_fields", {}), case),
                    **build_round2_confirmation(case),
                    **build_round3_confirmation({
                        "core_talking_points": {"value": case["talking_points"], "source": "generated", "confirmed": True},
                        "misconceptions": {"value": case.get("misconceptions", ""), "source": "generated", "confirmed": True},
                    }),
                    "point_of_view": {"value": case["point_of_view"], "source": "extracted", "confirmed": True},
                }
            },
        },
    )
    steps.append({"step": "chat_brief_approve", "seconds": elapsed, "status_code": status})
    print(f"[{project_id}] chat_brief_approve {elapsed:.3f}s")

    outline = event_result.get("screen_outline")
    event_result, elapsed, status = await timed_request(
        client,
        "POST",
        f"/api/project/{project_id}/event",
        json_body={"event": "approve", "payload": {"current_outline": outline}},
    )
    steps.append({"step": "gate2_approve", "seconds": elapsed, "status_code": status})
    print(f"[{project_id}] gate2 approve {elapsed:.3f}s")

    storyboard = event_result.get("storyboard") or []
    pipeline_state, elapsed, status = await timed_request(
        client,
        "GET",
        f"/api/project/{project_id}/pipeline-state",
    )
    steps.append({"step": "pipeline_state_final", "seconds": elapsed, "status_code": status})

    quality_log, elapsed, status = await timed_request(
        client,
        "GET",
        f"/api/quality-log/{project_id}",
    )
    steps.append({"step": "quality_log", "seconds": elapsed, "status_code": status})

    stats_after = snapshot_stats()
    llm_delta = diff_stats(stats_before, stats_after)
    storyboard_summary = summarize_storyboard(storyboard)
    total_elapsed = round(time.perf_counter() - case_start, 3)

    print(
        f"[{project_id}] done in {total_elapsed:.3f}s | "
        f"{storyboard_summary['screen_count']} screens | "
        f"{storyboard_summary['actual_duration_sec']}s actual"
    )

    return {
        "project_id": project_id,
        "case": case,
        "steps": steps,
        "total_seconds": total_elapsed,
        "final_phase": pipeline_state["phase"],
        "outline_eval": pipeline_state["data"].get("outline_eval"),
        "storyboard_eval": pipeline_state["data"].get("storyboard_eval"),
        "storyboard_summary": storyboard_summary,
        "quality_log_entries": quality_log["entries"],
        "llm_delta": llm_delta,
    }


async def main() -> int:
    run_id = datetime.now().strftime("batch-%Y%m%d-%H%M%S")
    output_dir = OUTPUT_ROOT / run_id
    output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = output_dir / "summary.json"
    log_path = output_dir / "run.log"

    original_stdout = sys.stdout
    original_stderr = sys.stderr

    with log_path.open("w", encoding="utf-8") as log_file:
        tee = Tee(original_stdout, log_file)
        sys.stdout = tee
        sys.stderr = tee
        try:
            await init_db()

            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://plotline.local") as client:
                all_results = []
                run_start = time.perf_counter()
                global_stats_before = snapshot_stats()

                for case in CASES:
                    try:
                        result = await run_case(client, case, run_id)
                        all_results.append(result)
                    except Exception as exc:
                        all_results.append({
                            "project_id": f"{run_id}-{case['slug']}",
                            "case": case,
                            "error": str(exc),
                        })
                        print(f"[{run_id}-{case['slug']}] FAILED: {exc}")

                total_elapsed = round(time.perf_counter() - run_start, 3)
                global_stats_after = snapshot_stats()
                summary = {
                    "run_id": run_id,
                    "started_at": datetime.now().isoformat(),
                    "total_seconds": total_elapsed,
                    "cases": all_results,
                    "llm_summary": llm.summary(),
                    "llm_delta": diff_stats(global_stats_before, global_stats_after),
                    "output_dir": str(output_dir),
                    "log_path": str(log_path),
                }
                summary_path.write_text(
                    json.dumps(summary, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )

                print("\n===== BATCH COMPLETE =====")
                print(f"summary.json: {summary_path}")
                print(f"run.log: {log_path}")
                print(llm.summary())

        finally:
            sys.stdout = original_stdout
            sys.stderr = original_stderr

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
