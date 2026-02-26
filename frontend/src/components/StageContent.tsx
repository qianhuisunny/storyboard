import { useState, useMemo, useCallback, useEffect } from "react";
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
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("idle");
  const [researchFindings, setResearchFindings] = useState<ResearchFindings | null>(null);
  const [researchEvents, setResearchEvents] = useState<SearchEvent[]>([]);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [knowledgeShareInitialized, setKnowledgeShareInitialized] = useState(false);

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
        try {
          setResearchStatus("running");
          setKnowledgeShareInitialized(true);

          // Submit intake and get Round 1 fields
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

          if (response.ok) {
            const data = await response.json();
            console.log("Knowledge Share Round 1 response:", data);
            // Backend returns brief_fields, not fields
            if (data.brief_fields) {
              setKnowledgeShareFields(data.brief_fields);
              setKnowledgeShareRound(1);
              // Also update research status based on response
              if (data.research_status === "complete") {
                setResearchStatus("complete");
              }
            } else if (data.error) {
              setResearchError(data.error);
            }
          } else {
            const errorData = await response.json();
            console.error("Knowledge Share init failed:", errorData);
            setResearchError(errorData.error || "Failed to start briefing");
          }
        } catch (err) {
          console.error("Failed to initialize Knowledge Share flow:", err);
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

  // Handle round confirmation for Knowledge Share
  const handleKnowledgeShareRoundConfirm = useCallback(
    async (round: number, confirmedFields: Record<string, BriefField>): Promise<Record<string, BriefField>> => {
      const eventTypeMap: Record<number, string> = {
        1: "round1_confirm",
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
      return data.fields || {};
    },
    [projectId]
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
              <h3 className="font-semibold text-sm">Processing Log</h3>
              <p className="text-xs text-muted-foreground">Research activity and findings</p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {researchStatus === "idle" && (
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-sm">Research will start when you begin the briefing flow.</p>
                </div>
              )}
              {researchStatus === "running" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-sm font-medium">Researching topic...</span>
                  </div>
                  {researchEvents.length > 0 && (
                    <div className="space-y-2">
                      {researchEvents.map((event) => (
                        <div
                          key={event.id}
                          className="p-3 bg-muted/50 rounded-lg border text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium">{event.query}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              event.status === "complete"
                                ? "bg-green-100 text-green-700"
                                : event.status === "error"
                                ? "bg-red-100 text-red-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}>
                              {event.status}
                            </span>
                          </div>
                          {event.resultsCount !== undefined && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Found {event.resultsCount} results
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {researchStatus === "complete" && researchFindings && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-600">
                    <Check className="w-4 h-4" />
                    <span className="text-sm font-medium">Research complete</span>
                  </div>
                  {researchFindings.summary && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-medium mb-2">Summary</h4>
                      <p className="text-sm text-muted-foreground">{researchFindings.summary}</p>
                    </div>
                  )}
                  {researchFindings.keyPoints && researchFindings.keyPoints.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-medium mb-2">Key Insights</h4>
                      <ul className="space-y-1">
                        {researchFindings.keyPoints.map((point, i) => (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                            <span className="text-primary">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {researchFindings.sources && researchFindings.sources.length > 0 && (
                    <div className="p-3 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-medium mb-2">Sources ({researchFindings.sources.length})</h4>
                      <ul className="space-y-1">
                        {researchFindings.sources.slice(0, 5).map((source, i) => (
                          <li key={i} className="text-xs">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline truncate block"
                            >
                              {source.title || source.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {researchStatus === "error" && (
                <div className="text-center py-8">
                  <p className="text-sm text-red-600">{researchError || "Research failed"}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => {
                      setResearchStatus("running");
                      setResearchError(null);
                    }}
                  >
                    Retry Research
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
