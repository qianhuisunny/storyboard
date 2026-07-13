import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { type Stage } from "./StageNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, RefreshCw, Loader2 } from "lucide-react";
import { BriefBuilder, normalizeBrief, type StoryBrief, type BriefField, type ProcessingLogEntry } from "./BriefBuilder";
import { ChatBriefBuilder } from "./ChatBriefBuilder";
import { SplitBriefBuilder } from "./BriefBuilder/SplitBriefBuilder";
import { type OnboardingData } from "./BriefBuilder/SplitBriefBuilder/types";
import { OutlineBuilder, type EvidenceResearch } from "./OutlineBuilder";
import { DraftBuilder, parseProductionScreens, type ProductionScreen, type DraftProcessingEntry } from "./DraftBuilder";
import { ReviewBuilder } from "./ReviewBuilder";
import type { QualityEvalResult } from "./QualityScore";
import { VIDEO_INTENT_ROUTES, isGuidedBriefType } from "@/lib/videoIntent";
import SmartIntakeBuilder from "./SmartIntakeBuilder";
import { isCanonicalIntakeContent, type WorkflowResponse } from "@/lib/workflow";

// Feature flag for new split-screen brief builder
const USE_SPLIT_BRIEF_BUILDER = true;

// Feature flag for the guided intent-aware brief flow
const USE_GUIDED_BRIEF_FLOW = true;

interface ApproveOptions {
  skipNextGeneration?: boolean;
  nextStageContent?: string;
}

interface StageContentProps {
  stage: Stage;
  aiContent: string | null;
  humanContent: string | null;
  previousStageOutput?: Record<string, unknown> | null;
  isGenerating: boolean;
  onApprove: (content: string, options?: ApproveOptions) => void | Promise<void>;
  onRegenerate: (feedback: string) => void;
  onContentChange: (content: string) => void;
  onStoryboardGeneratingChange?: (isGenerating: boolean) => void;
  workflow?: WorkflowResponse | null;
  onWorkflowChange?: (workflow: WorkflowResponse) => void;
}

interface GuidedBriefInitResult {
  briefFields: Record<string, BriefField>;
  isBriefAlreadyApproved: boolean;
}

const guidedBriefInitRequests = new Map<string, Promise<GuidedBriefInitResult>>();

// Helper to get onboarding data from session storage
function getOnboardingDataFromSession(): OnboardingData | null {
  try {
    const storedPrompt = sessionStorage.getItem("storyboardPrompt");
    const storedType = sessionStorage.getItem("storyboardType");
    const storedTypeName = sessionStorage.getItem("storyboardTypeName");
    const storedIntentRoute = sessionStorage.getItem("storyboardIntentRoute");
    const storedContentMode = sessionStorage.getItem("storyboardContentMode");
    const storedContext = sessionStorage.getItem("storyboardContext");
    const storedDuration = sessionStorage.getItem("storyboardDuration");
    const storedAudience = sessionStorage.getItem("storyboardAudience");

    if (!storedPrompt) return null;

    // Parse video type ID to name
    const videoTypeMap: Record<string, string> = {
      "1": "Product Release",
      "2": "Product Demo",
      "3": "YouTube Explainer",
      "4": "Talking Script",
      "5": "Planner / Lifestyle",
    };
    const routeLabel = storedIntentRoute && storedIntentRoute in VIDEO_INTENT_ROUTES
      ? VIDEO_INTENT_ROUTES[storedIntentRoute as keyof typeof VIDEO_INTENT_ROUTES].label
      : undefined;

    // Try to extract additional data from context
    let links: string[] = [];
    const companyName = "";
    const tone = "professional";

    // Parse duration from stored value (now stored as number string)
    let duration = 60;
    if (storedDuration) {
      const parsed = parseInt(storedDuration, 10);
      if (!isNaN(parsed) && parsed > 0) {
        duration = parsed;
      }
    }

    // Parse context if available
    if (storedContext) {
      // Extract links from context (URLs starting with http)
      const urlRegex = /https?:\/\/[^\s]+/g;
      const foundLinks = storedContext.match(urlRegex);
      if (foundLinks) {
        links = foundLinks;
      }
    }

    return {
      videoType: storedTypeName || routeLabel || videoTypeMap[storedType || "3"] || "YouTube Explainer",
      intentRoute: storedIntentRoute || undefined,
      contentMode: storedContentMode || undefined,
      description: storedPrompt,
      duration,
      audience: storedAudience || "General audience",
      companyName,
      tone,
      showFace: false,
      platform: "youtube",
      links,
    };
  } catch {
    return null;
  }
}

