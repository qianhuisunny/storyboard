"""
Brief Builder Agent - Creates Story Brief from intake form using 3-round flow.
Generates fields with proper source tagging (extracted vs inferred).
"""

import json
from typing import Any, Optional

from .base import BaseAgent


class BriefBuilder(BaseAgent):
    """
    Three-round brief generation for Knowledge Share videos.

    Field sources are determined by WHERE data comes from:
    - extracted: directly from user-provided inputs (form submission or explicit answers)
    - inferred: suggested by the system (AI inference)
    - empty: not set
    """

    prompt_file = "BRIEF_BUILDER_SYSTEM_PROMPT.md"

    def run(
        self,
        state: Any,
        round: int = 1,
        confirmed_fields: Optional[dict] = None,
        revision_feedback: Optional[str] = None,
        **kwargs
    ) -> dict:
        """
        Build Story Brief fields for a specific round.

        Args:
            state: StoryboardState with intake_form
            round: Which round to generate (1, 2, or 3)
            confirmed_fields: Fields confirmed from previous rounds
            revision_feedback: Optional feedback for revisions

        Returns:
            dict with { round: int, fields: { key: { value, source, confirmed } } }
        """
        if not state.intake_form:
            raise ValueError("BriefBuilder requires intake_form in state")

        confirmed_fields = confirmed_fields or {}

        if round == 1:
            return self._generate_round1(state.intake_form)
        elif round == 2:
            return self._generate_round2(state.intake_form, confirmed_fields)
        elif round == 3:
            research_results = getattr(state, 'research_results', None) or {}
            return self._generate_round3(state.intake_form, confirmed_fields, research_results)
        else:
            raise ValueError(f"Invalid round: {round}. Must be 1, 2, or 3.")

    def _generate_round1(self, intake_form: dict) -> dict:
        """
        Generate Section 1: Core Intent fields.

        Returns extracted fields immediately (no LLM call).
        Inferred fields are left empty for user input.

        Field source mapping:
        - video_type: extracted (user selection), confirmed=true
        - viewer_outcome: empty (user fills in — merged from old primary_goal + one_big_thing)
        - target_audience: extracted (from initial form)
        - duration: extracted (from initial form)
        - audience_level: empty (user selects)
        - platform: empty (user selects)
        """
        fields = {}

        # video_type is always extracted and confirmed
        fields["video_type"] = {
            "value": "knowledge_share",
            "source": "extracted",
            "confirmed": True,
        }

        # viewer_outcome - empty (user fills in)
        # Combines old primary_goal and one_big_thing into a single field
        fields["viewer_outcome"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # target_audience - extracted from form
        target_audience = intake_form.get("target_audience", "")
        fields["target_audience"] = {
            "value": target_audience,
            "source": "extracted" if target_audience else "empty",
            "confirmed": False,
        }

        # duration - extracted from form (can be "duration" or "desired_length")
        duration = intake_form.get("duration") or intake_form.get("desired_length", "")
        fields["duration"] = {
            "value": str(duration) if duration else "",
            "source": "extracted" if duration else "empty",
            "confirmed": False,
        }

        # Remaining fields are empty - user fills them in
        # No LLM call here to ensure immediate response

        # audience_level - empty (user selects)
        fields["audience_level"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # platform - empty (user selects)
        fields["platform"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        return {"round": 1, "fields": fields}

    def _generate_round2(self, intake_form: dict, confirmed_fields: dict) -> dict:
        """
        Generate Section 2: Delivery & Format fields.

        All Round 2 fields are empty - user fills them in.
        No LLM call to ensure immediate response.

        Field source mapping:
        - on_camera_presence: empty (user selects)
        - broll_type: empty (user selects)
        - delivery_tone: empty (user selects)
        - freshness_expectation: empty (user selects)
        """
        fields = {}

        # on_camera_presence - empty (user selects)
        fields["on_camera_presence"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # broll_type - empty (user selects, array)
        fields["broll_type"] = {
            "value": [],
            "source": "empty",
            "confirmed": False,
        }

        # delivery_tone - empty (user selects)
        fields["delivery_tone"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        # freshness_expectation - empty (user selects)
        fields["freshness_expectation"] = {
            "value": "",
            "source": "empty",
            "confirmed": False,
        }

        return {"round": 2, "fields": fields}

    def _generate_round3(
        self,
        intake_form: dict,
        confirmed_fields: dict,
        research_results: dict
    ) -> dict:
        """
        Generate Section 3: Content Spine fields from user's Point of View.

        Uses chained generation order:
        1. core_talking_points <- POV + audience + brief context (argument beats)
        2. misconception <- POV + talking_points + audience (the single strongest counter-thesis)
        3. must_avoid <- POV + talking_points + misconception (claim guardrails)

        POV is the source of truth. All fields are downstream derivations.
        """
        # Extract confirmed field values for context
        def get_val(key: str, default: str = "") -> str:
            field = confirmed_fields.get(key, {})
            if isinstance(field, dict) and "value" in field:
                v = field["value"]
                return ", ".join(v) if isinstance(v, list) else str(v)
            return str(field) if field else default

        point_of_view = get_val("point_of_view")
        viewer_outcome = get_val("viewer_outcome")
        target_audience = get_val("target_audience")
        audience_level = get_val("audience_level", "intermediate")
        duration = get_val("duration", "300")
        platform = get_val("platform")
        delivery_tone = get_val("delivery_tone")
        freshness = get_val("freshness_expectation")

        prompt = f"""## TASK: Generate Content Spine from Point of View

The user has provided a central claim (Point of View) that this video will build and defend.
Your job is to generate the argument structure that supports this claim.

## POINT OF VIEW (source of truth)
{point_of_view}

## BRIEF CONTEXT
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Viewer Outcome: {viewer_outcome}
- Duration: {duration} seconds
- Platform: {platform}
- Delivery Tone: {delivery_tone}
- Freshness: {freshness}

## GENERATION INSTRUCTIONS

Generate three fields in this exact dependency order:

### 1. core_talking_points (3-5 items)
These are the major ARGUMENT BEATS required to make the POV convincing.
- Each point is a reasoning step that builds the case for the claim
- They should create progression: point N builds on point N-1
- Do NOT list subtopics or generic bullet points — list the steps of the argument

### 2. misconception (1 sentence)
What is the single most important misconception this video needs to address?

This is NOT a list of all possible objections. It is the ONE counter-thesis that, if left unaddressed, would make the audience dismiss the POV entirely.

Pick the misconception that is:
- The most widely held by this specific audience
- The hardest to let go of (not a strawman)
- The one that, once dismantled, clears the path for the rest of the argument

Frame it as a belief statement: "Most people think X, but actually Y."
Do NOT generate a list. Return a single string.

### 3. must_avoid (1-2 items)
These are what would make THIS SPECIFIC POV weaker, blurrier, or less credible.
- Identify traps specific to this argument that would dilute the thesis
- Be specific to this POV, not generic writing advice
- Example format: "Don't retreat to [safe framing] — this POV claims [specific insight]"

## QUALITY CHECK
Before returning, verify:
1. Each talking point directly advances the case for the POV
2. The misconception is a genuine counter-thesis the audience holds, not a mirror-phrased talking point
3. Each must_avoid is specific to this POV, not generic advice like "don't be vague"
4. The three fields are functionally distinct — no paraphrases of one another

## OUTPUT FORMAT
Return a JSON object with exactly these 3 keys:
{{
  "core_talking_points": ["argument beat 1", "argument beat 2", "argument beat 3"],
  "misconception": "Most people think X, but actually Y.",
  "must_avoid": ["POV-specific guardrail 1"]
}}"""

        # Call LLM to generate content spine
        try:
            response = self.call_llm(prompt, max_tokens=2000, temperature=0.7)
            parsed = self._extract_json(response)
        except Exception as e:
            print(f"[BriefBuilder] Round 3 LLM call failed: {e}")
            parsed = None

        # Build fields from LLM response or fallback to empty
        if parsed and isinstance(parsed, dict):
            talking_points = parsed.get("core_talking_points", [])
            # Accept both "misconception" (new) and "misconceptions" (legacy)
            misconception = parsed.get("misconception") or parsed.get("misconceptions", "")
            must_avoid = parsed.get("must_avoid", [])

            # Ensure talking_points and must_avoid are lists
            if isinstance(talking_points, str):
                talking_points = [talking_points]
            if isinstance(must_avoid, str):
                must_avoid = [must_avoid]
            # misconception should be a string; if LLM returned a list, take the first
            if isinstance(misconception, list):
                misconception = misconception[0] if misconception else ""

            fields = {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": misconception,
                    "source": "inferred",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": must_avoid,
                    "source": "inferred",
                    "confirmed": False,
                },
            }
        else:
            # Fallback: empty fields for user input
            fields = {
                "core_talking_points": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": "",
                    "source": "empty",
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": [],
                    "source": "empty",
                    "confirmed": False,
                },
            }

        return {"round": 3, "fields": fields}

