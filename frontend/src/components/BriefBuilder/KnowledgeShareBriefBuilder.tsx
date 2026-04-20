/**
 * KnowledgeShareBriefBuilder - Main container for the 3-round briefing flow.
 * Manages round state and routes to the appropriate form.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { RoundOneForm, RoundTwoForm, RoundThreeForm, BriefReview, CollapsibleSection } from "./RoundForms";
import type { BriefField, BriefRound } from "./types";
import { createInitialKnowledgeShareFields } from "./types";
import { cn } from "@/lib/utils";

interface KnowledgeShareBriefBuilderProps {
  projectId: string;
  initialFields?: Record<string, BriefField>;
  initialRound?: BriefRound;
  researchComplete?: boolean;
  isResearchRunning?: boolean;
  isAlreadyApproved?: boolean; // Brief was already approved on backend
  onRoundConfirm: (round: number, confirmedFields: Record<string, BriefField>) => Promise<Record<string, BriefField>>;
  onGenerateContentSpine: (pov: string, feedback?: string) => Promise<Record<string, BriefField>>;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}

export default function KnowledgeShareBriefBuilder({
  projectId: _projectId,
  initialFields,
  initialRound = 1,
  researchComplete = false,
  isResearchRunning = false,
  isAlreadyApproved = false,
  onRoundConfirm,
  onGenerateContentSpine,
  onBriefApprove,
  onEditBrief,
}: KnowledgeShareBriefBuilderProps) {
  // Fields whose edits invalidate the content spine (Round 3 generated fields)
  const SPINE_DEPENDENT_FIELDS = new Set([
    'viewer_outcome', 'target_audience', 'audience_level',
    'duration', 'platform', 'delivery_tone', 'freshness_expectation', 'point_of_view'
  ]);

  // State
  const [dirtyFields, setDirtyFields] = useState<Set<string>>(new Set());
  const [currentRound, setCurrentRound] = useState<BriefRound>(initialRound);
  const [fields, setFields] = useState<Record<string, BriefField>>(() => {
    // Use initialFields if it has any keys, otherwise create empty fields
    if (initialFields && Object.keys(initialFields).length > 0) {
      return initialFields;
    }
    return createInitialKnowledgeShareFields();
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard against double-submission (ref doesn't wait for re-render)
  const isSubmittingRef = useRef(false);

  // Update fields when initialFields changes (e.g., from API response)
  useEffect(() => {
    if (initialFields && Object.keys(initialFields).length > 0) {
      setFields(prev => ({
        ...prev,
        ...initialFields,
      }));
    }
  }, [initialFields]);

  // Sync currentRound with initialRound when it changes (e.g., after state restoration)
  useEffect(() => {
    if (initialRound !== currentRound) {
      console.log("[KS Builder] Syncing round:", initialRound);
      setCurrentRound(initialRound);
    }
  }, [initialRound]);

  // Track which rounds are completed
  const [completedRounds, setCompletedRounds] = useState<Set<number>>(() => {
    const completed = new Set<number>();
    if (initialRound === 2) completed.add(1);
    if (initialRound === 3) {
      completed.add(1);
      completed.add(2);
    }
    if (initialRound === "review") {
      completed.add(1);
      completed.add(2);
      completed.add(3);
    }
    return completed;
  });

  // Sync completedRounds when initialRound changes
  useEffect(() => {
    const completed = new Set<number>();
    if (initialRound === 2) completed.add(1);
    if (initialRound === 3) {
      completed.add(1);
      completed.add(2);
    }
    if (initialRound === "review") {
      completed.add(1);
      completed.add(2);
      completed.add(3);
    }
    if (completed.size > 0) {
      setCompletedRounds(completed);
    }
  }, [initialRound]);

  // Derived: has any field been edited since last confirm/load?
  const hasDirtyFields = dirtyFields.size > 0;
  // Derived: do dirty fields include any that invalidate the content spine?
  const needsSpineRegeneration = [...dirtyFields].some(f => SPINE_DEPENDENT_FIELDS.has(f));

  // Handle field value change
  const handleFieldChange = useCallback((key: string, value: string | string[] | boolean) => {
    setDirtyFields(prev => new Set(prev).add(key));
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        value,
        // When user edits, always set source to extracted (user-provided)
        source: "extracted",
        confirmed: false,
      },
    }));
  }, []);

  // Handle field confirmation (individual field)
  const handleFieldConfirm = useCallback((key: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        confirmed: true,
      },
    }));
  }, []);

  // Handle field unconfirmation (revert to editable)
  const handleFieldUnconfirm = useCallback((key: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        confirmed: false,
      },
    }));
  }, []);

  // Handle section confirmation
  const handleSectionConfirm = useCallback(
    async (round: 1 | 2 | 3) => {
      // Guard against double-click
      if (isSubmittingRef.current) {
        console.log("[KS] Ignoring duplicate submit for round", round);
        return;
      }
      isSubmittingRef.current = true;
      setIsLoading(true);
      setError(null);

      try {
        // If round already completed and nothing was edited, just navigate forward
        if (completedRounds.has(round) && !hasDirtyFields) {
          if (round === 1) setCurrentRound(2);
          else if (round === 2) setCurrentRound(3);
          else if (round === 3) setCurrentRound("review");
          return;
        }

        // Get confirmed fields for this round
        const confirmedFields: Record<string, BriefField> = {};
        for (const [key, field] of Object.entries(fields)) {
          if (field.confirmed || field.value) {
            confirmedFields[key] = { ...field, confirmed: true };
          }
        }

        // Call backend to get next round fields
        const nextFields = await onRoundConfirm(round, confirmedFields);

        // Merge new fields with existing
        setFields((prev) => ({
          ...prev,
          ...nextFields,
        }));

        // Mark round as completed, reset dirty tracking, and move to next
        setDirtyFields(new Set());
        setCompletedRounds((prev) => new Set([...prev, round]));

        if (round === 1) {
          setCurrentRound(2);
        } else if (round === 2) {
          setCurrentRound(3);
        } else if (round === 3) {
          // Round 3 confirmed; move directly to review
          setCurrentRound("review");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to confirm section");
      } finally {
        setIsLoading(false);
        isSubmittingRef.current = false;
      }
    },
    [fields, onRoundConfirm]
  );

  // Handle generating content spine from a point of view
  const handleGenerateContentSpine = useCallback(
    async (pov: string, feedback?: string) => {
      setIsLoading(true);
      setError(null);
      try {
        const newFields = await onGenerateContentSpine(pov, feedback);
        // Merge returned fields into local state
        setFields((prev) => ({
          ...prev,
          ...newFields,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate content spine");
      } finally {
        setIsLoading(false);
      }
    },
    [onGenerateContentSpine]
  );

  // Handle brief approval
  const handleBriefApprove = useCallback(async () => {
    console.log("[KS Builder] handleBriefApprove called, fields:", Object.keys(fields));
    setIsLoading(true);
    setError(null);

    try {
      console.log("[KS Builder] Calling onBriefApprove...");
      await onBriefApprove(fields);
      console.log("[KS Builder] onBriefApprove completed successfully");
    } catch (err) {
      console.error("[KS Builder] onBriefApprove failed:", err);
      setError(err instanceof Error ? err.message : "Failed to approve brief");
    } finally {
      setIsLoading(false);
    }
  }, [fields, onBriefApprove]);

  // Handle edit brief (go back to round 1)
  const handleEditBrief = useCallback(() => {
    setCurrentRound(1);
    setCompletedRounds(new Set());
    onEditBrief();
  }, [onEditBrief]);

  // Render completed sections as collapsed
  const renderCompletedSections = () => {
    const sections = [];

    if (completedRounds.has(1) && currentRound !== 1) {
      sections.push(
        <CollapsibleSection key="section1" title="Section 1: Core Intent" completed={true}>
          <RoundOneForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => {}}
            disabled={false}
            showConfirmButton={false}
          />
        </CollapsibleSection>
      );
    }

    if (completedRounds.has(2) && currentRound !== 2 && currentRound !== 1) {
      sections.push(
        <CollapsibleSection key="section2" title="Section 2: Delivery & Format" completed={true}>
          <RoundTwoForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => {}}
            disabled={false}
            showConfirmButton={false}
          />
        </CollapsibleSection>
      );
    }

    if (completedRounds.has(3) && currentRound !== 3 && currentRound !== 2 && currentRound !== 1) {
      sections.push(
        <CollapsibleSection key="section3" title="Section 3: Content Spine" completed={true}>
          <RoundThreeForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => {}}
            onGenerateContentSpine={handleGenerateContentSpine}
            briefContext={briefContext}
            disabled={false}
            researchComplete={researchComplete}
            showConfirmButton={false}
          />
        </CollapsibleSection>
      );
    }

    return sections;
  };

  // Render current round form
  const renderCurrentForm = () => {
    if (currentRound === "review") {
      return (
        <BriefReview
          fields={fields}
          onEditBrief={handleEditBrief}
          onApproveBrief={handleBriefApprove}
          disabled={isLoading}
          isAlreadyApproved={isAlreadyApproved}
        />
      );
    }

    // In revision mode, disable confirm buttons until user actually edits something
    const confirmDisabled = isLoading || (isAlreadyApproved && !hasDirtyFields);

    switch (currentRound) {
      case 1:
        return (
          <RoundOneForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => handleSectionConfirm(1)}
            disabled={confirmDisabled}
          />
        );
      case 2:
        return (
          <RoundTwoForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => handleSectionConfirm(2)}
            disabled={confirmDisabled}
          />
        );
      case 3:
        return (
          <RoundThreeForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => handleSectionConfirm(3)}
            onGenerateContentSpine={handleGenerateContentSpine}
            briefContext={briefContext}
            disabled={confirmDisabled}
            researchComplete={researchComplete}
          />
        );
      default:
        return null;
    }
  };

  // Extract brief context from Round 1 fields for content spine generation
  const briefContext = {
    audience: typeof fields.target_audience?.value === "string" ? fields.target_audience.value : "",
    topic: typeof fields.viewer_outcome?.value === "string" ? fields.viewer_outcome.value : "",
    goal: typeof fields.viewer_outcome?.value === "string" ? fields.viewer_outcome.value : "",
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Progress Bar — mockup-style rounded card with step segments */}
      <div className="flex-shrink-0" style={{ padding: "20px 38px 0" }}>
        <div className="max-w-5xl flex items-stretch bg-white border border-[#D9DDD2] overflow-hidden" style={{ borderRadius: "10px", marginBottom: "28px" }}>
          {([1, 2, 3, "review"] as const).map((round, index) => {
            const isActive = currentRound === round;
            const stepOrder: readonly (1 | 2 | 3 | "review")[] = [1, 2, 3, "review"];
            const currentIndex = stepOrder.indexOf(currentRound);
            const roundIndex = stepOrder.indexOf(round);
            const isPast = currentIndex > roundIndex;
            const isCompleted =
              typeof round === "number" && completedRounds.has(round);
            const stepNames = ["Core Intent", "Delivery", "Content Spine", "Review"];
            // Revision mode (all rounds completed): free navigation
            // First-pass mode: only backward navigation
            const allRoundsCompleted = completedRounds.size >= 3;
            const isClickable = !isActive && (isPast || allRoundsCompleted);

            return (
              <div
                key={String(round)}
                className={cn(
                  "flex-1 flex items-center transition-colors",
                  isClickable && "cursor-pointer",
                  !isClickable && "cursor-default",
                  index < 3 && "border-r border-[#D9DDD2]",
                  isActive && "bg-[#E8F0E9]",
                  !isActive && isClickable && "hover:bg-[#EEF1E9]",
                  (isPast && !isActive) && "opacity-55"
                )}
                style={{ gap: "9px", padding: "11px 16px" }}
                onClick={() => {
                  if (isClickable) {
                    // If navigating to Round 3 and spine-dependent fields were edited,
                    // clear generated content spine fields so user must regenerate
                    if (round === 3 && needsSpineRegeneration) {
                      setFields(prev => ({
                        ...prev,
                        core_talking_points: { ...prev.core_talking_points, value: "", confirmed: false },
                        misconceptions: { ...prev.misconceptions, value: "", confirmed: false },
                        must_avoid: { ...prev.must_avoid, value: "", confirmed: false },
                      }));
                    }
                    setCurrentRound(round);
                  }
                }}
              >
                <div
                  className={cn(
                    "flex-shrink-0 rounded-full flex items-center justify-center",
                    isActive && "bg-[#3A6B47] text-white",
                    (isCompleted || isPast) && !isActive && "bg-[#E6F2EB] text-[#2D6A4F]",
                    !isActive && !isCompleted && !isPast && "text-[#626B58]"
                  )}
                  style={{
                    width: "26px", height: "26px",
                    border: isActive ? "1.5px solid #3A6B47" : (isCompleted || isPast) ? "1.5px solid #2D6A4F" : "1.5px solid #BFC6B5",
                    fontSize: "12px", fontWeight: 700, fontFamily: "'Fraunces', serif"
                  }}
                >
                  {isCompleted || isPast ? "\u2713" : round === "review" ? "R" : round}
                </div>
                <div>
                  <div className="text-[#626B58]" style={{ fontSize: "10.5px", letterSpacing: "0.2px", lineHeight: "1.3" }}>Step {index + 1}</div>
                  <div className={cn("text-[#1C2118]", isActive && "text-[#3A6B47]")} style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.3" }}>{stepNames[index]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-4 flex items-center gap-2.5 bg-[#FBEAE8] border border-[#E8C0BC] text-[#A63228]" style={{ borderRadius: "8px", padding: "11px 16px", fontSize: "13px", fontWeight: 500 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto relative" style={{ padding: "30px 38px" }}>
        <div className="max-w-5xl" style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
        {/* Completed Sections */}
        {renderCompletedSections()}

        {/* Current Form */}
        {renderCurrentForm()}

        </div>
      </div>

      {/* Loading Overlay (for section confirm) */}
      {isLoading && !isResearchRunning && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-20">
          <div className="flex items-center gap-2 px-4 py-2 bg-background border rounded-lg shadow-lg">
            <svg className="w-5 h-5 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm font-medium">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
