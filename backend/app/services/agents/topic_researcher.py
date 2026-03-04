"""
Topic Researcher Agent - Perspective-first research for Knowledge Share videos.

Flow:
1. generate_perspectives() - Generate 3 POV options from Round 1 fields
2. generate_talking_points() - Create talking points based on selected perspective
3. generate_research_questions() - Craft questions for all Round 3 fields
4. research_questions() - Search for evidence (RAG first, API fallback)
"""

import json
from pathlib import Path
from typing import Any, Optional, List

from .base import BaseAgent


class TopicResearcher(BaseAgent):
    """
    Perspective-first research agent for Knowledge Share videos.

    Interactive flow:
    - User confirms Round 1 → generate 3 perspectives
    - User selects perspective → generate talking points
    - User confirms talking points → research evidence
    - Output populates Round 3 fields + detailed research for writing
    """

    prompt_file = "TOPIC_RESEARCHER_SYSTEM_PROMPT.md"

    # =========================================================================
    # Step 1: Generate Perspectives
    # =========================================================================

    def generate_perspectives(self, confirmed_fields: dict) -> dict:
        """
        Generate 3 contrarian POV options based on Round 1 fields.

        Args:
            confirmed_fields: Confirmed fields from Round 1
                - target_audience, duration, primary_goal, audience_level, etc.

        Returns:
            {
                "perspectives": [
                    {"id": 1, "statement": "...", "hook": "Why this matters"},
                    {"id": 2, "statement": "...", "hook": "..."},
                    {"id": 3, "statement": "...", "hook": "..."}
                ]
            }
        """
        # Extract field values
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")
        one_big_thing = self._get_field_value(confirmed_fields, "one_big_thing", "")
        audience_level = self._get_field_value(
            confirmed_fields, "audience_level", "intermediate"
        )
        duration = self._get_field_value(confirmed_fields, "duration", "300")

        prompt = f"""Generate 3 potential perspectives for a Knowledge Share video.

## ROUND 1 CONTEXT
Target Audience: {target_audience}
Primary Goal: {primary_goal}
One Big Thing: {one_big_thing}
Audience Level: {audience_level}
Duration: {duration} seconds

## PERSPECTIVE PRINCIPLES

A compelling perspective:
1. **Contrarian**: Challenges what audience currently believes
2. **Specific**: Names the cohort and context (not "marketers" but "B2B SaaS marketers in 2026")
3. **Actionable**: Sets up what the video will teach
4. **Fresh**: Not obvious advice everyone already knows

## PERSPECTIVE FORMULA

"For [specific cohort], [topic] in [year/context] is not about [old framing]; it's about [new reality/constraint]."

## EXAMPLES

Good perspectives:
- "For first-time founders, startup exits in 2026 aren't about finding a buyer; they're about surviving the 18-month dead zone between Series A and profitability."
- "B2B marketers don't need more content; they need fewer, better pieces their SDRs actually use in outreach."

Bad perspectives (too generic):
- "Marketing is changing"
- "Founders should plan ahead"

## OUTPUT FORMAT

Return a JSON object with exactly 3 perspectives:
{{
    "perspectives": [
        {{
            "id": 1,
            "statement": "For [audience], [topic] in 2026 isn't about [old]; it's about [new]",
            "hook": "Why this matters for {target_audience}"
        }},
        {{
            "id": 2,
            "statement": "...",
            "hook": "..."
        }},
        {{
            "id": 3,
            "statement": "...",
            "hook": "..."
        }}
    ]
}}

Each perspective should be distinct and offer a different angle on the topic."""

        response = self.call_llm(prompt, max_tokens=1500, temperature=0.8)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict) and "perspectives" in parsed:
            return parsed

        # Fallback
        return {
            "perspectives": [
                {
                    "id": 1,
                    "statement": f"For {target_audience}, {primary_goal or one_big_thing} requires rethinking conventional approaches.",
                    "hook": "A fresh perspective on an important topic",
                },
                {
                    "id": 2,
                    "statement": f"Most {target_audience} misunderstand the key factors in {primary_goal or one_big_thing}.",
                    "hook": "Common misconceptions revealed",
                },
                {
                    "id": 3,
                    "statement": f"The hidden factor in {primary_goal or one_big_thing} that experts know but rarely share.",
                    "hook": "Insider knowledge",
                },
            ]
        }

    # =========================================================================
    # Step 2: Generate Talking Points
    # =========================================================================

    def generate_talking_points(
        self, perspective: str, confirmed_fields: dict, feedback: Optional[str] = None
    ) -> list:
        """
        Generate core talking points based on the selected perspective.

        Args:
            perspective: The selected perspective statement
            confirmed_fields: Confirmed fields from Round 1
            feedback: Optional user feedback to incorporate

        Returns:
            List of talking point strings
        """
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        audience_level = self._get_field_value(
            confirmed_fields, "audience_level", "intermediate"
        )
        duration = int(self._get_field_value(confirmed_fields, "duration", "300"))

        # Calculate number of talking points based on duration
        num_points = self._calculate_talking_points_count(duration)

        feedback_section = ""
        if feedback:
            feedback_section = f"""
## USER FEEDBACK
The user provided this feedback on a previous version:
{feedback}

Please incorporate this feedback into the talking points.
"""

        prompt = f"""Generate {num_points} core talking points that support this perspective.

## PERSPECTIVE
{perspective}

## CONTEXT
Target Audience: {target_audience}
Audience Level: {audience_level}
Duration: {duration} seconds
{feedback_section}
## TALKING POINTS PRINCIPLES

1. **Support the thesis**: Each point should reinforce the perspective
2. **Build progressively**: Start with foundation, build to insight
3. **Match audience level**: {audience_level} = {"foundational concepts, clear explanations" if audience_level == "beginner" else "application-focused, some nuance" if audience_level == "intermediate" else "edge cases, contrarian data, deep analysis"}

## OUTPUT FORMAT

Return a JSON array of exactly {num_points} talking points:
[
    "First talking point - clear and specific",
    "Second talking point - builds on the first",
    "Third talking point - adds depth or nuance"
]

Each talking point should be:
- A complete thought (not just a topic)
- Specific and actionable
- 10-20 words"""

        response = self.call_llm(prompt, max_tokens=1000, temperature=0.7)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, list):
            return parsed[:num_points]

        # Fallback
        return [
            "Understanding the key factors and options available",
            "Common mistakes and misconceptions to avoid",
            "Practical steps to take action on this topic",
        ][:num_points]

    def _calculate_talking_points_count(self, duration_seconds: int) -> int:
        """Calculate number of talking points based on video duration."""
        if duration_seconds <= 120:  # ≤2 min
            return 2
        elif duration_seconds <= 300:  # 2-5 min
            return 3
        elif duration_seconds <= 600:  # 5-10 min
            return 4
        else:  # 10+ min
            return 5

    # =========================================================================
    # Step 3: Generate Research Questions
    # =========================================================================

    def generate_research_questions(
        self, talking_points: list, confirmed_fields: dict
    ) -> dict:
        """
        Craft research questions for ALL Round 3 fields.

        Args:
            talking_points: Confirmed talking points
            confirmed_fields: Confirmed fields from Round 1

        Returns:
            {
                "talking_point_questions": [
                    {"talking_point": "...", "questions": ["Q1", "Q2"]}
                ],
                "misconception_questions": ["Q1", "Q2"],
                "takeaway_questions": ["Q1", "Q2"],
                "avoid_questions": ["Q1"]
            }
        """
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        audience_level = self._get_field_value(
            confirmed_fields, "audience_level", "intermediate"
        )
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")

        # Calculate questions per point based on audience level
        questions_per_point = self._calculate_questions_per_point(audience_level)

        talking_points_text = "\n".join(f"- {tp}" for tp in talking_points)

        prompt = f"""Generate research questions for a Knowledge Share video.

## TALKING POINTS
{talking_points_text}

## CONTEXT
Target Audience: {target_audience}
Audience Level: {audience_level}
Primary Goal: {primary_goal}

## RESEARCH QUESTION PRINCIPLES

Questions should:
1. **Seek evidence**: Look for statistics, data, or studies
2. **Find examples**: Look for case studies or real-world instances
3. **Match audience depth**:
   - Beginner: "What is X?" "How does X work?"
   - Intermediate: "What factors affect X?" "What are the tradeoffs?"
   - Advanced: "What are the edge cases?" "What's the contrarian view?"

## OUTPUT FORMAT

Return a JSON object:
{{
    "talking_point_questions": [
        {{
            "talking_point": "the talking point",
            "questions": ["Research question 1", "Research question 2"]
        }}
    ],
    "misconception_questions": [
        "What do most people get wrong about [topic]?",
        "What's the biggest myth about [topic]?"
    ],
    "takeaway_questions": [
        "What's the most actionable first step for {target_audience}?",
        "What deliverable or framework would help them apply this?"
    ],
    "avoid_questions": [
        "What topics or claims should be avoided in this video?"
    ]
}}

Generate {questions_per_point} questions per talking point."""

        response = self.call_llm(prompt, max_tokens=2000, temperature=0.6)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return parsed

        # Fallback
        return {
            "talking_point_questions": [
                {"talking_point": tp, "questions": [f"What evidence supports '{tp}'?"]}
                for tp in talking_points
            ],
            "misconception_questions": [
                f"What do most people get wrong about {primary_goal}?"
            ],
            "takeaway_questions": [
                f"What's the most actionable first step for {target_audience}?"
            ],
            "avoid_questions": ["What topics should be avoided?"],
        }

    def _calculate_questions_per_point(self, audience_level: str) -> int:
        """Calculate questions per talking point based on audience level."""
        level_map = {"beginner": 1, "intermediate": 2, "advanced": 3, "mixed": 2}
        return level_map.get(audience_level, 2)

    # =========================================================================
    # Step 4: Research Talking Points + Generate Round 3 Field Values
    # =========================================================================

    def research_questions(
        self,
        questions: dict,
        confirmed_fields: dict,
        user_materials: Optional[dict] = None,
    ) -> dict:
        """
        Research talking points extensively, generate simple values for other Round 3 fields.

        - Talking points: Deep research with question→answer→sources
        - Misconceptions/takeaway/avoid: LLM-generated values (no deep research yet)

        After user confirms Round 3, call misc_research() for deep research on those fields.

        Args:
            questions: Output from generate_research_questions()
            confirmed_fields: Confirmed fields from Round 1
            user_materials: Optional user-provided materials for RAG

        Returns:
            {
                "round3_fields": {
                    "core_talking_points": {...},
                    "misconceptions": {...},
                    "practical_takeaway": {...},
                    "must_avoid": {...}
                },
                "research_details": {
                    "talking_point_answers": [...]
                }
            }
        """
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")
        one_big_thing = self._get_field_value(confirmed_fields, "one_big_thing", "")

        # Build talking points research section
        talking_points_section = ""
        for tp_q in questions.get("talking_point_questions", []):
            talking_points_section += f"\n### Talking Point: {tp_q.get('talking_point', '')}\n"
            for q in tp_q.get("questions", []):
                talking_points_section += f"- {q}\n"

        # Include user materials if available
        materials_text = ""
        if user_materials and user_materials.get("parsed_materials"):
            materials_text = "\n\n## USER-PROVIDED MATERIALS\n"
            for material in user_materials["parsed_materials"]:
                materials_text += f"\n### {material.get('name', 'Source')}\n"
                materials_text += material.get("content", "")[:2000] + "\n"

        # Extract talking points for context
        talking_points = [
            tp_q.get("talking_point", "")
            for tp_q in questions.get("talking_point_questions", [])
        ]
        talking_points_list = "\n".join(f"- {tp}" for tp in talking_points)

        prompt = f"""Research and generate content for a Knowledge Share video.

## CONTEXT
Target Audience: {target_audience}
Primary Goal: {primary_goal}
One Big Thing: {one_big_thing}
{materials_text}

## PART 1: RESEARCH TALKING POINTS (Deep Research Required)

For each talking point below, research and provide detailed answers with sources.
{talking_points_section}

## PART 2: GENERATE ROUND 3 FIELD VALUES (No Deep Research - Just Generate)

Based on the topic and talking points, generate simple values for these fields:

Talking Points:
{talking_points_list}

## OUTPUT FORMAT

{{
    "talking_point_answers": [
        {{
            "talking_point": "the talking point text",
            "questions_and_answers": [
                {{
                    "question": "the research question",
                    "answer": "Detailed answer with paragraphs, bullet points, statistics...",
                    "sources": ["https://real-url.com/source1"]
                }}
            ]
        }}
    ],
    "misconceptions": [
        "Common misconception 1 that {target_audience} have about this topic",
        "Common misconception 2"
    ],
    "practical_takeaway": "One specific, actionable thing the viewer should do after watching",
    "must_avoid": [
        "Topic or claim to avoid (e.g., legal advice, specific predictions)"
    ]
}}

IMPORTANT:
- talking_point_answers: Do deep research, include real URLs
- misconceptions/practical_takeaway/must_avoid: Just generate sensible values based on the topic (these will be researched later after user confirmation)"""

        response = self.call_llm(prompt, max_tokens=4000, temperature=0.4)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return self._format_research_output(parsed, questions)

        return self._create_fallback_research_output(questions)

    def _format_research_output(self, research: dict, questions: dict) -> dict:
        """Format research results into Round 3 fields + detailed research."""
        # Extract talking points from the research answers
        talking_points = []
        for tp_answer in research.get("talking_point_answers", []):
            talking_points.append(tp_answer.get("talking_point", ""))

        # If no talking points from research, fall back to questions
        if not talking_points:
            talking_points = [
                tp_q.get("talking_point", "")
                for tp_q in questions.get("talking_point_questions", [])
            ]

        # Get simple generated values (not deeply researched yet)
        misconceptions = research.get("misconceptions", [])
        if isinstance(misconceptions, str):
            misconceptions = [misconceptions]

        practical_takeaway = research.get("practical_takeaway", "")
        if isinstance(practical_takeaway, list):
            practical_takeaway = practical_takeaway[0] if practical_takeaway else ""

        must_avoid = research.get("must_avoid", [])
        if isinstance(must_avoid, str):
            must_avoid = [must_avoid]

        return {
            "round3_fields": {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {
                    "value": misconceptions,
                    "source": "generated",  # Not researched yet
                    "confirmed": False,
                },
                "practical_takeaway": {
                    "value": practical_takeaway,
                    "source": "generated",  # Not researched yet
                    "confirmed": False,
                },
                "must_avoid": {
                    "value": must_avoid,
                    "source": "generated",  # Not researched yet
                    "confirmed": False,
                },
            },
            "research_details": {
                "talking_point_answers": research.get("talking_point_answers", []),
                # misconception/takeaway/avoid research added after Round 3 confirm
            },
        }

    # =========================================================================
    # Step 5: Research Misconceptions/Takeaway/Avoid (After Round 3 Confirm)
    # =========================================================================

    def misc_research(
        self,
        confirmed_round3: dict,
        confirmed_fields: dict,
        user_materials: Optional[dict] = None,
    ) -> dict:
        """
        Deep research on misconceptions, takeaway, and avoid after user confirms Round 3.

        Args:
            confirmed_round3: Confirmed Round 3 fields from user
                - misconceptions, practical_takeaway, must_avoid
            confirmed_fields: Confirmed fields from Round 1
            user_materials: Optional user-provided materials

        Returns:
            {
                "misconception_answers": [{question, answer, sources}],
                "takeaway_answers": [{question, answer, sources}],
                "avoid_answers": [{question, answer, sources}]
            }
        """
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")

        # Extract confirmed values
        misconceptions = self._get_field_value(confirmed_round3, "misconceptions", [])
        if isinstance(misconceptions, str):
            misconceptions = [misconceptions]

        practical_takeaway = self._get_field_value(confirmed_round3, "practical_takeaway", "")

        must_avoid = self._get_field_value(confirmed_round3, "must_avoid", [])
        if isinstance(must_avoid, str):
            must_avoid = [must_avoid]

        # Build research questions from confirmed values
        misconceptions_text = "\n".join(f"- {m}" for m in misconceptions) if misconceptions else "- None specified"
        must_avoid_text = "\n".join(f"- {a}" for a in must_avoid) if must_avoid else "- None specified"

        # Include user materials if available
        materials_text = ""
        if user_materials and user_materials.get("parsed_materials"):
            materials_text = "\n\n## USER-PROVIDED MATERIALS\n"
            for material in user_materials["parsed_materials"]:
                materials_text += f"\n### {material.get('name', 'Source')}\n"
                materials_text += material.get("content", "")[:2000] + "\n"

        prompt = f"""Research the following confirmed content for a Knowledge Share video.

## CONTEXT
Target Audience: {target_audience}
Primary Goal: {primary_goal}
{materials_text}

## MISCONCEPTIONS TO RESEARCH
{misconceptions_text}

For each misconception, research:
- Why do people believe this?
- What's the reality?
- What data/evidence contradicts this misconception?

## PRACTICAL TAKEAWAY TO RESEARCH
{practical_takeaway}

Research:
- How can the viewer implement this?
- What are the specific steps?
- Any tools, frameworks, or resources that help?

## TOPICS TO AVOID - RESEARCH WHY
{must_avoid_text}

Research:
- Why should this be avoided in the video?
- What expertise is required for this topic?
- What are the risks of including it?

## OUTPUT FORMAT

{{
    "misconception_answers": [
        {{
            "misconception": "the misconception text",
            "answer": "Detailed research on why people believe this and what the reality is...",
            "sources": ["https://real-url.com/source"]
        }}
    ],
    "takeaway_answers": [
        {{
            "takeaway": "{practical_takeaway}",
            "answer": "Detailed implementation guidance, steps, resources...",
            "sources": ["https://real-url.com/source"]
        }}
    ],
    "avoid_answers": [
        {{
            "topic": "the topic to avoid",
            "answer": "Why this should be avoided, what expertise is needed...",
            "sources": ["https://real-url.com/source"]
        }}
    ]
}}"""

        response = self.call_llm(prompt, max_tokens=3000, temperature=0.4)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return parsed

        # Fallback
        return {
            "misconception_answers": [],
            "takeaway_answers": [],
            "avoid_answers": [],
            "error": "Could not parse misc research response",
        }

    def _create_fallback_research_output(self, questions: dict) -> dict:
        """Create fallback output when research parsing fails."""
        talking_points = [
            tp_q.get("talking_point", "")
            for tp_q in questions.get("talking_point_questions", [])
        ]

        return {
            "round3_fields": {
                "core_talking_points": {
                    "value": talking_points,
                    "source": "inferred",
                    "confirmed": False,
                },
                "misconceptions": {"value": [], "source": "empty", "confirmed": False},
                "practical_takeaway": {
                    "value": "",
                    "source": "empty",
                    "confirmed": False,
                },
                "must_avoid": {"value": [], "source": "empty", "confirmed": False},
            },
            "research_details": {
                "talking_point_answers": [],
                "error": "Could not parse research response",
            },
        }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _get_field_value(self, fields: dict, key: str, default: str = "") -> str:
        """Extract value from field structure or plain dict."""
        field = fields.get(key, {})
        if isinstance(field, dict) and "value" in field:
            return str(field["value"])
        return str(field) if field else default

    def _process_user_inputs(
        self, intake_form: dict, project_id: Optional[str]
    ) -> dict:
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
            "parsed_materials": [],
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
                    compacted = self._compact_if_needed(
                        content, source_name=pdf_file.name
                    )
                    result["parsed_materials"].append(
                        {"type": "pdf", "name": pdf_file.name, "content": compacted}
                    )

            # Also process text files in uploads
            for txt_file in uploads_dir.glob("*.txt"):
                content = txt_file.read_text(encoding="utf-8", errors="ignore")
                if content:
                    compacted = self._compact_if_needed(
                        content, source_name=txt_file.name
                    )
                    result["parsed_materials"].append(
                        {"type": "text", "name": txt_file.name, "content": compacted}
                    )

        # Process fetched links (stored as text files)
        links_dir = project_dir / "links"
        if links_dir.exists():
            for link_file in links_dir.glob("*.txt"):
                content = link_file.read_text(encoding="utf-8", errors="ignore")
                if content:
                    compacted = self._compact_if_needed(
                        content, source_name=link_file.stem
                    )
                    result["parsed_materials"].append(
                        {"type": "url", "name": link_file.stem, "content": compacted}
                    )

        return result

    def _extract_pdf_text(self, pdf_path: Path) -> str:
        """Extract text content from a PDF file."""
        try:
            try:
                import PyPDF2

                with open(pdf_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text_parts = []
                    for page in reader.pages:
                        text = page.extract_text()
                        if text:
                            text_parts.append(text)
                    return "\n\n".join(text_parts)
            except ImportError:
                pass

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

            return ""

        except Exception as e:
            print(f"Error extracting PDF text from {pdf_path}: {e}")
            return ""

    def _compact_if_needed(
        self, content: str, max_words: int = 2000, source_name: str = ""
    ) -> str:
        """Summarize content if too long, preserving key information."""
        word_count = len(content.split())

        if word_count <= max_words:
            return content

        prompt = f"""Summarize the following content from "{source_name}", preserving:
- Key facts, statistics, and numbers
- Important quotes or statements
- Main concepts and ideas
- Any actionable information

Content to summarize:
{content[:12000]}

Provide a concise summary (under 500 words) that captures the essential information."""

        try:
            summary = self.call_llm(prompt, max_tokens=1000)
            return f"[Summarized from {word_count} words]\n\n{summary}"
        except Exception:
            truncated = " ".join(content.split()[:max_words])
            return f"[Truncated from {word_count} words]\n\n{truncated}..."

    # =========================================================================
    # Legacy run() - stub for backward compatibility
    # =========================================================================

    def run(self, state: Any, **kwargs) -> dict:
        """
        Legacy method stub - kept for backward compatibility with old orchestrator flow.
        For Knowledge Share, use the step-by-step methods:
        - generate_perspectives()
        - generate_talking_points()
        - generate_research_questions()
        - research_questions()
        """
        # Return empty dict - output is not used by legacy flow anyway
        return {}
