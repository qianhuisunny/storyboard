import pytest

from app.services.video_intent import infer_video_intent_route


@pytest.mark.parametrize(
    ("intake_form", "expected_route"),
    [
        (
            {
                "description": "Announce our new AI scheduling feature to operations leaders with a clear launch CTA.",
                "duration": 120,
            },
            "product_release",
        ),
        (
            {
                "description": "Create a step-by-step tutorial showing new users how to configure the workflow.",
                "duration": 360,
            },
            "tutorial_demo",
        ),
        (
            {
                "description": "A 10-minute YouTube explainer about why AI agents work better with narrow jobs.",
                "duration": 600,
            },
            "deep_explainer",
        ),
        (
            {
                "description": "I want a sharp 90-second talking script about why planning apps fail.",
                "duration": 600,
            },
            "talking_script",
        ),
        (
            {
                "description": "A cozy Sunday reset planner video for creators rebuilding their week.",
                "duration": 540,
            },
            "planner_lifestyle",
        ),
    ],
)
def test_infer_video_intent_route_matches_user_intent(intake_form, expected_route):
    assert infer_video_intent_route(intake_form).key == expected_route


@pytest.mark.parametrize(
    ("alias", "expected_route"),
    [
        ("Product Demo Video", "tutorial_demo"),
        ("Knowledge Sharing", "deep_explainer"),
        ("short_pov_script", "talking_script"),
        ("planner_lifestyle_story", "planner_lifestyle"),
    ],
)
def test_infer_video_intent_route_supports_legacy_and_content_mode_aliases(alias, expected_route):
    assert infer_video_intent_route({"video_type": alias}).key == expected_route
