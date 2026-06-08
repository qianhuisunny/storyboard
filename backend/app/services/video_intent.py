"""Intent routing for guided video brief intake.

The route is an internal planning hint, not a user-facing required choice.
It lets the brief, outline, and writer prompts adapt to different video jobs
while preserving one simple field schema.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Mapping


@dataclass(frozen=True)
class VideoIntentRoute:
    key: str
    label: str
    type_id: int
    content_mode: str
    default_platform: str
    default_audience_level: str
    default_tone: str
    default_freshness: str
    default_broll_type: tuple[str, ...]
    default_on_camera_presence: str
    summary: str


VIDEO_INTENT_ROUTES: dict[str, VideoIntentRoute] = {
    "product_release": VideoIntentRoute(
        key="product_release",
        label="Product Release",
        type_id=1,
        content_mode="launch_or_feature_story",
        default_platform="youtube",
        default_audience_level="mixed",
        default_tone="executive_briefing",
        default_freshness="current_year",
        default_broll_type=("slides", "screen_recording", "stock_footage"),
        default_on_camera_presence="yes",
        summary="Announce a product, feature, or business update with a clear problem-solution-CTA arc.",
    ),
    "tutorial_demo": VideoIntentRoute(
        key="tutorial_demo",
        label="Tutorial / Demo",
        type_id=2,
        content_mode="step_by_step_walkthrough",
        default_platform="youtube",
        default_audience_level="beginner",
        default_tone="clear_practical",
        default_freshness="evergreen",
        default_broll_type=("screen_recording", "slides"),
        default_on_camera_presence="no",
        summary="Teach a workflow or show how to use a product, tool, method, or process.",
    ),
    "deep_explainer": VideoIntentRoute(
        key="deep_explainer",
        label="YouTube Explainer",
        type_id=3,
        content_mode="long_form_explainer",
        default_platform="youtube",
        default_audience_level="intermediate",
        default_tone="analytical_informative",
        default_freshness="evergreen",
        default_broll_type=("slides", "whiteboard_animation", "stock_footage"),
        default_on_camera_presence="no",
        summary="Build a longer educational or opinion-driven explanation with a strong narrative spine.",
    ),
    "talking_script": VideoIntentRoute(
        key="talking_script",
        label="Talking Script",
        type_id=4,
        content_mode="short_pov_script",
        default_platform="short_form",
        default_audience_level="mixed",
        default_tone="mentor_peer",
        default_freshness="evergreen",
        default_broll_type=("slides",),
        default_on_camera_presence="yes",
        summary="Shape a speak-to-camera script around a sharp point, story, or opinion.",
    ),
    "planner_lifestyle": VideoIntentRoute(
        key="planner_lifestyle",
        label="Planner / Lifestyle",
        type_id=5,
        content_mode="planner_lifestyle_story",
        default_platform="youtube",
        default_audience_level="mixed",
        default_tone="mentor_peer",
        default_freshness="evergreen",
        default_broll_type=("real_world", "slides", "stock_footage"),
        default_on_camera_presence="yes",
        summary="Turn a routine, planning session, lifestyle idea, or personal process into a watchable sequence.",
    ),
}


LEGACY_ROUTE_ALIASES = {
    "product release": "product_release",
    "product_release": "product_release",
    "launch_or_feature_story": "product_release",
    "product demo": "tutorial_demo",
    "product demo video": "tutorial_demo",
    "how-to demo": "tutorial_demo",
    "how_to_demo": "tutorial_demo",
    "step_by_step_walkthrough": "tutorial_demo",
    "knowledge share": "deep_explainer",
    "knowledge sharing": "deep_explainer",
    "knowledge_share": "deep_explainer",
    "knowledge_sharing": "deep_explainer",
    "youtube explainer": "deep_explainer",
    "deep explainer": "deep_explainer",
    "long_form_explainer": "deep_explainer",
    "talking script": "talking_script",
    "talking head": "talking_script",
    "short pov script": "talking_script",
    "short_pov_script": "talking_script",
    "planner / lifestyle": "planner_lifestyle",
    "planner lifestyle": "planner_lifestyle",
    "planner_lifestyle_story": "planner_lifestyle",
}


DIRECT_ROUTE_PHRASES: dict[str, tuple[str, ...]] = {
    "product_release": (
        "product release",
        "product launch",
        "launch video",
        "feature announcement",
        "product update",
        "发布",
        "上线",
    ),
    "tutorial_demo": (
        "product demo",
        "how-to demo",
        "how to",
        "tutorial",
        "walkthrough",
        "step by step",
        "step-by-step",
        "screen recording",
        "教程",
        "演示",
    ),
    "deep_explainer": (
        "youtube explainer",
        "deep explainer",
        "deep dive",
        "long-form",
        "long form",
        "video essay",
        "knowledge share",
        "知识分享",
        "长视频",
    ),
    "talking_script": (
        "talking script",
        "talking head",
        "speak to camera",
        "to-camera",
        "short pov",
        "short-form script",
        "口播",
        "想说",
    ),
    "planner_lifestyle": (
        "planner video",
        "planner / lifestyle",
        "planner lifestyle",
        "lifestyle video",
        "routine video",
        "sunday reset",
        "weekly reset",
        "生活方式",
        "手帐",
    ),
}


KEYWORDS: dict[str, tuple[str, ...]] = {
    "planner_lifestyle": (
        "planner",
        "planning",
        "routine",
        "lifestyle",
        "vlog",
        "day in the life",
        "reset",
        "weekly plan",
        "monthly plan",
        "morning routine",
        "evening routine",
        "notion setup",
        "journal",
        "bullet journal",
        "habits",
        "life admin",
        "life update",
        "口播 vlog",
        "生活方式",
        "手帐",
        "计划",
    ),
    "tutorial_demo": (
        "how to",
        "how-to",
        "tutorial",
        "walkthrough",
        "demo",
        "step by step",
        "step-by-step",
        "screen recording",
        "setup",
        "install",
        "configure",
        "workflow",
        "use ",
        "using ",
        "build ",
        "操作",
        "教程",
        "演示",
    ),
    "product_release": (
        "launch",
        "release",
        "announce",
        "announcement",
        "new feature",
        "feature update",
        "product update",
        "go-to-market",
        "gtm",
        "sales",
        "customers",
        "cta",
        "waitlist",
        "发布",
        "上线",
        "产品更新",
    ),
    "talking_script": (
        "talking head",
        "speak to camera",
        "to camera",
        "script",
        "monologue",
        "rant",
        "hot take",
        "reel",
        "shorts",
        "tiktok",
        "linkedin post",
        "what i want to say",
        "口播",
        "想说",
        "短视频",
        "短稿",
    ),
    "deep_explainer": (
        "youtube",
        "deep dive",
        "explainer",
        "explain",
        "essay",
        "analysis",
        "breakdown",
        "knowledge",
        "teach",
        "why ",
        "what is",
        "concept",
        "framework",
        "长视频",
        "解释",
        "知识",
    ),
}


_DURATION_PATTERN = re.compile(
    r"(\d+(?:\.\d+)?)\s*[- ]?\s*"
    r"(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|小时|分钟|分|秒)",
    re.IGNORECASE,
)


def _text_from_intake(intake_form: Mapping[str, Any]) -> str:
    parts = [
        intake_form.get("description"),
        intake_form.get("topic"),
        intake_form.get("userInput"),
        intake_form.get("user_inputs"),
        intake_form.get("prompt"),
        intake_form.get("video_type"),
        intake_form.get("typeName"),
    ]
    return " ".join(str(part) for part in parts if part).lower()


def _duration_from_text(text: str) -> int | None:
    for match in _DURATION_PATTERN.finditer(text):
        amount = float(match.group(1))
        unit = match.group(2).lower()
        if unit.startswith(("hour", "hr")) or unit in {"h", "小时"}:
            return int(amount * 3600)
        if unit.startswith(("minute", "min")) or unit in {"m", "分钟", "分"}:
            return int(amount * 60)
        return int(amount)
    return None


def _duration_seconds(intake_form: Mapping[str, Any]) -> int | None:
    text_duration = _duration_from_text(_text_from_intake(intake_form))
    if text_duration and text_duration > 0:
        return text_duration

    raw = None
    multiplier = 1
    for key in ("duration", "desired_length", "duration_seconds"):
        if intake_form.get(key) is not None:
            raw = intake_form.get(key)
            break
    if raw is None and intake_form.get("duration_minutes") is not None:
        raw = intake_form.get("duration_minutes")
        multiplier = 60

    try:
        value = int(float(raw) * multiplier)
    except (TypeError, ValueError):
        return None
    return value if value > 0 else None


def infer_video_intent_route(intake_form: Mapping[str, Any]) -> VideoIntentRoute:
    """Infer the route from user intent and soft constraints."""
    explicit = (
        str(
            intake_form.get("intent_route")
            or intake_form.get("content_mode")
            or intake_form.get("video_type")
            or intake_form.get("typeName")
            or ""
        )
        .strip()
        .lower()
    )
    explicit_key = LEGACY_ROUTE_ALIASES.get(explicit, explicit)
    if explicit_key in VIDEO_INTENT_ROUTES:
        return VIDEO_INTENT_ROUTES[explicit_key]

    text = _text_from_intake(intake_form)
    duration = _duration_seconds(intake_form)
    scores = {key: 0 for key in VIDEO_INTENT_ROUTES}

    for route_key, words in KEYWORDS.items():
        for word in words:
            if word in text:
                scores[route_key] += 2 if len(word) > 4 else 1

    for route_key, phrases in DIRECT_ROUTE_PHRASES.items():
        for phrase in phrases:
            if phrase in text:
                scores[route_key] += 6

    if duration:
        if duration <= 180:
            scores["talking_script"] += 2
        elif duration >= 540:
            scores["deep_explainer"] += 2
        elif 240 <= duration <= 900:
            scores["planner_lifestyle"] += 1

    if "youtube shorts" in text or "short form" in text:
        scores["talking_script"] += 3
    if "youtube" in text and duration and duration >= 360:
        scores["deep_explainer"] += 2

    winner = max(scores, key=scores.get)
    if scores[winner] == 0:
        if duration and duration <= 180:
            winner = "talking_script"
        elif duration and duration >= 540:
            winner = "deep_explainer"
        else:
            winner = "deep_explainer"

    return VIDEO_INTENT_ROUTES[winner]


def make_brief_field(value: Any, source: str = "inferred", confirmed: bool = False) -> dict[str, Any]:
    return {
        "value": value,
        "source": source if value not in ("", [], None) else "empty",
        "confirmed": confirmed,
    }
