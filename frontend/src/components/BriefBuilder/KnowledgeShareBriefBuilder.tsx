/**
 * KnowledgeShareBriefBuilder - Main container for the 3-round briefing flow.
 * Manages round state and routes to the appropriate form.
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import { RoundOneForm, RoundTwoForm, RoundThreeForm, BriefReview, AngleSelectionForm, CollapsibleSection } from "./RoundForms";
import type { BriefField, BriefRound } from "./types";
import { createInitialKnowledgeShareFields } from "./types";

interface Perspective {
  id: number;
  statement: string;
  hook: string;
}

interface KnowledgeShareBriefBuilderProps {
  projectId: string;
  initialFields?: Record<string, BriefField>;
  initialRound?: BriefRound;
  perspectives?: Perspective[];
  researchComplete?: boolean;
  isResearchRunning?: boolean;
  isAlreadyApproved?: boolean; // Brief was already approved on backend
  onRoundConfirm: (round: number, confirmedFields: Record<string, BriefField>) => Promise<Record<string, BriefField>>;
  onAngleApprove: (selectedAngle: string) => Promise<void>;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}

export default function KnowledgeShareBriefBuilder({
  projectId: _projectId,
  initialFields,
  initialRound = 1,
  perspectives: initialPerspectives = [],
  researchComplete = false,
  isResearchRunning = false,
  isAlreadyApproved = false,
  onRoundConfirm,
  onAngleApprove,
  onBriefApprove,
  onEditBrief,
}: KnowledgeShareBriefBuilderProps) {
  // State
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
  // Perspectives for angle selection
  const [perspectives, setPerspectives] = useState<Perspective[]>(initialPerspectives);
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

  // Sync perspectives when initialPerspectives changes
  useEffect(() => {
    if (initialPerspectives && initialPerspectives.length > 0) {
      setPerspectives(initialPerspectives);
    }
  }, [initialPerspectives]);

  // Track which rounds are completed
  const [completedRounds, setCompletedRounds] = useState<Set<number>>(() => {
    const completed = new Set<number>();
    if (initialRound === 2) completed.add(1);
    if (initialRound === 3) {
      completed.add(1);
      completed.add(2);
    }
    if (initialRound === "angle_selection") {
      completed.add(1);
      completed.add(2);
      completed.add(3);
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
    if (initialRound === "angle_selection") {
      completed.add(1);
      completed.add(2);
      completed.add(3);
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

  // Handle field value change
  const handleFieldChange = useCallback((key: string, value: string | string[] | boolean) => {
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

        // Mark round as completed and move to next
        setCompletedRounds((prev) => new Set([...prev, round]));

        if (round === 1) {
          setCurrentRound(2);
        } else if (round === 2) {
          setCurrentRound(3);
        } else if (round === 3) {
          // Round 3 returns perspectives; move to angle selection
          setCurrentRound("angle_selection");
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

  // Handle angle approval
  const handleAngleApprove = useCallback(
    async (selectedAngle: string) => {
      setIsLoading(true);
      setError(null);
      try {
        await onAngleApprove(selectedAngle);
        setCurrentRound("review");
        setCompletedRounds((prev) => new Set([...prev, 3]));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to approve angle");
      } finally {
        setIsLoading(false);
      }
    },
    [onAngleApprove]
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
            disabled={false}
            researchComplete={researchComplete}
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

    if (currentRound === "angle_selection") {
      return (
        <AngleSelectionForm
          perspectives={perspectives}
          onApproveAngle={handleAngleApprove}
          disabled={isLoading}
        />
      );
    }

    switch (currentRound) {
      case 1:
        return (
          <RoundOneForm
            fields={fields}
            onFieldChange={handleFieldChange}
            onFieldConfirm={handleFieldConfirm}
            onFieldUnconfirm={handleFieldUnconfirm}
            onSectionConfirm={() => handleSectionConfirm(1)}
            disabled={isLoading}
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
            disabled={isLoading}
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
            disabled={isLoading}
            researchComplete={researchComplete}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Progress Indicator */}
      <div className="flex-shrink-0 px-4 py-3 bg-muted/30 border-b">
        <div className="flex items-center gap-2">
          {([1, 2, 3, "angle_selection", "review"] as const).map((round, index) => {
            const isActive = currentRound === round;
            const stepOrder = [1, 2, 3, "angle_selection", "review"];
            const currentIndex = stepOrder.indexOf(currentRound);
            const roundIndex = stepOrder.indexOf(round);
            const isPast = currentIndex > roundIndex;
            const isCompleted =
              typeof round === "number" && completedRounds.has(round);

            return (
              <React.Fragment key={String(round)}>
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isCompleted || isPast
                      ? "bg-green-500 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {isCompleted || isPast ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : round === "review" ? (
                    "R"
                  ) : round === "angle_selection" ? (
                    "A"
                  ) : (
                    round
                  )}
                </div>
                {index < 4 && (
                  <div
                    className={`flex-1 h-1 rounded ${
                      isPast || isCompleted ? "bg-green-500" : "bg-muted"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-foreground">
          <span>Core Intent</span>
          <span>Delivery</span>
          <span>Content</span>
          <span>Angle</span>
          <span>Review</span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex-shrink-0 mx-4 mt-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 relative">
        {/* Completed Sections */}
        {renderCompletedSections()}

        {/* Current Form */}
        {renderCurrentForm()}

        {/* RESEARCH DISABLED: Research Running Overlay removed */}
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
