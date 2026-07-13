import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertCircle, Menu, X, Cloud, CloudOff, Loader2, RefreshCw, Copy, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import StageNavigation, { type Stage, type StageStatus } from "./StageNavigation";
import StageContent from "./StageContent";
import SatisfactionRatingModal from "./SatisfactionRatingModal";
import { useAnalytics } from "@/hooks/useAnalytics";
import { isGuidedBriefType } from "@/lib/videoIntent";
import { getAnonymousUserId } from "@/lib/anonymousUser";
import { ensureSession } from "@/lib/session";
import {
  getWorkflow,
  isCanonicalIntakeArtifact,
  sendWorkflowEvent,
  sendWorkflowGenerationEvent,
  WorkflowConflictError,
  type WorkflowResponse,
} from "@/lib/workflow";

const INITIAL_STAGES: Stage[] = [
  { id: 1, name: "Smart Intake", description: "Complete the missing story inputs", status: "not_started" },
  { id: 2, name: "Outline", description: "Review the story structure", status: "not_started" },
  { id: 3, name: "Storyboard", description: "Edit visuals and scripts", status: "not_started" },
  { id: 4, name: "Complete", description: "Review and export", status: "not_started" },
];

interface StageData {
  aiVersion: string | null;
  humanVersion: string | null;
}

