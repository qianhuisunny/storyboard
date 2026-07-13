from pathlib import Path
from types import SimpleNamespace

from app.services.agents.brief_builder import BriefBuilder


BANNED_ACTIVE_TERMS = (
    "point_of_view",
    "point of view",
    "intent_route",
    "intent route",
    "content_mode",
    "content mode",
    "video_type",
    "primary_pattern",
    "secondary_patterns",
    "core_talking_points",
    "core talking points",
    "misconceptions",
    "must_avoid",
    "must avoid",
    "pattern layer",
)


def _value(field: dict):
    return field["value"]


def test_brief_builder_seeds_only_canonical_fields_without_defaults():
    builder = BriefBuilder()
    state = SimpleNamespace(
        intake_form={
            "viewer_outcome": "Run a useful design critique.",
            "target_audience": "New design leads",
            "duration_seconds": 120,
            "platform": "YouTube",
            "aspect_ratio": "16:9",
            "production_formats": ["slides", "talking_head"],
        }
    )

    round1 = builder.run(state, round=1)["fields"]
    round2 = builder.run(state, round=2)["fields"]

    assert set(round1) == {
        "viewer_outcome",
        "target_audience",
        "duration",
        "platform",
        "aspect_ratio",
    }
    assert _value(round1["viewer_outcome"]) == "Run a useful design critique."
    assert _value(round1["target_audience"]) == "New design leads"
    assert _value(round1["duration"]) == "120"
    assert _value(round1["platform"]) == "YouTube"
    assert _value(round1["aspect_ratio"]) == "16:9"
    assert all(field["source"] == "extracted" for field in round1.values())

    assert set(round2) == {
        "audience_level",
        "delivery_tone",
        "production_formats",
    }
    assert _value(round2["audience_level"]) == ""
    assert _value(round2["delivery_tone"]) == ""
    assert _value(round2["production_formats"]) == ["slides", "talking_head"]
    assert round2["audience_level"]["source"] == "empty"
    assert round2["delivery_tone"]["source"] == "empty"
    assert round2["production_formats"]["source"] == "extracted"


def test_brief_builder_round3_is_empty_and_never_calls_llm(monkeypatch):
    builder = BriefBuilder()
    monkeypatch.setattr(
        builder,
        "call_llm",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("Round 3 must not call the LLM")
        ),
    )
    state = SimpleNamespace(intake_form={"topic": "Legacy intake"})

    assert builder.run(state, round=3, revision_feedback="Try again") == {
        "fields": {}
    }


def test_brief_builder_maps_legacy_input_aliases_to_canonical_output():
    builder = BriefBuilder()
    state = SimpleNamespace(
        intake_form={
            "duration_minutes": 2,
            "broll_type": ["whiteboard_animation"],
        }
    )

    assert builder.run(state, round=1)["fields"]["duration"]["value"] == "120"
    assert builder.run(state, round=2)["fields"]["production_formats"][
        "value"
    ] == ["whiteboard_animation"]


def test_all_active_prompts_and_services_exclude_retired_taxonomy():
    root = Path(__file__).parents[3]
    active_files = list((root / "prompts").glob("*.md")) + [
        root / "backend/app/services/agents/brief_builder.py",
        root / "backend/app/main.py",
        root / "backend/app/services/orchestrator.py",
        root / "backend/app/services/agents/storyboard_director.py",
        root / "backend/app/services/agents/storyboard_writer.py",
        root / "backend/app/services/quality_gate.py",
    ]

    for path in active_files:
        text = path.read_text(encoding="utf-8").lower()
        for term in BANNED_ACTIVE_TERMS:
            assert term not in text, f"{term!r} remains active in {path}"
