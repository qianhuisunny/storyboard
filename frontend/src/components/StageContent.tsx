import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { type Stage } from "./StageNavigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, RefreshCw, Loader2 } from "lucide-react";
import { BriefBuilder, normalizeBrief, type StoryBrief, type BriefField, type BriefRound, KnowledgeShareBriefBuilder, type ProcessingLogEntry as LegacyProcessingLogEntry } from "./BriefBuilder";
import { SplitBriefBuilder } from "./BriefBuilder/SplitBriefBuilder";
import { type OnboardingData, type ProcessingLogEntry } from "./BriefBuilder/SplitBriefBuilder/types";
import { OutlineBuilder, type EvidenceResearch, type SectionResearch } from "./OutlineBuilder";
import { DraftBuilder, parseProductionScreens, type ProductionScreen, type DraftProcessingEntry } from "./DraftBuilder";
import { ReviewBuilder } from "./ReviewBuilder";

// Feature flag for new split-screen brief builder
const USE_SPLIT_BRIEF_BUILDER = true;

// Feature flag for new Knowledge Share 3-round flow
const USE_KNOWLEDGE_SHARE_FLOW = true;

// RESEARCH DISABLED: types kept for residual state references
type ResearchStatus = "idle" | "running" | "complete" | "error";

interface ApproveOptions {
  skipNextGeneration?: boolean;
  nextStageContent?: string;
}

interface StageContentProps {
  stage: Stage;
  aiContent: string | null;
  humanContent: string | null;
  previousStageOutput?: Record<string, unknown> | null;
  researchDetails?: Record<string, unknown> | null;
  isGenerating: boolean;
  onApprove: (content: string, options?: ApproveOptions) => void;
  onRegenerate: (feedback: string) => void;
  onContentChange: (content: string) => void;
  onAnchorChange?: (anchor: string | null) => void;
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
  researchDetails: _researchDetails,
  isGenerating,
  onApprove,
  onRegenerate,
  onContentChange,
  onAnchorChange,
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
  const [knowledgeShareInitialized, setKnowledgeShareInitialized] = useState(false);
  // Track if brief is already approved on backend (past brief stage)
  const [isBriefAlreadyApproved, setIsBriefAlreadyApproved] = useState(false);
  // RESEARCH DISABLED: research state variables
  const [researchStatus, setResearchStatus] = useState<ResearchStatus>("complete");
  const [, setResearchError] = useState<string | null>(null);

  // RESEARCH DISABLED
  const isResearchChatLoading = false;

  // Processing logs state for the Processing tab
  const [, setProcessingLogs] = useState<ProcessingLogEntry[]>([]);
  const [, setIsPollingLogs] = useState(false);
  // Use ref for lastLogId to avoid triggering re-renders/re-polls
  const lastLogIdRef = useRef<string | null>(null);
  // Track if we've cleared logs for this session
  const hasInitializedLogs = useRef(false);

  // Check if this is a Knowledge Share project
  // Priority: session storage onboarding data → saved brief content (for existing projects)
  const isKnowledgeShare = useMemo(() => {
    if (onboardingData) {
      return onboardingData.videoType === "Knowledge Share";
    }
    // Fallback: check saved stage-1 content for video_type field
    const content = humanContent || aiContent;
    if (content && stage.id === 1) {
      try {
        const parsed = JSON.parse(content);
        const videoType = parsed?.fields?.video_type?.value;
        if (videoType) {
          return videoType === "knowledge_share" || videoType === "Knowledge Share";
        }
      } catch {
        // Not JSON or doesn't have expected structure
      }
    }
    return false;
  }, [onboardingData, humanContent, aiContent, stage.id]);

