import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { type Stage } from "./StageNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, RefreshCw, Loader2 } from "lucide-react";
import { BriefBuilder, normalizeBrief, type StoryBrief, type ProcessingLogEntry, type BriefField, type BriefRound, KnowledgeShareBriefBuilder } from "./BriefBuilder";
import { SplitBriefBuilder } from "./BriefBuilder/SplitBriefBuilder";
import { type OnboardingData } from "./BriefBuilder/SplitBriefBuilder/types";
import { OutlineBuilder, parseScreens, type Screen, type OutlineProcessingEntry } from "./OutlineBuilder";
import { DraftBuilder, parseProductionScreens, type ProductionScreen, type DraftProcessingEntry } from "./DraftBuilder";
import { ReviewBuilder } from "./ReviewBuilder";

// Feature flag for new split-screen brief builder
const USE_SPLIT_BRIEF_BUILDER = true;

// Feature flag for new Knowledge Share 3-round flow
const USE_KNOWLEDGE_SHARE_FLOW = true;

// Types for research stream events
interface SearchEvent {
  id: string;
  query: string;
  status: "running" | "complete" | "error";
  resultsCount?: number;
  timestamp: number;
}

interface ResearchFindings {
  summary?: string;
  keyPoints?: string[];
  sources?: { url: string; title: string }[];
  company?: string[];
  product?: string[];
  industry?: string[];
  workflows?: string[];
  terminology?: string[];
  uncertainties?: string[];
}

type ResearchStatus = "idle" | "running" | "complete" | "error";

// Two-phase research tracking
type ResearchPhase = "none" | "round1_running" | "round1_complete" | "round3_running" | "complete";

interface AngleSummary {
  audienceLevel: string;
  keyTakeaway: string;
  durationMinutes: number;
  questions: string[];
}

interface StageContentProps {
  stage: Stage;
  aiContent: string | null;
  humanContent: string | null;
  previousStageOutput?: Record<string, unknown> | null;
  isGenerating: boolean;
  onApprove: (content: string) => void;
  onRegenerate: (feedback: string) => void;
  onContentChange: (content: string) => void;
}

