import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertCircle, Menu, X, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
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

function stageStatusesFromList(statuses: unknown): Record<number, StageStatus> {
  if (!Array.isArray(statuses)) return {};
  return statuses.reduce<Record<number, StageStatus>>((acc, status) => {
    if (
      status &&
      typeof status === "object" &&
      "id" in status &&
      "status" in status
    ) {
      const stageId = Number((status as { id: unknown }).id);
      const stageStatus = (status as { status: StageStatus }).status;
      if (stageId && ["not_started", "in_progress", "needs_review", "approved", "generating"].includes(stageStatus)) {
        acc[stageId] = stageStatus;
      }
    }
    return acc;
  }, {});
}

function deriveStageViewFromPipeline(
  pipelineState: PipelineStateResponse | null,
  savedCurrentStageId?: number,
  savedStageStatuses?: unknown,
): { currentStageId: number; stageStatuses: Record<number, StageStatus> } | null {
  const phase = pipelineState?.phase;
  if (!phase) return null;

  const savedStatuses = stageStatusesFromList(savedStageStatuses);
  const stageStatuses: Record<number, StageStatus> = {
    1: "not_started",
    2: "not_started",
    3: "not_started",
    4: "not_started",
  };

  let currentStageId = savedCurrentStageId || 1;

  if (phase === "intake") {
    currentStageId = 1;
  } else if (phase === "brief_chat") {
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
    stageStatuses[1] = "approved";
    stageStatuses[2] = "approved";
    const stage3WasApproved = savedStatuses[3] === "approved" || (savedCurrentStageId || 0) >= 4;
    if (stage3WasApproved) {
      currentStageId = 4;
      stageStatuses[3] = "approved";
      stageStatuses[4] = "needs_review";
    } else {
      currentStageId = 3;
      stageStatuses[3] = "needs_review";
    }
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
  const hasLoadedStages = useRef(false);
  const workflowLoadGenerationRef = useRef(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousStageIdRef = useRef<number | null>(null);
  const stageDataRef = useRef(stageData);
  const generateStageRef = useRef<(stageId: number, context?: string, feedback?: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    stageDataRef.current = stageData;
  }, [stageData]);

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
              stagesPayload.stageStatuses,
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
    setWorkflowState(nextWorkflow);
    const isCanonical = isCanonicalIntakeArtifact(nextWorkflow.artifacts.intake);
    setWorkflowLoadState(isCanonical ? "canonical" : "legacy");
    setWorkflowLoadError(null);
    if (!isCanonical) return;
    setStageData(hydrateStageDataFromWorkflow(nextWorkflow));
    const stageView = deriveStageViewFromWorkflow(nextWorkflow);
    setCurrentStageId(stageView.currentStageId);
    setStages((current) => current.map((stage) => ({
      ...stage,
      status: stageView.stageStatuses[stage.id] ?? stage.status,
    })));
  }, []);

  // Save stages function
  const saveStages = useCallback(async () => {
    if (!projectId || usesCanonicalWorkflow || Object.keys(stageData).length === 0) return;

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
        // Reset to idle after 2 seconds
        setTimeout(() => setSaveStatus("idle"), 2000);
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

  const handleRetryOutline = async () => {
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
            {jobAppliesToCurrentStage && workflowState?.job.status === "running" && (
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
            {jobAppliesToCurrentStage && workflowState?.job.status === "failed" && (
              <div role="alert" className="m-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-800">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">Outline generation failed</p>
                    <p className="mt-1 text-sm">{workflowState.job.error || "Plotline could not generate the outline."}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 border-red-200 bg-white"
                      disabled={isRetryingJob}
                      onClick={() => void handleRetryOutline()}
                    >
                      {isRetryingJob ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                      Retry outline
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {!(jobAppliesToCurrentStage && workflowState?.job.status === "running" && !hasStageContent(currentData)) && (
              <StageContent
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
    </div>
  );
}
