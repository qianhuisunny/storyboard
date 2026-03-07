"""
Processing Log Service - Stores and serves LLM processing events for frontend display.

Instead of console.log, agents emit processing events that can be:
1. Stored in memory (per project)
2. Retrieved via API endpoint
3. Displayed in the Processing tab in the frontend
"""

import uuid
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from threading import Lock


@dataclass
class ProcessingLogEntry:
    """Single processing log entry for an LLM call."""
    id: str
    timestamp: str
    phase: str  # e.g., "generate_perspectives", "generate_talking_points"
    entry_type: str  # "request" or "response"
    data: Dict[str, Any]

    def to_dict(self) -> Dict:
        result = asdict(self)
        # Rename entry_type to type for frontend compatibility
        result["type"] = result.pop("entry_type")
        return result


class ProcessingLogStore:
    """In-memory store for processing logs, keyed by project_id."""

    def __init__(self, max_entries_per_project: int = 100):
        self._logs: Dict[str, List[ProcessingLogEntry]] = {}
        self._lock = Lock()
        self._max_entries = max_entries_per_project

    def add_entry(self, project_id: str, entry: ProcessingLogEntry) -> None:
        """Add a log entry for a project."""
        with self._lock:
            if project_id not in self._logs:
                self._logs[project_id] = []
            self._logs[project_id].append(entry)
            # Trim old entries if over limit
            if len(self._logs[project_id]) > self._max_entries:
                self._logs[project_id] = self._logs[project_id][-self._max_entries:]

    def get_entries(
        self, project_id: str, since_id: Optional[str] = None
    ) -> List[Dict]:
        """Get log entries for a project, optionally since a specific entry ID."""
        with self._lock:
            entries = self._logs.get(project_id, [])
            if since_id:
                # Find the index of the since_id entry and return everything after
                for i, entry in enumerate(entries):
                    if entry.id == since_id:
                        entries = entries[i + 1:]
                        break
            return [e.to_dict() for e in entries]

    def clear(self, project_id: str) -> None:
        """Clear all logs for a project."""
        with self._lock:
            if project_id in self._logs:
                self._logs[project_id] = []


# Global store instance
_store = ProcessingLogStore()


def get_store() -> ProcessingLogStore:
    """Get the global processing log store."""
    return _store


def log_llm_request(
    project_id: str,
    phase: str,
    input_fields: Dict[str, str],
    system_prompt: str,
    user_prompt: str,
    model: str = "gpt-4o",
    max_tokens: int = 1500,
    temperature: float = 0.8,
) -> str:
    """
    Log an LLM request. Returns the entry ID for later reference.

    Args:
        project_id: The project this request belongs to
        phase: The agent phase (e.g., "generate_perspectives")
        input_fields: Key-value pairs of input data
        system_prompt: The full system prompt
        user_prompt: The user prompt being sent
        model: Model name
        max_tokens: Max tokens setting
        temperature: Temperature setting

    Returns:
        The entry ID (for correlating with response)
    """
    entry_id = str(uuid.uuid4())[:8]
    entry = ProcessingLogEntry(
        id=entry_id,
        timestamp=datetime.now().isoformat(),
        phase=phase,
        entry_type="request",
        data={
            "inputFields": input_fields,
            "systemPromptLength": len(system_prompt),
            "systemPromptPreview": (
                system_prompt[:500] + "..."
                if len(system_prompt) > 500
                else system_prompt
            ),
            "userPrompt": user_prompt,
            "llmParams": {
                "model": model,
                "maxTokens": max_tokens,
                "temperature": temperature,
            },
        },
    )
    _store.add_entry(project_id, entry)

    # Also print to console for debugging
    print(f"\n{'='*80}")
    print(f"🔵 {phase}() - LLM API CALL [project: {project_id}]")
    print(f"{'='*80}")
    print(f"📥 Input: {input_fields}")
    print(f"📝 Prompt: {user_prompt[:200]}...")
    print(f"{'='*80}\n")

    return entry_id


def log_llm_response(
    project_id: str,
    phase: str,
    raw_response: str,
    parsed_result: Optional[Any] = None,
) -> str:
    """
    Log an LLM response.

    Args:
        project_id: The project this response belongs to
        phase: The agent phase
        raw_response: The raw text response from LLM
        parsed_result: The parsed JSON result (if any)

    Returns:
        The entry ID
    """
    entry_id = str(uuid.uuid4())[:8]
    entry = ProcessingLogEntry(
        id=entry_id,
        timestamp=datetime.now().isoformat(),
        phase=phase,
        entry_type="response",
        data={
            "rawResponse": raw_response,
            "responseLength": len(raw_response),
            "parsedResult": parsed_result,
        },
    )
    _store.add_entry(project_id, entry)

    # Also print to console for debugging
    print(f"\n{'='*80}")
    print(f"🟢 {phase}() - LLM RESPONSE [project: {project_id}]")
    print(f"{'='*80}")
    print(f"📤 Response ({len(raw_response)} chars): {raw_response[:200]}...")
    print(f"{'='*80}\n")

    return entry_id