interface PipelineStateResponse {
  success: boolean;
  phase?: string;
  state?: {
    has_story_brief?: boolean;
    has_screen_outline?: boolean;
    has_storyboard?: boolean;
  };
  data?: {
    story_brief?: unknown;
    screen_outline?: unknown;
    storyboard?: unknown;
  };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";
type WorkflowLoadState = "loading" | "canonical" | "legacy" | "error";
type EditableArtifact = "outline" | "storyboard";

interface VersionConflictState {
  stageId: 2 | 3;
  message: string;
}

function stringifyForStageData(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function parseMaybeJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function isMeaningfulStageContent(content: string | null | undefined): boolean {
  return typeof content === "string" && content.trim().length > 0;
}

function hasStageContent(data: StageData | undefined): boolean {
  return isMeaningfulStageContent(data?.aiVersion) || isMeaningfulStageContent(data?.humanVersion);
}

function fillStageFromPipeline(
  existing: Record<number, StageData>,
  stageId: number,
  content: unknown,
  version: keyof StageData,
) {
  if (content == null || hasStageContent(existing[stageId])) return;
  const prior = existing[stageId] ?? { aiVersion: null, humanVersion: null };
  existing[stageId] = {
    ...prior,
    [version]: stringifyForStageData(content),
  };
}

function hydrateStageDataFromPipeline(
  restoredData: Record<number, StageData>,
  pipelineState: PipelineStateResponse | null,
): Record<number, StageData> {
  const next = { ...restoredData };
  const pipelineData = pipelineState?.data;
  if (!pipelineData) return next;

  fillStageFromPipeline(next, 1, pipelineData.story_brief, "humanVersion");
  fillStageFromPipeline(next, 2, pipelineData.screen_outline, "aiVersion");
  fillStageFromPipeline(next, 3, pipelineData.storyboard, "aiVersion");
  fillStageFromPipeline(next, 4, pipelineData.storyboard, "aiVersion");

  return next;
}

function hydrateStageDataFromWorkflow(workflow: WorkflowResponse): Record<number, StageData> {
  const next: Record<number, StageData> = {};
  const intake = workflow.artifacts.intake.current_content;
  const outline = workflow.artifacts.outline.current_content;
  const storyboard = workflow.artifacts.storyboard.current_content;

  if (intake != null) {
    next[1] = { aiVersion: null, humanVersion: stringifyForStageData(intake) };
  }
  if (outline != null) {
    next[2] = { aiVersion: stringifyForStageData(outline), humanVersion: null };
  }
  if (storyboard != null) {
    next[3] = { aiVersion: stringifyForStageData(storyboard), humanVersion: null };
    next[4] = { aiVersion: stringifyForStageData(storyboard), humanVersion: null };
  }
  return next;
}

function deriveStageViewFromWorkflow(workflow: WorkflowResponse): {
  currentStageId: number;
  stageStatuses: Record<number, StageStatus>;
} {
  const stageIds = { intake: 1, outline: 2, storyboard: 3, complete: 4 } as const;
  const currentStageId = stageIds[workflow.workflow_stage];
  const stageStatuses: Record<number, StageStatus> = {
    1: workflow.artifacts.intake.current_version_id ? "in_progress" : "not_started",
    2: "not_started",
    3: "not_started",
    4: "not_started",
  };

  if (currentStageId > 1) stageStatuses[1] = "approved";
  if (currentStageId > 2) stageStatuses[2] = "approved";
  if (currentStageId > 3) stageStatuses[3] = "approved";
  if (workflow.workflow_stage === "complete") stageStatuses[4] = "approved";

  if (workflow.workflow_stage === "outline") {
    stageStatuses[2] = workflow.job.status === "running" && workflow.job.kind === "outline"
      ? "generating"
      : workflow.artifacts.outline.current_version_id
      ? "needs_review"
      : "in_progress";
  } else if (workflow.workflow_stage === "storyboard") {
    stageStatuses[3] = workflow.job.status === "running" && workflow.job.kind === "storyboard"
      ? "generating"
      : workflow.artifacts.storyboard.current_version_id
      ? "needs_review"
      : "in_progress";
  }

  return { currentStageId, stageStatuses };
}

function deriveStageViewFromPipeline(
  pipelineState: PipelineStateResponse | null,
  savedCurrentStageId?: number,
): { currentStageId: number; stageStatuses: Record<number, StageStatus> } | null {
  const phase = pipelineState?.phase;
  if (!phase) return null;

  const stageStatuses: Record<number, StageStatus> = {
    1: "not_started",
    2: "not_started",
    3: "not_started",
    4: "not_started",
  };

  let currentStageId = savedCurrentStageId || 1;

  if (phase === "intake") {
    currentStageId = 1;
  } else if ([
    "brief_chat",
    "brief_round1",
    "brief_round2",
    "brief_round3",
    "angle_selection",
  ].includes(phase)) {
    currentStageId = 1;
    stageStatuses[1] = "in_progress";
  } else if (phase === "brief_review" || phase === "gate1") {
    currentStageId = 1;
    stageStatuses[1] = "needs_review";
  } else if (phase === "gate2" || phase === "outline_research") {
    currentStageId = 2;
    stageStatuses[1] = "approved";
    stageStatuses[2] = phase === "outline_research" ? "generating" : "needs_review";
  } else if (phase === "review") {
    currentStageId = 3;
    stageStatuses[1] = "approved";
    stageStatuses[2] = "approved";
    stageStatuses[3] = "needs_review";
  } else if (phase === "done") {
    currentStageId = 4;
    stageStatuses[1] = "approved";
    stageStatuses[2] = "approved";
    stageStatuses[3] = "approved";
    stageStatuses[4] = "approved";
  }

  return { currentStageId, stageStatuses };
}

export default function StageLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [userId] = useState(() => getAnonymousUserId());
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [stages, setStages] = useState<Stage[]>(INITIAL_STAGES);
  const [currentStageId, setCurrentStageId] = useState(1);
  const [stageData, setStageData] = useState<Record<number, StageData>>({});
  const [isGenerating, setIsGenerating] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [projectContext, setProjectContext] = useState<{
    userInput: string;
    typeName: string;
  } | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isLoadingStages, setIsLoadingStages] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [workflowState, setWorkflowState] = useState<WorkflowResponse | null>(null);
  const [workflowLoadState, setWorkflowLoadState] = useState<WorkflowLoadState>("loading");
  const [workflowLoadError, setWorkflowLoadError] = useState<string | null>(null);
  const [workflowLoadAttempt, setWorkflowLoadAttempt] = useState(0);
  const [workflowActionError, setWorkflowActionError] = useState<string | null>(null);
  const [isRetryingJob, setIsRetryingJob] = useState(false);
  const [isWorkflowActionPending, setIsWorkflowActionPending] = useState(false);
  const [versionConflict, setVersionConflict] = useState<VersionConflictState | null>(null);
  const [editorResetGeneration, setEditorResetGeneration] = useState(0);
  const hasLoadedStages = useRef(false);
  const workflowLoadGenerationRef = useRef(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const saveStatusIdleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reloadLatestButtonRef = useRef<HTMLButtonElement | null>(null);
  const conflictRestoreFocusRef = useRef<HTMLElement | null>(null);
  const previousStageIdRef = useRef<number | null>(null);
  const stageDataRef = useRef(stageData);
  const workflowStateRef = useRef(workflowState);
  const canonicalSaveInFlightRef = useRef<Promise<WorkflowResponse | null> | null>(null);
  const suppressedConflictContentRef = useRef<string | null>(null);
  const generateStageRef = useRef<(stageId: number, context?: string, feedback?: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    stageDataRef.current = stageData;
  }, [stageData]);

  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (saveStatusIdleTimeoutRef.current) clearTimeout(saveStatusIdleTimeoutRef.current);
  }, [projectId]);

  const usesCanonicalWorkflow = Boolean(
    workflowLoadState === "canonical"
    && workflowState
    && isCanonicalIntakeArtifact(workflowState.artifacts.intake),
  );

  // Initialize analytics tracking
  const analytics = useAnalytics(projectId, userId ?? undefined);

  // Load project context on mount
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const loadProject = async () => {
      if (!projectId) return;

      // Wait for stages to finish loading before deciding to generate
      if (isLoadingStages || workflowLoadState === "loading" || workflowLoadState === "error") return;

      try {
        setProjectLoadError(null);
        await ensureSession();

        // Project persistence is the source of truth for ownership. A local
        // anonymous ID must never stand in for a Clerk-owned project.
        const response = await fetch(`/api/project/${projectId}`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Project request failed: ${response.status}`);
        }

        const data = await response.json();
        if (!active) return;
        const project = data.success ? data.project : null;
        if (!project?.id) throw new Error("Project data is missing");

        // Try to load from sessionStorage first
        const storedPrompt = sessionStorage.getItem("storyboardPrompt");
        const storedType = sessionStorage.getItem("storyboardType");

        if (storedPrompt) {
          setProjectContext({
            userInput: storedPrompt,
            typeName: storedType || "Video Project",
          });

          // Start legacy generation only for old non-guided projects.
          const storedTypeName = sessionStorage.getItem("storyboardTypeName");
          const isGuidedBrief = Boolean(sessionStorage.getItem("storyboardIntentRoute")) || isGuidedBriefType(storedTypeName);
          if (workflowLoadState === "legacy" && !stageDataRef.current[1]?.aiVersion && !hasLoadedStages.current && !isGuidedBrief) {
            void generateStageRef.current(1, storedPrompt);
          }
        } else {
          setProjectContext({
            userInput: project.userInput,
            typeName: project.typeName,
          });

          // Start legacy generation only for old non-guided projects.
          const projectIsGuidedBrief = isGuidedBriefType(project.typeName);
          if (workflowLoadState === "legacy" && !stageDataRef.current[1]?.aiVersion && !hasLoadedStages.current && project.userInput && !projectIsGuidedBrief) {
            void generateStageRef.current(1, project.userInput);
          }
        }
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("Failed to load project:", error);
        setProjectLoadError("Unable to verify this project's owner. Refresh to try again.");
      }
    };

    loadProject();
    return () => {
      active = false;
      controller.abort();
    };
  }, [projectId, isLoadingStages, workflowLoadState]);

  // Load saved stages on mount
  useEffect(() => {
    const generation = ++workflowLoadGenerationRef.current;
    const controller = new AbortController();
    const isCurrentLoad = () => workflowLoadGenerationRef.current === generation;

    setIsLoadingStages(true);
    setWorkflowLoadState("loading");
    setWorkflowLoadError(null);
    setWorkflowState(null);
    setStageData({});
    setStages(INITIAL_STAGES);
    setCurrentStageId(1);
    setProjectContext(null);
    setProjectLoadError(null);
    setWorkflowActionError(null);
    setVersionConflict(null);
    suppressedConflictContentRef.current = null;
    hasLoadedStages.current = false;

    const loadSavedStages = async () => {
      if (!projectId) return;

      try {
        const pipelinePayload = await getWorkflow(projectId, fetch, controller.signal);
        if (!isCurrentLoad()) return;
        setWorkflowState(pipelinePayload);

        const isCanonicalWorkflow = isCanonicalIntakeArtifact(pipelinePayload.artifacts.intake);
        setWorkflowLoadState(isCanonicalWorkflow ? "canonical" : "legacy");
        let stagesPayload: {
          stages?: Record<string, StageData>;
          currentStageId?: number;
          stageStatuses?: unknown;
        } = {};
        const restoredData: Record<number, StageData> = {};

        // Canonical version pointers are the sole source of truth. Legacy stage
        // snapshots are consulted only for projects that have not migrated.
        if (!isCanonicalWorkflow) {
          const stagesResponse = await fetch(`/api/project/${projectId}/stages`, {
            signal: controller.signal,
          });
          if (!isCurrentLoad()) return;
          stagesPayload = stagesResponse.ok ? await stagesResponse.json() : {};
          if (stagesPayload.stages && Object.keys(stagesPayload.stages).length > 0) {
            for (const [key, value] of Object.entries(stagesPayload.stages)) {
              restoredData[parseInt(key)] = value;
            }
          }
        }

        const hydratedData = isCanonicalWorkflow
          ? hydrateStageDataFromWorkflow(pipelinePayload)
          : hydrateStageDataFromPipeline(restoredData, pipelinePayload as PipelineStateResponse);
        if (!isCurrentLoad()) return;
        setStageData(hydratedData);

        const derivedStageView = isCanonicalWorkflow
          ? deriveStageViewFromWorkflow(pipelinePayload)
          : deriveStageViewFromPipeline(
              pipelinePayload as PipelineStateResponse,
              stagesPayload.currentStageId,
            );

        if (derivedStageView) {
          setCurrentStageId(derivedStageView.currentStageId);
          setStages((prev) =>
            prev.map((s) => ({
              ...s,
              status: derivedStageView.stageStatuses[s.id] ?? s.status,
            }))
          );
        } else {
          if (stagesPayload.currentStageId) {
            setCurrentStageId(stagesPayload.currentStageId);
          }

          if (stagesPayload.stageStatuses && Array.isArray(stagesPayload.stageStatuses)) {
            const savedStageStatuses = stagesPayload.stageStatuses;
            setStages((prev) =>
              prev.map((s) => {
                const savedStatus = savedStageStatuses.find(
                  (ss: { id: number; status: StageStatus }) => ss.id === s.id
                );
                if (!savedStatus) return s;
                const status = savedStatus.status === "generating" ? "not_started" : savedStatus.status;
                return { ...s, status };
              })
            );
          }
        }

        hasLoadedStages.current =
          Object.values(hydratedData).some(hasStageContent) ||
          Boolean(pipelinePayload?.state?.has_story_brief);
        console.log("Restored saved stages:", { stages: stagesPayload, pipeline: pipelinePayload });
      } catch (error) {
        if (!isCurrentLoad() || (error instanceof DOMException && error.name === "AbortError")) return;
        console.error("Failed to load saved stages:", error);
        setWorkflowLoadState("error");
        setWorkflowLoadError(
          error instanceof Error ? error.message : "The workflow request failed.",
        );
      } finally {
        if (isCurrentLoad()) setIsLoadingStages(false);
      }
    };

    void loadSavedStages();
    return () => {
      controller.abort();
    };
  }, [projectId, workflowLoadAttempt]);

  const handleWorkflowChange = useCallback((nextWorkflow: WorkflowResponse) => {
    workflowStateRef.current = nextWorkflow;
    setWorkflowState(nextWorkflow);
    const isCanonical = isCanonicalIntakeArtifact(nextWorkflow.artifacts.intake);
    setWorkflowLoadState(isCanonical ? "canonical" : "legacy");
    setWorkflowLoadError(null);
    if (!isCanonical) return;
    const hydrated = hydrateStageDataFromWorkflow(nextWorkflow);
    for (const stageId of [2, 3] as const) {
      const localCopy = stageDataRef.current[stageId]?.humanVersion;
      if (localCopy && localCopy !== hydrated[stageId]?.aiVersion) {
        hydrated[stageId] = {
          aiVersion: hydrated[stageId]?.aiVersion ?? null,
          humanVersion: localCopy,
        };
      }
    }
    setStageData(hydrated);
    const stageView = deriveStageViewFromWorkflow(nextWorkflow);
    setCurrentStageId(stageView.currentStageId);
    setStages((current) => current.map((stage) => ({
      ...stage,
      status: stageView.stageStatuses[stage.id] ?? stage.status,
    })));
  }, []);

  const surfaceWorkflowError = useCallback((caught: unknown, stageId: 2 | 3, content: string) => {
    if (caught instanceof WorkflowConflictError && caught.code === "version_conflict") {
      conflictRestoreFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      suppressedConflictContentRef.current = content;
      setVersionConflict({ stageId, message: caught.message });
      setSaveStatus("error");
      return;
    }
    setWorkflowActionError(caught instanceof Error ? caught.message : "The workflow action failed.");
    setSaveStatus("error");
  }, []);

  const saveCanonicalArtifact = useCallback(async (
    stageId: 2 | 3,
    content: string,
  ): Promise<WorkflowResponse | null> => {
    if (!projectId) return null;
    if (canonicalSaveInFlightRef.current) {
      await canonicalSaveInFlightRef.current;
    }

    const artifactType: EditableArtifact = stageId === 2 ? "outline" : "storyboard";
    const currentWorkflow = workflowStateRef.current;
    if (!currentWorkflow || currentWorkflow.workflow_stage !== artifactType) {
      return null;
    }

    if (saveStatusIdleTimeoutRef.current) clearTimeout(saveStatusIdleTimeoutRef.current);
    setSaveStatus("saving");
    setWorkflowActionError(null);
    const request = sendWorkflowEvent(projectId, `save_${artifactType}`, {
      content: parseMaybeJson(content),
      expected_version_id: currentWorkflow.artifacts[artifactType].current_version_id,
    }).then((nextWorkflow) => {
      const newestLocalCopy = stageDataRef.current[stageId]?.humanVersion;
      handleWorkflowChange(nextWorkflow);
      if (newestLocalCopy !== null && newestLocalCopy !== undefined && newestLocalCopy !== content) {
        const serverContent = nextWorkflow.artifacts[artifactType].current_content;
        setStageData((current) => ({
          ...current,
          [stageId]: {
            aiVersion: serverContent == null ? null : stringifyForStageData(serverContent),
            humanVersion: newestLocalCopy,
          },
        }));
      } else {
        suppressedConflictContentRef.current = null;
      }
      setSaveStatus("saved");
      if (saveStatusIdleTimeoutRef.current) clearTimeout(saveStatusIdleTimeoutRef.current);
      saveStatusIdleTimeoutRef.current = setTimeout(() => {
        saveStatusIdleTimeoutRef.current = null;
        setSaveStatus("idle");
      }, 1800);
      return nextWorkflow;
    }).catch((caught: unknown) => {
      surfaceWorkflowError(caught, stageId, content);
      return null;
    }).finally(() => {
      canonicalSaveInFlightRef.current = null;
    });

    canonicalSaveInFlightRef.current = request;
    return request;
  }, [handleWorkflowChange, projectId, surfaceWorkflowError]);

  useEffect(() => {
    if (!usesCanonicalWorkflow || isLoadingStages || (currentStageId !== 2 && currentStageId !== 3)) return;
    const localCopy = stageData[currentStageId]?.humanVersion;
    if (!localCopy || localCopy === stageData[currentStageId]?.aiVersion) return;
    if (suppressedConflictContentRef.current === localCopy) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void saveCanonicalArtifact(currentStageId, localCopy);
    }, 650);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [currentStageId, isLoadingStages, saveCanonicalArtifact, stageData, usesCanonicalWorkflow]);

  const ensureLatestArtifact = useCallback(async (
    artifactType: EditableArtifact,
    content: string,
  ): Promise<WorkflowResponse | null> => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (canonicalSaveInFlightRef.current) await canonicalSaveInFlightRef.current;
    const stageId = artifactType === "outline" ? 2 : 3;
    let latest = workflowStateRef.current;
    if (!latest) return null;
    const serverContent = latest.artifacts[artifactType].current_content;
    if (serverContent == null || stringifyForStageData(serverContent) !== content) {
      latest = await saveCanonicalArtifact(stageId, content);
    }
    return latest;
  }, [saveCanonicalArtifact]);

  const handleCanonicalRevise = useCallback(async (
    artifactType: EditableArtifact,
    content: string,
    instruction: string,
  ) => {
    if (!projectId || isWorkflowActionPending || workflowStateRef.current?.job.status === "running") return;
    const stageId = artifactType === "outline" ? 2 : 3;
    setIsWorkflowActionPending(true);
    setWorkflowActionError(null);
    try {
      const saved = await ensureLatestArtifact(artifactType, content);
      if (!saved) return;
      const next = await sendWorkflowGenerationEvent(projectId, `revise_${artifactType}`, {
        instruction,
        expected_version_id: saved.artifacts[artifactType].current_version_id,
      }, handleWorkflowChange);
      handleWorkflowChange(next);
    } catch (caught) {
      surfaceWorkflowError(caught, stageId, content);
      if (!(caught instanceof WorkflowConflictError)) {
        try { handleWorkflowChange(await getWorkflow(projectId)); } catch { /* Keep the original error. */ }
      }
    } finally {
      setIsWorkflowActionPending(false);
    }
  }, [ensureLatestArtifact, handleWorkflowChange, isWorkflowActionPending, projectId, surfaceWorkflowError]);

  const handleCanonicalApprove = useCallback(async (
    artifactType: EditableArtifact,
    content: string,
  ) => {
    if (!projectId || isWorkflowActionPending || workflowStateRef.current?.job.status === "running") return;
    const stageId = artifactType === "outline" ? 2 : 3;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setIsWorkflowActionPending(true);
    setWorkflowActionError(null);
    try {
      if (canonicalSaveInFlightRef.current) await canonicalSaveInFlightRef.current;
      const latest = workflowStateRef.current;
      if (!latest) return;
      const payload = {
        content: parseMaybeJson(content),
        expected_version_id: latest.artifacts[artifactType].current_version_id,
      };
      const next = artifactType === "outline"
        ? await sendWorkflowGenerationEvent(projectId, "approve_outline", payload, handleWorkflowChange)
        : await sendWorkflowEvent(projectId, "approve_storyboard", payload);
      handleWorkflowChange(next);
    } catch (caught) {
      surfaceWorkflowError(caught, stageId, content);
      if (!(caught instanceof WorkflowConflictError)) {
        try { handleWorkflowChange(await getWorkflow(projectId)); } catch { /* Keep the original error. */ }
      }
    } finally {
      setIsWorkflowActionPending(false);
    }
  }, [handleWorkflowChange, isWorkflowActionPending, projectId, surfaceWorkflowError]);

  const handleKeepStoryboard = useCallback(async () => {
    if (!projectId || isWorkflowActionPending || workflowStateRef.current?.job.status === "running") return;
    const current = workflowStateRef.current;
    const storyboard = current?.artifacts.storyboard;
    if (!current || !storyboard?.current_version_id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setIsWorkflowActionPending(true);
    setWorkflowActionError(null);
    try {
      const editableContent = stageDataRef.current[3]?.humanVersion
        ?? stringifyForStageData(storyboard.current_content);
      const latest = await ensureLatestArtifact("storyboard", editableContent);
      const latestStoryboard = latest?.artifacts.storyboard;
      if (!latestStoryboard?.current_version_id) return;
      handleWorkflowChange(await sendWorkflowEvent(projectId, "keep_storyboard", {
        expected_version_id: latestStoryboard.current_version_id,
      }));
    } catch (caught) {
      surfaceWorkflowError(caught, 3, stringifyForStageData(storyboard.current_content));
    } finally {
      setIsWorkflowActionPending(false);
    }
  }, [ensureLatestArtifact, handleWorkflowChange, isWorkflowActionPending, projectId, surfaceWorkflowError]);

  const reloadVersionConflict = useCallback(async () => {
    if (!projectId) return;
    setWorkflowActionError(null);
    try {
      if (versionConflict) {
        stageDataRef.current = {
          ...stageDataRef.current,
          [versionConflict.stageId]: {
            ...stageDataRef.current[versionConflict.stageId],
            humanVersion: null,
          },
        };
      }
      handleWorkflowChange(await getWorkflow(projectId));
      setEditorResetGeneration((generation) => generation + 1);
      setVersionConflict(null);
      suppressedConflictContentRef.current = null;
      setSaveStatus("idle");
    } catch (caught) {
      setWorkflowActionError(caught instanceof Error ? caught.message : "Could not reload the latest version.");
    }
  }, [handleWorkflowChange, projectId, versionConflict]);

  // Save stages function
  const saveStages = useCallback(async () => {
    if (!projectId || usesCanonicalWorkflow || Object.keys(stageData).length === 0) return;

    if (saveStatusIdleTimeoutRef.current) clearTimeout(saveStatusIdleTimeoutRef.current);
    setSaveStatus("saving");
    try {
      const response = await fetch(`/api/project/${projectId}/stages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stages: stageData,
          currentStageId,
          stageStatuses: stages.map((s) => ({ id: s.id, status: s.status })),
        }),
      });

      if (response.ok) {
        setSaveStatus("saved");
        saveStatusIdleTimeoutRef.current = setTimeout(() => {
          saveStatusIdleTimeoutRef.current = null;
          setSaveStatus("idle");
        }, 2000);
      } else {
        setSaveStatus("error");
      }
    } catch (error) {
      console.error("Failed to save stages:", error);
      setSaveStatus("error");
    }
  }, [projectId, stageData, currentStageId, stages, usesCanonicalWorkflow]);

  // Auto-save with 2-second debounce
  useEffect(() => {
    if (!projectId || usesCanonicalWorkflow || Object.keys(stageData).length === 0 || isLoadingStages) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for auto-save
    saveTimeoutRef.current = setTimeout(() => {
      saveStages();
    }, 2000);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [stageData, currentStageId, stages, projectId, isLoadingStages, saveStages, usesCanonicalWorkflow]);

  // Track stage enter/exit for analytics
  useEffect(() => {
    if (isLoadingStages || !userId) return;

    const currentStage = stages.find((s) => s.id === currentStageId);
    const stageName = currentStage?.name || `Stage ${currentStageId}`;

    // Track exit from previous stage
    if (previousStageIdRef.current !== null && previousStageIdRef.current !== currentStageId) {
      analytics.trackStageExit(previousStageIdRef.current);

      // Track go-back if navigating to an earlier stage
      if (currentStageId < previousStageIdRef.current) {
        analytics.trackGoBack(previousStageIdRef.current, currentStageId);
      }
    }

    // Track enter into current stage
    analytics.trackStageEnter(currentStageId, stageName);
    previousStageIdRef.current = currentStageId;

    // Cleanup: track exit when component unmounts or stage changes
    return () => {
      // Exit tracking is handled on the next stage change
    };
  }, [currentStageId, isLoadingStages, stages, analytics, userId]);

  const buildLegacyIntakeForm = useCallback((userInput: string, feedback?: string) => {
    const videoType = sessionStorage.getItem("storyboardType") || "1";
    const duration = sessionStorage.getItem("storyboardDuration") || "60";
    const audience = sessionStorage.getItem("storyboardAudience") || "";
    const videoTypeNames: Record<string, string> = {
      "1": "Product Release",
      "2": "Product Demo Video",
      "3": "YouTube Explainer",
      "4": "Talking Script",
      "5": "Planner / Lifestyle",
    };

    return {
      user_inputs: feedback ? `${userInput}\n\nRevision request:\n${feedback}` : userInput,
      video_goal: "",
      target_audience: audience,
      company_or_brand_name: "",
      tone_and_style: "professional",
      format_or_platform: "general",
      desired_length: duration,
      show_face: "No",
      cta: "",
      video_type: videoTypeNames[videoType] || "Product Release",
    };
  }, []);

  const setStageContentAndStatus = useCallback((stageId: number, content: string, status: StageStatus) => {
    setStageData((prev) => ({
      ...prev,
      [stageId]: {
        aiVersion: content,
        humanVersion: null,
      },
    }));
    updateStageStatus(stageId, status);
  }, []);

  const generateStage = async (stageId: number, context?: string, feedback?: string) => {
    if (stageId !== 1) {
      console.warn(`[StageLayout] generateStage(${stageId}) is deprecated. Use /event-driven transitions instead.`);
      return;
    }

    const storedType = sessionStorage.getItem("storyboardType");
    const storedIntentRoute = sessionStorage.getItem("storyboardIntentRoute");
    const storedTypeName = sessionStorage.getItem("storyboardTypeName");
    const projectType = projectContext?.typeName;
    const isGuidedBriefStage =
      Boolean(storedIntentRoute) || isGuidedBriefType(storedTypeName) || isGuidedBriefType(projectType) || storedType === "3";
    if (isGuidedBriefStage) {
      console.error("[StageLayout] Refusing to use legacy /start for guided brief projects. Use submit_guided_brief instead.");
      return;
    }

    setIsGenerating(true);
    updateStageStatus(stageId, "in_progress");

    try {
      // Get additional context from uploaded sources (files, links, text)
      const sourceContext = sessionStorage.getItem("storyboardContext") || "";

      // Combine user input with source context for the first stage
      let fullUserInput = context || projectContext?.userInput || "";
      if (stageId === 1 && sourceContext) {
        fullUserInput = `${fullUserInput}\n\n--- Reference Materials ---\n\n${sourceContext}`;
      }

      const response = await fetch(`/api/project/${projectId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intake_form: buildLegacyIntakeForm(fullUserInput, feedback),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate stage");
      }

      const data = await response.json();
      const briefContent = data.story_brief ? stringifyForStageData(data.story_brief) : null;
      if (!briefContent) {
        throw new Error("Brief generation returned no story_brief");
      }

      setStageContentAndStatus(stageId, briefContent, "needs_review");
    } catch (error) {
      console.error("Failed to generate stage:", error);
      updateStageStatus(stageId, "not_started");
    } finally {
      setIsGenerating(false);
    }
  };
  useEffect(() => {
    generateStageRef.current = generateStage;
  });

  const updateStageStatus = (stageId: number, status: StageStatus) => {
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, status } : s))
    );
  };

  const handleStageSelect = async (stageId: number) => {
    setIsMobileMenuOpen(false);
    if (!projectId || !workflowState || !usesCanonicalWorkflow) {
      setCurrentStageId(stageId);
      return;
    }

    if (currentStageId === 2 || currentStageId === 3) {
      const currentData = stageDataRef.current[currentStageId];
      if (
        currentData?.humanVersion
        && currentData.humanVersion !== currentData.aiVersion
        && suppressedConflictContentRef.current !== currentData.humanVersion
      ) {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        const saved = await saveCanonicalArtifact(currentStageId, currentData.humanVersion);
        if (!saved) return;
      }
    }

    const targetStage = ({ 1: "intake", 2: "outline", 3: "storyboard", 4: "complete" } as const)[stageId as 1 | 2 | 3 | 4];
    if (!targetStage || targetStage === workflowState.workflow_stage) return;

    let event: string | null = null;
    if (workflowState.workflow_stage === "complete") {
      event = ({ intake: "reopen_intake", outline: "reopen_outline", storyboard: "reopen_storyboard" } as const)[targetStage as "intake" | "outline" | "storyboard"] ?? null;
    } else if (targetStage === "intake" && ["outline", "storyboard"].includes(workflowState.workflow_stage)) {
      event = "edit_intake";
    } else if (targetStage === "outline" && workflowState.workflow_stage === "storyboard") {
      event = "edit_outline";
    }

    if (!event || !workflowState.allowed_events.includes(event)) return;
    setWorkflowActionError(null);
    try {
      handleWorkflowChange(await sendWorkflowEvent(projectId, event, {}));
    } catch (caught) {
      setWorkflowActionError(caught instanceof Error ? caught.message : "Could not reopen this stage.");
    }
  };

  const handleApprove = async (
    content: string,
    options?: { skipNextGeneration?: boolean; nextStageContent?: string }
  ) => {
    const currentStage = stages.find((s) => s.id === currentStageId);
    if (!currentStage) return;

    // Save the approved content
    setStageData((prev) => ({
      ...prev,
      [currentStageId]: {
        ...prev[currentStageId],
        humanVersion: content,
      },
    }));

    const advanceToNextStage = (nextStageId: number, nextContent: string) => {
      updateStageStatus(currentStageId, "approved");
      setCurrentStageId(nextStageId);
      setStageContentAndStatus(nextStageId, nextContent, "needs_review");
    };

    try {
      if (currentStageId === 1) {
        if (options?.nextStageContent) {
          advanceToNextStage(2, options.nextStageContent);
          return;
        }

        const response = await fetch(`/api/project/${projectId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "approve",
            payload: {
              current_story_brief: parseMaybeJson(content),
            },
          }),
        });
        if (!response.ok) throw new Error("Failed to approve brief");
        const data = await response.json();
        if (!data.screen_outline) throw new Error("Brief approval returned no outline");
        advanceToNextStage(2, stringifyForStageData(data.screen_outline));
        return;
      }

      if (currentStageId === 2) {
        const nextContent = options?.nextStageContent;
        if (!nextContent) {
          const response = await fetch(`/api/project/${projectId}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "approve",
              payload: {
                current_outline: content,
              },
            }),
          });
          if (!response.ok) throw new Error("Failed to approve outline");
          const data = await response.json();
          if (!data.storyboard) throw new Error("Outline approval returned no storyboard");
          advanceToNextStage(3, stringifyForStageData(data.storyboard));
          return;
        }

        advanceToNextStage(3, nextContent);
        return;
      }

      if (currentStageId === 3) {
        advanceToNextStage(4, content);
        return;
      }

      if (currentStageId === 4) {
        const response = await fetch(`/api/project/${projectId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "approve",
            payload: {
              current_storyboard: parseMaybeJson(content),
            },
          }),
        });
        if (!response.ok) throw new Error("Failed to finalize storyboard");
        updateStageStatus(currentStageId, "approved");
        setShowRatingModal(true);
      }
    } catch (error) {
      console.error("Failed to approve stage:", error);
      throw error;
    }
  };

  const handleRegenerate = async (feedback: string) => {
    // Track regeneration for analytics
    analytics.trackRegeneration(currentStageId);
    if (currentStageId === 1) {
      await generateStage(currentStageId, projectContext?.userInput, feedback);
      return;
    }
    console.warn(`[StageLayout] Generic regenerate is not supported for stage ${currentStageId}; use stage-specific event actions.`);
  };

  const handleRatingSubmit = async (rating: number, feedback: string) => {
    await analytics.submitRating(rating, feedback);
    navigate("/projects");
  };

  const handleRatingClose = () => {
    setShowRatingModal(false);
    navigate("/projects");
  };

  const handleContentChange = (content: string) => {
    setStageData((prev) => ({
      ...prev,
      [currentStageId]: {
        ...prev[currentStageId],
        humanVersion: content,
      },
    }));
  };

  const handleStoryboardGeneratingChange = useCallback((generating: boolean) => {
    if (generating) {
      updateStageStatus(2, "approved");
      updateStageStatus(3, "generating");
      return;
    }

    setStages((prev) => {
      const stage3WasGenerating = prev.some((s) => s.id === 3 && s.status === "generating");
      if (!stage3WasGenerating) return prev;

      return prev.map((s) => {
        if (s.id === 2) return { ...s, status: "needs_review" };
        if (s.id === 3) return { ...s, status: "not_started" };
        return s;
      });
    });
  }, []);

  const currentStage = stages.find((s) => s.id === currentStageId);
  const currentData = stageData[currentStageId] || { aiVersion: null, humanVersion: null };
  const activeJobStageId = workflowState?.job.kind === "outline"
    ? 2
    : workflowState?.job.kind === "storyboard"
    ? 3
    : null;
  const jobAppliesToCurrentStage = usesCanonicalWorkflow
    && activeJobStageId === currentStageId
    && workflowState?.job.status !== "idle";
  const workflowMutationLocked = isWorkflowActionPending || workflowState?.job.status === "running";

  const handleRetryInitialOutline = async () => {
    if (!projectId || !workflowState || workflowState.job.kind !== "outline") return;
    setIsRetryingJob(true);
    setWorkflowActionError(null);
    try {
      let editableWorkflow = workflowState;
      if (editableWorkflow.workflow_stage !== "intake") {
        const reopenEvent = editableWorkflow.workflow_stage === "complete" ? "reopen_intake" : "edit_intake";
        editableWorkflow = await sendWorkflowEvent(projectId, reopenEvent, {});
        handleWorkflowChange(editableWorkflow);
      }
      const intake = editableWorkflow.artifacts.intake;
      if (!isCanonicalIntakeArtifact(intake)) {
        throw new Error("The current Smart Intake version is unavailable.");
      }
      const next = await sendWorkflowGenerationEvent(
        projectId,
        "approve_intake",
        {
          content: intake.current_content,
          expected_version_id: intake.current_version_id,
        },
        handleWorkflowChange,
      );
      handleWorkflowChange(next);
    } catch (caught) {
      setWorkflowActionError(caught instanceof Error ? caught.message : "Could not retry outline generation.");
      try {
        handleWorkflowChange(await getWorkflow(projectId));
      } catch {
        // Preserve the actionable retry error if refresh also fails.
      }
    } finally {
      setIsRetryingJob(false);
    }
  };

  const handleRetryInitialStoryboard = async () => {
    if (!projectId || !workflowState || workflowState.job.kind !== "storyboard") return;
    setIsRetryingJob(true);
    setWorkflowActionError(null);
    try {
      let editableWorkflow = workflowState;
      if (editableWorkflow.workflow_stage !== "outline") {
        const reopenEvent = editableWorkflow.workflow_stage === "complete" ? "reopen_outline" : "edit_outline";
        editableWorkflow = await sendWorkflowEvent(projectId, reopenEvent, {});
        handleWorkflowChange(editableWorkflow);
      }
      const outline = editableWorkflow.artifacts.outline;
      if (!outline.current_version_id || outline.current_content == null) {
        throw new Error("The current Outline version is unavailable.");
      }
      const next = await sendWorkflowGenerationEvent(
        projectId,
        "approve_outline",
        {
          content: outline.current_content,
          expected_version_id: outline.current_version_id,
        },
        handleWorkflowChange,
      );
      handleWorkflowChange(next);
    } catch (caught) {
      setWorkflowActionError(caught instanceof Error ? caught.message : "Could not retry storyboard generation.");
      try {
        handleWorkflowChange(await getWorkflow(projectId));
      } catch {
        // Preserve the actionable retry error if refresh also fails.
      }
    } finally {
      setIsRetryingJob(false);
    }
  };

  const handleRetryCurrentJob = async () => {
    if (!workflowState || workflowState.job.status !== "failed") return;
    const { job, artifacts } = workflowState;
    if (job.kind === "outline") {
      if (
        artifacts.outline.current_version_id
        && artifacts.outline.current_content != null
        && job.input_version_id
        && job.target_version_id === artifacts.outline.current_version_id
      ) {
        await handleCanonicalRevise(
          "outline",
          stringifyForStageData(artifacts.outline.current_content),
          "Retry the most recent outline revision.",
        );
        return;
      }
      await handleRetryInitialOutline();
      return;
    }
    if (job.kind === "storyboard") {
      if (
        artifacts.storyboard.current_version_id
        && artifacts.storyboard.current_content != null
        && job.input_version_id
        && job.target_version_id === artifacts.storyboard.current_version_id
      ) {
        await handleCanonicalRevise(
          "storyboard",
          stringifyForStageData(artifacts.storyboard.current_content),
          "Retry the most recent storyboard revision.",
        );
        return;
      }
      await handleRetryInitialStoryboard();
    }
  };

  // For stages > 1, get the previous stage's output to pass as context
  // Use humanVersion as fallback for guided brief flow which writes to humanVersion.
  const previousStageData = currentStageId > 1 ? stageData[currentStageId - 1] : null;
  const previousStageOutput = useMemo(() => {
    const content = previousStageData?.humanVersion || previousStageData?.aiVersion;
    if (!content) return null;
    try {
      return typeof content === "string" ? JSON.parse(content) : content;
    } catch {
      return null;
    }
  }, [previousStageData?.aiVersion, previousStageData?.humanVersion]);

  // Save status indicator component
  const SaveStatusIndicator = () => {
    if (saveStatus === "idle") return null;

    return (
      <div className="flex items-center gap-1.5 text-xs">
        {saveStatus === "saving" && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Saving...</span>
          </>
        )}
        {saveStatus === "saved" && (
          <>
            <Cloud className="w-3.5 h-3.5 text-success" />
            <span className="text-success">Saved</span>
          </>
        )}
        {saveStatus === "error" && (
          <>
            <CloudOff className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive">Save failed</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col md:flex-row relative" style={{ minHeight: 0 }}>
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-2 border-b border-border bg-background">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center"
        >
          {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          <span className="ml-2">Stage {currentStageId}: {currentStage?.name}</span>
        </Button>
        <SaveStatusIndicator />
      </div>

      {/* Desktop Save Status - positioned at top right */}
      <div className="hidden md:flex absolute top-3 right-4 z-10">
        <SaveStatusIndicator />
      </div>

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-[#1C2118]/50 z-40"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop: always visible, Mobile: slide-in */}
      <div
        className={`
          fixed md:relative z-50 md:z-auto
          h-full md:h-auto
          transform transition-transform duration-200 ease-in-out
          ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <StageNavigation
          stages={stages}
          currentStageId={currentStageId}
          onStageSelect={handleStageSelect}
        />
      </div>

      {/* Main Content — scroll container, full width (headers/footers span full; content areas self-constrain) */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-y-auto">
        {workflowLoadState === "error" ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <div role="alert" className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5 text-center text-red-800">
              <AlertCircle className="mx-auto h-6 w-6" />
              <h2 className="mt-3 font-medium">Could not load workflow state</h2>
              <p className="mt-1 text-sm">{workflowLoadError || "The workflow request failed."}</p>
              <Button
                type="button"
                variant="outline"
                className="mt-4 border-red-200 bg-white"
                onClick={() => setWorkflowLoadAttempt((attempt) => attempt + 1)}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry workflow
              </Button>
            </div>
          </div>
        ) : projectLoadError ? (
          <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-muted-foreground">
            {projectLoadError}
          </div>
        ) : isLoadingStages || !userId ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : currentStage ? (
          <>
            {workflowActionError && (
              <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {workflowActionError}
              </p>
            )}
            {usesCanonicalWorkflow && workflowState?.job.status === "running" && (
              <div
                role="status"
                aria-label={`${workflowState.job.kind === "outline" ? "Outline" : "Storyboard"} generation status`}
                className="m-4 rounded-2xl border border-[#C9D8C8] bg-[#F1F6F1] px-5 py-4 text-[#274F32]"
              >
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                  <div>
                    <p className="font-medium">Generating your {workflowState.job.kind}</p>
                    <p className="mt-0.5 text-sm text-[#526A57]">Your last saved version stays available while Plotline works.</p>
                  </div>
                </div>
              </div>
            )}
            {usesCanonicalWorkflow && workflowState?.job.status === "failed" && (
              <div role="alert" className="m-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{workflowState.job.kind === "storyboard" ? "Storyboard" : "Outline"} generation failed</p>
                    <p className="mt-1 text-sm">{workflowState.job.error || `Plotline could not generate the ${workflowState.job.kind ?? "artifact"}.`}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-red-200 bg-white"
                      disabled={isRetryingJob || workflowMutationLocked}
                      onClick={() => void handleRetryCurrentJob()}
                    >
                      {isRetryingJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Retry {workflowState.job.kind === "storyboard" ? "storyboard" : "outline"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {usesCanonicalWorkflow && currentStageId === 3 && workflowState?.artifacts.storyboard.needs_update && (
              <div
                role="status"
                aria-label="Storyboard needs update"
                className="m-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-medium">This storyboard was created from an earlier outline.</p>
                    <p className="mt-1 text-sm text-amber-800">Regenerate it from the approved outline, or explicitly keep this version.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={workflowMutationLocked}
                      onClick={() => void handleCanonicalRevise(
                        "storyboard",
                        stringifyForStageData(workflowState.artifacts.storyboard.current_content),
                        "Regenerate the storyboard for the currently approved outline.",
                      )}
                    >
                      {workflowMutationLocked ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Regenerate storyboard
                    </Button>
                    <Button type="button" size="sm" variant="outline" disabled={workflowMutationLocked} onClick={() => void handleKeepStoryboard()}>
                      Keep as-is
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {!(jobAppliesToCurrentStage && workflowState?.job.status === "running" && !hasStageContent(currentData)) && (
              <StageContent
                key={`${currentStageId}-${editorResetGeneration}`}
                stage={currentStage}
                aiContent={currentData.aiVersion}
                humanContent={currentData.humanVersion}
                previousStageOutput={previousStageOutput}
                isGenerating={isGenerating}
                onApprove={handleApprove}
                onRegenerate={handleRegenerate}
                onContentChange={handleContentChange}
                onStoryboardGeneratingChange={handleStoryboardGeneratingChange}
                workflow={workflowState}
                onWorkflowChange={handleWorkflowChange}
                onCanonicalApprove={handleCanonicalApprove}
                onCanonicalRevise={handleCanonicalRevise}
                isWorkflowActionPending={workflowMutationLocked}
              />
            )}
          </>
        ) : null}
      </div>

      {/* Satisfaction Rating Modal - shown after Stage 4 completion */}
      <SatisfactionRatingModal
        isOpen={showRatingModal}
        onClose={handleRatingClose}
        onSubmit={handleRatingSubmit}
      />

      <Dialog.Root
        open={Boolean(versionConflict)}
        onOpenChange={(open) => {
          if (!open) setVersionConflict(null);
        }}
      >
        {versionConflict && (
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-[80] bg-[#1C2118]/45" />
            <Dialog.Content
              role="alertdialog"
              aria-label="Version conflict"
              className="fixed left-1/2 top-1/2 z-[81] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#D9DDD2] bg-white p-6 shadow-2xl"
              onOpenAutoFocus={(event) => {
                event.preventDefault();
                reloadLatestButtonRef.current?.focus();
              }}
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                conflictRestoreFocusRef.current?.focus();
                conflictRestoreFocusRef.current = null;
              }}
            >
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
              <div>
                <Dialog.Title className="font-medium text-[#1C2118]">Version conflict</Dialog.Title>
                <Dialog.Description className="mt-2 text-sm leading-6 text-[#626B58]">{versionConflict.message}</Dialog.Description>
                <p className="mt-2 text-sm leading-6 text-[#626B58]">Reload the canonical version, or keep your local copy open without overwriting the newer work.</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setVersionConflict(null)}>
                <Copy className="mr-2 h-4 w-4" />
                Keep my copy
              </Button>
              <Button ref={reloadLatestButtonRef} type="button" onClick={() => void reloadVersionConflict()}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reload latest
              </Button>
            </div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </Dialog.Root>
    </div>
  );
}