  // Initialize Knowledge Share flow
  useEffect(() => {
    if (isKnowledgeShare && projectId && USE_KNOWLEDGE_SHARE_FLOW && stage.id === 1 && !knowledgeShareInitialized) {
      // Start the Knowledge Share flow by submitting intake
      const initializeKnowledgeShare = async () => {
        const startTime = performance.now();
        console.log("[KS] Initializing... stage.status:", stage.status);

        try {
          setKnowledgeShareInitialized(true);

          // If stage is already approved, we just need to load the saved data for display
          const isAlreadyApproved = stage.status === "approved";

          // First, check if project already has state (e.g., page refresh)
          const stateResponse = await fetch(`/api/project/${projectId}/pipeline-state`);
          if (stateResponse.ok) {
            const stateData = await stateResponse.json();
            console.log("[KS] Current pipeline state:", stateData);

            // Extract brief_fields from story_brief in pipeline state
            const briefFields = stateData.data?.story_brief?.fields || {};

            // If frontend stage is already approved, show review mode with saved data
            if (isAlreadyApproved && Object.keys(briefFields).length > 0) {
              console.log("[KS] Stage already approved, restoring fields:", Object.keys(briefFields));
              setKnowledgeShareFields(briefFields);
              setKnowledgeShareRound("review");
              setResearchStatus("complete");
              setIsBriefAlreadyApproved(true); // Mark as already approved on backend
              return;
            }

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
            } else if (stateData.phase === "angle_selection") {
              // Legacy: projects stuck in angle_selection get restored to round 3
              console.log("[KS] Restoring angle_selection as round 3, fields:", Object.keys(briefFields));
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
            // Still populate fields so they can be shown in read-only view
            if (stateData.phase && !stateData.phase.startsWith("brief_") && stateData.phase !== "intake") {
              console.log("[KS] Project already past brief stage, phase:", stateData.phase, "fields:", Object.keys(briefFields));
              if (Object.keys(briefFields).length > 0) {
                setKnowledgeShareFields(briefFields);
                setKnowledgeShareRound("review"); // Show as completed/locked
                setResearchStatus("complete");
                setIsBriefAlreadyApproved(true); // Mark as already approved on backend
              }
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
  }, [isKnowledgeShare, projectId, stage.id, stage.status, knowledgeShareInitialized, aiContent, onboardingData]);

  // RESEARCH DISABLED: Research polling removed
  // useEffect(() => {
  //   if (!isKnowledgeShare || !projectId || researchStatus !== "running") return;
  //   const pollResearch = async () => { ... };
  //   const interval = setInterval(pollResearch, 2000);
  //   return () => clearInterval(interval);
  // }, [isKnowledgeShare, projectId, researchStatus]);

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
    if (!projectId) return;

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

    // Poll while any research/generation is happening (Stage 1 research OR Stage 2/3 generation)
    const isActive = isResearchChatLoading || researchStatus === "running" || isGenerating;
    setIsPollingLogs(isActive);

    if (isActive) {
      const interval = setInterval(pollLogs, 1000);
      pollLogs(); // Initial poll
      return () => clearInterval(interval);
    } else {
      // Final poll when done
      pollLogs();
    }
  }, [projectId, isResearchChatLoading, researchStatus, isGenerating]);

  // RESEARCH DISABLED: addChatMessage helper removed
  // const addChatMessage = useCallback((...) => { ... }, []);

  // Handle round confirmation for Knowledge Share
  // RESEARCH DISABLED: Round 1 no longer triggers perspective generation.
  // It sends round1_confirm which now directly transitions to Round 2 on the backend.
  const handleKnowledgeShareRoundConfirm = useCallback(
    async (round: number, confirmedFields: Record<string, BriefField>): Promise<Record<string, BriefField>> => {
      // Map round numbers to event names
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

      // Update research status from response
      if (data.research_status === "complete") {
        setResearchStatus("complete");
      } else if (data.research_status === "failed") {
        setResearchStatus("error");
      }

      return data.brief_fields || data.fields || {};
    },
    [projectId]
  );

  // RESEARCH DISABLED: handleSelectPerspective and handleConfirmTalkingPoints removed
  // These handlers managed the perspective → talking points → research flow
  // which is now skipped. Round 1 confirm goes directly to Round 2.

  // Handle generating content spine from a point of view
  const handleGenerateContentSpine = useCallback(
    async (pov: string): Promise<Record<string, BriefField>> => {
      const response = await fetch(`/api/project/${projectId}/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "generate_content_spine",
          payload: { point_of_view: pov },
        }),
      });
      if (!response.ok) throw new Error("Failed to generate content spine");
      const data = await response.json();
      const newFields = data.brief_fields || data.fields || {};
      // Merge generated fields into local state
      setKnowledgeShareFields(prev => ({ ...prev, ...newFields }));
      return newFields;
    },
    [projectId]
  );

  // Handle brief approval for Knowledge Share
  const handleKnowledgeShareBriefApprove = useCallback(
    async (allFields: Record<string, BriefField>): Promise<void> => {
      console.log("[KS StageContent] handleKnowledgeShareBriefApprove called");
      console.log("[KS StageContent] projectId:", projectId);
      console.log("[KS StageContent] allFields keys:", Object.keys(allFields));

      const url = `/api/project/${projectId}/event`;
      const body = {
        event: "brief_approve",
        payload: { all_fields: allFields },
      };
      console.log("[KS StageContent] Fetching URL:", url);
      console.log("[KS StageContent] Request body:", JSON.stringify(body, null, 2));

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      console.log("[KS StageContent] Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[KS StageContent] Error response:", errorText);
        throw new Error("Failed to approve brief");
      }

      // Trigger stage advance
      const data = await response.json();
      console.log("[KS StageContent] Brief approve response:", data);

      // Backend returns screen_outline after running Director
      // For Knowledge Share, we skip the legacy endpoints and pass
      // the pre-generated outline directly to the next stage
      const briefContent = data.story_brief
        ? JSON.stringify(data.story_brief, null, 2)
        : JSON.stringify(allFields, null, 2);

      if (data.screen_outline) {
        console.log("[KS StageContent] Got screen_outline, calling onApprove with nextStageContent");
        // Pass brief as current stage content, outline as next stage content (plain text)
        onContentChange(briefContent);
        const outlineText = typeof data.screen_outline === "string"
          ? data.screen_outline
          : JSON.stringify(data.screen_outline, null, 2);
        onApprove(briefContent, {
          skipNextGeneration: true,
          nextStageContent: outlineText,
        });
      } else {
        console.log("[KS StageContent] No screen_outline, calling onApprove without nextStageContent");
        // Fallback if only brief returned - this shouldn't happen normally
        onContentChange(briefContent);
        onApprove(briefContent, { skipNextGeneration: true });
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
  // Evidence research state for outline stage
  const [outlineResearchResults, setOutlineResearchResults] = useState<EvidenceResearch | null>(null);
  const [isResearchingEvidence, setIsResearchingEvidence] = useState(false);
  const [researchProgress, setResearchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [isRegeneratingOutline, setIsRegeneratingOutline] = useState(false);

  // Track draft updates for the Draft stage
  const [localDraft, setLocalDraft] = useState<ProductionScreen[] | null>(null);

  // Track review updates for the Review stage
  const [localReview, setLocalReview] = useState<ProductionScreen[] | null>(null);

  // Use local brief if edited, otherwise use parsed AI brief
  const currentBrief = localBrief ?? briefData;

  // For outline stage: use local edits if present, otherwise use AI content directly
  const currentOutlineText = localOutlineText ?? (stage.id === 2 ? (humanContent ?? aiContent ?? "") : "");

  // Use local draft if edited, otherwise use parsed AI draft
  const currentDraft = localDraft ?? draftData;

  // Use local review if edited, otherwise use parsed AI review
  const currentReview = localReview ?? reviewData;

  // Restore evidence research on page load (if outline_research phase)
  useEffect(() => {
    if (stage.id !== 2 || !projectId || outlineResearchResults) return;
    const restoreResearch = async () => {
      try {
        const resp = await fetch(`/api/project/${projectId}/pipeline-state`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (data.data?.evidence_research) {
          setOutlineResearchResults(data.data.evidence_research);
          onAnchorChange?.("evidence");
        }
      } catch {
        // Silently fail
      }
    };
    restoreResearch();
  }, [stage.id, projectId, outlineResearchResults]);

  // Processing log for child components (legacy BriefBuilder)
  const processingLog: LegacyProcessingLogEntry[] = [];
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

  const handleRunResearch = useCallback(async () => {
    if (!projectId || !currentOutlineText.trim()) return;

    // Parse outline into individual section texts for parallel per-section calls
    const { parseOutline, serializeOutline } = await import("./OutlineBuilder/outlineParser");
    const sections = parseOutline(currentOutlineText);

    if (sections.length === 0) return;

    setIsResearchingEvidence(true);
    setOutlineResearchResults({ sections: [] });
    setResearchProgress({ completed: 0, total: sections.length });
    onAnchorChange?.("evidence");
    setTimeout(() => {
      document.getElementById("evidence")?.scrollIntoView({ behavior: "smooth" });
    }, 100);

    // Fire the state machine event in the background (locks outline + transitions phase).
    // This also runs full research on the backend — redundant but needed for state transition.
    // By the time the user reviews evidence and clicks approve, this will have completed.
    fetch(`/api/project/${projectId}/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "run_research",
        payload: { current_outline: currentOutlineText },
      }),
    }).catch(() => { /* non-critical */ });

    // Track results in a local array — state updates are batched per-resolve
    const results: Array<SectionResearch | null> = new Array(sections.length).fill(null);
    let completedCount = 0;

    const promises = sections.map(async (section, index) => {
      const sectionText = serializeOutline([section]);

      try {
        const response = await fetch(`/api/project/${projectId}/research-section`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_text: sectionText,
            full_outline: currentOutlineText,
            section_index: index,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          results[index] = data.section_research;
        }
      } catch (err) {
        console.error(`[Outline] Research failed for section ${index}:`, err);
      }

      // Update UI progressively as each section completes
      completedCount++;
      const orderedSections: SectionResearch[] = results.filter(
        (r): r is SectionResearch => r !== null
      );
      setOutlineResearchResults({ sections: orderedSections });
      setResearchProgress({ completed: completedCount, total: sections.length });
    });

    await Promise.allSettled(promises);

    setIsResearchingEvidence(false);
    setResearchProgress(null);
  }, [projectId, currentOutlineText, onAnchorChange]);

