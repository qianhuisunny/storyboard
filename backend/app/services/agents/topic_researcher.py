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
        Phase 1: Generate 3 contrarian POV options based on Round 1 fields.
        See system prompt "Phase 1: Perspective Principles" for guidelines.
        """
        # Extract field values
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")
        one_big_thing = self._get_field_value(confirmed_fields, "one_big_thing", "")
        audience_level = self._get_field_value(
            confirmed_fields, "audience_level", "intermediate"
        )
        duration = self._get_field_value(confirmed_fields, "duration", "300")

        prompt = f"""## TASK: Phase 1 - Generate Perspectives

Generate 3 perspectives following the Phase 1 principles in your system prompt.

## ROUND 1 CONTEXT
- Target Audience: {target_audience}
- Primary Goal: {primary_goal}
- One Big Thing: {one_big_thing}
- Audience Level: {audience_level}
- Duration: {duration} seconds

Each perspective should be distinct and offer a different angle on the topic."""

        # Console log everything sent to LLM
        print("\n" + "="*80)
        print("🔵 generate_perspectives() - LLM API CALL")
        print("="*80)
        print(f"\n📥 INPUT FIELDS (confirmed_fields):")
        print(f"   - target_audience: {target_audience}")
        print(f"   - primary_goal: {primary_goal}")
        print(f"   - one_big_thing: {one_big_thing}")
        print(f"   - audience_level: {audience_level}")
        print(f"   - duration: {duration}")
        print(f"\n🔧 SYSTEM PROMPT ({len(self.system_prompt)} chars):")
        print("-"*80)
        print(self.system_prompt[:2000] + "..." if len(self.system_prompt) > 2000 else self.system_prompt)
        print("-"*80)
        print(f"\n📝 USER PROMPT ({len(prompt)} chars):")
        print("-"*80)
        print(prompt)
        print("-"*80)
        print(f"\n⚙️  LLM PARAMS:")
        print(f"   - model: gpt-4o (default)")
        print(f"   - max_tokens: 1500")
        print(f"   - temperature: 0.8")
        print("="*80 + "\n")

        response = self.call_llm(prompt, max_tokens=1500, temperature=0.8)

        # Log the response
        print("\n" + "="*80)
        print("🟢 generate_perspectives() - LLM RESPONSE")
        print("="*80)
        print(f"\n📤 RAW RESPONSE ({len(response)} chars):")
        print("-"*80)
        print(response)
        print("-"*80)
        print("="*80 + "\n")

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
        Phase 2: Generate talking points based on the selected perspective.
        See system prompt "Phase 2: Talking Points Principles" for guidelines.
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
Incorporate this feedback: {feedback}
"""

        prompt = f"""## TASK: Phase 2 - Generate Talking Points

Generate {num_points} talking points following the Phase 2 principles in your system prompt.

## SELECTED PERSPECTIVE
{perspective}

## CONTEXT
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Duration: {duration} seconds
{feedback_section}"""

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
        Phase 3: Generate research questions for all Round 3 fields.
        See system prompt "Phase 3: Research Question Principles" for guidelines.
        """
        target_audience = self._get_field_value(confirmed_fields, "target_audience", "")
        audience_level = self._get_field_value(
            confirmed_fields, "audience_level", "intermediate"
        )
        primary_goal = self._get_field_value(confirmed_fields, "primary_goal", "")

        # Calculate questions per point based on audience level
        questions_per_point = self._calculate_questions_per_point(audience_level)

        talking_points_text = "\n".join(f"- {tp}" for tp in talking_points)

        prompt = f"""## TASK: Phase 3 - Generate Research Questions

Generate research questions following the Phase 3 principles in your system prompt.
Generate {questions_per_point} questions per talking point.

## CONFIRMED TALKING POINTS
{talking_points_text}

## CONTEXT
- Target Audience: {target_audience}
- Audience Level: {audience_level}
- Primary Goal: {primary_goal}"""

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
        Phase 4: Execute research on talking points and generate Round 3 field values.
        See system prompt "Phase 4: Execute Research" for output format.
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

        prompt = f"""## TASK: Phase 4 - Execute Research

Research the questions and generate output following the Phase 4 format in your system prompt.

## CONTEXT
- Target Audience: {target_audience}
- Primary Goal: {primary_goal}
- One Big Thing: {one_big_thing}
{materials_text}

## RESEARCH QUESTIONS BY TALKING POINT
{talking_points_section}

