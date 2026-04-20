import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Menu, X, Cloud, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import StageNavigation, { type Stage, type StageStatus } from "./StageNavigation";
import StageContent from "./StageContent";
import SatisfactionRatingModal from "./SatisfactionRatingModal";
import { useAnalytics } from "@/hooks/useAnalytics";

const INITIAL_STAGES: Stage[] = [
  { id: 1, name: "Video Briefing", description: "Define your video concept and goals", status: "not_started" },
  { id: 2, name: "Video Outline", description: "Review screen structure and types", status: "not_started" },
  { id: 3, name: "Storyboard Draft", description: "Full storyboard with visuals and scripts", status: "not_started" },
  { id: 4, name: "Review and Share", description: "Final review and export", status: "not_started" },
];

interface StageData {
  aiVersion: string | null;
  humanVersion: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

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

export default function StageLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useUser();
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
  const hasLoadedStages = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const previousStageIdRef = useRef<number | null>(null);

  // Initialize analytics tracking
  const analytics = useAnalytics(projectId, user?.id);

  // Load project context on mount
  useEffect(() => {
    const loadProject = async () => {
      if (!projectId) return;

      // Wait for stages to finish loading before deciding to generate
      if (isLoadingStages) return;

      try {
        // Try to load from sessionStorage first
        const storedPrompt = sessionStorage.getItem("storyboardPrompt");
        const storedType = sessionStorage.getItem("storyboardType");

        if (storedPrompt) {
          setProjectContext({
            userInput: storedPrompt,
            typeName: storedType || "Video Project",
          });

          // Start generating brief only if no saved data exists
          // SKIP for Knowledge Share (type "3") - handled by new 3-round flow in StageContent
          const isKnowledgeShare = storedType === "3";
          if (!stageData[1]?.aiVersion && !hasLoadedStages.current && !isKnowledgeShare) {
            generateStage(1, storedPrompt);
          }
        } else {
          // Load from API if not in session
          const response = await fetch(`/api/project/${projectId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.project) {
              setProjectContext({
                userInput: data.project.userInput,
                typeName: data.project.typeName,
              });

              // Start generating brief only if no saved data exists
              // SKIP for Knowledge Share - handled by new 3-round flow in StageContent
              const projectIsKnowledgeShare = data.project.typeName === "Knowledge Share";
              if (!stageData[1]?.aiVersion && !hasLoadedStages.current && data.project.userInput && !projectIsKnowledgeShare) {
                generateStage(1, data.project.userInput);
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      }
    };

    loadProject();
  }, [projectId, isLoadingStages]);

  // Load saved stages on mount
  useEffect(() => {
    const loadSavedStages = async () => {
      if (!projectId) return;

      // StrictMode double-mount guard: ref survives remount but state resets.
      // Always fetch and restore — skip only the "already loaded" early return.
      try {
        const response = await fetch(`/api/project/${projectId}/stages`);
        if (response.ok) {
          const data = await response.json();
          if (data.stages && Object.keys(data.stages).length > 0) {
            // Restore stage data
            const restoredData: Record<number, StageData> = {};
            for (const [key, value] of Object.entries(data.stages)) {
              restoredData[parseInt(key)] = value as StageData;
            }
            setStageData(restoredData);

            // Restore current stage ID
            if (data.currentStageId) {
              setCurrentStageId(data.currentStageId);
            }

            // Restore stage statuses
            if (data.stageStatuses && Array.isArray(data.stageStatuses)) {
              setStages((prev) =>
                prev.map((s) => {
                  const savedStatus = data.stageStatuses.find(
                    (ss: { id: number; status: StageStatus }) => ss.id === s.id
                  );
                  return savedStatus ? { ...s, status: savedStatus.status } : s;
                })
              );
            }

            hasLoadedStages.current = true;
            console.log("Restored saved stages:", data);
          }
        }
      } catch (error) {
        console.error("Failed to load saved stages:", error);
      } finally {
        setIsLoadingStages(false);
      }
    };

    loadSavedStages();
  }, [projectId]);

  // Save stages function
  const saveStages = useCallback(async () => {
    if (!projectId || Object.keys(stageData).length === 0) return;

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
  }, [projectId, stageData, currentStageId, stages]);

  // Auto-save with 2-second debounce
  useEffect(() => {
    if (!projectId || Object.keys(stageData).length === 0 || isLoadingStages) return;

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
  }, [stageData, currentStageId, stages, projectId, isLoadingStages, saveStages]);

  // Track stage enter/exit for analytics
  useEffect(() => {
    if (isLoadingStages) return;

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
  }, [currentStageId, isLoadingStages, stages, analytics]);

  const buildLegacyIntakeForm = useCallback((userInput: string, feedback?: string) => {
    const videoType = sessionStorage.getItem("storyboardType") || "1";
    const duration = sessionStorage.getItem("storyboardDuration") || "60";
    const audience = sessionStorage.getItem("storyboardAudience") || "";
    const videoTypeNames: Record<string, string> = {
      "1": "Product Release",
      "2": "Product Demo Video",
      "3": "Knowledge Sharing",
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

  const updateStageStatus = (stageId: number, status: StageStatus) => {
    setStages((prev) =>
      prev.map((s) => (s.id === stageId ? { ...s, status } : s))
    );
  };

  const handleStageSelect = (stageId: number) => {
    setCurrentStageId(stageId);
    setIsMobileMenuOpen(false);
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

  const currentStage = stages.find((s) => s.id === currentStageId);
  const currentData = stageData[currentStageId] || { aiVersion: null, humanVersion: null };

  // For stages > 1, get the previous stage's output to pass as context
  // Use humanVersion as fallback for Knowledge Share flow which writes to humanVersion
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
        {isLoadingStages ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : currentStage ? (
          <StageContent
            stage={currentStage}
            aiContent={currentData.aiVersion}
            humanContent={currentData.humanVersion}
            previousStageOutput={previousStageOutput}
            isGenerating={isGenerating}
            onApprove={handleApprove}
            onRegenerate={handleRegenerate}
            onContentChange={handleContentChange}
          />
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