  const handleRerunResearch = useCallback(async () => {
    if (!projectId) return;
    setOutlineResearchResults(null);
    setIsResearchingEvidence(true);
    try {
      const response = await fetch(`/api/project/${projectId}/rerun-research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_outline: currentOutlineText }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.evidence_research) {
          setOutlineResearchResults(data.evidence_research);
        }
      }
    } catch (err) {
      console.error("[Outline] Re-run research failed:", err);
    } finally {
      setIsResearchingEvidence(false);
    }
  }, [projectId, currentOutlineText]);

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
      // Check current backend phase before sending event
      const stateResp = await fetch(`/api/project/${projectId}/pipeline-state`);
      if (!stateResp.ok) return;
      const stateData = await stateResp.json();

      console.log("[Outline] Current backend phase:", stateData.phase);
      // If project already past outline_research, advance frontend using existing storyboard
      if (stateData.phase !== "outline_research") {
        const storyboard = stateData.data?.storyboard;
        // Validate: must be an array with screen objects (not just wrapped outline text)
        const isValidStoryboard = Array.isArray(storyboard) &&
          storyboard.length >= 3 &&
          storyboard[0]?.screen_type != null;
        console.log("[Outline] storyboard exists:", !!storyboard, "isValid:", isValidStoryboard);
        if (isValidStoryboard) {
          onApprove(currentOutlineText, {
            skipNextGeneration: true,
            nextStageContent: JSON.stringify(storyboard, null, 2),
          });
        } else {
          // Storyboard missing or invalid — advance without it, let stage 3 regenerate
          console.log("[Outline] No valid storyboard, advancing with currentOutlineText length:", currentOutlineText?.length);
          onApprove(currentOutlineText);
        }
        return;
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
      if (response.ok) {
        const data = await response.json();
        if (data.storyboard) {
          onApprove(currentOutlineText, {
            skipNextGeneration: true,
            nextStageContent: JSON.stringify(data.storyboard, null, 2),
          });
        } else {
          onApprove(currentOutlineText);
        }
      }
    } catch (err) {
      console.error("[Outline] Continue failed:", err);
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
  if (stage.id === 1 && USE_KNOWLEDGE_SHARE_FLOW && isKnowledgeShare && projectId) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        {/* RESEARCH DISABLED: Single-panel layout (was split 60/40 with TabbedResearchPanel) */}
        <KnowledgeShareBriefBuilder
          projectId={projectId}
          initialFields={knowledgeShareFields}
          initialRound={knowledgeShareRound}
          researchComplete={true}
          isResearchRunning={false}
          isAlreadyApproved={isBriefAlreadyApproved}
          onRoundConfirm={handleKnowledgeShareRoundConfirm}
          onGenerateContentSpine={handleGenerateContentSpine}
          onBriefApprove={handleKnowledgeShareBriefApprove}
          onEditBrief={handleKnowledgeShareEditBrief}
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

  // Render OutlineBuilder for the Outline stage (stage 2)
  if (stage.id === 2 && currentOutlineText) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <OutlineBuilder
          content={currentOutlineText}
          aiContent={aiContent}
          onChange={handleOutlineTextChange}
          onRunResearch={handleRunResearch}
          onRerunResearch={handleRerunResearch}
          onContinue={handleResearchContinue}
          onRegenerateSection={handleRegenerateSection}
          onRefineOutline={handleRefineOutline}
          isResearching={isResearchingEvidence}
          isRegenerating={isRegeneratingOutline}
          researchResults={outlineResearchResults}
          researchProgress={researchProgress}
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
