"""
Data access layer — async CRUD for all 4 tables.
"""

import json
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from .models import ChatMessage, Project, PipelineState, StageSnapshot, Upload


class ProjectRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ---- Projects ----

    async def create_project(
        self, project_id: str, user_id: str, title: str,
        type_id: int = 1, type_name: str = "", user_input: str = ""
    ) -> Project:
        project = Project(
            id=project_id, user_id=user_id, title=title,
            type_id=type_id, type_name=type_name, user_input=user_input,
        )
        self.session.add(project)
        # Also create initial pipeline state
        ps = PipelineState(project_id=project_id, phase="intake", status="pending", state_data="{}")
        self.session.add(ps)
        await self.session.commit()
        return project

    async def get_project(self, project_id: str) -> Optional[Project]:
        result = await self.session.execute(
            select(Project).where(Project.id == project_id)
        )
        return result.scalar_one_or_none()

    async def list_projects(self, user_id: str) -> list[Project]:
        result = await self.session.execute(
            select(Project).where(Project.user_id == user_id).order_by(Project.updated_at.desc())
        )
        return list(result.scalars().all())

    async def delete_project(self, project_id: str) -> bool:
        project = await self.get_project(project_id)
        if not project:
            return False
        await self.session.delete(project)
        await self.session.commit()
        return True

    async def update_project_timestamp(self, project_id: str):
        await self.session.execute(
            update(Project).where(Project.id == project_id).values(
                updated_at=datetime.now(timezone.utc)
            )
        )
        await self.session.commit()

    # ---- Pipeline State ----

    async def get_pipeline_state(self, project_id: str) -> Optional[PipelineState]:
        result = await self.session.execute(
            select(PipelineState).where(PipelineState.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def update_pipeline_state(
        self, project_id: str, phase: str, status: str, state_data: dict
    ):
        ps = await self.get_pipeline_state(project_id)
        if ps:
            ps.phase = phase
            ps.status = status
            ps.state_data = json.dumps(state_data)
            ps.updated_at = datetime.now(timezone.utc)
        else:
            ps = PipelineState(
                project_id=project_id, phase=phase, status=status,
                state_data=json.dumps(state_data),
            )
            self.session.add(ps)
        await self.session.commit()

    def parse_state_data(self, ps: PipelineState) -> dict:
        """Parse the JSON blob from pipeline_state."""
        if not ps or not ps.state_data:
            return {}
        try:
            return json.loads(ps.state_data)
        except json.JSONDecodeError:
            return {}

    # ---- Stage Snapshots ----

    async def get_stage_snapshot(self, project_id: str, stage_id: int) -> Optional[StageSnapshot]:
        result = await self.session.execute(
            select(StageSnapshot).where(
                StageSnapshot.project_id == project_id,
                StageSnapshot.stage_id == stage_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_all_snapshots(self, project_id: str) -> list[StageSnapshot]:
        result = await self.session.execute(
            select(StageSnapshot).where(
                StageSnapshot.project_id == project_id
            ).order_by(StageSnapshot.stage_id)
        )
        return list(result.scalars().all())

    async def get_all_stage_snapshots(self) -> list[StageSnapshot]:
        """Get all stage snapshots across all projects (for admin drift view).
        Eager-loads the Project relationship to avoid N+1 queries."""
        result = await self.session.execute(
            select(StageSnapshot)
            .where(StageSnapshot.stage_id.in_([2, 3]))
            .options(selectinload(StageSnapshot.project))
            .order_by(StageSnapshot.project_id, StageSnapshot.stage_id)
        )
        return list(result.scalars().all())

    async def save_stage_snapshot(
        self, project_id: str, stage_id: int,
        ai_version: Optional[str] = None,
        human_version: Optional[str] = None,
    ):
        snap = await self.get_stage_snapshot(project_id, stage_id)
        if snap:
            # Only update ai_version if provided AND not already set
            if ai_version is not None and snap.ai_version is None:
                snap.ai_version = ai_version
            if human_version is not None:
                snap.human_version = human_version
            snap.updated_at = datetime.now(timezone.utc)
        else:
            snap = StageSnapshot(
                project_id=project_id, stage_id=stage_id,
                ai_version=ai_version, human_version=human_version,
            )
            self.session.add(snap)
        await self.session.commit()

    # ---- Chat Messages ----

    async def list_chat_messages(self, project_id: str, stage_id: int = 1) -> list[ChatMessage]:
        result = await self.session.execute(
            select(ChatMessage)
            .where(ChatMessage.project_id == project_id, ChatMessage.stage_id == stage_id)
            .order_by(ChatMessage.created_at.asc(), ChatMessage.id.asc())
        )
        return list(result.scalars().all())

    async def upsert_chat_messages(self, project_id: str, messages: list[dict], stage_id: int = 1):
        if not messages:
            return

        message_ids = [message["id"] for message in messages]
        result = await self.session.execute(
            select(ChatMessage).where(
                ChatMessage.project_id == project_id,
                ChatMessage.stage_id == stage_id,
                ChatMessage.id.in_(message_ids),
            )
        )
        existing_messages = {
            message.id: message
            for message in result.scalars().all()
        }

        for message in messages:
            existing = existing_messages.get(message["id"])
            if existing:
                existing.role = message["role"]
                existing.content = message["content"]
                existing.phase = int(message.get("phase", 1))
                existing.field_key = message.get("fieldKey")
                existing.selected_chip = message.get("selectedChip")
            else:
                self.session.add(
                    ChatMessage(
                        id=message["id"],
                        project_id=project_id,
                        stage_id=stage_id,
                        role=message["role"],
                        content=message["content"],
                        phase=int(message.get("phase", 1)),
                        field_key=message.get("fieldKey"),
                        selected_chip=message.get("selectedChip"),
                    )
                )

        await self.session.commit()

    # ---- Uploads ----

    async def create_upload(
        self, project_id: str, filename: str, file_path: str,
        content_type: Optional[str] = None, size_bytes: Optional[int] = None,
    ) -> Upload:
        upload = Upload(
            project_id=project_id, filename=filename, file_path=file_path,
            content_type=content_type, size_bytes=size_bytes,
        )
        self.session.add(upload)
        await self.session.commit()
        return upload

    async def list_uploads(self, project_id: str) -> list[Upload]:
        result = await self.session.execute(
            select(Upload).where(Upload.project_id == project_id).order_by(Upload.created_at)
        )
        return list(result.scalars().all())
