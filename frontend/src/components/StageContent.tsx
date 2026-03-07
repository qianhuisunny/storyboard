import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { type Stage } from "./StageNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, RefreshCw, Loader2 } from "lucide-react";
import { BriefBuilder, normalizeBrief, type StoryBrief, type BriefField, type BriefRound, KnowledgeShareBriefBuilder, type ProcessingLogEntry as LegacyProcessingLogEntry } from "./BriefBuilder";
import { SplitBriefBuilder } from "./BriefBuilder/SplitBriefBuilder";
import { type OnboardingData, type ResearchChatState, type PerspectiveOption, type ChatMessage, type ProcessingLogEntry } from "./BriefBuilder/SplitBriefBuilder/types";
import { TabbedResearchPanel } from "./BriefBuilder/SplitBriefBuilder/ResearchPanel/TabbedResearchPanel";
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
}

type ResearchStatus = "idle" | "running" | "complete" | "error";

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
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [_researchFindings, setResearchFindings] = useState<ResearchFindings | null>(null);
  const [_researchEvents, setResearchEvents] = useState<SearchEvent[]>([]);
  const [_researchError, setResearchError] = useState<string | null>(null);
  const [knowledgeShareInitialized, setKnowledgeShareInitialized] = useState(false);

  // Note: _researchFindings, _researchEvents, _researchError are kept for legacy flow
  // but primarily used via researchChatState for the new interactive flow
  void _researchFindings;
  void _researchEvents;
  void _researchError;

  // NEW: Research chat state for perspective-first flow
  const [researchChatState, setResearchChatState] = useState<ResearchChatState>({
    status: "idle",
    messages: [],
    perspectives: [],
    selectedPerspective: null,
    talkingPoints: [],
    isLoading: false,
  });
  const [isResearchChatLoading, setIsResearchChatLoading] = useState(false);

  // Processing logs state for the Processing tab
  const [processingLogs, setProcessingLogs] = useState<ProcessingLogEntry[]>([]);
  const [isPollingLogs, setIsPollingLogs] = useState(false);
  // Use ref for lastLogId to avoid triggering re-renders/re-polls
  const lastLogIdRef = useRef<string | null>(null);
  // Track if we've cleared logs for this session
  const hasInitializedLogs = useRef(false);

  // Check if this is a Knowledge Share project
  const isKnowledgeShare = useMemo(() => {
    if (!onboardingData) return false;
    return onboardingData.videoType === "Knowledge Share";
  }, [onboardingData]);

  // Initialize Knowledge Share flow
  useEffect(() => {
    if (isKnowledgeShare && projectId && USE_KNOWLEDGE_SHARE_FLOW && stage.id === 1 && !knowledgeShareInitialized && !aiContent) {
      // Start the Knowledge Share flow by submitting intake
      const initializeKnowledgeShare = async () => {
        const startTime = performance.now();
        console.log("[KS] Initializing...");

        try {
          setKnowledgeShareInitialized(true);

          // First, check if project already has state (e.g., page refresh)
          const stateResponse = await fetch(`/api/project/${projectId}/pipeline-state`);
          if (stateResponse.ok) {
            const stateData = await stateResponse.json();
            console.log("[KS] Current pipeline state:", stateData);

            // Extract brief_fields from story_brief in pipeline state
            const briefFields = stateData.data?.story_brief?.fields || {};

            // If already in round 2 or later, restore that state
            if (stateData.phase === "brief_round2") {
              console.log("[KS] Restoring round 2 state, fields:", Object.keys(briefFields));
              setKnowledgeShareFields(briefFields);
              setKnowledgeShareRound(2);
              setResearchStatus("complete");
              return;
            } else if (stateData.phase === "brief_round3") {
              console.log("[KS] Restoring round 3 state, fields:", Object.keys(briefFields));
              setKnowledgeShareFields(briefFields);
              setKnowledgeShareRound(3);
              setResearchStatus("complete");
              return;
            } else if (stateData.phase === "brief_round1") {
              console.log("[KS] Restoring round 1 state, fields:", Object.keys(briefFields));
              setKnowledgeShareFields(briefFields);
              setKnowledgeShareRound(1);
              setResearchStatus("idle");
              return;
            }
            // If phase is set but not brief_round*, project may have progressed past brief stage
            if (stateData.phase && !stateData.phase.startsWith("brief_") && stateData.phase !== "intake") {
              console.log("[KS] Project already past brief stage, phase:", stateData.phase);
              return;
            }
          }

          // Project is new or in intake phase - start fresh
          console.log("[KS] Starting fresh with submit_knowledge_share...", {
            videoType: onboardingData?.videoType,
            duration: onboardingData?.duration,
            audience: onboardingData?.audience,
          });

          setResearchStatus("idle");

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

          console.log(`[KS] Response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json();
            console.log("[KS] Round 1 response data:", data);
            console.log(`[KS] Total time: ${(performance.now() - startTime).toFixed(0)}ms`);

            if (data.brief_fields) {
              setKnowledgeShareFields(data.brief_fields);
              setKnowledgeShareRound(1);
              if (data.research_status === "complete") {
                setResearchStatus("complete");
              }
            } else if (data.error) {
              setResearchError(data.error);
            }
          } else {
            const errorData = await response.json();
            console.error("[KS] Init failed:", errorData);
            setResearchError(errorData.error || "Failed to start briefing");
          }
        } catch (err) {
          console.error("[KS] Failed to initialize:", err);
          setResearchError("Failed to start briefing flow");
        }
      };

      initializeKnowledgeShare();
    }
  }, [isKnowledgeShare, projectId, stage.id, knowledgeShareInitialized, aiContent, onboardingData]);

  // Research stream for Knowledge Share (runs in parallel with Round 1 & 2)
  useEffect(() => {
    if (!isKnowledgeShare || !projectId || researchStatus !== "running") return;

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
  }, [isKnowledgeShare, projectId, researchStatus]);

  // Clear processing logs on mount (fresh session)
  useEffect(() => {
    if (!isKnowledgeShare || !projectId || hasInitializedLogs.current) return;
    hasInitializedLogs.current = true;

    // Clear logs on backend for fresh session
    fetch(`/api/project/${projectId}/processing-logs`, { method: "DELETE" }).catch(() => {
      // Silently fail - non-critical
    });
    // Reset frontend state
    setProcessingLogs([]);
    lastLogIdRef.current = null;
  }, [isKnowledgeShare, projectId]);

  // Poll for processing logs (for the Processing tab)
  useEffect(() => {
    if (!isKnowledgeShare || !projectId) return;

    const pollLogs = async () => {
      try {
        const url = lastLogIdRef.current
          ? `/api/project/${projectId}/processing-logs?since_id=${lastLogIdRef.current}`
          : `/api/project/${projectId}/processing-logs`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data && data.data.length > 0) {
            // Deduplicate by ID when adding new logs
            setProcessingLogs((prev) => {
              const existingIds = new Set(prev.map((log) => log.id));
              const newLogs = data.data.filter((log: ProcessingLogEntry) => !existingIds.has(log.id));
              return [...prev, ...newLogs];
            });
            // Track the last log ID for incremental polling (using ref to avoid re-renders)
            const lastEntry = data.data[data.data.length - 1];
            if (lastEntry) {
              lastLogIdRef.current = lastEntry.id;
            }
          }
        }
      } catch {
        // Silently fail polling
      }
    };

    // Poll while any research/generation is happening
    const isActive = isResearchChatLoading || researchStatus === "running";
    setIsPollingLogs(isActive);

    if (isActive) {
      const interval = setInterval(pollLogs, 1000);
      pollLogs(); // Initial poll
      return () => clearInterval(interval);
    } else {
      // Final poll when done
      pollLogs();
    }
  }, [isKnowledgeShare, projectId, isResearchChatLoading, researchStatus]);

  // Helper to add chat message
  const addChatMessage = useCallback((type: ChatMessage["type"], content: string, extra?: Partial<ChatMessage>) => {
    const message: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      content,
      timestamp: new Date(),
      ...extra,
    };
    setResearchChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }));
  }, []);

  // Handle round confirmation for Knowledge Share
  const handleKnowledgeShareRoundConfirm = useCallback(
    async (round: number, confirmedFields: Record<string, BriefField>): Promise<Record<string, BriefField>> => {
      // Round 1 confirm now triggers perspective generation (new flow)
      if (round === 1) {
        setIsResearchChatLoading(true);
        setResearchChatState((prev) => ({
          ...prev,
          status: "awaiting_perspective",
          isLoading: true,
        }));

        // Add initial chat message
        addChatMessage(
          "system",
          `I received your request for "${confirmedFields.primary_goal?.value || confirmedFields.one_big_thing?.value || "your video"}". Hold on while I analyze some angles...`
        );

        try {
          const response = await fetch(`/api/project/${projectId}/event`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "round1_confirm",
              payload: { confirmed_fields: confirmedFields },
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to confirm round 1");
          }

          const data = await response.json();

          // Check if we got perspectives back
          if (data.status === "awaiting_perspective" && data.perspectives) {
            setResearchChatState((prev) => ({
              ...prev,
              status: "awaiting_perspective",
              perspectives: data.perspectives,
              isLoading: false,
            }));
            addChatMessage("system", "A great knowledge-sharing video isn't just about assembling facts — it's about sharing your perspective. Here are some angles for your consideration:");
          } else {
            // Fallback to old flow if no perspectives
            setResearchStatus("running");
          }

          setIsResearchChatLoading(false);
          return {};  // Don't advance round yet - wait for perspective selection
        } catch (err) {
          setIsResearchChatLoading(false);
          setResearchChatState((prev) => ({
            ...prev,
            status: "idle",
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to generate perspectives",
          }));
          throw err;
        }
      }

      // Rounds 2 and 3 use standard flow
      const eventTypeMap: Record<number, string> = {
        2: "round2_confirm",
        3: "round3_confirm",
      };

      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: eventTypeMap[round],
          payload: { confirmed_fields: confirmedFields },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to confirm round ${round}`);
      }

      const data = await response.json();

      // Update research status from response
      if (data.research_status === "complete") {
        setResearchStatus("complete");
      } else if (data.research_status === "failed") {
        setResearchStatus("error");
      }

      return data.brief_fields || data.fields || {};
    },
    [projectId, addChatMessage]
  );

  // Handle perspective selection
  const handleSelectPerspective = useCallback(
    async (perspective: PerspectiveOption | string) => {
      setIsResearchChatLoading(true);
      const perspectiveText = typeof perspective === "string" ? perspective : perspective.statement;

      // Add user message
      addChatMessage("user", perspectiveText);

      setResearchChatState((prev) => ({
        ...prev,
        selectedPerspective: perspectiveText,
        status: "awaiting_talking_points_confirm",
        isLoading: true,
      }));

      try {
        const response = await fetch(`/api/project/${projectId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "select_perspective",
            payload: {
              perspective: typeof perspective === "string" ? perspective : perspective,
            },
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to select perspective");
        }

        const data = await response.json();

        if (data.status === "awaiting_talking_points_confirm" && data.talking_points) {
          setResearchChatState((prev) => ({
            ...prev,
            talkingPoints: data.talking_points,
            status: "awaiting_talking_points_confirm",
            isLoading: false,
          }));
          addChatMessage("system", "Great choice! Based on this angle, here are the key talking points:");
        }

        setIsResearchChatLoading(false);
      } catch (err) {
        setIsResearchChatLoading(false);
        setResearchChatState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Failed to generate talking points",
        }));
      }
    },
    [projectId, addChatMessage]
  );

  // Handle talking points confirmation
  const handleConfirmTalkingPoints = useCallback(
    async (feedback?: string, editedPoints?: string[]) => {
      setIsResearchChatLoading(true);
      setResearchChatState((prev) => ({
        ...prev,
        status: "researching",
        isLoading: true,
      }));

      // Build confirmation message showing the final talking points
      const finalPoints = editedPoints || researchChatState.talkingPoints;
      const pointsList = finalPoints.map((p, i) => `${i + 1}. ${p}`).join("\n");
      const confirmationMsg = `Confirmed talking points:\n${pointsList}${feedback ? `\n\nAdditional notes: ${feedback}` : ""}`;
      addChatMessage("user", confirmationMsg);
      addChatMessage("system", "Now researching evidence for each point...");

      try {
        const response = await fetch(`/api/project/${projectId}/event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "confirm_talking_points",
            payload: { feedback, editedPoints },
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to confirm talking points");
        }

        const data = await response.json();

        if (data.status === "round2_ready") {
          setResearchChatState((prev) => ({
            ...prev,
            status: "complete",
            isLoading: false,
          }));
          setResearchStatus("complete");
          addChatMessage(
            "system",
            "Research complete! I found statistics, examples, and identified common misconceptions. Your Round 3 fields have been populated."
          );

          // Update knowledge share fields with round 2 fields
          if (data.brief_fields) {
            setKnowledgeShareFields((prev) => ({ ...prev, ...data.brief_fields }));
          }

          // Advance to round 2
          setKnowledgeShareRound(2);
        }

        setIsResearchChatLoading(false);
      } catch (err) {
        setIsResearchChatLoading(false);
        setResearchChatState((prev) => ({
          ...prev,
          status: "awaiting_talking_points_confirm",
          isLoading: false,
          error: err instanceof Error ? err.message : "Research failed",
        }));
        addChatMessage("status", "Research encountered an error. You can try again.");
      }
    },
    [projectId, addChatMessage]
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
      console.log("[KS] Brief approve response:", data);

      // Backend returns screen_outline after running Director
      if (data.screen_outline) {
        // Pass outline to next stage
        onContentChange(JSON.stringify(data.screen_outline, null, 2));
        onApprove(JSON.stringify(data.screen_outline, null, 2));
      } else if (data.story_brief) {
        // Fallback if only brief returned
        onContentChange(JSON.stringify(data.story_brief, null, 2));
        onApprove(JSON.stringify(data.story_brief, null, 2));
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

  // Processing log for child components (legacy BriefBuilder)
  const processingLog: LegacyProcessingLogEntry[] = [];
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
            isResearchRunning={isResearchChatLoading || researchStatus === "running"}
            onRoundConfirm={handleKnowledgeShareRoundConfirm}
            onBriefApprove={handleKnowledgeShareBriefApprove}
            onEditBrief={handleKnowledgeShareEditBrief}
          />
        </div>

        {/* Right Panel - Tabbed Research Panel (40%) */}
        <div className="hidden md:block md:w-[40%] overflow-hidden bg-muted/10">
          <TabbedResearchPanel
            researchChatState={researchChatState}
            onSelectPerspective={handleSelectPerspective}
            onConfirmTalkingPoints={handleConfirmTalkingPoints}
            isResearchChatLoading={isResearchChatLoading}
            projectId={projectId}
            processingLogs={processingLogs}
            isPollingLogs={isPollingLogs}
          />
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
