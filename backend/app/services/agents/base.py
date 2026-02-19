"""
Base Agent - Foundation class for all storyboard agents.
Handles prompt loading and LLM calls with timing capture for analytics.
"""

import os
import json
import re
import time
from pathlib import Path
from typing import Optional, Any, Tuple, Dict
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Import analytics tracker (optional - may not exist in all environments)
try:
    from app.services.analytics import analytics_tracker
    ANALYTICS_AVAILABLE = True
except ImportError:
    analytics_tracker = None
    ANALYTICS_AVAILABLE = False


class BaseAgent:
    """
    Base class for all storyboard agents.

    Subclasses must set:
    - prompt_file: Name of the .md file in /prompts/ folder

    Subclasses must implement:
    - run(): Main execution method
    """

    prompt_file: str = None  # Override in subclass

    def __init__(self):
        self.client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.system_prompt = self._load_prompt()

    def _load_prompt(self) -> str:
        """Load system prompt from the prompts folder."""
        if not self.prompt_file:
            raise ValueError(f"{self.__class__.__name__} must set prompt_file attribute")

        # Navigate from agents/ -> services/ -> app/ -> backend/ -> prompts/
        prompts_dir = Path(__file__).parent.parent.parent.parent.parent / "prompts"
        prompt_path = prompts_dir / self.prompt_file

        if not prompt_path.exists():
            raise FileNotFoundError(
                f"Prompt file not found: {prompt_path}. "
                f"Available files: {list(prompts_dir.glob('*.md'))}"
            )

        return prompt_path.read_text(encoding="utf-8")

    def call_llm(
        self,
        user_prompt: str,
        model: str = "gpt-4o",
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> str:
        """
        Make a call to the LLM with the system prompt and user message.

        Args:
            user_prompt: The user message/input
            model: OpenAI model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response

        Returns:
            The assistant's response text
        """
        try:
            response = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            raise RuntimeError(f"LLM call failed in {self.__class__.__name__}: {str(e)}")

    def call_llm_with_timing(
        self,
        user_prompt: str,
        project_id: Optional[str] = None,
        stage_id: Optional[int] = None,
        stage_name: Optional[str] = None,
        model: str = "gpt-4o",
        temperature: float = 0.7,
        max_tokens: int = 4000,
    ) -> Tuple[str, Dict]:
        """
        Make a call to the LLM with streaming enabled to capture timing metrics.

        Uses streaming to capture time-to-first-token (TTFT) for analytics.

        Args:
            user_prompt: The user message/input
            project_id: Project ID for analytics tracking (optional)
            stage_id: Stage number for analytics (optional)
            stage_name: Stage name for analytics (optional)
            model: OpenAI model to use
            temperature: Sampling temperature
            max_tokens: Maximum tokens in response

        Returns:
            Tuple of (response_text, timing_metrics)
            timing_metrics includes: time_to_first_token_ms, total_generation_time_ms
        """
        start_time = time.perf_counter()
        first_token_time = None
        event_id = None

        # Record generation start if analytics available
        if ANALYTICS_AVAILABLE and project_id and stage_id and stage_name:
            event_id = analytics_tracker.record_generation_start(
                project_id, stage_id, stage_name
            )

        try:
            # Use streaming to capture first token timing
            response_chunks = []

            stream = self.client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": self.system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=temperature,
                max_tokens=max_tokens,
                stream=True,
            )

            for chunk in stream:
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content

                    # Record first token timing
                    if first_token_time is None:
                        first_token_time = time.perf_counter()

                        # Record in analytics
                        if ANALYTICS_AVAILABLE and project_id and event_id:
                            analytics_tracker.record_first_token(project_id, event_id)

                    response_chunks.append(content)

            end_time = time.perf_counter()
            full_response = "".join(response_chunks)

            # Calculate timing metrics
            timing_metrics = {
                "time_to_first_token_ms": int((first_token_time - start_time) * 1000) if first_token_time else None,
                "total_generation_time_ms": int((end_time - start_time) * 1000),
                "model_used": model,
            }

            # Record completion in analytics
            if ANALYTICS_AVAILABLE and project_id and event_id:
                analytics_tracker.record_generation_complete(project_id, event_id, model)

            return full_response, timing_metrics

        except Exception as e:
            raise RuntimeError(f"LLM call failed in {self.__class__.__name__}: {str(e)}")

    def run(self, state: Any, **kwargs) -> Any:
        """
        Main execution method. Must be implemented by subclasses.

        Args:
            state: The current StoryboardState
            **kwargs: Additional arguments specific to the agent

        Returns:
            Agent-specific output (dict, list, etc.)
        """
        raise NotImplementedError(f"{self.__class__.__name__} must implement run()")

    def _extract_json(self, text: str) -> Optional[Any]:
        """
        Extract JSON from LLM response text.
        Handles markdown code blocks and raw JSON.

        Args:
            text: Raw LLM response

        Returns:
            Parsed JSON object (dict or list) or None if not found
        """
        # Try to find JSON in code blocks first
        code_block_pattern = r"```(?:json)?\s*\n?([\s\S]*?)\n?```"
        matches = re.findall(code_block_pattern, text)

        for match in matches:
            try:
                return json.loads(match.strip())
            except json.JSONDecodeError:
                continue

        # Try to find raw JSON (array or object)
        json_patterns = [
            r'(\[[\s\S]*\])',  # Array
            r'(\{[\s\S]*\})',  # Object
        ]

        for pattern in json_patterns:
            matches = re.findall(pattern, text)
            for match in matches:
                try:
                    return json.loads(match)
                except json.JSONDecodeError:
                    continue

        return None

    def _validate_required_fields(self, data: dict, required_fields: list) -> list:
        """
        Validate that required fields are present in a dict.

        Args:
            data: Dictionary to validate
            required_fields: List of required field names

        Returns:
            List of missing field names (empty if all present)
        """
        return [field for field in required_fields if field not in data or data[field] is None]
