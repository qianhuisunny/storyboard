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


def test_confirmed_fields_override_intake_and_scalar_provenance_is_explicit():
    builder = BriefBuilder()
    state = SimpleNamespace(
        intake_form={
            "viewer_outcome": "Original generated outcome",
            "target_audience": "Original audience",
        }
    )

    fields = builder.run(
        state,
        round=1,
        confirmed_fields={"viewer_outcome": "User-edited outcome"},
    )["fields"]

    assert fields["viewer_outcome"] == {
        "value": "User-edited outcome",
        "source": "extracted",
        "confirmed": True,
    }
    assert fields["target_audience"] == {
        "value": "Original audience",
        "source": "extracted",
        "confirmed": False,
    }


def test_brief_builder_preserves_supplied_envelope_metadata():
    builder = BriefBuilder()
    state = SimpleNamespace(
        intake_form={
            "delivery_tone": {
                "value": "Warm",
                "source": "inferred",
                "confirmed": False,
                "confidence": 0.7,
            }
        }
    )
    confirmed = {
        "delivery_tone": {
            "value": "Direct",
            "source": "user",
            "confirmed": True,
            "confidence": 1.0,
        }
    }

    field = builder.run(state, round=2, confirmed_fields=confirmed)["fields"][
        "delivery_tone"
    ]

    assert field == confirmed["delivery_tone"]


def test_confirmed_duration_minutes_override_intake_seconds_with_provenance():
    builder = BriefBuilder()
    state = SimpleNamespace(intake_form={"duration_seconds": 120})

    field = builder.run(
        state, round=1, confirmed_fields={"duration_minutes": 3}
    )["fields"]["duration"]

    assert field == {
        "value": "180",
        "source": "extracted",
        "confirmed": True,
    }


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
