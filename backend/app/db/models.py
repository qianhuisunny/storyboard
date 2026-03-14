"""
SQLAlchemy ORM models — 4 tables.
"""

from datetime import datetime, timezone
from sqlalchemy import Column, Text, Integer, DateTime, ForeignKey, UniqueConstraint
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
