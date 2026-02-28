/**
 * SplitBriefBuilder - Main split-screen component for Brief Builder
 *
 * Left panel (50%): 4-turn chat flow with confirmation gates
 * Right panel (50%): Real-time research activity and findings
 * Mobile: Stacked vertically with collapsible drawer
 */

import { useState, useCallback, useEffect } from "react";
import type { SplitBriefBuilderProps, ChatTurn, GapAnswers } from "./types";
import { ChatPanel } from "./ChatPanel";
import { ResearchPanel } from "./ResearchPanel";
import { MobileDrawer } from "./MobileDrawer";
import { useChatState } from "./hooks/useChatState";
import { useResearchStream } from "./hooks/useResearchStream";
import type { StoryBrief } from "../types";
import { normalizeBrief } from "../types";

export function SplitBriefBuilder({
  projectId,
  onboardingData,
  onComplete,
  onAdvanceStage,
}: SplitBriefBuilderProps) {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const {
    state,
    confirmTurn,
    setCorrections,
    startResearch,
    addSearchEvent,
    updateSearchEvent,
    setResearchComplete,
    setResearchError,
    setGapAnswers,
    setFinalBrief,
    resetResearch,
    setAngle,
    setResearchPhase,
  } = useChatState();

  // SSE connection for research streaming
  const { startResearch: startSSE, stopResearch: stopSSE } = useResearchStream({
    projectId,
    enabled: state.researchStatus === "running",
    onSearchStarted: addSearchEvent,
    onSearchComplete: (id, resultsCount) => updateSearchEvent(id, "complete", resultsCount),
    onSearchError: (id) => updateSearchEvent(id, "error"),
    onResearchComplete: setResearchComplete,
    onError: setResearchError,
  });

  // Handle turn confirmation
  const handleConfirm = useCallback(
    async (turn: ChatTurn) => {
      confirmTurn(turn);

      if (turn === 1) {
        // Step 1: Calculate angle from Round 1 confirmed fields
        try {
          const angleResponse = await fetch(`/api/project/${projectId}/research/angle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audience: onboardingData.audience,
              description: onboardingData.description,
              duration: onboardingData.duration,
            }),
          });

          if (angleResponse.ok) {
            const { angle } = await angleResponse.json();
            setAngle(angle);

            // Step 2: Immediately start research with angle-based questions
            startResearch();
            setResearchPhase("running");
            startSSE({ angle });

            // Fallback if SSE doesn't work
            setTimeout(async () => {
              if (state.researchStatus === "running" && state.searchEvents.length === 0) {
                try {
                  const response = await fetch(`/api/project/${projectId}/research/run`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      video_type: onboardingData.videoType,
                      company_name: onboardingData.companyName,
                      description: onboardingData.description,
                      links: onboardingData.links,
                    }),
                  });

                  if (response.ok) {
                    const data = await response.json();
                    if (data.findings) {
                      setResearchComplete(data.findings);
                      setResearchPhase("complete");
                    }
                  } else {
                    setResearchError("Failed to run research");
                  }
                } catch (err) {
                  setResearchError("Network error during research");
                }
              }
            }, 5000);
          } else {
            // Fallback: start research without angle
            startResearch();
            startSSE();
          }
        } catch (err) {
          console.error("Error calculating angle:", err);
          // Fallback: start research without angle
          startResearch();
          startSSE();
        }
      }

      if (turn === 3) {
        // Generate final brief after confirming turn 3
        await generateFinalBrief();
      }
    },
    [
      confirmTurn,
      startResearch,
      startSSE,
      projectId,
      onboardingData,
      state.researchStatus,
      state.searchEvents.length,
      setResearchComplete,
      setResearchError,
      setAngle,
      setResearchPhase,
    ]
  );

  // Handle corrections
  const handleCorrect = useCallback(
    async (turn: ChatTurn, corrections: string) => {
      setCorrections(turn, corrections);

      if (turn === 1) {
        // Reset and re-run research with corrections
        resetResearch();
        stopSSE();

        // Re-run research with corrections
        setTimeout(() => {
          startResearch();
          startSSE();
        }, 500);
      }

      // TODO: Handle corrections for other turns
    },
    [setCorrections, resetResearch, stopSSE, startResearch, startSSE]
  );

  // Handle gap answers change
  const handleGapAnswerChange = useCallback(
    (answers: GapAnswers) => {
      setGapAnswers(answers);
    },
    [setGapAnswers]
  );

  // Generate final brief from all collected data
  const generateFinalBrief = useCallback(async () => {
    try {
      const response = await fetch(`/api/project/${projectId}/brief/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onboarding_data: onboardingData,
          research_findings: state.researchFindings,
          gap_answers: state.gapAnswers,
          corrections: {
            turn1: state.turns[1].corrections,
            turn2: state.turns[2].corrections,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const brief = normalizeBrief(data.brief);
        setFinalBrief(brief);
        onComplete(brief);
      } else {
        // Fallback: create brief from available data
        const fallbackBrief = createFallbackBrief();
        setFinalBrief(fallbackBrief);
        onComplete(fallbackBrief);
      }
    } catch (err) {
      console.error("Error generating brief:", err);
      // Fallback: create brief from available data
      const fallbackBrief = createFallbackBrief();
      setFinalBrief(fallbackBrief);
      onComplete(fallbackBrief);
    }
  }, [
    projectId,
    onboardingData,
    state.researchFindings,
    state.gapAnswers,
    state.turns,
    setFinalBrief,
    onComplete,
  ]);

  // Create fallback brief from onboarding data
  const createFallbackBrief = useCallback((): StoryBrief => {
    // Track which fields were auto-filled from onboarding
    const autoFilledFields: string[] = [];
    if (onboardingData.audience) autoFilledFields.push("target_audience");
    if (onboardingData.duration) autoFilledFields.push("desired_length");
    if (onboardingData.videoType) autoFilledFields.push("video_type");
    if (onboardingData.description) autoFilledFields.push("user_inputs");
    if (onboardingData.companyName) autoFilledFields.push("company_or_brand_name");
    if (onboardingData.tone) autoFilledFields.push("tone_and_style");
    if (onboardingData.platform) autoFilledFields.push("format_or_platform");
    if (onboardingData.showFace !== undefined) autoFilledFields.push("show_face");

    // Fields that are AI-inferred (derived from user input, not directly provided)
    const inferredFields: string[] = ["video_goal", "key_points", "cta"];

    return normalizeBrief({
      video_goal: onboardingData.description || "",
      target_audience: onboardingData.audience || "",
      company_or_brand_name: onboardingData.companyName || "",
      tone_and_style: onboardingData.tone || "professional",
      format_or_platform: onboardingData.platform || "youtube",
      desired_length: String(onboardingData.duration || 60),
      show_face: onboardingData.showFace ? "Yes" : "No",
      cta: state.gapAnswers.cta || "",
      video_type: onboardingData.videoType || "Product Release",
      user_inputs: onboardingData.description || "",
      key_points: [],
      constraints: [],
      auto_filled_fields: autoFilledFields,
      inferred_fields: inferredFields,
      user_override_fields: [],
      unresolved_questions: [],
    });
  }, [onboardingData, state.gapAnswers]);

  // Handle send to storyboard
  const handleSendToStoryboard = useCallback(() => {
    onAdvanceStage();
  }, [onAdvanceStage]);

  // Handle edit brief (go back to turn 1)
  const handleEditBrief = useCallback(() => {
    // Reset to turn 1 for editing
    // For now, just log - would need more complex state management
    console.log("Edit brief requested");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSSE();
    };
  }, [stopSSE]);

  return (
    <div className="h-full flex flex-col md:flex-row">
      {/* Chat Panel - Left side on desktop, full width on mobile */}
      <div className="flex-1 md:w-1/2 md:border-r overflow-hidden">
        <ChatPanel
          state={state}
          onboardingData={onboardingData}
          onConfirm={handleConfirm}
          onCorrect={handleCorrect}
          onGapAnswerChange={handleGapAnswerChange}
          onSendToStoryboard={handleSendToStoryboard}
          onEditBrief={handleEditBrief}
        />
      </div>

      {/* Research Panel - Right side on desktop, hidden on mobile */}
      <div className="hidden md:block md:w-1/2 overflow-hidden">
        <ResearchPanel
          status={state.researchStatus}
          findings={state.researchFindings}
          searchEvents={state.searchEvents}
          error={state.error}
          angle={state.angle}
          researchPhase={state.researchPhase}
        />
      </div>

      {/* Mobile Drawer */}
      <MobileDrawer
        isOpen={mobileDrawerOpen}
        onToggle={() => setMobileDrawerOpen(!mobileDrawerOpen)}
        status={state.researchStatus}
        findings={state.researchFindings}
        searchEvents={state.searchEvents}
        error={state.error}
        angle={state.angle}
        researchPhase={state.researchPhase}
      />

      {/* Bottom padding for mobile drawer toggle */}
      <div className="h-12 md:hidden" />
    </div>
  );
}

export default SplitBriefBuilder;