async function initializeGuidedBriefProject(
  projectId: string,
  onboardingData: OnboardingData | null,
  isAlreadyApproved: boolean
): Promise<GuidedBriefInitResult> {
  const startTime = performance.now();
  console.log("[Brief] Initializing... stage.status:", isAlreadyApproved ? "approved" : "not_approved");

  const stateResponse = await fetch(`/api/project/${projectId}/pipeline-state`);
  if (stateResponse.ok) {
    const stateData = await stateResponse.json();
    console.log("[Brief] Current pipeline state:", stateData);

    const briefFields = stateData.data?.story_brief?.fields || {};

    if (isAlreadyApproved && Object.keys(briefFields).length > 0) {
      console.log("[Brief] Stage already approved, restoring fields:", Object.keys(briefFields));
      return {
        briefFields,
        isBriefAlreadyApproved: true,
      };
    }

    if (stateData.phase === "brief_chat" || stateData.phase === "brief_review") {
      console.log("[Brief] Restoring chat brief state, fields:", Object.keys(briefFields));
      return {
        briefFields,
        isBriefAlreadyApproved: false,
      };
    }

    if (stateData.phase && !["intake", "brief_chat", "brief_review"].includes(stateData.phase)) {
      console.log(
        "[Brief] Project already past brief stage, phase:",
        stateData.phase,
        "fields:",
        Object.keys(briefFields)
      );
      return {
        briefFields,
        isBriefAlreadyApproved: Object.keys(briefFields).length > 0,
      };
    }
  }

  console.log("[Brief] Starting fresh with submit_guided_brief...", {
    videoType: onboardingData?.videoType,
    intentRoute: onboardingData?.intentRoute,
    duration: onboardingData?.duration,
    audience: onboardingData?.audience,
  });

  const response = await fetch(`/api/project/${projectId}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "submit_guided_brief",
      payload: {
        intake_form: {
          video_type: onboardingData?.intentRoute || onboardingData?.videoType,
          intent_route: onboardingData?.intentRoute,
          content_mode: onboardingData?.contentMode,
          description: onboardingData?.description,
          duration: onboardingData?.duration,
          target_audience: onboardingData?.audience,
          links: onboardingData?.links || [],
        },
      },
    }),
  });

  console.log(`[Brief] Response status: ${response.status}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("[Brief] Init failed:", errorData);
    throw new Error(errorData.error || errorData.detail || "Failed to start briefing");
  }

  const data = await response.json();
  console.log("[Brief] Round 1 response data:", data);
  console.log(`[Brief] Total time: ${(performance.now() - startTime).toFixed(0)}ms`);

  return {
    briefFields: data.brief_fields || {},
    isBriefAlreadyApproved: false,
  };
}

function getGuidedBriefInitRequest(
  projectId: string,
  onboardingData: OnboardingData | null,
  isAlreadyApproved: boolean
): Promise<GuidedBriefInitResult> {
  const existingRequest = guidedBriefInitRequests.get(projectId);
  if (existingRequest) {
    console.log("[Brief] Reusing in-flight initialization for project:", projectId);
    return existingRequest;
  }

  const request = initializeGuidedBriefProject(projectId, onboardingData, isAlreadyApproved)
    .finally(() => {
      guidedBriefInitRequests.delete(projectId);
    });

  guidedBriefInitRequests.set(projectId, request);
  return request;
}

const OUTLINE_STEPS = [
  { label: "Generating outline...", delay: 0 },
  { label: "Reviewing quality...", delay: 8000 },
  { label: "Refining with feedback...", delay: 16000 },
  { label: "Reviewing revised outline...", delay: 22000 },
  { label: "Quality check passed — preparing outline", delay: 28000 },
];

