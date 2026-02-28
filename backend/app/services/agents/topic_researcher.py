"""
Topic Researcher Agent - Gathers context about company/product/industry.
Returns research data with verified information for other agents.

Now supports angle-based research with duration scaling.
"""

import json
from pathlib import Path
from typing import Any, Optional, List

from .base import BaseAgent


# Question templates organized by audience level
QUESTION_TEMPLATES = {
    "beginner": [
        "What are the main {topic} options or paths available?",
        "What is the realistic distribution or frequency of different {topic} outcomes?",
        "What is one clear recent example ({year}) for each {topic} option?",
        "What are the most common misconceptions about {topic}?",
        "What should a beginner do first when approaching {topic}?",
    ],
    "intermediate": [
        "What decision framework should someone use for {topic}?",
        "What metrics or signals indicate the right choice for {topic}?",
        "What are the most common mistakes to avoid with {topic}?",
        "What should you do 6-12 months before {key_action}?",
        "What do experts and insiders say about {topic} in {year}?",
        "What recent examples ({year}) illustrate different approaches to {topic}?",
        "What preparation steps are most often overlooked for {topic}?",
    ],
    "advanced": [
        "What changed about {topic} in {year} compared to previous years?",
        "What are the second-order effects of {topic} that most people miss?",
        "What do the actual deal terms and mechanics look like for {topic}?",
        "What data or statistics support or contradict common advice about {topic}?",
        "What regulatory or market forces are shifting around {topic}?",
        "What do contrarian experts argue about {topic}?",
        "What are detailed case studies ({year}) with disclosed specifics about {topic}?",
        "What insider knowledge separates experts from amateurs on {topic}?",
        "What are the edge cases and exceptions to common {topic} advice?",
        "What emerging trends will reshape {topic} in the next 1-2 years?",
        "How do different stakeholders view {topic} differently?",
        "What are the most valuable but least discussed aspects of {topic}?",
    ],
}


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

    # =========================================================================
    # Angle-Based Research Methods
    # =========================================================================

    def calculate_angle(
        self,
        audience: str,
        description: str,
        duration_minutes: int,
        primary_goal: Optional[str] = None
    ) -> dict:
        """
        Calculate research angle from Round 1 confirmed fields.

        Args:
            audience: Target audience description
            description: Video description/topic
            duration_minutes: Video duration in minutes
            primary_goal: Optional key takeaway (extracted from description if not provided)

        Returns:
            Angle dict with audienceLevel, keyTakeaway, durationTier, questions
        """
        # Infer audience level
        audience_level = self._infer_audience_level(audience, description)

        # Extract key takeaway if not provided
        key_takeaway = primary_goal or self._extract_key_takeaway(description)

        # Determine duration tier and question count
        duration_tier, question_count = self._get_duration_config(duration_minutes)

        # Extract topic from description (simplified version)
        topic = self._extract_topic(description)

        # Select research questions based on angle
        questions = self.select_research_questions(
            audience_level=audience_level,
            key_takeaway=key_takeaway,
            topic=topic,
            count=question_count
        )

        return {
            "audienceLevel": audience_level,
            "keyTakeaway": key_takeaway,
            "durationTier": duration_tier,
            "durationMinutes": duration_minutes,
            "plannedQuestions": question_count,
            "questions": questions,
            "topic": topic,
        }

    def _infer_audience_level(self, audience: str, description: str) -> str:
        """
        Infer audience expertise level from audience description and video description.

        Returns: "beginner", "intermediate", or "advanced"
        """
        text = f"{audience} {description}".lower()

        # Advanced indicators
        advanced_keywords = [
            "expert", "advanced", "professional", "executive", "c-suite",
            "technical deep", "in-depth", "comprehensive", "detailed mechanics",
            "industry veteran", "experienced", "sophisticated", "nuanced"
        ]
        if any(kw in text for kw in advanced_keywords):
            return "advanced"

        # Beginner indicators
        beginner_keywords = [
            "beginner", "introduction", "basics", "getting started", "101",
            "first-time", "new to", "unfamiliar", "no experience", "novice",
            "just starting", "fundamentals", "overview", "primer"
        ]
        if any(kw in text for kw in beginner_keywords):
            return "beginner"

        # Default to intermediate
        return "intermediate"

    def _extract_key_takeaway(self, description: str) -> str:
        """
        Extract the primary takeaway/focus from the video description.
        Uses simple heuristics; could be enhanced with LLM if needed.
        """
        # Look for explicit goal phrases
        goal_phrases = ["how to", "learn about", "understand", "discover", "master"]
        desc_lower = description.lower()

        for phrase in goal_phrases:
            if phrase in desc_lower:
                # Extract from the phrase onwards (include the phrase for context)
                idx = desc_lower.index(phrase)
                remainder = description[idx:].strip()
                # Take first sentence or clause
                for end in [".", ",", ";", "!", "?"]:
                    if end in remainder:
                        return remainder[:remainder.index(end)].strip()
                return remainder[:100].strip() if len(remainder) > 100 else remainder

        # Fall back to first sentence or first 100 chars
        if "." in description:
            return description[:description.index(".")].strip()
        return description[:100].strip() if len(description) > 100 else description

    def _extract_topic(self, description: str) -> str:
        """
        Extract the main topic from the description.
        Simple extraction; could be enhanced with NLP.
        """
        # Remove common filler words and get the core topic
        stop_phrases = [
            "i want to", "we want to", "create a video about",
            "make a video on", "video about", "video on",
            "help me with", "explain", "discuss"
        ]

        topic = description.lower()
        for phrase in stop_phrases:
            topic = topic.replace(phrase, "")

        # Clean up and capitalize
        topic = topic.strip().strip(".,!?")

        # If too short or too long, use original
        if len(topic) < 5:
            topic = description[:50]
        elif len(topic) > 80:
            # Try to find a natural break
            if "," in topic[:80]:
                topic = topic[:topic.index(",")]
            else:
                topic = topic[:80]

        return topic.strip()

    def _get_duration_config(self, duration_minutes: int) -> tuple:
        """
        Get duration tier and question count based on video length.

        Returns: (duration_tier, question_count)
        """
        if duration_minutes <= 5:
            return ("short", 4)
        elif duration_minutes <= 15:
            return ("medium", 7)
        else:
            # Scale up for longer videos, max 12
            count = min(12, 4 + duration_minutes // 3)
            return ("long", count)

    def select_research_questions(
        self,
        audience_level: str,
        key_takeaway: str,
        topic: str,
        count: int,
        year: str = "2026"
    ) -> List[str]:
        """
        Select and format research questions based on angle.

        Args:
            audience_level: "beginner", "intermediate", or "advanced"
            key_takeaway: The primary focus/action of the video
            topic: The main topic being discussed
            count: Number of questions to generate
            year: Current year for time-sensitive questions

        Returns:
            List of formatted research questions
        """
        templates = QUESTION_TEMPLATES.get(audience_level, QUESTION_TEMPLATES["intermediate"])

        questions = []
        for i, template in enumerate(templates):
            if i >= count:
                break

            # Format the template with actual values
            question = template.format(
                topic=topic,
                key_action=key_takeaway,
                year=year
            )
            questions.append(question)

        return questions

    def run_with_angle(self, state: Any, angle: dict, **kwargs) -> dict:
        """
        Run research using angle-based questions instead of generic research.

        Args:
            state: StoryboardState with intake_form
            angle: Angle dict from calculate_angle()

        Returns:
            research_data dict with findings organized by question
        """
        if not state.intake_form:
            raise ValueError("TopicResearcher requires intake_form in state")

        questions = angle.get("questions", [])
        if not questions:
            # Fall back to regular research
            return self.run(state, **kwargs)

        # Process user inputs
        project_id = getattr(state, 'project_id', None)
        user_inputs = self._process_user_inputs(state.intake_form, project_id)

        # Build research prompt with specific questions
        user_prompt = self._build_angle_research_prompt(
            intake_form=state.intake_form,
            questions=questions,
            angle=angle
        )

        # Call LLM
        response = self.call_llm(user_prompt, max_tokens=4000)

        # Parse response
        research_data = self._parse_angle_research(response, questions)
        research_data["user_inputs"] = user_inputs
        research_data["angle"] = angle

        return research_data

    def _build_angle_research_prompt(
        self,
        intake_form: dict,
        questions: List[str],
        angle: dict
    ) -> str:
        """Build research prompt with specific questions based on angle."""
        company = intake_form.get("company_or_brand_name", "")
        topic = angle.get("topic", intake_form.get("video_goal", ""))
        audience_level = angle.get("audienceLevel", "intermediate")

        questions_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))

        return f"""Research the following topic for a video storyboard:

TOPIC: {topic}
COMPANY/PRODUCT: {company}
AUDIENCE LEVEL: {audience_level}

Please research and answer these specific questions:

{questions_text}

For each question:
1. Provide a clear, factual answer
2. Include specific examples, data, or statistics where available
3. Note any uncertainties with [uncertain: ...]
4. Cite sources where possible

Return your research as a JSON object with this structure:
{{
    "answers": [
        {{
            "question": "the question",
            "answer": "your research findings",
            "examples": ["relevant examples"],
            "sources": ["source references"],
            "confidence": "high/medium/low"
        }}
    ],
    "key_insights": ["main takeaways"],
    "uncertainties": ["things you couldn't verify"]
}}"""

    def _parse_angle_research(self, response: str, questions: List[str]) -> dict:
        """Parse angle-based research response."""
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return {
                "answers": parsed.get("answers", []),
                "key_insights": parsed.get("key_insights", []),
                "uncertainties": parsed.get("uncertainties", []),
                "raw_response": response if not parsed.get("answers") else None
            }

        # Fallback: create basic structure from response text
        return {
            "answers": [
                {
                    "question": q,
                    "answer": "",
                    "examples": [],
                    "sources": [],
                    "confidence": "low"
                }
                for q in questions
            ],
            "key_insights": [],
            "uncertainties": ["Could not parse structured response"],
            "raw_response": response
        }
