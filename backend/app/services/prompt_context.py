"""Bound untrusted or persisted values before embedding them in LLM prompts."""

import json
from typing import Any


TRUNCATION_MARKER = "…[truncated]"


def truncate_prompt_text(value: Any, max_chars: int) -> str:
    """Render scalar text within an explicit character budget."""
    text = "" if value is None else str(value)
    if len(text) <= max_chars:
        return text
    suffix = f"\n{TRUNCATION_MARKER}"
    if max_chars <= len(suffix):
        return suffix[-max_chars:]
    return text[: max_chars - len(suffix)] + suffix


def render_prompt_value(value: Any, max_chars: int) -> str:
    """Render structured or scalar prompt context with a visible truncation marker."""
    if isinstance(value, (dict, list, tuple, set)):
        try:
            rendered = json.dumps(
                list(value) if isinstance(value, set) else value,
                ensure_ascii=False,
                indent=2,
                default=str,
            )
        except (TypeError, ValueError):
            rendered = str(value)
    else:
        rendered = "" if value is None else str(value)
    return truncate_prompt_text(rendered, max_chars)


def serialized_size(value: Any) -> int:
    """Return a stable JSON character count for API payload budgeting."""
    return len(
        json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)
    )