const DRAFT_STEPS = [
  { label: "Generating storyboard panels...", delay: 0 },
  { label: "Writing voiceover scripts...", delay: 6000 },
  { label: "Adding visual direction...", delay: 12000 },
  { label: "Reviewing quality...", delay: 18000 },
  { label: "Finalizing storyboard", delay: 24000 },
];

function stringifyStageContent(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function extractBriefFieldsFromStageContent(content: string | null | undefined): Record<string, BriefField> {
  if (!content) return {};
  try {
    const parsed = JSON.parse(content);
    const fields = parsed?.fields;
    if (fields && typeof fields === "object" && !Array.isArray(fields)) {
      return fields as Record<string, BriefField>;
    }
  } catch {
    // Not JSON or not a brief payload.
  }
  return {};
}

function hasRenderableStoryboard(content: unknown): boolean {
  const screens = Array.isArray(content)
    ? content
    : typeof content === "object" && content !== null && Array.isArray((content as { screens?: unknown }).screens)
    ? (content as { screens: unknown[] }).screens
    : [];
  return screens.length >= 3 && typeof screens[0] === "object" && screens[0] !== null;
}

function GeneratingProgress({ stageId }: { stageId: number }) {
  const steps = stageId === 2 ? OUTLINE_STEPS : DRAFT_STEPS;
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const timers = steps.slice(1).map((step, idx) =>
      setTimeout(() => setActiveStep(idx + 1), step.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [steps]);

  return (
    <div className="flex flex-col items-center gap-6" style={{ maxWidth: 360 }}>
      <Loader2 className="w-8 h-8 animate-spin text-[#3A6B47]" />
      <div className="flex flex-col gap-2 w-full">
        {steps.map((step, idx) => {
          const isDone = idx < activeStep;
          const isCurrent = idx === activeStep;
          const isFuture = idx > activeStep;
          return (
            <div
              key={idx}
              className="flex items-center gap-3 transition-opacity duration-500"
              style={{ opacity: isFuture ? 0.3 : 1 }}
            >
              {isDone ? (
                <Check className="w-4 h-4 text-[#3A6B47] flex-shrink-0" />
              ) : isCurrent ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#3A6B47] flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-[#D9DDD2] flex-shrink-0" />
              )}
              <span
                className="text-sm"
                style={{
                  color: isDone ? "#626B58" : isCurrent ? "#1C2118" : "#999",
                  fontWeight: isCurrent ? 600 : 400,
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StageContent({
  stage,
  aiContent,
  humanContent,
  previousStageOutput,
  isGenerating,
  onApprove,
  onRegenerate,
  onContentChange,
  onStoryboardGeneratingChange,
  workflow,
  onWorkflowChange,
}: StageContentProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [feedback, setFeedback] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [useSplitBuilder] = useState(USE_SPLIT_BRIEF_BUILDER);

  // Get onboarding data for SplitBriefBuilder
  const onboardingData = useMemo(() => getOnboardingDataFromSession(), []);

  const currentContent = humanContent ?? aiContent ?? "";
  const hasChanges = humanContent !== null && humanContent !== aiContent;

  // Guided brief flow state
  const savedGuidedBriefFields = useMemo(
    () => stage.id === 1 ? extractBriefFieldsFromStageContent(humanContent ?? aiContent) : {},
    [stage.id, humanContent, aiContent]
  );
  const [guidedBriefFields, setGuidedBriefFields] = useState<Record<string, BriefField>>(() => savedGuidedBriefFields);
  const guidedBriefInitStartedRef = useRef(false);
  // Track if brief is already approved on backend (past brief stage)
  const [isBriefAlreadyApproved, setIsBriefAlreadyApproved] = useState(false);
  const [, setResearchError] = useState<string | null>(null);

  // Check if this project should use the guided intent-aware brief flow.
  // Priority: session storage onboarding data → saved brief content (for existing projects)
  const isGuidedBrief = useMemo(() => {
    if (onboardingData) {
      return Boolean(onboardingData.intentRoute) || isGuidedBriefType(onboardingData.videoType);
    }
    // Fallback: check saved stage-1 content for video_type field
    const content = humanContent || aiContent;
    if (content && stage.id === 1) {
      try {
        const parsed = JSON.parse(content);
        const intentRoute = parsed?.fields?.intent_route?.value;
        const videoType = parsed?.fields?.video_type?.value;
        if (intentRoute || videoType) {
          return Boolean(intentRoute) || isGuidedBriefType(videoType);
        }
      } catch {
        // Not JSON or doesn't have expected structure
      }
    }
    return false;
  }, [onboardingData, humanContent, aiContent, stage.id]);

  useEffect(() => {
    if (Object.keys(guidedBriefFields).length > 0 || Object.keys(savedGuidedBriefFields).length === 0) return;
    setGuidedBriefFields(savedGuidedBriefFields);
  }, [guidedBriefFields, savedGuidedBriefFields]);

  // Initialize guided brief flow
  useEffect(() => {
    if (isGuidedBrief && projectId && USE_GUIDED_BRIEF_FLOW && stage.id === 1 && !guidedBriefInitStartedRef.current) {
      let active = true;
      guidedBriefInitStartedRef.current = true;

      const runGuidedBriefInitialization = async () => {
        try {
          const initResult = await getGuidedBriefInitRequest(
            projectId,
            onboardingData,
            stage.status === "approved"
          );

          if (!active) return;

          setGuidedBriefFields(initResult.briefFields);
          setIsBriefAlreadyApproved(initResult.isBriefAlreadyApproved);
        } catch (err) {
          if (!active) return;
          guidedBriefInitStartedRef.current = false;
          console.error("[Brief] Failed to initialize:", err);
          setResearchError("Failed to start briefing flow");
        }
      };

      runGuidedBriefInitialization();

      return () => {
        active = false;
        guidedBriefInitStartedRef.current = false;
      };
    }
  }, [isGuidedBrief, projectId, stage.id, stage.status, onboardingData]);

  // Handle brief approval for guided brief projects
  const handleGuidedBriefApprove = useCallback(
    async (allFields: Record<string, BriefField>): Promise<void> => {
      console.log("[Brief StageContent] handleGuidedBriefApprove called");
      console.log("[Brief StageContent] projectId:", projectId);
      console.log("[Brief StageContent] allFields keys:", Object.keys(allFields));

      const url = `/api/project/${projectId}/event`;
      const body = {
        event: "chat_brief_approve",
        payload: { all_fields: allFields },
      };
      console.log("[Brief StageContent] Fetching URL:", url);
      console.log("[Brief StageContent] Request body:", JSON.stringify(body, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      console.log("[Brief StageContent] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[Brief StageContent] Error response:", errorText);
        throw new Error("Failed to approve brief");
      }

      // Trigger stage advance
      const data = await response.json();
      console.log("[Brief StageContent] Brief approve response:", data);

      const briefContent = data.story_brief
        ? JSON.stringify(data.story_brief, null, 2)
        : JSON.stringify(allFields, null, 2);

      // If the backend was already at gate2, chat_brief_approve saves the
      // edited brief and regenerates the outline in one call.
      onContentChange(briefContent);
      if (data.screen_outline) {
        onApprove(briefContent, {
          skipNextGeneration: true,
          nextStageContent: stringifyStageContent(data.screen_outline),
        });
        return;
      }

      // First-time chat_brief_approve finalizes the briefing document and
      // enters Gate 1. Stage 1 approval still runs through the normal
      // stage-level approve event so Director remains owned by gate1 -> outline.
      onApprove(briefContent);
    },
    [projectId, onContentChange, onApprove]
  );

  // Handle edit brief for guided brief projects
  const handleGuidedBriefEdit = useCallback(() => {
    // ChatBriefBuilder manages its own edit state internally
  }, []);

  // For Brief stage, parse the AI content into a StoryBrief object
  const briefData = useMemo<StoryBrief | null>(() => {
    if (stage.id !== 1 || !aiContent) return null;
    try {
      const parsed = typeof aiContent === "string" ? JSON.parse(aiContent) : aiContent;
      return normalizeBrief(parsed);
    } catch {
      return null;
    }
  }, [stage.id, aiContent]);

  // For Outline stage, content is plain text (no parsing needed)

  // For Draft stage, parse the AI content into production screens array
  const draftData = useMemo<ProductionScreen[]>(() => {
    if (stage.id !== 3 || !aiContent) return [];
    try {
      const parsed = typeof aiContent === "string" ? JSON.parse(aiContent) : aiContent;
      return parseProductionScreens(parsed);
    } catch {
      return [];
    }
  }, [stage.id, aiContent]);

  // For Review stage, parse the AI content into production screens array
  const reviewData = useMemo<ProductionScreen[]>(() => {
    if (stage.id !== 4 || !aiContent) return [];
    try {
      const parsed = typeof aiContent === "string" ? JSON.parse(aiContent) : aiContent;
      return parseProductionScreens(parsed);
    } catch {
      return [];
    }
  }, [stage.id, aiContent]);


  // Track brief updates for the Brief stage
  const [localBrief, setLocalBrief] = useState<StoryBrief | null>(null);

  // Track outline text updates for the Outline stage
  const [localOutlineText, setLocalOutlineText] = useState<string | null>(null);
  // Reserved UI state for future evidence research payloads that may already
  // exist on a project, even though the MVP does not trigger research.
  const [outlineResearchResults, setOutlineResearchResults] = useState<EvidenceResearch | null>(null);
  const [isResearchingEvidence] = useState(false);
  const [researchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [isRegeneratingOutline, setIsRegeneratingOutline] = useState(false);

  // Track draft updates for the Draft stage
  const [localDraft, setLocalDraft] = useState<ProductionScreen[] | null>(null);

  // Track review updates for the Review stage
  const [localReview, setLocalReview] = useState<ProductionScreen[] | null>(null);

  // Quality gate evals
  const [outlineEval, setOutlineEval] = useState<QualityEvalResult | null>(null);
  const [storyboardEval, setStoryboardEval] = useState<QualityEvalResult | null>(null);

  // Use local brief if edited, otherwise use parsed AI brief
  const currentBrief = localBrief ?? briefData;

  // For outline stage: use local edits if present, otherwise use AI content directly
  const currentOutlineText = localOutlineText ?? (stage.id === 2 ? (humanContent ?? aiContent ?? "") : "");

  // Use local draft if edited, otherwise use parsed AI draft
  const currentDraft = localDraft ?? draftData;

  // Use local review if edited, otherwise use parsed AI review
  const currentReview = localReview ?? reviewData;

  // If evidence research already exists from a future or offline flow,
  // surface it here for review. The MVP does not trigger research itself.
  useEffect(() => {
    if (stage.id !== 2 || !projectId || outlineResearchResults) return;
    const restoreResearch = async () => {
      try {
        const resp = await fetch(`/api/project/${projectId}/pipeline-state`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.data?.evidence_research) {
          setOutlineResearchResults(data.data.evidence_research);
        }
        if (data.data?.outline_eval) setOutlineEval(data.data.outline_eval);
        if (data.data?.storyboard_eval) setStoryboardEval(data.data.storyboard_eval);
      } catch {
        // Silently fail
      }
    };
    restoreResearch();
  }, [stage.id, projectId, outlineResearchResults]);

  // Processing log for child components (legacy BriefBuilder)
  const processingLog: ProcessingLogEntry[] = [];
  const draftProcessingLog: DraftProcessingEntry[] = [];

  // Processing logs for outline stage (currently unused by simplified OutlineBuilder)

  // Outline summary for draft stage
  const outlineSummary = useMemo(() => {
    if (previousStageOutput && typeof previousStageOutput === "object") {
      return {
        video_type: previousStageOutput.video_type as string,
        target_duration: previousStageOutput.desired_length as string,
        total_screens: currentDraft.length,
      };
    }
    return undefined;
  }, [previousStageOutput, currentDraft.length]);

  const handleBriefUpdate = (updatedBrief: StoryBrief) => {
    setLocalBrief(updatedBrief);
    // Also update the humanContent for tracking changes
    onContentChange(JSON.stringify(updatedBrief, null, 2));
  };

  const handleBriefConfirm = () => {
    const briefToApprove = currentBrief ?? briefData;
    if (briefToApprove) {
      onApprove(JSON.stringify(briefToApprove, null, 2));
    }
  };

  const handleOutlineTextChange = (text: string) => {
    setLocalOutlineText(text);
    onContentChange(text);
  };

  const handleRegenerateSection = useCallback(async (sectionNumber: number, instruction: string) => {
    if (!projectId) return;
    setIsRegeneratingOutline(true);
    try {
      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "regenerate_section",
          payload: { section_number: sectionNumber, instruction, current_outline: currentOutlineText },
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to regenerate section ${sectionNumber}`);
      }
      const data = await response.json();
      if (data.screen_outline) {
        setLocalOutlineText(data.screen_outline);
        onContentChange(data.screen_outline);
      }
    } finally {
      setIsRegeneratingOutline(false);
    }
  }, [projectId, currentOutlineText, onContentChange]);

  const handleRefineOutline = useCallback(async (instruction: string) => {
    if (!projectId) return;
    setIsRegeneratingOutline(true);
    try {
      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "refine_outline",
          payload: { instruction, current_outline: currentOutlineText },
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to regenerate outline");
      }
      const data = await response.json();
      if (data.screen_outline) {
        setLocalOutlineText(data.screen_outline);
        onContentChange(data.screen_outline);
      }
    } finally {
      setIsRegeneratingOutline(false);
    }
  }, [projectId, currentOutlineText, onContentChange]);

  const handleResearchContinue = useCallback(async (filteredEvidence?: EvidenceResearch | null) => {
    console.log("[Outline] handleResearchContinue called, projectId:", projectId);
    if (!projectId) return;
    try {
      const stateResp = await fetch(`/api/project/${projectId}/pipeline-state`);
      if (!stateResp.ok) return;
      const stateData = await stateResp.json();
      const phase = stateData.phase;
      console.log("[Outline] Current backend phase:", phase);

      const advanceWithStoryboard = async (storyboard: unknown) => {
        await onApprove(currentOutlineText, {
          skipNextGeneration: true,
          nextStageContent: JSON.stringify(storyboard, null, 2),
        });
      };

      // If storyboard already exists, skip straight to the frontend advance.
      // This can happen after a previous writer run completed but the stage
      // snapshot did not save before refresh/navigation.
      if (phase !== "gate2" && phase !== "outline_research") {
        if (stateData.data?.storyboard_eval) setStoryboardEval(stateData.data.storyboard_eval);
        const storyboard = stateData.data?.storyboard;
        if (hasRenderableStoryboard(storyboard)) {
          await advanceWithStoryboard(storyboard);
          return;
        }
        throw new Error(`Storyboard is not ready for phase '${phase}'.`);
      }

      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "approve",
          payload: {
            current_outline: currentOutlineText,
            ...(filteredEvidence ? { evidence_research: filteredEvidence } : {}),
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || errData.error || "Failed to approve outline");
      }

      const data = await response.json();
      if (data.storyboard_eval) setStoryboardEval(data.storyboard_eval);
      if (data.storyboard) {
        await advanceWithStoryboard(data.storyboard);
        return;
      }

      throw new Error("Outline approval completed without storyboard data.");
    } catch (err) {
      console.error("[Outline] Continue failed:", err);
      throw err;
    }
  }, [projectId, currentOutlineText, onApprove]);

  const handleDraftUpdate = (updatedDraft: ProductionScreen[]) => {
    setLocalDraft(updatedDraft);
    onContentChange(JSON.stringify(updatedDraft, null, 2));
  };

  const handleDraftConfirm = () => {
    const draftToApprove = currentDraft.length > 0 ? currentDraft : draftData;
    if (draftToApprove.length > 0) {
      onApprove(JSON.stringify(draftToApprove, null, 2));
    }
  };

  const handleReviewUpdate = (updatedReview: ProductionScreen[]) => {
    setLocalReview(updatedReview);
    onContentChange(JSON.stringify(updatedReview, null, 2));
  };

  const handleReviewConfirm = () => {
    const reviewToApprove = currentReview.length > 0 ? currentReview : reviewData;
    if (reviewToApprove.length > 0) {
      onApprove(JSON.stringify(reviewToApprove, null, 2));
    }
  };

  const handleApprove = () => {
    onApprove(currentContent);
  };

  const handleRegenerate = () => {
    if (feedback.trim()) {
      onRegenerate(feedback);
      setFeedback("");
    }
  };

  const canonicalIntake = workflow?.artifacts.intake.current_content;
  if (
    stage.id === 1
    && projectId
    && workflow
    && onWorkflowChange
    && isCanonicalIntakeContent(canonicalIntake)
  ) {
    return (
      <SmartIntakeBuilder
        projectId={projectId}
        workflow={workflow}
        onWorkflowChange={onWorkflowChange}
      />
    );
  }

  if (isGenerating && stage.id !== 2 && stage.id !== 3) {
    return (
      <div className="flex-1 flex items-center justify-center p-4" style={{ minHeight: "300px" }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">Generating {stage.name}...</h3>
          <p className="text-sm text-muted-foreground">
            This may take a moment
          </p>
        </div>
      </div>
    );
  }

  // For Stage 1 (Brief), use ChatBriefBuilder for guided intent-aware videos
  if (stage.id === 1 && USE_GUIDED_BRIEF_FLOW && isGuidedBrief && projectId) {
    if (!isBriefAlreadyApproved && Object.keys(guidedBriefFields).length === 0) {
      return (
        <div className="flex-1 flex items-center justify-center p-4" style={{ minHeight: "300px" }}>
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">Preparing your briefing...</h3>
            <p className="text-sm text-muted-foreground">
              Plotline is reading the intent behind your video idea.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <ChatBriefBuilder
          projectId={projectId}
          initialFields={guidedBriefFields}
          isAlreadyApproved={isBriefAlreadyApproved}
          onBriefApprove={handleGuidedBriefApprove}
          onEditBrief={handleGuidedBriefEdit}
        />
      </div>
    );
  }

  // For Stage 1 (Brief), use SplitBriefBuilder if enabled and we have onboarding data
  if (stage.id === 1 && useSplitBuilder && onboardingData && projectId && !aiContent) {
    const handleBriefComplete = (brief: StoryBrief) => {
      // Store the brief and trigger content change
      onContentChange(JSON.stringify(brief, null, 2));
    };

    const handleAdvanceStage = () => {
      // Approve the current brief and move to next stage
      const briefJson = humanContent || "";
      if (briefJson) {
        onApprove(briefJson);
      }
    };

    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <SplitBriefBuilder
          projectId={projectId}
          onboardingData={onboardingData}
          onComplete={handleBriefComplete}
          onAdvanceStage={handleAdvanceStage}
        />
      </div>
    );
  }

  if (!aiContent && stage.status === "not_started") {
    // For the first stage (Brief), show a different message
    const isFirstStage = stage.id === 1;

    return (
      <div className="flex-1 flex items-center justify-center p-4" style={{ minHeight: "300px" }}>
        <div className="text-center text-muted-foreground">
          <p>
            {isFirstStage
              ? "Loading project... Generation will start automatically."
              : "Complete the previous stage to unlock this one."}
          </p>
        </div>
      </div>
    );
  }

  // Render BriefBuilder for the Brief stage (stage 1)
  if (stage.id === 1 && currentBrief) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <BriefBuilder
          briefData={currentBrief}
          processingLog={processingLog}
          onBriefUpdate={handleBriefUpdate}
          onConfirm={handleBriefConfirm}
        />
      </div>
    );
  }

  // Stage 2 or 3 generating: show progress sequence
  if ((stage.id === 2 && !currentOutlineText && isGenerating) ||
      (stage.id === 3 && currentDraft.length === 0 && isGenerating)) {
    const stageTitle = stage.id === 2 ? "Video Outline" : "Storyboard Draft";
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <div className="px-6 sm:px-10 py-4 sm:py-5 border-b border-border shrink-0">
          <h2 className="text-xl font-semibold">{stageTitle}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Generating your {stageTitle.toLowerCase()}...</p>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <GeneratingProgress stageId={stage.id} />
        </div>
      </div>
    );
  }

  // Render OutlineBuilder for the Outline stage (stage 2)
  if (stage.id === 2 && currentOutlineText) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <OutlineBuilder
          content={currentOutlineText}
          aiContent={aiContent}
          onChange={handleOutlineTextChange}
          onContinue={handleResearchContinue}
          onRegenerateSection={handleRegenerateSection}
          onRefineOutline={handleRefineOutline}
          isResearching={isResearchingEvidence}
          isRegenerating={isRegeneratingOutline}
          researchResults={outlineResearchResults}
          researchProgress={researchProgress}
          outlineEval={outlineEval}
          onGeneratingStateChange={onStoryboardGeneratingChange}
        />
      </div>
    );
  }

  // Render DraftBuilder for the Draft stage (stage 3)
  if (stage.id === 3 && currentDraft.length > 0) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <DraftBuilder
          draftData={currentDraft}
          projectId={projectId || ""}
          outlineSummary={outlineSummary}
          previousStageOutput={previousStageOutput}
          processingLog={draftProcessingLog}
          onDraftUpdate={handleDraftUpdate}
          onConfirm={handleDraftConfirm}
          storyboardEval={storyboardEval}
        />
      </div>
    );
  }

  // Render ReviewBuilder for the Review stage (stage 4)
  if (stage.id === 4 && currentReview.length > 0) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <ReviewBuilder
          screens={currentReview}
          projectId={projectId || ""}
          projectTitle="Video Storyboard"
          previousStageOutput={previousStageOutput}
          onScreensUpdate={handleReviewUpdate}
          onExport={handleReviewConfirm}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
      {/* Stage Header */}
      <div className="px-6 sm:px-10 py-4 sm:py-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0">
        <div className="mb-2 sm:mb-0">
          <h2 className="text-lg sm:text-xl font-semibold">{stage.name}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">{stage.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-xs text-warning-foreground bg-warning/20 px-2 py-1 rounded">
              Edited
            </span>
          )}
          {stage.status === "approved" && (
            <span className="text-xs text-success-foreground bg-success/20 px-2 py-1 rounded flex items-center gap-1">
              <Check className="w-3 h-3" />
              Approved
            </span>
          )}
        </div>
      </div>

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-6" style={{ minHeight: 0 }}>
        <div className="w-full max-w-5xl">
          {isEditing ? (
            <Textarea
              value={currentContent}
              onChange={(e) => onContentChange(e.target.value)}
              className="min-h-[200px] sm:min-h-[300px] font-mono text-sm w-full"
              placeholder="Edit the content here..."
            />
          ) : (
            <div
              className="prose prose-sm max-w-none p-3 sm:p-4 bg-muted/30 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setIsEditing(true)}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm" style={{ wordBreak: "break-word" }}>
                {currentContent || "No content yet. Click to edit."}
              </pre>
            </div>
          )}

          {isEditing && (
            <div className="mt-2 flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(false)}
              >
                Done Editing
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer - Always visible, never cut off */}
      {stage.status !== "approved" && (
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/20 shrink-0">
          <div className="max-w-5xl mx-auto">
            {/* Feedback input for regeneration */}
            <div className="flex flex-col sm:flex-row mb-3 sm:mb-4" style={{ gap: "8px" }}>
              <Textarea
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Suggest changes for AI to regenerate (optional)..."
                className="flex-1 min-h-[50px] sm:min-h-[60px] resize-none"
              />
              <Button
                variant="outline"
                onClick={handleRegenerate}
                disabled={!feedback.trim()}
                className="w-full sm:w-auto sm:self-end"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Regenerate
              </Button>
            </div>

            {/* Approve button */}
            <div className="flex justify-end">
              <Button onClick={handleApprove} className="w-full sm:w-auto">
                <Check className="w-4 h-4 mr-2" />
                Approve & Continue
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