// Helper to get onboarding data from session storage
function getOnboardingDataFromSession(): OnboardingData | null {
  try {
    const storedPrompt = sessionStorage.getItem("storyboardPrompt");
    const storedType = sessionStorage.getItem("storyboardType");
    const storedContext = sessionStorage.getItem("storyboardContext");
    const storedDuration = sessionStorage.getItem("storyboardDuration");
    const storedAudience = sessionStorage.getItem("storyboardAudience");

    if (!storedPrompt) return null;

    // Parse video type ID to name
    const videoTypeMap: Record<string, string> = {
      "1": "Product Release",
      "2": "Product Demo",
      "3": "Knowledge Share",
    };

    // Try to extract additional data from context
    let links: string[] = [];
    const companyName = "";
    const tone = "professional";

    // Parse duration from stored value (60s, 90s, 2mins, 5mins+)
    let duration = 60;
    if (storedDuration) {
      const durationMap: Record<string, number> = {
        "60s": 60,
        "90s": 90,
        "2mins": 120,
        "5mins+": 300,
      };
      duration = durationMap[storedDuration] || 60;
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
      videoType: videoTypeMap[storedType || "1"] || "Product Release",
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

export default function StageContent({
  stage,
  aiContent,
  humanContent,
  previousStageOutput,
  isGenerating,
  onApprove,
  onRegenerate,
  onContentChange,
}: StageContentProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const [feedback, setFeedback] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [useSplitBuilder] = useState(USE_SPLIT_BRIEF_BUILDER);

  // Get onboarding data for SplitBriefBuilder
  const onboardingData = useMemo(() => getOnboardingDataFromSession(), []);

  const currentContent = humanContent ?? aiContent ?? "";
  const hasChanges = humanContent !== null && humanContent !== aiContent;

  // Knowledge Share 3-round flow state
  const [knowledgeShareFields, setKnowledgeShareFields] = useState<Record<string, BriefField>>({});
  const [knowledgeShareRound, setKnowledgeShareRound] = useState<BriefRound>(1);
  const initializingRef = useRef(false); // Prevent StrictMode double-invoke race condition
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [researchFindings, setResearchFindings] = useState<ResearchFindings | null>(null);
  const [researchEvents, setResearchEvents] = useState<SearchEvent[]>([]);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [knowledgeShareInitialized, setKnowledgeShareInitialized] = useState(false);

  // Two-phase research state for Knowledge Share
  const [researchPhase, setResearchPhase] = useState<ResearchPhase>("none");
  const [angle, setAngle] = useState<AngleSummary | null>(null);
  const [round1Events, setRound1Events] = useState<SearchEvent[]>([]);
  const [round1Findings, setRound1Findings] = useState<ResearchFindings | null>(null);
  const [round3Events, setRound3Events] = useState<SearchEvent[]>([]);
  const [round3Findings, setRound3Findings] = useState<ResearchFindings | null>(null);

  // Log entries for processing log (must be defined before callbacks that use it)
  const [logEntries, setLogEntries] = useState<Array<{time: string, type: 'info' | 'error' | 'success', message: string}>>([]);

  const addLogEntry = useCallback((type: 'info' | 'error' | 'success', message: string) => {
    const time = new Date().toLocaleTimeString();
    setLogEntries(prev => [...prev, { time, type, message }]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  // Check if this is a Knowledge Share project
  const isKnowledgeShare = useMemo(() => {
    if (!onboardingData) return false;
    return onboardingData.videoType === "Knowledge Share";
  }, [onboardingData]);

  // Initialize Knowledge Share flow - check backend state first
  useEffect(() => {
    console.log("=== KNOWLEDGE SHARE INIT CHECK ===");
    console.log("isKnowledgeShare:", isKnowledgeShare);
    console.log("projectId:", projectId);
    console.log("USE_KNOWLEDGE_SHARE_FLOW:", USE_KNOWLEDGE_SHARE_FLOW);
    console.log("stage.id:", stage.id);
    console.log("knowledgeShareInitialized:", knowledgeShareInitialized);
    console.log("aiContent:", aiContent ? "present" : "null");
    console.log("onboardingData:", onboardingData);

    if (isKnowledgeShare && projectId && USE_KNOWLEDGE_SHARE_FLOW && stage.id === 1 && !knowledgeShareInitialized && !aiContent) {
      const initializeKnowledgeShare = async () => {
        // Prevent StrictMode double-invoke race condition
        if (initializingRef.current) {
          console.log("=== KNOWLEDGE SHARE INIT ALREADY IN PROGRESS, SKIPPING ===");
          return;
        }
        initializingRef.current = true;

        console.log("=== INITIALIZING KNOWLEDGE SHARE ===");
        try {
          setKnowledgeShareInitialized(true);

          // Pre-populate fields from onboarding data immediately (so user sees their values right away)
          if (onboardingData) {
            const initialFields: Record<string, BriefField> = {
              video_type: { value: "knowledge_share", source: "extracted", confirmed: true },
              target_audience: {
                value: onboardingData.audience || "",
                source: onboardingData.audience ? "extracted" : "empty",
                confirmed: false
              },
              duration: {
                value: onboardingData.duration || "",
                source: onboardingData.duration ? "extracted" : "empty",
                confirmed: false
              },
            };
            setKnowledgeShareFields(initialFields);
            console.log("Pre-populated fields from onboarding:", initialFields);
          }

          // First, check backend state via pipeline-state endpoint
          console.log("Fetching pipeline-state...");
          const stateResponse = await fetch(`/api/project/${projectId}/pipeline-state`);
          console.log("pipeline-state response:", stateResponse.status);

          if (stateResponse.ok) {
            const stateData = await stateResponse.json();
            const currentPhase = stateData.state?.phase || "intake";

            console.log("Knowledge Share: current phase =", currentPhase);
            console.log("State data:", stateData);

            // Map backend phase to frontend round
            const phaseToRound: Record<string, BriefRound> = {
              "intake": 1,
              "brief_round1": 1,
              "brief_round2": 2,
              "brief_round3": 3,
              "brief_review": "review",
            };

            const round = phaseToRound[currentPhase] || 1;

            // If already past intake, load existing fields from state
            if (currentPhase !== "intake") {
              const fields = stateData.state?.story_brief?.fields || {};
              setKnowledgeShareFields(fields);
              setKnowledgeShareRound(round);
              setResearchError(null); // Clear any previous error
              console.log("Knowledge Share: resuming at round", round, "with fields:", Object.keys(fields));
              return;
            }
          } else {
            // If pipeline-state check failed, don't proceed with submit
            console.error("Failed to fetch pipeline-state, cannot safely submit");
            return;
          }

          // Only submit if we confirmed we're in intake phase
          console.log("Submitting submit_knowledge_share event...");
          const response = await fetch(`/api/project/${projectId}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "submit_knowledge_share",
              payload: {
                intake_form: {
                  video_type: onboardingData?.videoType,
                  description: onboardingData?.description,
                  duration: onboardingData?.duration,
                  target_audience: onboardingData?.audience,
                  links: onboardingData?.links || [],
                },
              },
            }),
          });

          console.log("submit_knowledge_share response:", response.status);

          if (response.ok) {
            const data = await response.json();
            console.log("Knowledge Share Round 1 response:", data);
            if (data.brief_fields) {
              setKnowledgeShareFields(data.brief_fields);
              setKnowledgeShareRound(1);
              console.log("Set fields:", Object.keys(data.brief_fields));
            } else if (data.error) {
              console.error("Response error:", data.error);
              setResearchError(data.error);
            }
          } else {
            const errorData = await response.json();
            console.error("Knowledge Share init failed:", errorData);
            setResearchError(errorData.detail || errorData.error || "Failed to start briefing");
          }
        } catch (err) {
          console.error("Failed to initialize Knowledge Share flow:", err);
          setResearchError("Failed to start briefing flow");
          initializingRef.current = false; // Allow retry on error
        }
      };

      initializeKnowledgeShare();
    }
  }, [isKnowledgeShare, projectId, stage.id, knowledgeShareInitialized, aiContent, onboardingData]);

  // Start Round 3 research after Round 1 completes
  const startRound3Research = useCallback(async () => {
    if (!angle || !projectId) return;

    addLogEntry('info', 'Starting Round 3 research...');
    setResearchPhase("round3_running");

    try {
      const response = await fetch(`/api/project/${projectId}/research/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_type: onboardingData?.videoType,
          company_name: onboardingData?.companyName,
          description: onboardingData?.description,
          links: onboardingData?.links,
          round: 3,
          angle: angle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.findings) {
          const findingsCount = Object.values(data.findings).flat().filter(Boolean).length;
          addLogEntry('success', `Round 3 complete: ${findingsCount} findings`);
          setRound3Findings(data.findings);
          setResearchPhase("complete");
          setResearchStatus("complete");
          // Merge findings from both rounds
          setResearchFindings({
            ...round1Findings,
            ...data.findings,
          });
          addLogEntry('success', 'All research complete!');
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.detail || 'Unknown error';
        addLogEntry('error', `Round 3 failed: ${errorMsg}`);
        setResearchError(`Failed to run Round 3 research: ${errorMsg}`);
        setResearchPhase("complete");
      }
    } catch (err) {
      console.error("Round 3 research error:", err);
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      addLogEntry('error', `Round 3 error: ${errorMsg}`);
      setResearchError(`Network error during Round 3 research: ${errorMsg}`);
      setResearchPhase("complete");
    }
  }, [projectId, onboardingData, angle, round1Findings, addLogEntry]);

  // Start two-phase research (called after Section 1 confirm)
  const startTwoPhaseResearch = useCallback(async () => {
    if (!projectId || !onboardingData) return;

    addLogEntry('info', 'Section 1 confirmed, starting research...');

    try {
      // Step 1: Calculate angle
      addLogEntry('info', 'Calculating angle from intake data...');
      const angleResponse = await fetch(`/api/project/${projectId}/research/angle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience: onboardingData.audience,
          description: onboardingData.description,
          duration: onboardingData.duration,
        }),
      });

      let calculatedAngle: AngleSummary | null = null;
      if (angleResponse.ok) {
        const angleData = await angleResponse.json();
        calculatedAngle = angleData.angle;
        setAngle(calculatedAngle);
        addLogEntry('success', `Angle calculated: ${calculatedAngle?.questions?.length || 0} questions generated`);
      } else {
        const errorData = await angleResponse.json().catch(() => ({}));
        addLogEntry('error', `Angle calculation failed: ${errorData.detail || 'Unknown error'}`);
      }

      // Step 2: Start Round 1 research
      addLogEntry('info', 'Starting Round 1 research...');
      setResearchStatus("running");
      setResearchPhase("round1_running");

      const response = await fetch(`/api/project/${projectId}/research/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_type: onboardingData.videoType,
          company_name: onboardingData.companyName,
          description: onboardingData.description,
          links: onboardingData.links,
          round: 1,
          angle: calculatedAngle,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.findings) {
          const findingsCount = Object.values(data.findings).flat().filter(Boolean).length;
          addLogEntry('success', `Round 1 complete: ${findingsCount} findings`);
          setRound1Findings(data.findings);
          setResearchPhase("round1_complete");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.detail || 'Unknown error';
        addLogEntry('error', `Round 1 failed: ${errorMsg}`);
        setResearchError(`Failed to run Round 1 research: ${errorMsg}`);
      }
    } catch (err) {
      console.error("Research error:", err);
      const errorMsg = err instanceof Error ? err.message : 'Network error';
      addLogEntry('error', `Research error: ${errorMsg}`);
      setResearchError(`Network error during research: ${errorMsg}`);
    }
  }, [projectId, onboardingData, addLogEntry]);

  // Auto-start Round 3 when Round 1 completes
  useEffect(() => {
    if (researchPhase === "round1_complete" && round1Findings) {
      startRound3Research();
    }
  }, [researchPhase, round1Findings, startRound3Research]);

  // Research stream for Knowledge Share (legacy polling - kept for backwards compat)
  useEffect(() => {
    if (!isKnowledgeShare || !projectId || researchStatus !== "running") return;
    if (researchPhase !== "none") return; // Skip legacy polling if using two-phase

    // Poll for research status
    const pollResearch = async () => {
      try {
        const response = await fetch(`/api/project/${projectId}/research/status`);
        if (response.ok) {
          const data = await response.json();
          if (data.status === "complete") {
            setResearchStatus("complete");
            setResearchFindings(data.findings);
          } else if (data.status === "running") {
            // Update events
            if (data.events) {
              setResearchEvents(data.events);
            }
          } else if (data.status === "error") {
            setResearchStatus("error");
            setResearchError(data.error || "Research failed");
          }
        }
      } catch {
        // Silently fail polling
      }
    };

    const interval = setInterval(pollResearch, 2000);
    pollResearch(); // Initial poll

    return () => clearInterval(interval);
  }, [isKnowledgeShare, projectId, researchStatus, researchPhase]);

  // Handle round confirmation for Knowledge Share
  const handleKnowledgeShareRoundConfirm = useCallback(
    async (round: number, confirmedFields: Record<string, BriefField>): Promise<Record<string, BriefField>> => {
      console.log(`=== ROUND ${round} CONFIRM ===`);
      console.log("Confirmed fields:", Object.keys(confirmedFields));

      const eventTypeMap: Record<number, string> = {
        1: "round1_confirm",
        2: "round2_confirm",
        3: "round3_confirm",
      };

      const event = eventTypeMap[round];
      console.log("Sending event:", event);

      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: event,
          payload: { confirmed_fields: confirmedFields },
        }),
      });

      console.log("Event response status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Round confirm failed:", errorData);
        throw new Error(errorData.detail || `Failed to confirm round ${round}`);
      }

      // Start two-phase research after Section 1 is confirmed
      if (round === 1) {
        console.log("Section 1 confirmed - starting two-phase research");
        startTwoPhaseResearch();
      }

      const data = await response.json();
      console.log("Round confirm response:", data);
      return data.fields || {};
    },
    [projectId, startTwoPhaseResearch]
  );

  // Handle brief approval for Knowledge Share
  const handleKnowledgeShareBriefApprove = useCallback(
    async (allFields: Record<string, BriefField>): Promise<void> => {
      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "brief_approve",
          payload: { all_fields: allFields },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to approve brief");
      }

      // Trigger stage advance
      const data = await response.json();
      if (data.brief) {
        onContentChange(JSON.stringify(data.brief, null, 2));
        onApprove(JSON.stringify(data.brief, null, 2));
      }
    },
    [projectId, onContentChange, onApprove]
  );

  // Handle edit brief for Knowledge Share
  const handleKnowledgeShareEditBrief = useCallback(() => {
    setKnowledgeShareRound(1);
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

  // For Outline stage, parse the AI content into screens array
  const screensData = useMemo<Screen[]>(() => {
    if (stage.id !== 2 || !aiContent) return [];
    try {
      const parsed = typeof aiContent === "string" ? JSON.parse(aiContent) : aiContent;
      return parseScreens(parsed);
    } catch {
      return [];
    }
  }, [stage.id, aiContent]);

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

  // Track screens updates for the Outline stage
  const [localScreens, setLocalScreens] = useState<Screen[] | null>(null);

  // Track draft updates for the Draft stage
  const [localDraft, setLocalDraft] = useState<ProductionScreen[] | null>(null);

  // Track review updates for the Review stage
  const [localReview, setLocalReview] = useState<ProductionScreen[] | null>(null);

  // Use local brief if edited, otherwise use parsed AI brief
  const currentBrief = localBrief ?? briefData;

  // Use local screens if edited, otherwise use parsed AI screens
  const currentScreens = localScreens ?? screensData;

  // Use local draft if edited, otherwise use parsed AI draft
  const currentDraft = localDraft ?? draftData;

  // Use local review if edited, otherwise use parsed AI review
  const currentReview = localReview ?? reviewData;

  // Processing log for child components
  const processingLog: ProcessingLogEntry[] = [];
  const outlineProcessingLog: OutlineProcessingEntry[] = [];
  const draftProcessingLog: DraftProcessingEntry[] = [];

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

  const handleScreensUpdate = (updatedScreens: Screen[]) => {
    setLocalScreens(updatedScreens);
    onContentChange(JSON.stringify(updatedScreens, null, 2));
  };

  const handleOutlineConfirm = () => {
    const screensToApprove = currentScreens.length > 0 ? currentScreens : screensData;
    if (screensToApprove.length > 0) {
      onApprove(JSON.stringify(screensToApprove, null, 2));
    }
  };

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

  if (isGenerating) {
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

  // For Stage 1 (Brief), use KnowledgeShareBriefBuilder for Knowledge Share videos
  if (stage.id === 1 && USE_KNOWLEDGE_SHARE_FLOW && isKnowledgeShare && projectId && !aiContent) {
    return (
      <div className="flex-1 flex flex-col md:flex-row" style={{ minHeight: 0, height: "100%" }}>
        {/* Left Panel - Brief Fields (60%) */}
        <div className="flex-1 md:w-[60%] overflow-hidden border-r">
          <KnowledgeShareBriefBuilder
            projectId={projectId}
            initialFields={knowledgeShareFields}
            initialRound={knowledgeShareRound}
            researchComplete={researchStatus === "complete"}
            onRoundConfirm={handleKnowledgeShareRoundConfirm}
            onBriefApprove={handleKnowledgeShareBriefApprove}
            onEditBrief={handleKnowledgeShareEditBrief}
          />
        </div>

        {/* Right Panel - Processing Log (40%) */}
        <div className="hidden md:block md:w-[40%] overflow-hidden bg-muted/10">
          <div className="h-full flex flex-col">
            <div className="px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Processing Log</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  researchPhase === "complete" ? "bg-green-100 text-green-700" :
                  researchPhase === "round1_running" || researchPhase === "round3_running" ? "bg-blue-100 text-blue-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {researchPhase === "none" ? "Waiting" :
                   researchPhase === "round1_running" ? "Round 1..." :
                   researchPhase === "round1_complete" ? "Starting R3" :
                   researchPhase === "round3_running" ? "Round 3..." :
                   "Complete"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Research activity and findings</p>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {/* Idle state - waiting for Section 1 confirm */}
              {researchPhase === "none" && researchStatus === "idle" && (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">Research will start after confirming Section 1.</p>
                </div>
              )}

              {/* Angle display */}
              {angle && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="text-sm font-medium text-blue-700 mb-2">Angle Summary</h4>
                  <div className="text-xs space-y-1 text-blue-600">
                    <p><span className="font-medium">Audience:</span> {angle.audienceLevel}</p>
                    <p><span className="font-medium">Key Takeaway:</span> {angle.keyTakeaway}</p>
                    <p><span className="font-medium">Duration:</span> {angle.durationMinutes} min</p>
                    {angle.questions.length > 0 && (
                      <p><span className="font-medium">Questions:</span> {angle.questions.length}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Round 1 Research Section */}
              {(researchPhase === "round1_running" || researchPhase === "round1_complete" || researchPhase === "round3_running" || researchPhase === "complete") && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {researchPhase === "round1_running" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                    <span className={`text-sm font-medium ${
                      researchPhase === "round1_running" ? "text-blue-600" : "text-green-600"
                    }`}>
                      Round 1 Research {researchPhase !== "round1_running" && "✓"}
                    </span>
                  </div>
                  {round1Findings && (
                    <div className="pl-6 text-xs text-muted-foreground">
                      {Object.values(round1Findings).flat().filter(Boolean).length} findings collected
                    </div>
                  )}
                </div>
              )}

              {/* Round 3 Research Section */}
              {(researchPhase === "round3_running" || researchPhase === "complete") && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {researchPhase === "round3_running" ? (
                      <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    ) : (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                    <span className={`text-sm font-medium ${
                      researchPhase === "round3_running" ? "text-blue-600" : "text-green-600"
                    }`}>
                      Round 3 Research {researchPhase === "complete" && "✓"}
                    </span>
                  </div>
                  {round3Findings && (
                    <div className="pl-6 text-xs text-muted-foreground">
                      {Object.values(round3Findings).flat().filter(Boolean).length} findings collected
                    </div>
                  )}
                </div>
              )}

              {/* Combined findings when complete */}
              {researchPhase === "complete" && researchFindings && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-4 h-4" />
                    <span className="text-sm font-medium">All research complete</span>
                  </div>
                  {researchFindings.keyPoints && researchFindings.keyPoints.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-medium mb-2">Key Insights</h4>
                      <ul className="space-y-1">
                        {researchFindings.keyPoints.slice(0, 5).map((point, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Log entries */}
              {logEntries.length > 0 && (
                <div className="space-y-1 border-t pt-3 mt-3">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Activity Log</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {logEntries.map((entry, i) => (
                      <div key={i} className={`text-xs px-2 py-1 rounded ${
                        entry.type === 'error' ? 'bg-red-50 text-red-700' :
                        entry.type === 'success' ? 'bg-green-50 text-green-700' :
                        'bg-gray-50 text-gray-600'
                      }`}>
                        <span className="text-muted-foreground">[{entry.time}]</span> {entry.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error state */}
              {researchError && (
                <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm text-red-600">{researchError}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setResearchError(null);
                      setResearchPhase("none");
                      setResearchStatus("idle");
                      setLogEntries([]);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
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

  // Render OutlineBuilder for the Outline stage (stage 2)
  if (stage.id === 2 && currentScreens.length > 0) {
    // Stage 1 output is the Brief data from previous stage
    const stage1Output = previousStageOutput || null;

    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <OutlineBuilder
          screens={currentScreens}
          stage1Output={stage1Output}
          processingLog={outlineProcessingLog}
          onScreensUpdate={handleScreensUpdate}
          onConfirm={handleOutlineConfirm}
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
          outlineSummary={outlineSummary}
          previousStageOutput={previousStageOutput}
          processingLog={draftProcessingLog}
          onDraftUpdate={handleDraftUpdate}
          onConfirm={handleDraftConfirm}
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
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0">
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
      <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ minHeight: 0 }}>
        <div className="max-w-5xl mx-auto">
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
