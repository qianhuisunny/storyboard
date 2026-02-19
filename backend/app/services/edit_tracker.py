"""
Edit Tracker - Tracks all user edits at gating points for prompt improvement analysis.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Optional, List
from pydantic import BaseModel


class EditSummary(BaseModel):
    """Summary of edits made to a stage."""
    characters_added: int = 0
    characters_removed: int = 0
    was_edited: bool = False
    edit_time_seconds: Optional[float] = None


class StageEditLog(BaseModel):
    """Edit log for a single stage."""
    ai_version: str
    human_version: Optional[str] = None
    edited: bool = False
    edit_summary: Optional[EditSummary] = None
    feedback_provided: Optional[str] = None
    regeneration_count: int = 0
    approved_at: Optional[str] = None
    created_at: str
    sources: List[dict] = []


class ProjectEditLog(BaseModel):
    """Complete edit log for a project."""
    project_id: str
    user_id: Optional[str] = None
    stages: dict = {}  # stage_name -> StageEditLog
    created_at: str
    last_updated: str


class EditTracker:
    """Tracks edits at gating points for prompt improvement."""

    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or Path(__file__).parent.parent.parent.parent / "data"

    def _get_project_dir(self, project_id: str) -> Path:
        return self.data_dir / f"project_{project_id}"

    def _get_edit_log_path(self, project_id: str) -> Path:
        return self._get_project_dir(project_id) / "edit_log.json"

    def load_edit_log(self, project_id: str) -> Optional[ProjectEditLog]:
        """Load existing edit log for a project."""
        path = self._get_edit_log_path(project_id)
        if path.exists():
            with open(path, "r") as f:
                data = json.load(f)
                return ProjectEditLog(**data)
        return None

    def save_edit_log(self, edit_log: ProjectEditLog) -> None:
        """Save edit log to disk."""
        path = self._get_edit_log_path(edit_log.project_id)
        path.parent.mkdir(parents=True, exist_ok=True)

        edit_log.last_updated = datetime.now().isoformat()

        with open(path, "w") as f:
            json.dump(edit_log.model_dump(), f, indent=2)

    def create_edit_log(self, project_id: str, user_id: Optional[str] = None) -> ProjectEditLog:
        """Create a new edit log for a project."""
        now = datetime.now().isoformat()
        edit_log = ProjectEditLog(
            project_id=project_id,
            user_id=user_id,
            stages={},
            created_at=now,
            last_updated=now,
        )
        self.save_edit_log(edit_log)
        return edit_log

    def record_ai_generation(
        self,
        project_id: str,
        stage: str,
        ai_content: str,
        sources: List[dict],
        user_id: Optional[str] = None,
    ) -> StageEditLog:
        """Record AI-generated content for a stage."""
        edit_log = self.load_edit_log(project_id)

        if not edit_log:
            edit_log = self.create_edit_log(project_id, user_id)

        stage_log = StageEditLog(
            ai_version=ai_content,
            created_at=datetime.now().isoformat(),
            sources=sources,
        )

        edit_log.stages[stage] = stage_log.model_dump()
        self.save_edit_log(edit_log)

        return stage_log

    def record_human_edit(
        self,
        project_id: str,
        stage: str,
        human_content: str,
        edit_time_seconds: Optional[float] = None,
    ) -> EditSummary:
        """Record human edits to a stage."""
        edit_log = self.load_edit_log(project_id)

        if not edit_log or stage not in edit_log.stages:
            raise ValueError(f"No AI content found for stage {stage}")

        stage_data = edit_log.stages[stage]
        ai_content = stage_data.get("ai_version", "")

        # Calculate edit summary
        edit_summary = self._calculate_edit_summary(ai_content, human_content, edit_time_seconds)

        # Update stage log
        stage_data["human_version"] = human_content
        stage_data["edited"] = edit_summary.was_edited
        stage_data["edit_summary"] = edit_summary.model_dump()

        edit_log.stages[stage] = stage_data
        self.save_edit_log(edit_log)

        return edit_summary

    def record_approval(
        self,
        project_id: str,
        stage: str,
        approved_content: str,
    ) -> None:
        """Record stage approval."""
        edit_log = self.load_edit_log(project_id)

        if not edit_log or stage not in edit_log.stages:
            raise ValueError(f"No content found for stage {stage}")

        stage_data = edit_log.stages[stage]
        stage_data["approved_at"] = datetime.now().isoformat()

        # If human version exists and differs from AI, mark as edited
        if stage_data.get("human_version") and stage_data["human_version"] != stage_data.get("ai_version"):
            stage_data["edited"] = True

        edit_log.stages[stage] = stage_data
        self.save_edit_log(edit_log)

    def record_regeneration(
        self,
        project_id: str,
        stage: str,
        feedback: str,
        new_ai_content: str,
        sources: List[dict],
    ) -> None:
        """Record a regeneration request with feedback."""
        edit_log = self.load_edit_log(project_id)

        if not edit_log or stage not in edit_log.stages:
            raise ValueError(f"No content found for stage {stage}")

        stage_data = edit_log.stages[stage]

        # Increment regeneration count
        stage_data["regeneration_count"] = stage_data.get("regeneration_count", 0) + 1
        stage_data["feedback_provided"] = feedback
        stage_data["ai_version"] = new_ai_content
        stage_data["human_version"] = None  # Reset human version
        stage_data["sources"] = sources

        edit_log.stages[stage] = stage_data
        self.save_edit_log(edit_log)

    def _calculate_edit_summary(
        self,
        original: str,
        edited: str,
        edit_time_seconds: Optional[float] = None,
    ) -> EditSummary:
        """Calculate statistics about the edits made."""
        original_len = len(original)
        edited_len = len(edited)

        # Simple character diff (could be enhanced with proper diff algorithm)
        was_edited = original != edited

        if was_edited:
            # Rough calculation of added/removed characters
            if edited_len > original_len:
                characters_added = edited_len - original_len
                characters_removed = 0
            else:
                characters_added = 0
                characters_removed = original_len - edited_len
        else:
            characters_added = 0
            characters_removed = 0

        return EditSummary(
            characters_added=characters_added,
            characters_removed=characters_removed,
            was_edited=was_edited,
            edit_time_seconds=edit_time_seconds,
        )

    def get_analytics_summary(self, project_id: str) -> dict:
        """Get analytics summary for a project's edits."""
        edit_log = self.load_edit_log(project_id)

        if not edit_log:
            return {"error": "No edit log found"}

        summary = {
            "project_id": project_id,
            "user_id": edit_log.user_id,
            "total_stages": len(edit_log.stages),
            "edited_stages": 0,
            "total_regenerations": 0,
            "stages": {},
        }

        for stage_name, stage_data in edit_log.stages.items():
            was_edited = stage_data.get("edited", False)
            regen_count = stage_data.get("regeneration_count", 0)

            if was_edited:
                summary["edited_stages"] += 1
            summary["total_regenerations"] += regen_count

            summary["stages"][stage_name] = {
                "edited": was_edited,
                "regenerations": regen_count,
                "has_feedback": bool(stage_data.get("feedback_provided")),
                "approved": bool(stage_data.get("approved_at")),
            }

        return summary


# Singleton instance
edit_tracker = EditTracker()
