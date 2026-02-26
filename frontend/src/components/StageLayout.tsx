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

// Map stage IDs to API-compatible stage names
const STAGE_API_NAMES: Record<number, string> = {
  1: "brief",
  2: "outline",
  3: "draft",
  4: "polish",
};

interface StageData {
  aiVersion: string | null;
  humanVersion: string | null;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

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
      if (!projectId || hasLoadedStages.current) return;

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

  const generateStage = async (stageId: number, context?: string, feedback?: string) => {
    setIsGenerating(true);
    updateStageStatus(stageId, "in_progress");

    // Use API-compatible stage names
    const stageName = STAGE_API_NAMES[stageId] || "unknown";

    try {
      // Build previous stages data using API-compatible names
      const previousStages: Record<string, string> = {};
      for (let i = 1; i < stageId; i++) {
        const prevStageName = STAGE_API_NAMES[i] || "";
        const prevData = stageData[i];
        if (prevData) {
          previousStages[prevStageName] = prevData.humanVersion || prevData.aiVersion || "";
        }
      }

      // Get video type from sessionStorage
      const videoType = sessionStorage.getItem("storyboardType") || "1";
      const videoTypeNames: Record<string, string> = {
        "1": "Product Release",
        "2": "Product Demo Video",
        "3": "Knowledge Sharing",
      };

      // Get additional context from uploaded sources (files, links, text)
      const sourceContext = sessionStorage.getItem("storyboardContext") || "";

      // Combine user input with source context for the first stage
      let fullUserInput = context || projectContext?.userInput || "";
      if (stageId === 1 && sourceContext) {
        fullUserInput = `${fullUserInput}\n\n--- Reference Materials ---\n\n${sourceContext}`;
      }

      const response = await fetch(`/api/project/${projectId}/stage/${stageName}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_input: fullUserInput,
          previous_stages: previousStages,
          feedback: feedback,
          user_id: user?.id,
          video_type: videoTypeNames[videoType] || "Product Release",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate stage");
      }

      const data = await response.json();

      setStageData((prev) => ({
        ...prev,
        [stageId]: {
          aiVersion: data.ai_content,
          humanVersion: null,
        },
      }));

      updateStageStatus(stageId, "needs_review");
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

  const handleApprove = async (content: string) => {
    const currentStage = stages.find((s) => s.id === currentStageId);
    if (!currentStage) return;

    // Use API-compatible stage name
    const stageName = STAGE_API_NAMES[currentStageId] || "unknown";

    // Save the approved content
    setStageData((prev) => ({
      ...prev,
      [currentStageId]: {
        ...prev[currentStageId],
        humanVersion: content,
      },
    }));

    // Track the edit via API
    try {
      const aiVersion = stageData[currentStageId]?.aiVersion || "";
      if (content !== aiVersion) {
        await fetch(`/api/project/${projectId}/stage/${stageName}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: stageName,
            content: content,
          }),
        });
      }

      // Approve the stage
      await fetch(`/api/project/${projectId}/stage/${stageName}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stageName,
          content: content,
          user_id: user?.id,
        }),
      });
    } catch (error) {
      console.error("Failed to save approval:", error);
    }

    // Mark as approved
    updateStageStatus(currentStageId, "approved");

    // Move to next stage or complete
    const nextStageId = currentStageId + 1;
    if (nextStageId <= 4) {
      setCurrentStageId(nextStageId);
      generateStage(nextStageId);
    } else {
      // All stages complete - show rating modal before navigating
      setShowRatingModal(true);
    }
  };

  const handleRegenerate = async (feedback: string) => {
    // Track regeneration for analytics
    analytics.trackRegeneration(currentStageId);
    await generateStage(currentStageId, projectContext?.userInput, feedback);
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
  const previousStageData = currentStageId > 1 ? stageData[currentStageId - 1] : null;
  const previousStageOutput = useMemo(() => {
    if (!previousStageData?.aiVersion) return null;
    try {
      return typeof previousStageData.aiVersion === "string"
        ? JSON.parse(previousStageData.aiVersion)
        : previousStageData.aiVersion;
    } catch {
      return null;
    }
  }, [previousStageData?.aiVersion]);

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
            <Cloud className="w-3.5 h-3.5 text-green-500" />
            <span className="text-green-600">Saved</span>
          </>
        )}
        {saveStatus === "error" && (
          <>
            <CloudOff className="w-3.5 h-3.5 text-red-500" />
            <span className="text-red-600">Save failed</span>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="h-full w-full flex flex-col md:flex-row relative" style={{ minHeight: 0 }}>
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
          className="md:hidden fixed inset-0 bg-black/50 z-40"
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

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
        {currentStage && (
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
        )}
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
