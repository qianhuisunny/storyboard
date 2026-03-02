"""
Observability service for tracking and analyzing user edits.

Stores:
- Edit events (append-only JSONL log)
- Snapshots (versioned state)
- Computed summaries

Uses file-based storage for now (aligned with existing data/ pattern).
Will migrate to Postgres with rest of system (task 103-105).
"""

import json
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from collections import defaultdict

from app.models.observability import (
    EditEvent, EditType, EditTarget, EditValue, EditContext,
    Snapshot, SnapshotTrigger, Stage,
    ProjectEditSummary, StageEditSummary, FieldEditPattern,
    CrossProjectAnalytics, PromptImprovementSignal, SemanticCategory
)


class ObservabilityService:
    """Service for edit tracking and analytics."""

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)

    def _get_obs_dir(self, project_id: str) -> Path:
        """Get or create observability directory for project."""
        obs_dir = self.data_dir / f"project_{project_id}" / "observability"
        obs_dir.mkdir(parents=True, exist_ok=True)
        return obs_dir

    def _get_events_file(self, project_id: str) -> Path:
        """Get events JSONL file path."""
        obs_dir = self._get_obs_dir(project_id)
        events_dir = obs_dir / "events"
        events_dir.mkdir(exist_ok=True)
        return events_dir / "edits.jsonl"

    def _get_snapshots_dir(self, project_id: str) -> Path:
        """Get snapshots directory."""
        obs_dir = self._get_obs_dir(project_id)
        snapshots_dir = obs_dir / "snapshots"
        snapshots_dir.mkdir(exist_ok=True)
        return snapshots_dir

    # ==================== Event Logging ====================

    def log_edit_event(self, event: EditEvent) -> EditEvent:
        """Append an edit event to the log."""
        events_file = self._get_events_file(event.project_id)

        with open(events_file, "a") as f:
            f.write(event.to_jsonl() + "\n")

        return event

    def log_field_edit(
        self,
        project_id: str,
        stage: str,
        field_name: str,
        before_value: any,
        after_value: any,
        screen_number: Optional[int] = None,
        user_id: Optional[str] = None,
        stage_round: int = 1,
        time_since_generation_sec: Optional[float] = None
    ) -> EditEvent:
        """Convenience method to log a field edit."""
        target = EditTarget(
            field_name=field_name,
            screen_number=screen_number,
            field_path=f"screens[{screen_number-1}].{field_name}" if screen_number else field_name
        )

        event = EditEvent(
            project_id=project_id,
            user_id=user_id,
            stage=Stage(stage),
            stage_round=stage_round,
            edit_type=EditType.FIELD_EDIT,
            target=target,
            before=EditValue.from_value(before_value, "ai_generated"),
            after=EditValue.from_value(after_value, "human_edited"),
            context=EditContext(
                time_since_generation_sec=time_since_generation_sec
            ) if time_since_generation_sec else None
        )

        return self.log_edit_event(event)

    def log_screen_delete(
        self,
        project_id: str,
        stage: str,
        screen_number: int,
        screen_content: dict,
        user_id: Optional[str] = None
    ) -> EditEvent:
        """Log a screen deletion."""
        event = EditEvent(
            project_id=project_id,
            user_id=user_id,
            stage=Stage(stage),
            edit_type=EditType.SCREEN_DELETE,
            target=EditTarget(field_name="screen", screen_number=screen_number),
            before=EditValue(value=screen_content, source="ai_generated"),
            after=EditValue(value=None, source="human_edited")
        )
        return self.log_edit_event(event)

    def log_screen_add(
        self,
        project_id: str,
        stage: str,
        screen_number: int,
        screen_content: dict,
        user_id: Optional[str] = None
    ) -> EditEvent:
        """Log a screen addition."""
        event = EditEvent(
            project_id=project_id,
            user_id=user_id,
            stage=Stage(stage),
            edit_type=EditType.SCREEN_ADD,
            target=EditTarget(field_name="screen", screen_number=screen_number),
            before=EditValue(value=None, source="none"),
            after=EditValue(value=screen_content, source="human_edited")
        )
        return self.log_edit_event(event)

    def log_regenerate(
        self,
        project_id: str,
        stage: str,
        feedback: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> EditEvent:
        """Log a regeneration request."""
        event = EditEvent(
            project_id=project_id,
            user_id=user_id,
            stage=Stage(stage),
            edit_type=EditType.REGENERATE,
            target=EditTarget(field_name="full_stage"),
            before=EditValue(value=None, source="ai_generated"),
            after=EditValue(value=feedback, source="human_feedback")
        )
        return self.log_edit_event(event)

    def log_approval(
        self,
        project_id: str,
        stage: str,
        user_id: Optional[str] = None
    ) -> EditEvent:
        """Log stage approval."""
        event = EditEvent(
            project_id=project_id,
            user_id=user_id,
            stage=Stage(stage),
            edit_type=EditType.APPROVE,
            target=EditTarget(field_name="full_stage"),
            before=EditValue(value="pending", source="system"),
            after=EditValue(value="approved", source="human_edited")
        )
        return self.log_edit_event(event)

    # ==================== Snapshots ====================

    def create_snapshot(
        self,
        project_id: str,
        stage: str,
        trigger: str,
        content: dict
    ) -> Snapshot:
        """Create and save a snapshot."""
        snapshots_dir = self._get_snapshots_dir(project_id)

        # Determine version number
        existing = list(snapshots_dir.glob(f"{stage}_v*.json"))
        version = len(existing) + 1

        snapshot = Snapshot(
            project_id=project_id,
            stage=Stage(stage),
            version=version,
            trigger=SnapshotTrigger(trigger),
            content=content
        )

        filename = f"{stage}_v{version}.json"
        with open(snapshots_dir / filename, "w") as f:
            json.dump(snapshot.to_dict(), f, indent=2)

        return snapshot

    def get_snapshots(self, project_id: str, stage: Optional[str] = None) -> list[dict]:
        """Get all snapshots for a project, optionally filtered by stage."""
        snapshots_dir = self._get_snapshots_dir(project_id)

        if not snapshots_dir.exists():
            return []

        pattern = f"{stage}_v*.json" if stage else "*_v*.json"
        snapshots = []

        for f in sorted(snapshots_dir.glob(pattern)):
            with open(f) as fp:
                snapshots.append(json.load(fp))

        return snapshots

    def get_latest_snapshot(self, project_id: str, stage: str) -> Optional[dict]:
        """Get the most recent snapshot for a stage."""
        snapshots = self.get_snapshots(project_id, stage)
        return snapshots[-1] if snapshots else None

    # ==================== Event Retrieval ====================

    def get_edit_events(
        self,
        project_id: str,
        stage: Optional[str] = None,
        edit_type: Optional[str] = None
    ) -> list[dict]:
        """Get edit events for a project."""
        events_file = self._get_events_file(project_id)

        if not events_file.exists():
            return []

        events = []
        with open(events_file) as f:
            for line in f:
                if line.strip():
                    event = json.loads(line)
                    if stage and event.get("stage") != stage:
                        continue
                    if edit_type and event.get("edit_type") != edit_type:
                        continue
                    events.append(event)

        return events

    # ==================== Diff Computation ====================

    def get_stage_diff(self, project_id: str, stage: str) -> Optional[dict]:
        """Get diff between first (AI) and last (human) snapshot."""
        snapshots = self.get_snapshots(project_id, stage)

        if len(snapshots) < 2:
            return None

        ai_snapshot = snapshots[0]
        human_snapshot = snapshots[-1]

        return {
            "stage": stage,
            "ai_version": ai_snapshot,
            "human_version": human_snapshot,
            "edit_events": self.get_edit_events(project_id, stage)
        }

    # ==================== Project Summary ====================

    def compute_project_summary(self, project_id: str) -> ProjectEditSummary:
        """Compute edit summary for a single project."""
        events = self.get_edit_events(project_id)

        # Group by stage
        by_stage = defaultdict(list)
        for e in events:
            by_stage[e["stage"]].append(e)

        summary = ProjectEditSummary(project_id=project_id)

        for stage_name, stage_events in by_stage.items():
            stage_summary = self._compute_stage_summary(stage_name, stage_events)

            if stage_name == "brief":
                summary.brief_stage = stage_summary
            elif stage_name == "outline":
                summary.outline_stage = stage_summary
            elif stage_name == "draft":
                summary.draft_stage = stage_summary

        # Save summary
        obs_dir = self._get_obs_dir(project_id)
        with open(obs_dir / "summary.json", "w") as f:
            json.dump(summary.to_dict(), f, indent=2)

        return summary

    def _compute_stage_summary(self, stage: str, events: list[dict]) -> StageEditSummary:
        """Compute summary for one stage."""
        summary = StageEditSummary(stage=stage)

        fields_edited = set()
        screens_edited = set()
        field_counts = defaultdict(int)

        for e in events:
            edit_type = e.get("edit_type")
            target = e.get("target", {})

            if edit_type == "field_edit":
                field_name = target.get("field_name")
                if field_name:
                    fields_edited.add(field_name)
                    field_counts[field_name] += 1

                screen_num = target.get("screen_number")
                if screen_num:
                    screens_edited.add(screen_num)

            elif edit_type == "screen_delete":
                screen_num = target.get("screen_number")
                if screen_num:
                    summary.screens_deleted.append(screen_num)

            elif edit_type == "screen_add":
                summary.screens_added += 1

            elif edit_type == "screen_reorder":
                summary.screens_reordered = True

        summary.fields_edited = list(fields_edited)
        summary.screens_edited = list(screens_edited)

        # Compute heatmap (normalized field edit counts)
        if field_counts:
            max_count = max(field_counts.values())
            summary.field_edit_heatmap = {
                k: round(v / max_count, 2) for k, v in field_counts.items()
            }

        # Detect patterns
        summary.patterns = self._detect_patterns(events)

        return summary

    def _detect_patterns(self, events: list[dict]) -> list[dict]:
        """Detect edit patterns from events."""
        patterns = []

        # Count semantic categories
        categories = defaultdict(int)
        for e in events:
            metrics = e.get("diff_metrics", {})
            cat = metrics.get("semantic_category")
            if cat:
                categories[cat] += 1

        total = sum(categories.values())
        if total > 0:
            for cat, count in categories.items():
                freq = count / total
                if freq >= 0.2:  # 20%+ threshold
                    patterns.append({
                        "pattern": cat,
                        "frequency": round(freq, 2),
                        "count": count
                    })

        # Check for hook rewrites (screen 1 edits)
        hook_edits = [
            e for e in events
            if e.get("target", {}).get("screen_number") == 1
            and e.get("edit_type") == "field_edit"
        ]
        if hook_edits:
            patterns.append({
                "pattern": "hook_rewrite",
                "description": "User edited the hook/intro screen",
                "count": len(hook_edits)
            })

        return patterns

    # ==================== Cross-Project Analytics ====================

    def compute_cross_project_analytics(
        self,
        time_range: str = "7d",
        user_id: Optional[str] = None
    ) -> CrossProjectAnalytics:
        """Compute aggregated analytics across all projects."""
        # Parse time range
        days = int(time_range.replace("d", ""))
        cutoff = datetime.utcnow() - timedelta(days=days)

        # Find all projects with observability data
        all_projects = []
        for project_dir in self.data_dir.glob("project_*"):
            obs_dir = project_dir / "observability"
            if obs_dir.exists():
                project_id = project_dir.name.replace("project_", "")
                all_projects.append(project_id)

        # Aggregate stats
        stage_edit_counts = defaultdict(int)
        field_edit_counts = defaultdict(lambda: defaultdict(int))
        semantic_counts = defaultdict(int)
        total_with_stage = defaultdict(int)
        regeneration_counts = []

        for project_id in all_projects:
            events = self.get_edit_events(project_id)

            stages_edited = set()
            regen_count = 0

            for e in events:
                stage = e.get("stage")
                edit_type = e.get("edit_type")

                if edit_type == "field_edit":
                    stages_edited.add(stage)
                    field_name = e.get("target", {}).get("field_name")
                    if field_name:
                        field_edit_counts[stage][field_name] += 1

                    metrics = e.get("diff_metrics", {})
                    cat = metrics.get("semantic_category")
                    if cat:
                        semantic_counts[cat] += 1

                elif edit_type == "regenerate":
                    regen_count += 1

                total_with_stage[stage] += 1

            for stage in stages_edited:
                stage_edit_counts[stage] += 1

            regeneration_counts.append(regen_count)

        total_projects = len(all_projects)

        # Build analytics object
        analytics = CrossProjectAnalytics(
            time_range=time_range,
            total_projects=total_projects
        )

        # Stage edit rates
        for stage in ["brief", "outline", "draft"]:
            if total_projects > 0:
                analytics.stage_edit_rates[stage] = round(
                    stage_edit_counts[stage] / total_projects, 2
                )

        # Field edit frequency (sorted)
        field_freq = []
        for stage, fields in field_edit_counts.items():
            for field, count in fields.items():
                total_for_stage = total_with_stage.get(stage, 1)
                field_freq.append({
                    "stage": stage,
                    "field": field,
                    "edit_count": count,
                    "edit_rate": round(count / max(total_for_stage, 1), 2)
                })
        analytics.field_edit_frequency = sorted(
            field_freq, key=lambda x: x["edit_rate"], reverse=True
        )[:10]  # Top 10

        # Semantic patterns
        total_semantic = sum(semantic_counts.values())
        if total_semantic > 0:
            for cat, count in sorted(semantic_counts.items(), key=lambda x: -x[1])[:5]:
                analytics.semantic_patterns.append({
                    "category": cat,
                    "frequency": round(count / total_semantic, 2),
                    "count": count
                })

        # Revision metrics
        if regeneration_counts:
            analytics.revision_metrics = {
                "avg_regenerations": round(sum(regeneration_counts) / len(regeneration_counts), 1),
                "projects_with_zero_edits": round(
                    sum(1 for r in regeneration_counts if r == 0) / len(regeneration_counts), 2
                )
            }

        # Generate prompt improvement signals
        analytics.prompt_improvement_signals = self._generate_improvement_signals(analytics)

        return analytics

    def _generate_improvement_signals(
        self,
        analytics: CrossProjectAnalytics
    ) -> list[PromptImprovementSignal]:
        """Generate actionable signals for prompt improvement."""
        signals = []

        # High tone_change rate → writer needs tone guidance
        for pattern in analytics.semantic_patterns:
            if pattern["category"] == "tone_change" and pattern["frequency"] > 0.3:
                signals.append(PromptImprovementSignal(
                    agent="StoryboardWriter",
                    issue="Voiceover tone mismatch",
                    evidence=f"{int(pattern['frequency']*100)}% of edits are tone changes",
                    recommendation="Pass tone_and_style from brief directly to writer prompt",
                    confidence=0.7
                ))

        # High voiceover edit rate
        for field in analytics.field_edit_frequency:
            if field["field"] == "voiceover_text" and field["edit_rate"] > 0.5:
                signals.append(PromptImprovementSignal(
                    agent="StoryboardWriter",
                    issue="Voiceover text frequently edited",
                    evidence=f"{int(field['edit_rate']*100)}% of {field['stage']} voiceovers are edited",
                    recommendation="Add examples of good voiceover to prompt; emphasize conversational style",
                    confidence=0.6
                ))

        # High screen deletion rate
        outline_del = analytics.stage_edit_rates.get("outline", 0)
        if outline_del > 0.4:
            signals.append(PromptImprovementSignal(
                agent="StoryboardDirector",
                issue="Users frequently delete screens",
                evidence=f"{int(outline_del*100)}% of projects have screen deletions",
                recommendation="Reduce default screen count; add 'minimum viable screens' constraint",
                confidence=0.5
            ))

        return signals


# Singleton instance
_service: Optional[ObservabilityService] = None


def get_observability_service() -> ObservabilityService:
    """Get or create the observability service."""
    global _service
    if _service is None:
        _service = ObservabilityService()
    return _service
