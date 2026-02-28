"""
Topic Researcher Agent - Gathers context about company/product/industry.
Returns research data with verified information for other agents.
"""

import json
from pathlib import Path
from typing import Any, Optional

from .base import BaseAgent


class TopicResearcher(BaseAgent):
    """
    Research agent that gathers context about the video subject.

    Input: intake_form with company/product information
    Output: research_data dict with structured research findings
    """

    prompt_file = "TOPIC_RESEARCHER_SYSTEM_PROMPT.md"

    def run(self, state: Any, **kwargs) -> dict:
        """
        Research the topic and return research data.

        Args:
            state: StoryboardState with intake_form

        Returns:
            research_data dict with:
            - company_context
            - product_context
            - industry_context
            - terminology_glossary
            - typical_workflows
            - uncertainties
            - user_inputs (processed user inputs with parsed materials)
        """
        if not state.intake_form:
            raise ValueError("TopicResearcher requires intake_form in state")

        # Process user inputs (original prompt + uploaded files + fetched links)
        project_id = getattr(state, 'project_id', None)
        user_inputs = self._process_user_inputs(state.intake_form, project_id)

        # Build the user prompt from intake form
        user_prompt = self._build_research_prompt(state.intake_form)

        # Call LLM
        response = self.call_llm(user_prompt)

        # Parse the response
        research_data = self._parse_research_data(response)

        # Add processed user inputs to research data
        research_data["user_inputs"] = user_inputs

        return research_data

    def _build_research_prompt(self, intake_form: dict) -> str:
        """Build the research request prompt from intake form."""
        company = intake_form.get("company_or_brand_name", "Unknown Company")
        video_goal = intake_form.get("video_goal", "")
        target_audience = intake_form.get("target_audience", "")
        video_type = intake_form.get("video_type", "")
        user_inputs = intake_form.get("user_inputs", "")

        return f"""Research the following for a video storyboard:

COMPANY/PRODUCT: {company}

VIDEO GOAL: {video_goal}

TARGET AUDIENCE: {target_audience}

VIDEO TYPE: {video_type}

USER PROVIDED INFORMATION:
{user_inputs}

Please research and return a Context Pack with:
1. Company context (background, mission, positioning)
2. Product context (what it does, key differentiators)
3. Industry context (market trends, standards)
4. Terminology glossary (key terms with definitions)
5. Typical workflows (traditional process vs optimized with product)
6. Uncertainties (anything you couldn't verify)

Return the Context Pack as a valid JSON object."""

    def _parse_research_data(self, response: str) -> dict:
        """Parse the LLM response into research data."""
        # Try to extract JSON
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return self._normalize_research_data(parsed)

        # If JSON extraction failed, create a basic pack from the response
        return {
            "company_context": response[:500] if len(response) > 500 else response,
            "product_context": "",
            "industry_context": "",
            "terminology_glossary": {},
            "typical_workflows": {
                "traditional_process": "",
                "optimized_process": ""
            },
            "key_value_propositions": {},
            "uncertainties": ["[uncertain: Could not parse structured response]"],
            "raw_research": response
        }

    def _normalize_research_data(self, data: dict) -> dict:
        """Ensure research data has all required fields."""
        default_data = {
            "company_context": "",
            "product_context": "",
            "industry_context": "",
            "terminology_glossary": {},
            "typical_workflows": {
                "traditional_process": "",
                "optimized_process": ""
            },
            "key_value_propositions": {},
            "target_decision_makers": {},
            "technology_context": {},
            "uncertainties": []
        }

        # Merge provided data with defaults
        for key, default_value in default_data.items():
            if key not in data:
                data[key] = default_value

        # Ensure typical_workflows has required structure
        if isinstance(data.get("typical_workflows"), str):
            data["typical_workflows"] = {
                "traditional_process": data["typical_workflows"],
                "optimized_process": ""
            }

        return data

    def _process_user_inputs(self, intake_form: dict, project_id: Optional[str]) -> dict:
        """
        Process and compact user inputs from various sources.

        Args:
            intake_form: The intake form with user-provided information
            project_id: Project ID to locate uploaded files and links

        Returns:
            dict with original_prompt, video_type, and parsed_materials
        """
        result = {
            "original_prompt": intake_form.get("user_inputs", ""),
            "video_type": intake_form.get("video_type", ""),
            "video_goal": intake_form.get("video_goal", ""),
            "target_audience": intake_form.get("target_audience", ""),
            "company_or_brand_name": intake_form.get("company_or_brand_name", ""),
            "parsed_materials": []
        }

        if not project_id:
            return result

        # Find project directory
        project_dir = Path(f"data/project_{project_id}")
        if not project_dir.exists():
            return result

        # Process uploaded PDFs
        uploads_dir = project_dir / "uploads"
        if uploads_dir.exists():
            for pdf_file in uploads_dir.glob("*.pdf"):
                content = self._extract_pdf_text(pdf_file)
                if content:
                    compacted = self._compact_if_needed(content, source_name=pdf_file.name)
                    result["parsed_materials"].append({
                        "type": "pdf",
                        "name": pdf_file.name,
                        "content": compacted
                    })

            # Also process text files in uploads
            for txt_file in uploads_dir.glob("*.txt"):
                content = txt_file.read_text(encoding="utf-8", errors="ignore")
                if content:
                    compacted = self._compact_if_needed(content, source_name=txt_file.name)
                    result["parsed_materials"].append({
                        "type": "text",
                        "name": txt_file.name,
                        "content": compacted
                    })

        # Process fetched links (stored as text files)
        links_dir = project_dir / "links"
        if links_dir.exists():
            for link_file in links_dir.glob("*.txt"):
                content = link_file.read_text(encoding="utf-8", errors="ignore")
                if content:
                    compacted = self._compact_if_needed(content, source_name=link_file.stem)
                    result["parsed_materials"].append({
                        "type": "url",
                        "name": link_file.stem,
                        "content": compacted
                    })

        return result

    def _extract_pdf_text(self, pdf_path: Path) -> str:
        """
        Extract text content from a PDF file.

        Args:
            pdf_path: Path to the PDF file

        Returns:
            Extracted text content or empty string if extraction fails
        """
        try:
            # Try using PyPDF2 first
            try:
                import PyPDF2
                with open(pdf_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    text_parts = []
                    for page in reader.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                    return "\n\n".join(text_parts)
            except ImportError:
                pass

            # Fallback to pdfplumber
            try:
                import pdfplumber
                with pdfplumber.open(pdf_path) as pdf:
                    text_parts = []
                    for page in pdf.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                    return "\n\n".join(text_parts)
            except ImportError:
                pass

            # If no PDF library is available, return empty
            return ""

        except Exception as e:
            print(f"Error extracting PDF text from {pdf_path}: {e}")
            return ""

    def _compact_if_needed(self, content: str, max_words: int = 2000, source_name: str = "") -> str:
        """
        Summarize content if too long, preserving key information.

        Uses LLM-based compaction as recommended by Anthropic's context engineering approach:
        finding the smallest possible set of high-signal tokens.

        Args:
            content: The content to potentially compact
            max_words: Maximum word count before compaction is triggered
            source_name: Name of the source for context in summarization

        Returns:
            Original content if short enough, or summarized version
        """
        word_count = len(content.split())

        if word_count <= max_words:
            return content

        # Use LLM to summarize, preserving key facts
        prompt = f"""Summarize the following content from "{source_name}", preserving:
- Key facts, statistics, and numbers
- Important quotes or statements
- Main concepts and ideas
- Any actionable information

Content to summarize:
{content[:12000]}

Provide a concise summary (under 500 words) that captures the essential information for creating a video storyboard."""

        try:
            summary = self.call_llm(prompt, max_tokens=1000)
            return f"[Summarized from {word_count} words]\n\n{summary}"
        except Exception as e:
            # If LLM call fails, truncate with note
            truncated = " ".join(content.split()[:max_words])
            return f"[Truncated from {word_count} words]\n\n{truncated}..."
