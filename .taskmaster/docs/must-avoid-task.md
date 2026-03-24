# P3: Gather requirements on must-avoid types

**Priority: low**

The must_avoid field has been commented out from the content spine generation (brief_builder.py) and was already hidden from the frontend UI. The Director prompt still references must_avoid but will receive empty/missing values.

Before re-enabling, gather requirements:
1. Define what types of must-avoid are useful: POV-specific guardrails vs generic advice vs content restrictions
2. Determine if this should be user-provided, AI-generated, or both
3. Decide if it belongs in the content spine or as a separate standalone field
4. Review whether the Director/Writer actually use must_avoid effectively when it IS provided — check gold set outputs for evidence

**Files affected**: `backend/app/services/agents/brief_builder.py`, `frontend/src/components/BriefBuilder/RoundForms/RoundThreeForm.tsx`, `prompts/storyboard_director_prompt_v0323.md`
