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
    def _unwrap(value: Any) -> Any:
        if isinstance(value, dict) and "value" in value:
            return value["value"]
        return value

    @staticmethod
    def _present(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, dict, set)):
            return bool(value)
        return True

    def _read(
        self,
        intake: dict,
        confirmed_fields: dict,
        aliases: tuple[str, ...],
        default: Any = "",
    ) -> Any:
        for source in (intake or {}, confirmed_fields or {}):
            for name in aliases:
                if name not in source:
                    continue
                value = self._unwrap(source[name])
                if self._present(value):
                    return value
        return default

    @staticmethod
    def _field(value: Any, empty_value: Any = "") -> dict:
        present = BriefBuilder._present(value)
        return {
            "value": value if present else empty_value,
            "source": "extracted" if present else "empty",
            "confirmed": False,
        }

    def _duration(self, intake: dict, confirmed_fields: dict) -> str:
        value = self._read(
            intake,
            confirmed_fields,
            ("duration_seconds", "duration", "desired_length"),
        )
        if not self._present(value):
            minutes = self._read(
                intake, confirmed_fields, ("duration_minutes",), None
            )
            if self._present(minutes):
                try:
                    value = float(minutes) * 60
                except (TypeError, ValueError):
                    value = ""
        if not self._present(value):
            return ""
        try:
            numeric = float(value)
            if numeric > 0 and numeric.is_integer():
                return str(int(numeric))
        except (TypeError, ValueError):
            pass
        return str(value)

    def _round_one_fields(
        self, intake: dict, confirmed_fields: dict
    ) -> dict:
        values = {
            "viewer_outcome": self._read(
                intake, confirmed_fields, ("viewer_outcome",)
            ),
            "target_audience": self._read(
                intake, confirmed_fields, ("target_audience", "audience")
            ),
            "duration": self._duration(intake, confirmed_fields),
            "platform": self._read(
                intake, confirmed_fields, ("platform",)
            ),
            "aspect_ratio": self._read(
                intake, confirmed_fields, ("aspect_ratio",)
            ),
        }
        return {name: self._field(value) for name, value in values.items()}

    def _round_two_fields(
        self, intake: dict, confirmed_fields: dict
    ) -> dict:
        formats = self._read(
            intake,
            confirmed_fields,
            ("production_formats", "broll_type"),
            [],
        )
        if isinstance(formats, str):
            formats = [formats] if formats.strip() else []
        return {
            "audience_level": self._field(
                self._read(intake, confirmed_fields, ("audience_level",))
            ),
            "delivery_tone": self._field(
                self._read(intake, confirmed_fields, ("delivery_tone",))
            ),
            "production_formats": self._field(formats, []),
        }
