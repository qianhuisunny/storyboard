import pytest

from app.main import ChatBriefRequest, chat_brief


@pytest.mark.asyncio
async def test_chat_brief_uses_only_canonical_smart_intake_context(monkeypatch):
    captured = {}

    def fake_chat(**kwargs):
        captured.update(kwargs)
        return """{
          "reply": "I have what I need.",
          "done": true,
          "extracted_fields": {
            "viewer_outcome": "Run the check",
            "target_audience": "Engineering leads",
            "audience_level": "Intermediate",
            "delivery_tone": "Direct",
            "production_formats": ["slides"],
            "intent_route": "must-not-return"
          }
        }"""

    monkeypatch.setattr("app.infra.llm_gateway.llm.chat", fake_chat)
    response = await chat_brief(
        "prompt-contract",
        ChatBriefRequest(
            messages=[{"role": "user", "content": "Make it practical."}],
            fields_so_far={
                "viewer_outcome": {"value": "Run the check"},
                "intent_route": {"value": "must-not-leak"},
                "core_talking_points": {"value": ["must-not-leak"]},
            },
            onboarding={
                "prompt": "Explain production handoffs.",
                "duration_seconds": 90,
                "target_audience": "Engineering leads",
                "platform": "LinkedIn",
                "aspect_ratio": "9:16",
                "production_formats": ["slides"],
                "source_snapshot": "Use the launch checklist source.",
                "intent_route": "must-not-leak",
                "content_mode": "must-not-leak",
            },
        ),
    )

    assert response["done"] is True
    assert set(response["extracted_fields"]) == {
        "viewer_outcome",
        "target_audience",
        "audience_level",
        "delivery_tone",
        "production_formats",
    }
    system_prompt = captured["system_prompt"]
    user_prompt = captured["user_prompt"]
    for key in (
        "viewer_outcome",
        "target_audience",
        "audience_level",
        "delivery_tone",
        "production_formats",
    ):
        assert key in system_prompt
    for expected in (
        "Explain production handoffs.",
        "90",
        "Engineering leads",
        "LinkedIn",
        "9:16",
        "slides",
        "Use the launch checklist source.",
        "Run the check",
    ):
        assert expected in user_prompt
    lowered = f"{system_prompt}\n{user_prompt}".lower()
    for retired in (
        "intent_route",
        "intent route",
        "content_mode",
        "content mode",
        "core_talking_points",
        "core talking points",
        "point_of_view",
        "point of view",
        "misconceptions",
    ):
        assert retired not in lowered
    assert "must-not-leak" not in user_prompt