## ADDITIONAL QUESTIONS FROM PHASE 3
- Misconception questions: {questions.get("misconception_questions", [])}
- Takeaway questions: {questions.get("takeaway_questions", [])}
- Avoid questions: {questions.get("avoid_questions", [])}

NOTE: For talking_point_answers, do deep research with real sources. For misconceptions/practical_takeaway/must_avoid, generate initial values (these will be researched after user confirmation)."""

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
        Phase 4 follow-up: Deep research on misconceptions, takeaway, and avoid
        after user confirms Round 3 fields.
        See system prompt "Phase 4: Execute Research" for output format.
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

        # Build research items from confirmed values
        misconceptions_text = "\n".join(f"- {m}" for m in misconceptions) if misconceptions else "- None specified"
        must_avoid_text = "\n".join(f"- {a}" for a in must_avoid) if must_avoid else "- None specified"

        # Include user materials if available
        materials_text = ""
        if user_materials and user_materials.get("parsed_materials"):
            materials_text = "\n\n## USER-PROVIDED MATERIALS\n"
            for material in user_materials["parsed_materials"]:
                materials_text += f"\n### {material.get('name', 'Source')}\n"
                materials_text += material.get("content", "")[:2000] + "\n"

        prompt = f"""## TASK: Phase 4 Follow-up - Deep Research on Confirmed Fields

Research the user-confirmed misconceptions, takeaway, and avoid topics following the Phase 4 output format in your system prompt.

## CONTEXT
- Target Audience: {target_audience}
- Primary Goal: {primary_goal}
{materials_text}

## CONFIRMED MISCONCEPTIONS TO RESEARCH
{misconceptions_text}

## CONFIRMED PRACTICAL TAKEAWAY TO RESEARCH
{practical_takeaway}

## CONFIRMED TOPICS TO AVOID - RESEARCH WHY
{must_avoid_text}

Return only the misconception_answers, takeaway_answers, and avoid_answers sections of the Phase 4 output format."""

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
    # API Methods - Called by main.py endpoints
    # =========================================================================

    def calculate_angle(
        self,
        audience: str,
        description: str,
        duration_minutes: int,
        primary_goal: Optional[str] = None,
    ) -> dict:
        """
        Calculate research angle from Round 1 confirmed fields.
        Called by /api/project/{id}/research/angle endpoint.

        Args:
            audience: Target audience description
            description: Video/topic description
            duration_minutes: Video duration in minutes
            primary_goal: Optional primary goal

        Returns:
            {
                "audienceLevel": "beginner" | "intermediate" | "advanced",
                "keyTakeaway": primary goal or extracted from description,
                "durationTier": "short" | "medium" | "long",
                "durationMinutes": the input duration,
                "plannedQuestions": number of questions to generate,
                "questions": list of research questions
            }
        """
        # Determine audience level from description
        audience_lower = audience.lower()
        if any(word in audience_lower for word in ["beginner", "new", "starting", "intro", "basic"]):
            audience_level = "beginner"
        elif any(word in audience_lower for word in ["expert", "advanced", "senior", "experienced"]):
            audience_level = "advanced"
        else:
            audience_level = "intermediate"

        # Determine duration tier
        if duration_minutes <= 2:
            duration_tier = "short"
            num_questions = 3
        elif duration_minutes <= 5:
            duration_tier = "medium"
            num_questions = 5
        else:
            duration_tier = "long"
            num_questions = 7

        # Extract key takeaway
        key_takeaway = primary_goal if primary_goal else description[:150]

        # Generate research questions using LLM
        questions = self._generate_angle_questions(
            audience=audience,
            description=description,
            audience_level=audience_level,
            num_questions=num_questions,
        )

        return {
            "audienceLevel": audience_level,
            "keyTakeaway": key_takeaway,
            "durationTier": duration_tier,
            "durationMinutes": duration_minutes,
            "plannedQuestions": num_questions,
            "questions": questions,
        }

    def _generate_angle_questions(
        self,
        audience: str,
        description: str,
        audience_level: str,
        num_questions: int,
    ) -> List[str]:
        """Generate research questions based on the angle."""
        prompt = f"""Generate {num_questions} research questions for a Knowledge Share video.

## TOPIC
{description}

## TARGET AUDIENCE
{audience} (Level: {audience_level})

## QUESTION GUIDELINES
- Questions should help gather evidence, statistics, and examples
- Match the audience level:
  - Beginner: "What is X?", "How does X work?", "Why is X important?"
  - Intermediate: "What factors affect X?", "What are best practices for X?"
  - Advanced: "What are the edge cases?", "What's the contrarian view on X?"

