"""
Observability models for tracking user edits and AI output quality.

Inspired by OpenAI's Harness Engineering:
"When the agent struggles, treat it as a signal."
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Any, Optional
import uuid
import json


class Stage(str, Enum):
    BRIEF = "brief"
    OUTLINE = "outline"
    DRAFT = "draft"
    REVIEW = "review"


class EditType(str, Enum):
    FIELD_EDIT = "field_edit"
    SCREEN_EDIT = "screen_edit"
    SCREEN_ADD = "screen_add"
    SCREEN_DELETE = "screen_delete"
    SCREEN_REORDER = "screen_reorder"
    REGENERATE = "regenerate"
    APPROVE = "approve"
    REJECT = "reject"


class SemanticCategory(str, Enum):
    TONE_CHANGE = "tone_change"
    CONTENT_ADD = "content_add"
    CONTENT_REMOVE = "content_remove"
    REWRITE = "rewrite"
    MINOR_FIX = "minor_fix"
    STRUCTURE_CHANGE = "structure_change"
    UNKNOWN = "unknown"


class SnapshotTrigger(str, Enum):
    AI_GENERATION = "ai_generation"
    HUMAN_SAVE = "human_save"
    STAGE_APPROVAL = "stage_approval"


@dataclass
class EditTarget:
    """What was edited."""
    field_name: str
    screen_number: Optional[int] = None
    field_path: Optional[str] = None  # JSONPath like "screens[2].voiceover_text"

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v is not None}


@dataclass
class EditValue:
    """Before/after value with metadata."""
    value: Any
    source: str = "unknown"  # "ai_generated", "human_edited", "extracted", "inferred"
    word_count: Optional[int] = None

    def to_dict(self) -> dict:
        result = {"value": self.value, "source": self.source}
        if self.word_count is not None:
            result["word_count"] = self.word_count
        return result

    @classmethod
    def from_value(cls, value: Any, source: str = "unknown") -> "EditValue":
        word_count = None
        if isinstance(value, str):
            word_count = len(value.split())
        return cls(value=value, source=source, word_count=word_count)


@dataclass
class DiffMetrics:
    """Quantified difference between before and after."""
    word_diff_ratio: float = 0.0  # 0 = same, 1 = completely different
    levenshtein_distance: Optional[int] = None
    semantic_category: SemanticCategory = SemanticCategory.UNKNOWN

    def to_dict(self) -> dict:
        return {
            "word_diff_ratio": self.word_diff_ratio,
            "levenshtein_distance": self.levenshtein_distance,
            "semantic_category": self.semantic_category.value
        }

    @classmethod
    def compute(cls, before: str, after: str) -> "DiffMetrics":
        """Compute diff metrics between two strings."""
        if not before and not after:
            return cls(word_diff_ratio=0.0, semantic_category=SemanticCategory.UNKNOWN)

        if not before:
            return cls(word_diff_ratio=1.0, semantic_category=SemanticCategory.CONTENT_ADD)

        if not after:
            return cls(word_diff_ratio=1.0, semantic_category=SemanticCategory.CONTENT_REMOVE)

        # Word-level diff ratio
        before_words = set(before.lower().split())
        after_words = set(after.lower().split())

        if not before_words and not after_words:
            return cls(word_diff_ratio=0.0)

        intersection = before_words & after_words
        union = before_words | after_words
        jaccard_similarity = len(intersection) / len(union) if union else 1.0
        word_diff_ratio = 1.0 - jaccard_similarity

        # Classify the change
        category = cls._classify_change(before, after, word_diff_ratio)

        return cls(
            word_diff_ratio=round(word_diff_ratio, 3),
            semantic_category=category
        )

    @staticmethod
    def _classify_change(before: str, after: str, diff_ratio: float) -> SemanticCategory:
        """Heuristic classification of edit type."""
        before_len = len(before)
        after_len = len(after)

        # Minor fix: small change
        if diff_ratio < 0.2:
            return SemanticCategory.MINOR_FIX

        # Content add: significantly longer
        if after_len > before_len * 1.5:
            return SemanticCategory.CONTENT_ADD

        # Content remove: significantly shorter
        if after_len < before_len * 0.6:
            return SemanticCategory.CONTENT_REMOVE

        # Tone indicators
        formal_words = {"comprehensive", "utilize", "enterprise", "solution", "capabilities", "leverage"}
        casual_words = {"hey", "cool", "awesome", "check out", "let me show", "super"}

        before_formal = any(w in before.lower() for w in formal_words)
        after_casual = any(w in after.lower() for w in casual_words)

        if before_formal and after_casual:
            return SemanticCategory.TONE_CHANGE

        # Default to rewrite for significant changes
        if diff_ratio > 0.5:
            return SemanticCategory.REWRITE

        return SemanticCategory.UNKNOWN


@dataclass
class EditContext:
    """Contextual metadata about the edit."""
    time_since_generation_sec: Optional[float] = None
    session_edit_count: int = 1
    was_ai_regenerated: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class EditEvent:
    """A single user edit event."""
    project_id: str
    stage: Stage
    edit_type: EditType
    target: EditTarget
    before: EditValue
    after: EditValue

    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: Optional[str] = None
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    stage_round: int = 1
    diff_metrics: Optional[DiffMetrics] = None
    context: Optional[EditContext] = None

    def __post_init__(self):
        # Auto-compute diff metrics if not provided
        if self.diff_metrics is None and self.edit_type == EditType.FIELD_EDIT:
            before_str = str(self.before.value) if self.before.value else ""
            after_str = str(self.after.value) if self.after.value else ""
            self.diff_metrics = DiffMetrics.compute(before_str, after_str)

    def to_dict(self) -> dict:
        return {
            "event_id": self.event_id,
            "project_id": self.project_id,
            "user_id": self.user_id,
            "timestamp": self.timestamp,
            "stage": self.stage.value,
            "stage_round": self.stage_round,
            "edit_type": self.edit_type.value,
            "target": self.target.to_dict(),
            "before": self.before.to_dict(),
            "after": self.after.to_dict(),
            "diff_metrics": self.diff_metrics.to_dict() if self.diff_metrics else None,
            "context": self.context.to_dict() if self.context else None
        }

    def to_jsonl(self) -> str:
        """Serialize to single JSON line for append-only log."""
        return json.dumps(self.to_dict())


@dataclass
class Snapshot:
    """Complete state at a point in time."""
    project_id: str
    stage: Stage
    trigger: SnapshotTrigger
    content: dict  # Full stage content

    snapshot_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    version: int = 1
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    metadata: Optional[dict] = None

    def __post_init__(self):
        # Auto-compute metadata
        if self.metadata is None:
            self.metadata = self._compute_metadata()

    def _compute_metadata(self) -> dict:
        """Extract aggregate stats from content."""
        metadata = {}

        if self.stage in (Stage.OUTLINE, Stage.DRAFT):
            screens = self.content.get("screens", [])
            if isinstance(screens, list):
                metadata["total_screens"] = len(screens)

                total_words = 0
                total_duration = 0
                for screen in screens:
                    if isinstance(screen, dict):
                        vo = screen.get("voiceover_text", "")
                        if vo:
                            total_words += len(vo.split())
                        dur = screen.get("target_duration_sec", 0)
                        if dur:
                            total_duration += dur

                metadata["total_word_count"] = total_words
                if screens:
                    metadata["avg_screen_duration"] = round(total_duration / len(screens), 1)

        return metadata

    def to_dict(self) -> dict:
        return {
            "snapshot_id": self.snapshot_id,
            "project_id": self.project_id,
            "stage": self.stage.value,
            "version": self.version,
            "trigger": self.trigger.value,
            "timestamp": self.timestamp,
            "content": self.content,
            "metadata": self.metadata
        }


@dataclass
class FieldEditPattern:
    """Aggregated edit pattern for a single field."""
    stage: str
    field: str
    edit_count: int = 0
    edit_rate: float = 0.0  # % of projects that edit this field
    common_changes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class StageEditSummary:
    """Summary of edits for one stage of one project."""
    stage: str
    fields_edited: list = field(default_factory=list)
    fields_unchanged: list = field(default_factory=list)
    edit_rate: float = 0.0
    screens_edited: list = field(default_factory=list)
    screens_deleted: list = field(default_factory=list)
    screens_added: int = 0
    screens_reordered: bool = False
    field_edit_heatmap: dict = field(default_factory=dict)
    patterns: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ProjectEditSummary:
    """Complete edit summary for one project."""
    project_id: str
    user_id: Optional[str] = None
    computed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    brief_stage: Optional[StageEditSummary] = None
    outline_stage: Optional[StageEditSummary] = None
    draft_stage: Optional[StageEditSummary] = None

    def to_dict(self) -> dict:
        result = {
            "project_id": self.project_id,
            "user_id": self.user_id,
            "computed_at": self.computed_at
        }
        if self.brief_stage:
            result["brief_stage"] = self.brief_stage.to_dict()
        if self.outline_stage:
            result["outline_stage"] = self.outline_stage.to_dict()
        if self.draft_stage:
            result["draft_stage"] = self.draft_stage.to_dict()
        return result


@dataclass
class PromptImprovementSignal:
    """Signal for improving agent prompts."""
    agent: str
    issue: str
    evidence: str
    recommendation: str
    confidence: float = 0.5

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class CrossProjectAnalytics:
    """Aggregated analytics across all projects."""
    computed_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    time_range: str = "7d"
    total_projects: int = 0

    stage_edit_rates: dict = field(default_factory=dict)
    field_edit_frequency: list = field(default_factory=list)
    semantic_patterns: list = field(default_factory=list)
    revision_metrics: dict = field(default_factory=dict)
    prompt_improvement_signals: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "computed_at": self.computed_at,
            "time_range": self.time_range,
            "total_projects": self.total_projects,
            "stage_edit_rates": self.stage_edit_rates,
            "field_edit_frequency": [f if isinstance(f, dict) else f.to_dict() for f in self.field_edit_frequency],
            "semantic_patterns": self.semantic_patterns,
            "revision_metrics": self.revision_metrics,
            "prompt_improvement_signals": [s if isinstance(s, dict) else s.to_dict() for s in self.prompt_improvement_signals]
        }
