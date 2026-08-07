"""Deterministic compatibility seed for the canonical Smart Intake fields."""

from typing import Any, Optional

from .base import BaseAgent


class BriefBuilder(BaseAgent):
    """Expose legacy three-round calls without generating narrative metadata."""

    prompt_file = "SMART_INTAKE_SEED_PROMPT_v0712.md"

    def run(
        self,
        state: Any,
        round: int = 1,
        confirmed_fields: Optional[dict] = None,
        revision_feedback: Optional[str] = None,
        **kwargs,
    ) -> dict:
        if not state.intake_form:
            raise ValueError("BriefBuilder requires intake_form in state")

        confirmed_fields = confirmed_fields or {}
        if round == 1:
            return {
                "fields": self._round_one_fields(
                    state.intake_form, confirmed_fields
                )
            }
        if round == 2:
            return {
                "fields": self._round_two_fields(
                    state.intake_form, confirmed_fields
                )
            }
        if round == 3:
            return {"fields": {}}
        raise ValueError(f"Invalid round: {round}. Must be 1, 2, or 3.")

    @staticmethod
    def _present(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, dict, set)):
            return bool(value)
        return True

    def _resolve_field(
        self,
        intake: dict,
        confirmed_fields: dict,
        aliases: tuple[str, ...],
        empty_value: Any = "",
    ) -> tuple[dict, Optional[str]]:
        """Resolve confirmed edits first while retaining field provenance."""
        for source, is_confirmed in (
            (confirmed_fields or {}, True),
            (intake or {}, False),
        ):
            for name in aliases:
                if name not in source:
                    continue
                raw = source[name]
                if isinstance(raw, dict) and "value" in raw:
                    field = dict(raw)
                    field.setdefault("source", "extracted")
                    field.setdefault("confirmed", is_confirmed)
                    return field, name
                return (
                    {
                        "value": raw,
                        "source": "extracted" if self._present(raw) else "empty",
                        "confirmed": is_confirmed,
                    },
                    name,
                )
        return (
            {"value": empty_value, "source": "empty", "confirmed": False},
            None,
        )

    def _field_for(
        self,
        intake: dict,
        confirmed_fields: dict,
        aliases: tuple[str, ...],
        empty_value: Any = "",
    ) -> dict:
        field, _alias = self._resolve_field(
            intake, confirmed_fields, aliases, empty_value
        )
        return field

    @staticmethod
    def _replace_value(field: dict, value: Any, empty_value: Any = "") -> dict:
        updated = dict(field)
        updated["value"] = value if BriefBuilder._present(value) else empty_value
        return updated

    def _duration_field(self, intake: dict, confirmed_fields: dict) -> dict:
        field, alias = self._resolve_field(
            intake,
            confirmed_fields,
            (
                "duration_seconds",
                "duration",
                "desired_length",
                "duration_minutes",
            ),
        )
        value = field["value"]
        if alias == "duration_minutes" and self._present(value):
            try:
                value = float(value) * 60
            except (TypeError, ValueError):
                value = ""
        if not self._present(value):
            return self._replace_value(field, "")
        try:
            numeric = float(value)
            if numeric > 0 and numeric.is_integer():
                value = str(int(numeric))
        except (TypeError, ValueError):
            pass
        return self._replace_value(field, str(value))

    def _round_one_fields(
        self, intake: dict, confirmed_fields: dict
    ) -> dict:
        return {
            "viewer_outcome": self._field_for(
                intake, confirmed_fields, ("viewer_outcome",)
            ),
            "target_audience": self._field_for(
                intake, confirmed_fields, ("target_audience", "audience")
            ),
            "duration": self._duration_field(intake, confirmed_fields),
            "platform": self._field_for(
                intake, confirmed_fields, ("platform",)
            ),
            "aspect_ratio": self._field_for(
                intake, confirmed_fields, ("aspect_ratio",)
            ),
        }

    def _round_two_fields(
        self, intake: dict, confirmed_fields: dict
    ) -> dict:
        formats_field = self._field_for(
            intake,
            confirmed_fields,
            ("production_formats", "broll_type"),
            [],
        )
        formats = formats_field["value"]
        if isinstance(formats, str):
            formats = [formats] if formats.strip() else []
        return {
            "audience_level": self._field_for(
                intake, confirmed_fields, ("audience_level",)
            ),
            "delivery_tone": self._field_for(
                intake, confirmed_fields, ("delivery_tone",)
            ),
            "production_formats": self._replace_value(
                formats_field, formats, []
            ),
        }
