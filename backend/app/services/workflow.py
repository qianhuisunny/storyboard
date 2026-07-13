"""Concurrency-safe workflow transitions over immutable artifact versions."""

import asyncio
import inspect
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Awaitable, Callable, Optional
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.engine import AsyncSessionLocal
from app.db.repository import ProjectRepository
from app.services.state import JobOverlay, StateManager, StoryboardState


ArtifactContent = Any


class VersionConflictError(Exception):
    def __init__(self, current_version_id: Optional[str]):
        self.current_version_id = current_version_id
        super().__init__("The artifact changed since it was loaded")


class DuplicateJobError(Exception):
    def __init__(self, job: dict[str, Any]):
        self.job = job
        super().__init__("A matching generation job is already running")


class InvalidWorkflowEvent(Exception):
    def __init__(
        self,
        event: str,
        workflow_stage: str,
        allowed_events: list[str],
        message: Optional[str] = None,
    ):
        self.event = event
        self.workflow_stage = workflow_stage
        self.allowed_events = allowed_events
        super().__init__(message or f"Invalid event '{event}' for stage '{workflow_stage}'")


class WorkflowGenerationError(Exception):
    def __init__(self, message: str, job: Optional[dict[str, Any]] = None):
        self.job = job
        super().__init__(message)


@dataclass(frozen=True)
class GenerationContext:
    project_id: str
    kind: str
    input_version_id: str
    intake: dict
    target_version_id: Optional[str] = None
    outline: Any = None
    storyboard: Any = None
    current_content: Any = None
    instruction: Optional[str] = None

    def to_state(self) -> StoryboardState:
        """Create the current agents' StoryboardState-compatible input."""
        return StoryboardState(
            project_id=self.project_id,
            workflow_stage="outline" if self.kind == "outline" else "storyboard",
            phase="outline" if self.kind == "outline" else "storyboard",
            intake_form=self.intake,
            story_brief=self.intake,
            screen_outline=self.outline,
            storyboard=self.storyboard,
        )


@dataclass(frozen=True)
class GenerationResult:
    content: ArtifactContent
    evaluation: Optional[dict[str, Any]] = None


Generator = Callable[[GenerationContext], Awaitable[ArtifactContent] | ArtifactContent]


async def _production_outline_generator(context: GenerationContext) -> GenerationResult:
    """Use only methods that exist on the current Director and QualityGate."""
    from app.services.agents.storyboard_director import StoryboardDirector
    from app.services.orchestrator import orchestrator

    director = StoryboardDirector()
    state = context.to_state()
    if context.instruction:
        content = await asyncio.to_thread(
            director.refine_outline,
            context.current_content,
            context.instruction,
            context.intake,
        )
        evaluation = await orchestrator.quality_gate.evaluate(
            "outline", context.intake, content
        )
    else:
        content, evaluation = await asyncio.to_thread(
            lambda: asyncio.run(
                orchestrator.quality_gate.run_with_gate(
                    director, state, stage="outline"
                )
            )
        )
    orchestrator._raise_if_quality_gate_failed("Outline", evaluation)
    return GenerationResult(content, evaluation.to_dict())


async def _production_storyboard_generator(context: GenerationContext) -> GenerationResult:
    """Run the current Writer with existing storyboard included in its state."""
    from app.services.agents.storyboard_writer import StoryboardWriter
    from app.services.orchestrator import orchestrator

    writer = StoryboardWriter()
    state = context.to_state()
    if context.instruction:
        content = await asyncio.to_thread(
            writer.run,
            state,
            revision_instruction=context.instruction,
            existing_storyboard=context.current_content or context.storyboard,
        )
        evaluation = await orchestrator.quality_gate.evaluate(
            "storyboard",
            context.intake,
            content,
            outline=context.outline,
        )
    else:
        content, evaluation = await asyncio.to_thread(
            lambda: asyncio.run(
                orchestrator.quality_gate.run_with_gate(
                    writer,
                    state,
                    stage="storyboard",
                    outline_for_cross_stage=context.outline,
                )
            )
        )
    orchestrator._raise_if_quality_gate_failed("Storyboard", evaluation)
    return GenerationResult(content, evaluation.to_dict())


