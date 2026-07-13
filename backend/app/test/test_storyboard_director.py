from pathlib import Path
from types import SimpleNamespace

from app.services.agents.storyboard_director import StoryboardDirector


BANNED_PROMPT_TERMS = (
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


def _canonical_intake() -> dict:
    return {
        "prompt": "Teach product teams how to run a useful pre-mortem.",
        "viewer_outcome": "Leave able to facilitate a 20-minute pre-mortem.",
        "target_audience": "Product managers",
        "audience_level": "Intermediate",
        "duration_seconds": 90,
        "platform": "LinkedIn",
        "aspect_ratio": "9:16",
        "delivery_tone": "Direct and reassuring",
        "production_formats": ["talking_head", "slides"],
        "source_snapshot": "The source notes define four facilitation steps.",
        "sources": [
            {"name": "Premortem notes.pdf", "kind": "upload", "status": "ready"}
        ],
        "point_of_view": "legacy value that must not leak",
        "intent_route": "deep_explainer",
        "content_mode": "educational",
        "video_type": "knowledge_sharing",
        "primary_pattern": "problem-solution",
        "secondary_patterns": ["listicle"],
        "core_talking_points": ["legacy spine"],
        "misconceptions": "legacy misconception",
        "must_avoid": ["legacy restriction"],
    }


def _assert_no_banned_terms(text: str) -> None:
    lowered = text.lower()
    for term in BANNED_PROMPT_TERMS:
        assert term not in lowered


def test_director_prompt_uses_complete_canonical_intake_without_legacy_taxonomy():
    director = StoryboardDirector()

    prompt = director._build_prompt(_canonical_intake())

    for expected in (
        "Teach product teams how to run a useful pre-mortem.",
        "Leave able to facilitate a 20-minute pre-mortem.",
        "Product managers",
        "Intermediate",
        "90",
        "LinkedIn",
        "9:16",
        "Direct and reassuring",
        "talking_head",
        "slides",
        "The source notes define four facilitation steps.",
        "Premortem notes.pdf",
        "upload",
        "ready",
    ):
        assert expected in prompt
    _assert_no_banned_terms(prompt)


def test_director_supports_legacy_nested_fields_and_aliases_without_fabricated_values():
    director = StoryboardDirector()
    brief = {
        "fields": {
            "topic": {"value": "Explain database isolation"},
            "duration": {"value": "45"},
            "broll_type": {"value": ["slides"]},
            "on_camera_presence": {"value": "yes"},
            "source_context": {"value": "Use the transaction timeline example."},
        }
    }

    prompt = director._build_prompt(brief)

    assert "Explain database isolation" in prompt
    assert "45" in prompt
    assert "slides" in prompt
    assert "talking_head" in prompt
    assert "Use the transaction timeline example." in prompt
    assert "General audience" not in prompt
    assert "Intermediate" not in prompt
    _assert_no_banned_terms(prompt)


def test_director_run_threads_quality_feedback_without_mutating_system_prompt(monkeypatch):
    director = StoryboardDirector()
    original_system_prompt = director.system_prompt
    captured = []

    def fake_call(prompt, **_kwargs):
        captured.append(prompt)
        return "Section 1 — Opening\n\nPurpose\nStart clearly."

    monkeypatch.setattr(director, "call_llm", fake_call)
    state = SimpleNamespace(
        story_brief=_canonical_intake(), project_id="director-contract"
    )

    director.run(state, quality_feedback="Make the purpose more concrete.")

    assert "Make the purpose more concrete." in captured[0]
    assert director.system_prompt == original_system_prompt
    _assert_no_banned_terms(captured[0])


def test_director_refinement_prompts_share_the_canonical_context(monkeypatch):
    director = StoryboardDirector()
    prompts = []
    monkeypatch.setattr(
        director,
        "call_llm",
        lambda prompt, **_kwargs: prompts.append(prompt) or "updated outline",
    )
    intake = _canonical_intake()

    director.refine_outline("current outline", "Tighten the opening", intake)
    director.regenerate_section(
        "current outline", 2, "Use a stronger example", intake
    )

    assert len(prompts) == 2
    for prompt in prompts:
        assert "Teach product teams how to run a useful pre-mortem." in prompt
        assert "Premortem notes.pdf" in prompt
        assert "9:16" in prompt
        _assert_no_banned_terms(prompt)


def test_director_active_system_prompt_keeps_exact_editable_outline_contract():
    director = StoryboardDirector()
    prompt_path = Path(__file__).parents[3] / "prompts" / director.prompt_file
    prompt = prompt_path.read_text(encoding="utf-8")

    for label in (
        "Section {N} — {Title}",
        "Purpose",
        "Entry assumption",
        "Exit state",
        "Duration",
        "Talking points",
    ):
        assert label in prompt
    assert "Brief talking points covered" not in prompt
    _assert_no_banned_terms(prompt)
