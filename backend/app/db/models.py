"""SQLAlchemy ORM models."""

from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id = Column(Text, primary_key=True)  # UUID string
    user_id = Column(Text, nullable=False, index=True)
    title = Column(Text, nullable=False, default="")
    type_id = Column(Integer, default=1)
    type_name = Column(Text, default="")
    user_input = Column(Text, default="")
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    # Relationships
    pipeline_state = relationship("PipelineState", back_populates="project", uselist=False,
                                  cascade="all, delete-orphan")
    stage_snapshots = relationship("StageSnapshot", back_populates="project",
                                   cascade="all, delete-orphan")
    uploads = relationship("Upload", back_populates="project", cascade="all, delete-orphan")
    artifact_versions = relationship(
        "ArtifactVersion",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ArtifactVersion(Base):
    """Append-only snapshot in one of a project's artifact streams."""

    __tablename__ = "artifact_versions"

    id = Column(Text, primary_key=True, default=lambda: str(uuid4()))
    project_id = Column(
        Text,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    artifact_type = Column(Text, nullable=False)
    version_number = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)  # JSON text
    based_on_version_id = Column(
        Text,
        ForeignKey("artifact_versions.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by = Column(Text, nullable=False)
    is_override = Column(Boolean, nullable=False, default=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        CheckConstraint(
            "artifact_type IN ('intake', 'outline', 'storyboard')",
            name="ck_artifact_version_type",
        ),
        UniqueConstraint(
            "project_id",
            "artifact_type",
            "version_number",
            name="uq_project_artifact_version",
        ),
    )

    project = relationship("Project", back_populates="artifact_versions")


class PipelineState(Base):
    __tablename__ = "pipeline_states"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Text, ForeignKey("projects.id", ondelete="CASCADE"), unique=True,
                        nullable=False)
    phase = Column(Text, nullable=False, default="intake")
    status = Column(Text, nullable=False, default="pending")
    state_data = Column(Text, default="{}")  # JSON blob
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="pipeline_state")


class StageSnapshot(Base):
    __tablename__ = "stage_snapshots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Text, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    stage_id = Column(Integer, nullable=False)  # 1-5
    ai_version = Column(Text, nullable=True)  # JSON string, written once
    human_version = Column(Text, nullable=True)  # JSON string, updated on edit
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc),
                        onupdate=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("project_id", "stage_id", name="uq_project_stage"),
    )

    project = relationship("Project", back_populates="stage_snapshots")


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Text, primary_key=True)
    project_id = Column(Text, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    stage_id = Column(Integer, nullable=False, default=1)
    role = Column(Text, nullable=False)
    content = Column(Text, nullable=False)
    phase = Column(Integer, nullable=False, default=1)
    field_key = Column(Text, nullable=True)
    selected_chip = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project")


class Upload(Base):
    __tablename__ = "uploads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Text, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    filename = Column(Text, nullable=False)
    file_path = Column(Text, nullable=False)
    content_type = Column(Text, nullable=True)
    size_bytes = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))

    project = relationship("Project", back_populates="uploads")


class QualityLogEntry(Base):
    __tablename__ = "quality_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    project_id = Column(Text, nullable=False, index=True)
    event = Column(Text, nullable=False, index=True)
    stage = Column(Text, nullable=False)
    scope = Column(Text, nullable=True)
    attempt = Column(Integer, nullable=True)
    model = Column(Text, nullable=True)
    prompt_ref = Column(Text, nullable=True)
    context = Column(Text, nullable=True)
    raw_response = Column(Text, nullable=True)
    parsed_output = Column(Text, nullable=True)
    scores = Column(Text, nullable=True)
    instruction = Column(Text, nullable=True)
    before_content = Column(Text, nullable=True)
    after_content = Column(Text, nullable=True)
    parent_id = Column(Integer, ForeignKey("quality_log.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
