"""
Analytics Service for Plotline Monitoring Dashboard

Tracks:
- Performance metrics (time to first token, generation times)
- User behavior (stage time, edits, regenerations, go-backs)
- Field-level edits (for prompt refinement)
- Session metrics (completion status)
- Satisfaction ratings
- User registrations (via Clerk webhook)
"""

import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field


# =============================================================================
# DATA MODELS
# =============================================================================

class PerformanceMetrics(BaseModel):
    """Timing metrics for a single stage generation."""
    stage_id: int
    stage_name: str
    request_started_at: str
    first_token_at: Optional[str] = None
    response_completed_at: Optional[str] = None
    time_to_first_token_ms: Optional[int] = None
    total_generation_time_ms: Optional[int] = None
    api_response_time_ms: Optional[int] = None
    model_used: Optional[str] = None


class FieldEdit(BaseModel):
    """Individual field edit for prompt refinement analysis."""
    field_name: str
    ai_value: str
    human_value: str
    edit_type: Literal["modified", "added", "deleted"]
    timestamp: str


class UserBehaviorMetrics(BaseModel):
    """User interaction metrics for a single stage."""
    stage_id: int
    stage_name: str
    stage_entered_at: str
    stage_exited_at: Optional[str] = None
    time_spent_seconds: Optional[float] = None
    regeneration_count: int = 0
    manual_edit_count: int = 0
    field_edits: List[FieldEdit] = Field(default_factory=list)
    characters_added: int = 0
    characters_removed: int = 0


class SessionMetrics(BaseModel):
    """Full session tracking for a project."""
    project_id: str
    user_id: Optional[str] = None
    session_started_at: str
    session_ended_at: Optional[str] = None
    completion_status: Literal["in_progress", "completed", "abandoned"] = "in_progress"
    current_stage: int = 1
    highest_stage_reached: int = 1
    go_back_count: int = 0
    total_time_spent_seconds: Optional[float] = None


class SatisfactionRating(BaseModel):
    """User satisfaction feedback after Stage 4."""
    project_id: str
    user_id: Optional[str] = None
    rating: int  # 1-5 stars
    feedback_text: Optional[str] = None
    submitted_at: str
    stage_completed: int = 4


class ProjectAnalytics(BaseModel):
    """Complete analytics for a project."""
    project_id: str
    user_id: Optional[str] = None
    created_at: str
    last_updated: str
    performance_metrics: List[PerformanceMetrics] = Field(default_factory=list)
    user_behavior: List[UserBehaviorMetrics] = Field(default_factory=list)
    session_metrics: Optional[SessionMetrics] = None
    satisfaction_rating: Optional[SatisfactionRating] = None


class UserRegistration(BaseModel):
    """User registration event from Clerk webhook."""
    user_id: str
    email: Optional[str] = None
    created_at: str
    source: str = "clerk_webhook"


class GlobalMetrics(BaseModel):
    """Cross-project aggregated metrics."""
    last_updated: str
    total_users: int = 0
    total_projects: int = 0
    registrations: List[UserRegistration] = Field(default_factory=list)


# =============================================================================
# ANALYTICS TRACKER SERVICE
# =============================================================================