## OUTPUT FORMAT
Return a JSON array of exactly {num_questions} questions:
["Question 1?", "Question 2?", "Question 3?"]

Each question should be specific and searchable."""

        response = self.call_llm(prompt, max_tokens=800, temperature=0.6)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, list):
            return parsed[:num_questions]

        # Fallback questions
        return [
            f"What are the key concepts of {description[:50]}?",
            f"What are common mistakes when learning {description[:50]}?",
            f"What are best practices for {description[:50]}?",
        ][:num_questions]

    def run_with_angle(self, state: Any, angle: dict) -> dict:
        """
        Run research using angle-based questions.
        Called by /api/project/{id}/research/run endpoint.

        Args:
            state: Object with intake_form containing video_type, description, etc.
            angle: Angle dict with questions list

        Returns:
            {
                "company_context": str,
                "company_context_sources": list,
                "product_context": str,
                "product_context_sources": list,
                "industry_context": str,
                "industry_context_sources": list,
                "uncertainties": list
            }
        """
        intake_form = getattr(state, "intake_form", {}) if hasattr(state, "intake_form") else state
        description = intake_form.get("description", "")
        video_type = intake_form.get("video_type", "")
        company_name = intake_form.get("company_name", "")

        questions = angle.get("questions", [])
        audience_level = angle.get("audienceLevel", "intermediate")

        # If no questions provided, generate some
        if not questions:
            questions = self._generate_angle_questions(
                audience=audience_level,
                description=description,
                audience_level=audience_level,
                num_questions=5,
            )

        # Research each question
        research_results = []
        for question in questions[:7]:  # Limit to 7 questions
            result = self._research_single_question(question, description)
            research_results.append(result)

        # Synthesize results into context categories
        return self._synthesize_research(
            research_results=research_results,
            description=description,
            company_name=company_name,
            video_type=video_type,
        )

    def _research_single_question(self, question: str, context: str) -> dict:
        """Research a single question using LLM."""
        prompt = f"""Research this question and provide a detailed answer.

## QUESTION
{question}

## CONTEXT
{context}

## OUTPUT FORMAT
Provide a comprehensive answer with:
1. Direct answer to the question
2. Supporting evidence or examples
3. Any relevant statistics or data points

Keep the answer focused and factual."""

        response = self.call_llm(prompt, max_tokens=1000, temperature=0.4)

        return {
            "question": question,
            "answer": response,
            "sources": [],  # LLM doesn't provide real sources
        }

    def _synthesize_research(
        self,
        research_results: list,
        description: str,
        company_name: str,
        video_type: str,
    ) -> dict:
        """Synthesize research results into structured context."""
        # Combine all answers
        all_answers = "\n\n".join(
            f"Q: {r['question']}\nA: {r['answer']}" for r in research_results
        )

        prompt = f"""Synthesize the following research into structured categories.

## VIDEO CONTEXT
Type: {video_type}
Topic: {description}
Company: {company_name or "N/A"}

## RESEARCH FINDINGS
{all_answers[:6000]}

## OUTPUT FORMAT
Return a JSON object with these categories:
{{
    "company_context": "Summary of company/brand information (or empty if not applicable)",
    "product_context": "Summary of product/service information relevant to the topic",
    "industry_context": "Summary of industry trends, market context, and background",
    "key_insights": ["Insight 1", "Insight 2", "Insight 3"],
    "uncertainties": ["Things that need verification or are unclear"]
}}

Focus on extracting actionable insights for creating the video."""

        response = self.call_llm(prompt, max_tokens=2000, temperature=0.3)
        parsed = self._extract_json(response)

        if parsed and isinstance(parsed, dict):
            return {
                "company_context": parsed.get("company_context", ""),
                "company_context_sources": [],
                "product_context": parsed.get("product_context", ""),
                "product_context_sources": [],
                "industry_context": parsed.get("industry_context", ""),
                "industry_context_sources": [],
                "key_insights": parsed.get("key_insights", []),
                "uncertainties": parsed.get("uncertainties", []),
            }

        # Fallback
        return {
            "company_context": "",
            "company_context_sources": [],
            "product_context": description,
            "product_context_sources": [],
            "industry_context": "",
            "industry_context_sources": [],
            "uncertainties": ["Could not synthesize research results"],
        }

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
