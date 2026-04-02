"""
Evidence Researcher Agent — storyboard-ready research for video outline sections.

Three-step research flow for per-section research:
1. LLM generates research questions from section content
2. Google Search finds real URLs + snippets; expert query for demo sections
3. LLM synthesizes storyboard-usable phrasing from real search results

Knowledge sources:
1. Google Custom Search API (real URLs, real snippets)
2. Expert query to Claude Sonnet (for demo sections — practical tool advice)
3. RAG retrieval from user-uploaded documents (when project has documents)
4. LLM training knowledge (fallback only when search returns nothing)

Data model: evidence_needed → research_question → full_answer → storyboard_usable_phrasing[]
"""

import json
from typing import Any, Optional, List, Dict

from .base import BaseAgent


class EvidenceResearcher(BaseAgent):
    """
    Generates storyboard-ready evidence research from LLM knowledge + optional RAG.

    Input: outline text + brief context + optional project_id (for RAG)
    Output: per-section, per-evidence-item research with writer-ready phrasing
    """

    prompt_file = "evidence_researcher_prompt_v0324.md"

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

        prompt = f"""Analyze this video outline and generate storyboard-ready research for each section's claims and talking points.

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

    def research_section(
        self,
        section_text: str,
        full_outline: str,
        story_brief: dict,
        project_id: str = None,
    ) -> dict:
        """
        Research a single section using a three-step process:
        1. LLM generates research questions from the section
        2. Google Search finds real URLs + snippets; expert query for demo sections
        3. LLM synthesizes storyboard-usable phrasing from real search results

        Returns:
            A single SectionResearch dict:
            {"section_title": "...", "evidence_items": [...]}
        """
        if not section_text or not section_text.strip():
            return {"section_title": "", "evidence_items": []}

        viewer_outcome = self._extract_brief_field(story_brief, "viewer_outcome")
        target_audience = self._extract_brief_field(story_brief, "target_audience")
        is_demo = "[DEMO RECOMMENDED]" in section_text

        # --- Step 1: Generate research questions ---
        questions = self._generate_research_questions(section_text, target_audience, is_demo)

        # --- Step 2: Gather real source material ---
        # 2a: Google Search for each question
        search_results = self._search_for_questions(questions)

        # 2b: Expert query for demo sections
        expert_response = ""
        if is_demo:
            expert_response = self._query_demo_expert(section_text, target_audience)

        # 2c: RAG context
        rag_context = self._get_rag_context(full_outline, project_id)

        # --- Step 3: Synthesize from real sources ---
        source_material = self._format_source_material(search_results, expert_response, rag_context)

        prompt = f"""Here is the full video outline for context:

## VIDEO CONTEXT
Viewer outcome: {viewer_outcome}
Target audience: {target_audience}

## FULL OUTLINE (for context only)
{full_outline}

## SOURCE MATERIAL
The following is REAL source material gathered from web search, expert queries, and uploaded documents.
You MUST cite from these sources. Every source has a real URL — include it in your citation.
Do NOT invent sources, URLs, statistics, or document names. Only cite what is provided below.
If the source material doesn't cover something, say so — do not fabricate.

{source_material}

## RESEARCH TASK
Research ONLY the following section. Do NOT research other sections.

{section_text}

Return a JSON object with this exact structure:
{{
  "section_title": "the section title",
  "evidence_items": [
    {{
      "evidence_needed": "what evidence is needed",
      "research_blocks": [
        {{
          "research_question": "specific research question",
          "storyboard_usable_phrasing": ["ready-to-use phrasing 1 [1]", "ready-to-use phrasing 2 [2]"],
          "full_answer": "detailed answer synthesized from the source material",
          "sources": ["[1] Source Title — URL", "[2] Source Title — URL"],
          "confidence": "high|medium|low"
        }}
      ]
    }}
  ]
}}"""

        response = self.call_llm(prompt, max_tokens=2000, temperature=0.4)
        parsed = self._extract_json(response)

        if not parsed or not isinstance(parsed, dict):
            return {"section_title": "", "evidence_items": []}

        return {
            "section_title": parsed.get("section_title", ""),
            "evidence_items": parsed.get("evidence_items", []),
        }

    # ---- Step 1: Generate research questions ----

    def _generate_research_questions(self, section_text: str, target_audience: str, is_demo: bool) -> List[str]:
        """Ask LLM to generate 2-4 specific research questions for this section."""
        demo_guidance = ""
        if is_demo:
            demo_guidance = """This is a [DEMO RECOMMENDED] section. Generate questions about:
- Practical how-to steps and prompts for this demo
- Best practices that should inform the prompt/workflow
- Tool-specific tips and features relevant to the audience
Do NOT generate questions about whether the tool works or generic capability descriptions."""

        prompt = f"""Given this video section, generate 2-4 specific research questions that I should Google to find real sources for the storyboard.

Target audience: {target_audience}
{demo_guidance}

Section:
{section_text}