class WorkflowService:
    JOB_LEASE_DURATION = timedelta(minutes=15)
    NEW_EVENTS = {
        "save_intake",
        "approve_intake",
        "save_outline",
        "revise_outline",
        "approve_outline",
        "edit_intake",
        "save_storyboard",
        "revise_storyboard",
        "approve_storyboard",
        "edit_outline",
        "keep_storyboard",
        "reopen_intake",
        "reopen_outline",
        "reopen_storyboard",
    }
    ARTIFACTS = ("intake", "outline", "storyboard")
    GENERATION_KIND = {
        "approve_intake": "outline",
        "revise_outline": "outline",
        "approve_outline": "storyboard",
        "revise_storyboard": "storyboard",
    }

    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession] = AsyncSessionLocal,
        outline_generator: Generator = _production_outline_generator,
        storyboard_generator: Generator = _production_storyboard_generator,
    ):
        self.sessionmaker = sessionmaker
        self.outline_generator = outline_generator
        self.storyboard_generator = storyboard_generator

    async def process_event(
        self,
        project_id: str,
        event: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        payload = payload or {}
        if event not in self.NEW_EVENTS:
            state = await self._load_current_state(project_id)
            self._raise_invalid(event, state)

        if event.startswith("save_"):
            artifact_type = event.removeprefix("save_")
            await self._save_only(project_id, event, artifact_type, payload)
            return await self.get_project(project_id)

        if event in {"approve_intake", "approve_outline"}:
            target = "outline" if event == "approve_intake" else "storyboard"
            context, job_id = await self._approve_and_start(
                project_id, event, target, payload
            )
            return await self._run_generation(context, job_id)

        if event in {"revise_outline", "revise_storyboard"}:
            artifact_type = "outline" if event == "revise_outline" else "storyboard"
            context, job_id = await self._revise_and_start(
                project_id, event, artifact_type, payload
            )
            return await self._run_generation(context, job_id)

        if event == "approve_storyboard":
            await self._approve_storyboard(project_id, event, payload)
        elif event == "keep_storyboard":
            await self._keep_storyboard(project_id, event, payload)
        else:
            await self._move_stage(project_id, event)
        return await self.get_project(project_id)

    async def get_project(self, project_id: str) -> dict[str, Any]:
        async with self.sessionmaker() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            versions = {
                artifact_type: await repo.list_artifact_versions(
                    project_id, artifact_type
                )
                for artifact_type in self.ARTIFACTS
            }
            artifacts = {}
            for artifact_type in self.ARTIFACTS:
                pointers = state.artifacts[artifact_type]
                current_content = await self._content_for_pointer(
                    repo, pointers.current_version_id
                )
                approved_content = await self._content_for_pointer(
                    repo, pointers.approved_version_id
                )
                legacy_content = self._legacy_content(state, artifact_type)
                if current_content is None:
                    current_content = legacy_content
                if approved_content is None and self._legacy_is_approved(
                    state, artifact_type
                ):
                    approved_content = legacy_content
                artifacts[artifact_type] = {
                    **pointers.model_dump(),
                    "current_content": current_content,
                    "approved_content": approved_content,
                    "versions": [self._version_metadata(item) for item in versions[artifact_type]],
                }

            intake_current = artifacts["intake"]["current_content"]
            outline_current = artifacts["outline"]["current_content"]
            storyboard_current = artifacts["storyboard"]["current_content"]
            outline_is_versioned = (
                state.artifacts["outline"].current_version_id is not None
            )
            storyboard_is_versioned = (
                state.artifacts["storyboard"].current_version_id is not None
            )
            data = {
                "intake_form": (
                    state.intake_form
                    if state.intake_form is not None
                    else intake_current
                ),
                "story_brief": (
                    state.story_brief
                    if state.story_brief is not None
                    else intake_current
                ),
                "screen_outline": (
                    outline_current if outline_is_versioned else state.screen_outline
                ),
                "storyboard": (
                    storyboard_current
                    if storyboard_is_versioned
                    else state.storyboard
                ),
                "evidence_research": state.evidence_research,
                "outline_eval": state.outline_eval,
                "storyboard_eval": state.storyboard_eval,
            }
            allowed_events = StateManager(project_id).allowed_events(state)
            return {
                "success": True,
                "project_id": project_id,
                "workflow_stage": state.workflow_stage,
                "phase": state.phase,
                "allowed_events": allowed_events,
                "available_events": allowed_events,
                "job": state.job.model_dump(),
                "artifacts": artifacts,
                "state": {
                    "brief_locked": state.brief_locked,
                    "outline_locked": state.outline_locked,
                    "revision_count_gate1": state.revision_count_gate1,
                    "revision_count_gate2": state.revision_count_gate2,
                    "max_revisions": state.max_revisions,
                    "has_intake_form": data["intake_form"] is not None,
                    "has_story_brief": data["story_brief"] is not None,
                    "has_screen_outline": data["screen_outline"] is not None,
                    "has_storyboard": data["storyboard"] is not None,
                },
                "data": data,
                "revision_history": [item.model_dump() for item in state.revision_history],
            }

    async def _save_only(
        self,
        project_id: str,
        event: str,
        artifact_type: str,
        payload: dict[str, Any],
    ) -> None:
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            materialized = await self._materialize_legacy_artifacts(repo, state)
            payload = self._accept_materialized_expected(
                payload, artifact_type, materialized, state
            )
            self._expire_generation_lease(state)
            self._validate_event(event, state)
            self._require_content(event, state, payload)
            await self._save_human_artifact(repo, state, artifact_type, payload)
            await self._persist_state(repo, state)

    async def _approve_and_start(
        self,
        project_id: str,
        event: str,
        target: str,
        payload: dict[str, Any],
    ) -> tuple[GenerationContext, str]:
        artifact_type = "intake" if event == "approve_intake" else "outline"
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            materialized = await self._materialize_legacy_artifacts(repo, state)
            payload = self._accept_materialized_expected(
                payload, artifact_type, materialized, state
            )
            self._expire_generation_lease(state)
            self._require_content(event, state, payload)
            pointers = state.artifacts[artifact_type]
            current_content = await self._content_for_pointer(
                repo, pointers.current_version_id
            )
            candidate_input_id = (
                pointers.current_version_id
                if pointers.current_version_id is not None
                and current_content == payload["content"]
                else None
            )
            self._reject_duplicate_job(event, state, candidate_input_id)
            self._validate_event(event, state)
            await self._save_human_artifact(repo, state, artifact_type, payload)
            pointers.approved_version_id = pointers.current_version_id
            pointers.needs_update = False
            StateManager(project_id).mark_upstream_changed(state, artifact_type)
            state.workflow_stage = target
            state.phase = target
            job_id = str(uuid4())
            state.job = JobOverlay(
                status="running",
                job_id=job_id,
                kind=target,
                input_version_id=pointers.approved_version_id,
                target_version_id=state.artifacts[target].current_version_id,
                started_at=datetime.now(timezone.utc).isoformat(),
            )
            context = await self._generation_context(
                repo,
                state,
                target,
                pointers.approved_version_id,
            )
            await self._persist_state(repo, state)
        return context, job_id

    async def _revise_and_start(
        self,
        project_id: str,
        event: str,
        artifact_type: str,
        payload: dict[str, Any],
    ) -> tuple[GenerationContext, str]:
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            materialized = await self._materialize_legacy_artifacts(repo, state)
            payload = self._accept_materialized_expected(
                payload, artifact_type, materialized, state
            )
            self._expire_generation_lease(state)
            instruction = payload.get("instruction")
            if not isinstance(instruction, str) or not instruction.strip():
                self._raise_invalid(event, state, "instruction is required")
            pointers = state.artifacts[artifact_type]
            self._check_expected(pointers.current_version_id, payload)
            if pointers.current_version_id is None:
                self._raise_invalid(event, state, "a current version is required")
            upstream_type = "intake" if artifact_type == "outline" else "outline"
            input_version_id = state.artifacts[upstream_type].approved_version_id
            if input_version_id is None:
                self._raise_invalid(event, state, "an approved upstream version is required")
            self._reject_duplicate_job(event, state, input_version_id)
            self._validate_event(event, state)
            current_content = await self._content_for_pointer(
                repo, pointers.current_version_id
            )
            job_id = str(uuid4())
            state.job = JobOverlay(
                status="running",
                job_id=job_id,
                kind=artifact_type,
                input_version_id=input_version_id,
                target_version_id=pointers.current_version_id,
                started_at=datetime.now(timezone.utc).isoformat(),
            )
            context = await self._generation_context(
                repo,
                state,
                artifact_type,
                input_version_id,
                current_content=current_content,
                instruction=instruction.strip(),
            )
            await self._persist_state(repo, state)
        return context, job_id

    async def _run_generation(
        self, context: GenerationContext, job_id: str
    ) -> dict[str, Any]:
        generator = (
            self.outline_generator
            if context.kind == "outline"
            else self.storyboard_generator
        )
        try:
            generated = generator(context)
            if inspect.isawaitable(generated):
                generated = await generated
            if isinstance(generated, GenerationResult):
                content = generated.content
                evaluation = generated.evaluation
            else:
                content = generated
                evaluation = None
            self._validate_generated_content(context.kind, content)
        except asyncio.CancelledError:
            await asyncio.shield(
                self._persist_generation_failure(
                    context.project_id, job_id, "Generation cancelled"
                )
            )
            raise
        except Exception as error:
            failed_job = await self._persist_generation_failure(
                context.project_id, job_id, str(error)
            )
            if failed_job is None:
                failed_job = JobOverlay(
                    status="failed",
                    job_id=job_id,
                    kind=context.kind,
                    input_version_id=context.input_version_id,
                    target_version_id=context.target_version_id,
                    error=str(error),
                ).model_dump()
            raise WorkflowGenerationError(str(error), failed_job) from error

        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, context.project_id)
            version = await repo.create_artifact_version(
                context.project_id,
                context.kind,
                content,
                created_by="ai",
                based_on_version_id=context.input_version_id,
                commit=False,
            )
            input_type = "intake" if context.kind == "outline" else "outline"
            owns_job = (
                state.job.status == "running"
                and state.job.job_id == job_id
                and state.job.kind == context.kind
            )
            is_current = (
                owns_job
                and state.job.input_version_id == context.input_version_id
                and state.job.target_version_id == context.target_version_id
                and state.artifacts[input_type].approved_version_id
                == context.input_version_id
                and state.artifacts[input_type].current_version_id
                == context.input_version_id
                and state.artifacts[context.kind].current_version_id
                == context.target_version_id
            )
            if is_current:
                pointers = state.artifacts[context.kind]
                pointers.current_version_id = version.id
                pointers.needs_update = False
                self._set_legacy_content(state, context.kind, content)
                if evaluation is not None:
                    if context.kind == "outline":
                        state.outline_eval = evaluation
                    else:
                        state.storyboard_eval = evaluation
            if owns_job:
                state.job = JobOverlay()
            await self._persist_state(repo, state)
        return await self.get_project(context.project_id)

    async def _persist_generation_failure(
        self, project_id: str, job_id: str, message: str
    ) -> Optional[dict[str, Any]]:
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            if state.job.status == "running" and state.job.job_id == job_id:
                state.job.status = "failed"
                state.job.error = message
                await self._persist_state(repo, state)
                return state.job.model_dump()
        return None

    async def _approve_storyboard(
        self,
        project_id: str,
        event: str,
        payload: dict[str, Any],
    ) -> None:
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            materialized = await self._materialize_legacy_artifacts(repo, state)
            payload = self._accept_materialized_expected(
                payload, "storyboard", materialized, state
            )
            self._expire_generation_lease(state)
            self._validate_event(event, state)
            self._require_content(event, state, payload)
            pointers = state.artifacts["storyboard"]
            self._check_expected(pointers.current_version_id, payload)
            current_content = await self._content_for_pointer(
                repo, pointers.current_version_id
            )
            if pointers.needs_update and current_content == payload["content"]:
                self._raise_invalid(
                    event,
                    state,
                    "The storyboard is stale and unchanged; use keep_storyboard "
                    "to explicitly keep it against the new outline.",
                )
            await self._save_human_artifact(repo, state, "storyboard", payload)
            pointers.approved_version_id = pointers.current_version_id
            pointers.needs_update = False
            state.workflow_stage = "complete"
            state.phase = "complete"
            state.job = JobOverlay()
            await self._persist_state(repo, state)

    async def _keep_storyboard(
        self,
        project_id: str,
        event: str,
        payload: dict[str, Any],
    ) -> None:
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            materialized = await self._materialize_legacy_artifacts(repo, state)
            payload = self._accept_materialized_expected(
                payload, "storyboard", materialized, state
            )
            self._expire_generation_lease(state)
            self._validate_event(event, state)
            pointers = state.artifacts["storyboard"]
            self._check_expected(pointers.current_version_id, payload)
            approved_outline = state.artifacts["outline"].approved_version_id
            if pointers.current_version_id is None or approved_outline is None:
                self._raise_invalid(
                    event, state, "current storyboard and approved outline are required"
                )
            content = await self._content_for_pointer(repo, pointers.current_version_id)
            version = await repo.create_artifact_version(
                project_id,
                "storyboard",
                content,
                created_by="human",
                based_on_version_id=approved_outline,
                is_override=True,
                commit=False,
            )
            pointers.current_version_id = version.id
            pointers.needs_update = False
            self._set_legacy_content(state, "storyboard", content)
            await self._persist_state(repo, state)

    async def _move_stage(self, project_id: str, event: str) -> None:
        targets = {
            "edit_intake": "intake",
            "edit_outline": "outline",
            "reopen_intake": "intake",
            "reopen_outline": "outline",
            "reopen_storyboard": "storyboard",
        }
        async with self._write_session() as session:
            repo = ProjectRepository(session)
            state = await self._load_state(repo, project_id)
            await self._materialize_legacy_artifacts(repo, state)
            self._expire_generation_lease(state)
            self._validate_event(event, state)
            state.workflow_stage = targets[event]
            state.phase = targets[event]
            await self._persist_state(repo, state)

    @asynccontextmanager
    async def _write_session(self) -> AsyncIterator[AsyncSession]:
        """Acquire SQLite's write lock before reading any mutable state."""
        async with self.sessionmaker() as session:
            await session.execute(text("BEGIN IMMEDIATE"))
            try:
                yield session
                await session.commit()
            except BaseException:
                await session.rollback()
                raise

    async def _save_human_artifact(
        self,
        repo: ProjectRepository,
        state: StoryboardState,
        artifact_type: str,
        payload: dict[str, Any],
    ) -> str:
        pointers = state.artifacts[artifact_type]
        self._check_expected(pointers.current_version_id, payload)
        content = payload["content"]
        based_on = self._human_based_on(state, artifact_type)
        current_version = (
            await repo.get_artifact_version(pointers.current_version_id)
            if pointers.current_version_id is not None
            else None
        )
        current_content = (
            repo.parse_artifact_content(current_version)
            if current_version is not None
            else None
        )
        same_lineage = (
            artifact_type == "intake"
            or (
                current_version is not None
                and current_version.based_on_version_id == based_on
            )
        )
        if current_version is not None and current_content == content and same_lineage:
            return current_version.id

        version = await repo.create_artifact_version(
            state.project_id,
            artifact_type,
            content,
            created_by="human",
            based_on_version_id=based_on,
            commit=False,
        )
        pointers.current_version_id = version.id
        pointers.needs_update = False
        self._set_legacy_content(state, artifact_type, content)
        if artifact_type in {"intake", "outline"}:
            StateManager(state.project_id).mark_upstream_changed(
                state, artifact_type
            )
        return version.id

    def _human_based_on(
        self, state: StoryboardState, artifact_type: str
    ) -> Optional[str]:
        if artifact_type == "intake":
            return state.artifacts["intake"].current_version_id
        if artifact_type == "outline":
            return (
                state.artifacts["intake"].approved_version_id
                or state.artifacts["outline"].current_version_id
            )
        return (
            state.artifacts["outline"].approved_version_id
            or state.artifacts["storyboard"].current_version_id
        )

    async def _materialize_legacy_artifacts(
        self, repo: ProjectRepository, state: StoryboardState
    ) -> set[str]:
        """Create immutable versions for legacy content under the write lock."""
        materialized: set[str] = set()
        for artifact_type in self.ARTIFACTS:
            pointers = state.artifacts[artifact_type]
            legacy_content = self._legacy_content(state, artifact_type)
            if pointers.current_version_id is None and legacy_content is not None:
                if artifact_type == "intake":
                    based_on = None
                elif artifact_type == "outline":
                    based_on = (
                        state.artifacts["intake"].approved_version_id
                        or state.artifacts["intake"].current_version_id
                    )
                else:
                    based_on = (
                        state.artifacts["outline"].approved_version_id
                        or state.artifacts["outline"].current_version_id
                    )
                version = await repo.create_artifact_version(
                    state.project_id,
                    artifact_type,
                    legacy_content,
                    created_by="migration",
                    based_on_version_id=based_on,
                    commit=False,
                )
                pointers.current_version_id = version.id
                materialized.add(artifact_type)

            if (
                pointers.current_version_id is not None
                and pointers.approved_version_id is None
                and self._legacy_is_approved(state, artifact_type)
            ):
                pointers.approved_version_id = pointers.current_version_id

        return materialized

    def _accept_materialized_expected(
        self,
        payload: dict[str, Any],
        artifact_type: str,
        materialized: set[str],
        state: StoryboardState,
    ) -> dict[str, Any]:
        if (
            artifact_type in materialized
            and payload.get("expected_version_id") is None
        ):
            return {
                **payload,
                "expected_version_id": state.artifacts[
                    artifact_type
                ].current_version_id,
            }
        return payload

    def _expire_generation_lease(self, state: StoryboardState) -> bool:
        if state.job.status != "running":
            return False

        try:
            started_at = datetime.fromisoformat(state.job.started_at or "")
            if started_at.tzinfo is None:
                started_at = started_at.replace(tzinfo=timezone.utc)
            expired = (
                datetime.now(timezone.utc) - started_at
                >= self.JOB_LEASE_DURATION
            )
        except (TypeError, ValueError):
            expired = True

        if not expired:
            return False

        state.job.status = "failed"
        state.job.error = "Generation job lease expired"
        return True

    async def _generation_context(
        self,
        repo: ProjectRepository,
        state: StoryboardState,
        kind: str,
        input_version_id: str,
        current_content: Any = None,
        instruction: Optional[str] = None,
    ) -> GenerationContext:
        intake_id = state.artifacts["intake"].approved_version_id
        intake = await self._content_for_pointer(repo, intake_id)
        if intake is None:
            intake = state.story_brief or state.intake_form or {}
        outline_id = (
            state.artifacts["outline"].approved_version_id
            or state.artifacts["outline"].current_version_id
        )
        outline = await self._content_for_pointer(repo, outline_id)
        if outline is None:
            outline = state.screen_outline
        storyboard = await self._content_for_pointer(
            repo, state.artifacts["storyboard"].current_version_id
        )
        if storyboard is None:
            storyboard = state.storyboard
        return GenerationContext(
            project_id=state.project_id,
            kind=kind,
            input_version_id=input_version_id,
            intake=intake,
            target_version_id=state.job.target_version_id,
            outline=outline,
            storyboard=storyboard,
            current_content=current_content,
            instruction=instruction,
        )

    async def _load_current_state(self, project_id: str) -> StoryboardState:
        async with self.sessionmaker() as session:
            return await self._load_state(ProjectRepository(session), project_id)

    async def _load_state(
        self, repo: ProjectRepository, project_id: str
    ) -> StoryboardState:
        project = await repo.get_project(project_id)
        if project is None:
            raise ValueError(f"Project not found: {project_id}")
        row = await repo.get_pipeline_state(project_id)
        data = repo.parse_state_data(row) if row else {}
        data.setdefault("project_id", project_id)
        if row is not None:
            data["phase"] = row.phase or data.get("phase", "intake")
        return StoryboardState(**data)

    async def _persist_state(
        self, repo: ProjectRepository, state: StoryboardState
    ) -> None:
        state.updated_at = datetime.now(timezone.utc).isoformat()
        status = "completed" if state.workflow_stage == "complete" else "pending"
        await repo.update_pipeline_state(
            state.project_id,
            phase=state.phase,
            status=status,
            state_data=state.model_dump(),
            commit=False,
        )

    def _validate_event(self, event: str, state: StoryboardState) -> None:
        if event not in StateManager(state.project_id).allowed_events(state):
            self._raise_invalid(event, state)

    def _raise_invalid(
        self,
        event: str,
        state: StoryboardState,
        message: Optional[str] = None,
    ) -> None:
        raise InvalidWorkflowEvent(
            event,
            state.workflow_stage,
            StateManager(state.project_id).allowed_events(state),
            message,
        )

    def _reject_duplicate_job(
        self,
        event: str,
        state: StoryboardState,
        input_version_id: Optional[str],
    ) -> None:
        kind = self.GENERATION_KIND.get(event)
        if (
            kind is not None
            and state.job.status == "running"
            and state.job.kind == kind
            and state.job.input_version_id == input_version_id
        ):
            raise DuplicateJobError(state.job.model_dump())

    def _check_expected(
        self, current_version_id: Optional[str], payload: dict[str, Any]
    ) -> None:
        if payload.get("expected_version_id") != current_version_id:
            raise VersionConflictError(current_version_id)

    def _require_content(
        self, event: str, state: StoryboardState, payload: dict[str, Any]
    ) -> None:
        if "content" not in payload:
            self._raise_invalid(event, state, "content is required")
        artifact_type = (
            "intake"
            if event.endswith("intake")
            else "outline"
            if event.endswith("outline")
            else "storyboard"
        )
        content = payload["content"]
        if artifact_type == "intake":
            valid = isinstance(content, dict)
        elif artifact_type == "outline":
            valid = isinstance(content, str) and bool(content.strip())
        else:
            valid = isinstance(content, list)
        if not valid:
            self._raise_invalid(
                event, state, f"invalid {artifact_type} content structure"
            )

    def _validate_generated_content(self, kind: str, content: Any) -> None:
        if kind == "outline" and (
            not isinstance(content, str) or not content.strip()
        ):
            raise ValueError("Outline generation returned invalid content")
        if kind == "storyboard" and not isinstance(content, list):
            raise ValueError("Storyboard generation returned invalid content")

    async def _content_for_pointer(
        self, repo: ProjectRepository, version_id: Optional[str]
    ) -> Any:
        if version_id is None:
            return None
        version = await repo.get_artifact_version(version_id)
        return repo.parse_artifact_content(version) if version is not None else None

    def _set_legacy_content(
        self, state: StoryboardState, artifact_type: str, content: Any
    ) -> None:
        if artifact_type == "intake":
            if state.intake_form is None and state.story_brief is None:
                state.intake_form = content
                state.story_brief = content
            elif state.intake_form is not None and state.story_brief is not None:
                if state.intake_form == state.story_brief:
                    state.intake_form = content
                state.story_brief = content
            elif state.story_brief is not None:
                state.story_brief = content
            else:
                state.intake_form = content
        elif artifact_type == "outline":
            state.screen_outline = content
        else:
            state.storyboard = content

    def _legacy_content(self, state: StoryboardState, artifact_type: str) -> Any:
        if artifact_type == "intake":
            return (
                state.story_brief
                if state.story_brief is not None
                else state.intake_form
            )
        if artifact_type == "outline":
            return state.screen_outline
        return state.storyboard

    def _legacy_is_approved(
        self, state: StoryboardState, artifact_type: str
    ) -> bool:
        rank = {"intake": 0, "outline": 1, "storyboard": 2, "complete": 3}
        artifact_rank = {"intake": 0, "outline": 1, "storyboard": 2}
        return rank[state.workflow_stage] > artifact_rank[artifact_type]

    def _version_metadata(self, version) -> dict[str, Any]:
        return {
            "id": version.id,
            "version_number": version.version_number,
            "based_on_version_id": version.based_on_version_id,
            "created_by": version.created_by,
            "is_override": bool(version.is_override),
            "created_at": version.created_at.isoformat(),
        }


workflow_service = WorkflowService()
