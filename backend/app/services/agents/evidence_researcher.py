"""
Evidence Researcher Agent — storyboard-ready research for video outline sections.

Two knowledge sources:
1. LLM training knowledge (always available)
2. RAG retrieval from user-uploaded documents (when project has documents)

Data model: evidence_needed → research_question → full_answer → storyboard_usable_phrasing[]
"""

import json
from typing import Any, Optional

from .base import BaseAgent


class EvidenceResearcher(BaseAgent):
    """
    Generates storyboard-ready evidence research from LLM knowledge + optional RAG.

    Input: outline text + brief context + optional project_id (for RAG)
    Output: per-section, per-evidence-item research with writer-ready phrasing
    """

    prompt_file = "evidence_researcher_prompt_v0317.md"

    def run(self, state: Any, **kwargs) -> dict:
        """Run evidence research from state object (used by orchestrator)."""
        outline_text = state.screen_outline or ""
        story_brief = state.story_brief or {}
        project_id = getattr(state, "project_id", None)
        return self.research(outline_text, story_brief, project_id=project_id)

    def research(
        self,
        outline_text: str,
        story_brief: dict,
        model: str = None,
        project_id: str = None,
    ) -> dict:
        """
        Generate storyboard-ready evidence research for an outline.

        Args:
            outline_text: Plain text outline from Director
            story_brief: Story brief dict with fields
            model: Optional model override
            project_id: Optional project ID for RAG retrieval

        Returns:
            {
                "sections": [
                    {
                        "section_title": "Section 1 — ...",
                        "evidence_items": [
                            {
                                "evidence_needed": "...",
                                "research_blocks": [
                                    {
                                        "research_question": "...",
                                        "storyboard_usable_phrasing": ["...", "..."],
                                        "full_answer": "...",
                                        "sources": ["..."],
                                        "confidence": "high|medium|low"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        """
        if not outline_text or not outline_text.strip():
            return {"sections": []}

        # Extract brief context
        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome")
        target_audience = self._extract_brief_field(story_brief, "target_audience")

        # Retrieve RAG context if project has documents
        rag_context = self._get_rag_context(outline_text, project_id)

        # Build prompt
        rag_section = ""
        if rag_context:
            rag_section = f"""
## USER-PROVIDED REFERENCE MATERIALS
The following excerpts are from documents uploaded by the user. Prioritize information from these sources when relevant, and cite them as "User-provided: [source name]".

{rag_context}
"""

        prompt = f"""Analyze this video outline and generate storyboard-ready research for each section's evidence items.

## VIDEO CONTEXT
Viewer outcome: {viewer_outcome}
Target audience: {target_audience}
{rag_section}
## OUTLINE
{outline_text}

Return JSON following the schema in your system prompt. For each section, research every evidence item and produce usable phrasing the writer can directly lift into the storyboard."""

        kwargs_llm = {"max_tokens": 8000, "temperature": 0.4}
        if model:
            kwargs_llm["model"] = model

        response = self.call_llm(prompt, **kwargs_llm)
        parsed = self._extract_json(response)

        if not parsed or not isinstance(parsed, dict):
            return {"sections": []}

        sections = parsed.get("sections", [])
        if not isinstance(sections, list):
            return {"sections": []}

        return {"sections": sections}

    def _get_rag_context(self, outline_text: str, project_id: str = None) -> str:
        """Retrieve relevant chunks from user-uploaded documents via RAG.

        Returns formatted context string, or empty string if no documents.
        """
        if not project_id:
            return ""

        try:
            from app.services.rag.store import RAGStore
            store = RAGStore(project_id)

            if store.chunk_count == 0:
                return ""

            # Extract key topics from outline for retrieval
            # Use the first 500 chars of outline as a broad query
            query = outline_text[:500]
            results = store.query(query, top_k=10)

            if not results:
                return ""

            # Format retrieved chunks
            lines = []
            for r in results:
                source = r.get("source", "unknown")
                text = r.get("text", "")
                lines.append(f"[Source: {source}]\n{text}")

            return "\n\n---\n\n".join(lines)

        except Exception:
            # RAG is optional — don't fail the whole research if it errors
            return ""

    def _extract_brief_field(self, story_brief: dict, field_name: str) -> str:
        """Extract a field value from story_brief's nested fields structure."""
        if not story_brief:
            return ""
        # Handle both flat dict (eval pipeline) and nested fields structure
        if field_name in story_brief:
            val = story_brief[field_name]
            return str(val) if val else ""
        fields = story_brief.get("fields", {})
        field = fields.get(field_name, {})
        if isinstance(field, dict):
            return field.get("value", "")
        return str(field) if field else ""