Return ONLY a JSON array of question strings, nothing else. Example:
["question 1", "question 2", "question 3"]"""

        try:
            response = self.call_llm(
                prompt,
                max_tokens=500,
                temperature=0.3,
                system_prompt_override="You generate specific, searchable research questions. Return only a JSON array of strings.",
            )
            parsed = self._extract_json(response)
            if isinstance(parsed, list):
                return [q for q in parsed if isinstance(q, str)][:4]
        except Exception as e:
            print(f"[EvidenceResearcher] Question generation failed: {e}")

        # Fallback: extract title as a single question
        for line in section_text.strip().split("\n"):
            if line.strip().startswith("Section") and "—" in line:
                title = line.split("—", 1)[1].strip()
                title = title.replace("[DEMO RECOMMENDED]", "").replace("[PIVOT]", "").replace("[SHOW REAL EXAMPLE]", "").replace("[LIMITATION]", "").strip()
                return [title]
        return []

    # ---- Step 2a: Google Search ----

    def _search_for_questions(self, questions: List[str]) -> List[Dict]:
        """Run Google Search for each question, return combined results."""
        try:
            from app.utils.web_search import search_web
        except ImportError:
            print("[EvidenceResearcher] web_search not available")
            return []

        all_results = []
        for question in questions:
            try:
                results = search_web(question, num_results=3)
                for r in results:
                    r["query"] = question  # tag which question found this
                all_results.extend(results)
            except Exception as e:
                print(f"[EvidenceResearcher] Search failed for '{question}': {e}")

        # Deduplicate by URL
        seen_urls = set()
        unique = []
        for r in all_results:
            url = r.get("link", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique.append(r)

        return unique

    # ---- Step 2b: Expert query for demo sections ----

    def _query_demo_expert(self, section_text: str, target_audience: str) -> str:
        """Ask Claude Sonnet a practical question about the demo topic."""
        title_line = ""
        for line in section_text.strip().split("\n"):
            if line.strip().startswith("Section") and "—" in line:
                title_line = line.split("—", 1)[1].strip()
                title_line = title_line.replace("[DEMO RECOMMENDED]", "").replace("[SHOW REAL EXAMPLE]", "").strip()
                break
        if not title_line:
            title_line = section_text[:200]

        talking_points = []
        in_tp = False
        for line in section_text.split("\n"):
            if "Talking points" in line:
                in_tp = True
                continue
            if in_tp and line.strip().startswith("- "):
                talking_points.append(line.strip()[2:])
            elif in_tp and not line.strip().startswith("- ") and line.strip():
                in_tp = False

        tp_context = ""
        if talking_points:
            tp_context = "\n\nThe demo should specifically cover:\n" + "\n".join(f"- {tp}" for tp in talking_points)

        expert_prompt = f"""I'm creating a video tutorial for {target_audience or 'non-technical professionals'}.

I need practical, specific advice for this demo: {title_line}{tp_context}

Please provide:
1. The exact prompts/commands a viewer should use (quotable as on-screen text)
2. What the output looks like and common first-attempt issues
3. Specific iteration prompts to refine the output
4. Best practices and tips — especially non-obvious tricks
5. Any relevant tool features, integrations, or capabilities the audience should know about

Be specific and practical. Include real documentation URLs where possible. Never fabricate URLs — if unsure, describe where to find the info instead."""

        try:
            response = self.call_llm(
                expert_prompt,
                max_tokens=2000,
                temperature=0.3,
                system_prompt_override="You are a practical expert. Give specific, actionable advice with real documentation URLs when possible. Never fabricate URLs or source names.",
            )
            return response
        except Exception as e:
            print(f"[EvidenceResearcher] Expert query failed: {e}")
            return ""

    # ---- Step 3 helper: Format source material ----

    def _format_source_material(self, search_results: List[Dict], expert_response: str, rag_context: str) -> str:
        """Format all gathered sources into a single context block for the synthesis LLM call."""
        sections = []

        # Google search results
        if search_results:
            lines = ["### Web Search Results\n"]
            for i, r in enumerate(search_results, 1):
                title = r.get("title", "")
                snippet = r.get("snippet", "")
                url = r.get("link", "")
                lines.append(f"**[{i}] {title}**")
                lines.append(f"URL: {url}")
                lines.append(f"Snippet: {snippet}")
                lines.append("")
            sections.append("\n".join(lines))

        # Expert query response
        if expert_response:
            sections.append(f"### Expert Query Response (Claude Sonnet)\nCite as: \"Claude Sonnet, practical usage guidance\"\nAlso cite any URLs mentioned within this response.\n\n{expert_response}")

        # RAG context
        if rag_context:
            sections.append(f"### User-Uploaded Reference Materials\nCite as: \"User-provided: [source name]\"\n\n{rag_context}")

        if not sections:
            return "(No source material found. Use your training knowledge as a fallback, but mark confidence as 'low' and note that sources need verification.)"

        return "\n\n---\n\n".join(sections)

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