class AnalyticsTracker:
    """
    Service for tracking and storing analytics data.

    Storage:
    - Per-project: data/project_{id}/analytics.json
    - Global: data/_analytics/global.json
    """

    def __init__(self, data_dir: str = "data"):
        self.data_dir = Path(data_dir)
        self._ensure_analytics_dir()

    def _ensure_analytics_dir(self):
        """Create analytics directory if it doesn't exist."""
        analytics_dir = self.data_dir / "_analytics"
        analytics_dir.mkdir(parents=True, exist_ok=True)

    def _get_project_analytics_path(self, project_id: str) -> Path:
        """Get path to project analytics file."""
        return self.data_dir / f"project_{project_id}" / "analytics.json"

    def _get_global_metrics_path(self) -> Path:
        """Get path to global metrics file."""
        return self.data_dir / "_analytics" / "global.json"

    def _load_project_analytics(self, project_id: str) -> ProjectAnalytics:
        """Load or create project analytics."""
        path = self._get_project_analytics_path(project_id)

        if path.exists():
            with open(path, "r") as f:
                data = json.load(f)
                return ProjectAnalytics(**data)

        # Create new analytics for project
        now = datetime.utcnow().isoformat()
        analytics = ProjectAnalytics(
            project_id=project_id,
            created_at=now,
            last_updated=now,
            session_metrics=SessionMetrics(
                project_id=project_id,
                session_started_at=now
            )
        )
        self._save_project_analytics(analytics)
        return analytics

    def _save_project_analytics(self, analytics: ProjectAnalytics):
        """Save project analytics to file."""
        analytics.last_updated = datetime.utcnow().isoformat()
        path = self._get_project_analytics_path(analytics.project_id)
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w") as f:
            json.dump(analytics.model_dump(), f, indent=2)

    def _load_global_metrics(self) -> GlobalMetrics:
        """Load or create global metrics."""
        path = self._get_global_metrics_path()

        if path.exists():
            with open(path, "r") as f:
                data = json.load(f)
                return GlobalMetrics(**data)

        return GlobalMetrics(last_updated=datetime.utcnow().isoformat())

    def _save_global_metrics(self, metrics: GlobalMetrics):
        """Save global metrics to file."""
        metrics.last_updated = datetime.utcnow().isoformat()
        path = self._get_global_metrics_path()

        with open(path, "w") as f:
            json.dump(metrics.model_dump(), f, indent=2)

    # =========================================================================
    # PERFORMANCE TRACKING
    # =========================================================================

    def record_generation_start(
        self,
        project_id: str,
        stage_id: int,
        stage_name: str
    ) -> str:
        """
        Record when AI generation begins.
        Returns event_id for tracking first token and completion.
        """
        analytics = self._load_project_analytics(project_id)
        now = datetime.utcnow().isoformat()

        # Create new performance metric
        metric = PerformanceMetrics(
            stage_id=stage_id,
            stage_name=stage_name,
            request_started_at=now
        )

        analytics.performance_metrics.append(metric)
        self._save_project_analytics(analytics)

        # Return index as event_id
        return str(len(analytics.performance_metrics) - 1)

    def record_first_token(self, project_id: str, event_id: str):
        """Record when first token is received (for streaming)."""
        analytics = self._load_project_analytics(project_id)
        idx = int(event_id)

        if 0 <= idx < len(analytics.performance_metrics):
            metric = analytics.performance_metrics[idx]
            now = datetime.utcnow()
            metric.first_token_at = now.isoformat()

            # Calculate time to first token
            start = datetime.fromisoformat(metric.request_started_at)
            metric.time_to_first_token_ms = int((now - start).total_seconds() * 1000)

            self._save_project_analytics(analytics)

    def record_generation_complete(
        self,
        project_id: str,
        event_id: str,
        model: Optional[str] = None
    ):
        """Record when generation completes."""
        analytics = self._load_project_analytics(project_id)
        idx = int(event_id)

        if 0 <= idx < len(analytics.performance_metrics):
            metric = analytics.performance_metrics[idx]
            now = datetime.utcnow()
            metric.response_completed_at = now.isoformat()
            metric.model_used = model

            # Calculate total generation time
            start = datetime.fromisoformat(metric.request_started_at)
            metric.total_generation_time_ms = int((now - start).total_seconds() * 1000)
            metric.api_response_time_ms = metric.total_generation_time_ms

            self._save_project_analytics(analytics)

    # =========================================================================
    # USER BEHAVIOR TRACKING
    # =========================================================================

    def record_stage_enter(
        self,
        project_id: str,
        stage_id: int,
        stage_name: str,
        user_id: Optional[str] = None
    ):
        """Record when user enters a stage."""
        analytics = self._load_project_analytics(project_id)
        now = datetime.utcnow().isoformat()

        # Update user_id if provided
        if user_id:
            analytics.user_id = user_id
            if analytics.session_metrics:
                analytics.session_metrics.user_id = user_id

        # Find or create behavior metric for this stage
        existing = next(
            (b for b in analytics.user_behavior if b.stage_id == stage_id),
            None
        )

        if existing:
            existing.stage_entered_at = now
        else:
            behavior = UserBehaviorMetrics(
                stage_id=stage_id,
                stage_name=stage_name,
                stage_entered_at=now
            )
            analytics.user_behavior.append(behavior)

        # Update session metrics
        if analytics.session_metrics:
            analytics.session_metrics.current_stage = stage_id
            if stage_id > analytics.session_metrics.highest_stage_reached:
                analytics.session_metrics.highest_stage_reached = stage_id

        self._save_project_analytics(analytics)

    def record_stage_exit(
        self,
        project_id: str,
        stage_id: int,
        time_spent_seconds: Optional[float] = None
    ):
        """Record when user exits a stage."""
        analytics = self._load_project_analytics(project_id)
        now = datetime.utcnow()

        # Find behavior metric for this stage
        behavior = next(
            (b for b in analytics.user_behavior if b.stage_id == stage_id),
            None
        )

        if behavior:
            behavior.stage_exited_at = now.isoformat()

            if time_spent_seconds is not None:
                behavior.time_spent_seconds = time_spent_seconds
            elif behavior.stage_entered_at:
                # Calculate time spent
                entered = datetime.fromisoformat(behavior.stage_entered_at)
                behavior.time_spent_seconds = (now - entered).total_seconds()

        self._save_project_analytics(analytics)

    def record_field_edit(
        self,
        project_id: str,
        stage_id: int,
        field_name: str,
        ai_value: str,
        human_value: str
    ):
        """Record a field-level edit for prompt refinement analysis."""
        analytics = self._load_project_analytics(project_id)
        now = datetime.utcnow().isoformat()

        # Find behavior metric for this stage
        behavior = next(
            (b for b in analytics.user_behavior if b.stage_id == stage_id),
            None
        )

        if not behavior:
            # Create behavior entry if it doesn't exist
            behavior = UserBehaviorMetrics(
                stage_id=stage_id,
                stage_name=f"stage_{stage_id}",
                stage_entered_at=now
            )
            analytics.user_behavior.append(behavior)

        # Determine edit type
        if not ai_value and human_value:
            edit_type = "added"
        elif ai_value and not human_value:
            edit_type = "deleted"
        else:
            edit_type = "modified"

        # Create field edit record
        field_edit = FieldEdit(
            field_name=field_name,
            ai_value=ai_value,
            human_value=human_value,
            edit_type=edit_type,
            timestamp=now
        )

        behavior.field_edits.append(field_edit)
        behavior.manual_edit_count += 1

        # Calculate character changes
        behavior.characters_added += max(0, len(human_value) - len(ai_value))
        behavior.characters_removed += max(0, len(ai_value) - len(human_value))

        self._save_project_analytics(analytics)

    def record_regeneration(self, project_id: str, stage_id: int):
        """Record a regeneration event."""
        analytics = self._load_project_analytics(project_id)

        # Find behavior metric for this stage
        behavior = next(
            (b for b in analytics.user_behavior if b.stage_id == stage_id),
            None
        )

        if behavior:
            behavior.regeneration_count += 1
            self._save_project_analytics(analytics)

    def record_go_back(
        self,
        project_id: str,
        from_stage: int,
        to_stage: int
    ):
        """Record when user goes back to a previous stage."""
        analytics = self._load_project_analytics(project_id)

        if analytics.session_metrics:
            analytics.session_metrics.go_back_count += 1

        self._save_project_analytics(analytics)

    # =========================================================================
    # SATISFACTION & COMPLETION
    # =========================================================================

    def submit_rating(
        self,
        project_id: str,
        rating: int,
        feedback: Optional[str] = None,
        user_id: Optional[str] = None
    ):
        """Submit user satisfaction rating."""
        analytics = self._load_project_analytics(project_id)
        now = datetime.utcnow().isoformat()

        analytics.satisfaction_rating = SatisfactionRating(
            project_id=project_id,
            user_id=user_id or analytics.user_id,
            rating=rating,
            feedback_text=feedback,
            submitted_at=now
        )

        # Mark session as completed
        if analytics.session_metrics:
            analytics.session_metrics.completion_status = "completed"
            analytics.session_metrics.session_ended_at = now

            # Calculate total time
            if analytics.session_metrics.session_started_at:
                started = datetime.fromisoformat(analytics.session_metrics.session_started_at)
                ended = datetime.fromisoformat(now)
                analytics.session_metrics.total_time_spent_seconds = (ended - started).total_seconds()

        self._save_project_analytics(analytics)

    def mark_project_abandoned(self, project_id: str):
        """Mark a project as abandoned."""
        analytics = self._load_project_analytics(project_id)

        if analytics.session_metrics:
            analytics.session_metrics.completion_status = "abandoned"
            analytics.session_metrics.session_ended_at = datetime.utcnow().isoformat()

        self._save_project_analytics(analytics)

    # =========================================================================
    # USER REGISTRATIONS
    # =========================================================================

    def record_user_registration(
        self,
        user_id: str,
        email: Optional[str] = None,
        created_at: Optional[str] = None
    ):
        """Record a new user registration from Clerk webhook."""
        global_metrics = self._load_global_metrics()

        registration = UserRegistration(
            user_id=user_id,
            email=email,
            created_at=created_at or datetime.utcnow().isoformat()
        )

        global_metrics.registrations.append(registration)
        global_metrics.total_users += 1

        self._save_global_metrics(global_metrics)

    # =========================================================================
    # RETRIEVAL & AGGREGATION
    # =========================================================================

    def get_project_analytics(self, project_id: str) -> ProjectAnalytics:
        """Get complete analytics for a project."""
        return self._load_project_analytics(project_id)

    def get_all_projects_analytics(
        self,
        time_range: Optional[str] = None
    ) -> List[ProjectAnalytics]:
        """Get analytics for all projects, optionally filtered by time range."""
        projects = []
        cutoff = self._get_time_cutoff(time_range)

        for project_dir in self.data_dir.glob("project_*"):
            analytics_file = project_dir / "analytics.json"
            if analytics_file.exists():
                with open(analytics_file, "r") as f:
                    data = json.load(f)
                    analytics = ProjectAnalytics(**data)

                    # Filter by time range
                    if cutoff:
                        created = datetime.fromisoformat(analytics.created_at)
                        if created < cutoff:
                            continue

                    projects.append(analytics)

        return projects

    def _get_time_cutoff(self, time_range: Optional[str]) -> Optional[datetime]:
        """Calculate cutoff datetime based on time range string."""
        if not time_range or time_range == "all":
            return None

        now = datetime.utcnow()

        if time_range == "7d":
            return now - timedelta(days=7)
        elif time_range == "30d":
            return now - timedelta(days=30)
        elif time_range == "90d":
            return now - timedelta(days=90)

        return None

    def get_dashboard_data(self, time_range: str = "30d") -> dict:
        """Get aggregated data for admin dashboard."""
        projects = self.get_all_projects_analytics(time_range)
        global_metrics = self._load_global_metrics()
        cutoff = self._get_time_cutoff(time_range)

        # Filter registrations by time range
        registrations = global_metrics.registrations
        if cutoff:
            registrations = [
                r for r in registrations
                if datetime.fromisoformat(r.created_at) >= cutoff
            ]

        # Calculate aggregated metrics
        total_projects = len(projects)
        completed_projects = sum(
            1 for p in projects
            if p.session_metrics and p.session_metrics.completion_status == "completed"
        )

        # Satisfaction metrics
        ratings = [p.satisfaction_rating.rating for p in projects if p.satisfaction_rating]
        avg_rating = sum(ratings) / len(ratings) if ratings else 0
        rating_distribution = {i: ratings.count(i) for i in range(1, 6)}

        # Performance metrics aggregation
        performance_by_stage = self._aggregate_performance(projects)

        # User behavior aggregation
        behavior_summary = self._aggregate_behavior(projects)

        # Field edit patterns
        field_edit_patterns = self._aggregate_field_edits(projects)

        # Completion funnel
        funnel = self._calculate_funnel(projects)

        return {
            "time_range": time_range,
            "total_projects": total_projects,
            "completed_projects": completed_projects,
            "completion_rate": completed_projects / total_projects if total_projects > 0 else 0,
            "new_registrations": len(registrations),
            "avg_rating": round(avg_rating, 2),
            "rating_distribution": rating_distribution,
            "performance_by_stage": performance_by_stage,
            "behavior_summary": behavior_summary,
            "field_edit_patterns": field_edit_patterns,
            "funnel": funnel,
            "recent_feedback": self._get_recent_feedback(projects, limit=10)
        }

    def _aggregate_performance(self, projects: List[ProjectAnalytics]) -> dict:
        """Aggregate performance metrics across projects."""
        stage_metrics = {}

        for project in projects:
            for metric in project.performance_metrics:
                stage = metric.stage_name
                if stage not in stage_metrics:
                    stage_metrics[stage] = {
                        "ttft_values": [],
                        "gen_time_values": []
                    }

                if metric.time_to_first_token_ms:
                    stage_metrics[stage]["ttft_values"].append(metric.time_to_first_token_ms)
                if metric.total_generation_time_ms:
                    stage_metrics[stage]["gen_time_values"].append(metric.total_generation_time_ms)

        # Calculate averages and percentiles
        result = {}
        for stage, data in stage_metrics.items():
            ttft = data["ttft_values"]
            gen_time = data["gen_time_values"]

            result[stage] = {
                "avg_ttft_ms": int(sum(ttft) / len(ttft)) if ttft else None,
                "avg_gen_time_ms": int(sum(gen_time) / len(gen_time)) if gen_time else None,
                "p95_ttft_ms": int(sorted(ttft)[int(len(ttft) * 0.95)]) if len(ttft) > 1 else (ttft[0] if ttft else None),
                "sample_count": len(ttft)
            }

        return result

    def _aggregate_behavior(self, projects: List[ProjectAnalytics]) -> dict:
        """Aggregate user behavior metrics."""
        stage_data = {}
        total_go_backs = 0

        for project in projects:
            if project.session_metrics:
                total_go_backs += project.session_metrics.go_back_count

            for behavior in project.user_behavior:
                stage = behavior.stage_name
                if stage not in stage_data:
                    stage_data[stage] = {
                        "time_spent": [],
                        "regenerations": [],
                        "edits": []
                    }

                if behavior.time_spent_seconds:
                    stage_data[stage]["time_spent"].append(behavior.time_spent_seconds)
                stage_data[stage]["regenerations"].append(behavior.regeneration_count)
                stage_data[stage]["edits"].append(behavior.manual_edit_count)

        result = {}
        for stage, data in stage_data.items():
            result[stage] = {
                "avg_time_seconds": int(sum(data["time_spent"]) / len(data["time_spent"])) if data["time_spent"] else None,
                "avg_regenerations": round(sum(data["regenerations"]) / len(data["regenerations"]), 2) if data["regenerations"] else 0,
                "avg_edits": round(sum(data["edits"]) / len(data["edits"]), 2) if data["edits"] else 0
            }

        result["total_go_backs"] = total_go_backs
        return result

    def _aggregate_field_edits(self, projects: List[ProjectAnalytics]) -> dict:
        """Aggregate field edit patterns for prompt refinement."""
        field_stats = {}

        for project in projects:
            for behavior in project.user_behavior:
                for edit in behavior.field_edits:
                    field = edit.field_name
                    if field not in field_stats:
                        field_stats[field] = {
                            "edit_count": 0,
                            "project_count": set(),
                            "samples": []
                        }

                    field_stats[field]["edit_count"] += 1
                    field_stats[field]["project_count"].add(project.project_id)

                    # Keep sample edits (up to 10 per field)
                    if len(field_stats[field]["samples"]) < 10:
                        field_stats[field]["samples"].append({
                            "ai_value": edit.ai_value[:100],  # Truncate long values
                            "human_value": edit.human_value[:100]
                        })

        # Convert to serializable format
        total_projects = len(projects) or 1
        result = {}
        for field, stats in field_stats.items():
            result[field] = {
                "edit_count": stats["edit_count"],
                "projects_affected": len(stats["project_count"]),
                "edit_rate": round(len(stats["project_count"]) / total_projects * 100, 1),
                "samples": stats["samples"]
            }

        # Sort by edit rate
        result = dict(sorted(result.items(), key=lambda x: x[1]["edit_rate"], reverse=True))
        return result

    def _calculate_funnel(self, projects: List[ProjectAnalytics]) -> dict:
        """Calculate completion funnel."""
        stages = [1, 2, 3, 4]
        funnel = {}

        for stage in stages:
            reached = sum(
                1 for p in projects
                if p.session_metrics and p.session_metrics.highest_stage_reached >= stage
            )
            funnel[f"stage_{stage}"] = reached

        # Calculate drop-off rates
        total = len(projects) or 1
        funnel["dropoff_rates"] = {}
        for i, stage in enumerate(stages):
            current = funnel[f"stage_{stage}"]
            funnel["dropoff_rates"][f"stage_{stage}"] = round((1 - current / total) * 100, 1)

        return funnel

    def _get_recent_feedback(self, projects: List[ProjectAnalytics], limit: int = 10) -> list:
        """Get recent satisfaction feedback."""
        feedback = []

        for project in projects:
            if project.satisfaction_rating and project.satisfaction_rating.feedback_text:
                feedback.append({
                    "project_id": project.project_id,
                    "rating": project.satisfaction_rating.rating,
                    "feedback": project.satisfaction_rating.feedback_text,
                    "submitted_at": project.satisfaction_rating.submitted_at
                })

        # Sort by date and limit
        feedback.sort(key=lambda x: x["submitted_at"], reverse=True)
        return feedback[:limit]

    def get_registrations(self, time_range: str = "30d") -> dict:
        """Get registration data for the dashboard."""
        global_metrics = self._load_global_metrics()
        cutoff = self._get_time_cutoff(time_range)

        registrations = global_metrics.registrations
        if cutoff:
            registrations = [
                r for r in registrations
                if datetime.fromisoformat(r.created_at) >= cutoff
            ]

        # Group by date
        by_date = {}
        for reg in registrations:
            date = reg.created_at[:10]  # YYYY-MM-DD
            by_date[date] = by_date.get(date, 0) + 1

        return {
            "total": len(registrations),
            "by_date": by_date,
            "all_time_total": global_metrics.total_users
        }


# Singleton instance
analytics_tracker = AnalyticsTracker()
