/**
 * KnowledgeShareBriefBuilder - Main container for the 3-round briefing flow.
 * Manages round state and routes to the appropriate form.
 */

import React, { useState, useCallback, useEffect } from "react";
import { RoundOneForm, RoundTwoForm, RoundThreeForm, BriefReview, CollapsibleSection } from "./RoundForms";
import type { BriefField, BriefRound } from "./types";
import { createInitialKnowledgeShareFields } from "./types";

interface KnowledgeShareBriefBuilderProps {
  projectId: string;
  initialFields?: Record<string, BriefField>;
  initialRound?: BriefRound;
  researchComplete?: boolean;
  isResearchRunning?: boolean;
  onRoundConfirm: (round: number, confirmedFields: Record<string, BriefField>) => Promise<Record<string, BriefField>>;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}

export default function KnowledgeShareBriefBuilder({
  projectId: _projectId,
  initialFields,
  initialRound = 1,
  researchComplete = false,
  isResearchRunning = false,
  onRoundConfirm,
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

  // Update fields when initialFields changes (e.g., from API response)
  useEffect(() => {
    if (initialFields && Object.keys(initialFields).length > 0) {
      setFields(prev => ({
        ...prev,
        ...initialFields,
      }));
    }
  }, [initialFields]);

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

  // Handle section confirmation
  const handleSectionConfirm = useCallback(
    async (round: 1 | 2 | 3) => {
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
          setCurrentRound("review");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to confirm section");
      } finally {
        setIsLoading(false);
      }
    },
    [fields, onRoundConfirm]
  );

  // Handle brief approval
  const handleBriefApprove = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await onBriefApprove(fields);
    } catch (err) {
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
            onSectionConfirm={() => {}}
            disabled={true}
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
            onSectionConfirm={() => {}}
            disabled={true}
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
            onSectionConfirm={() => {}}
            disabled={true}
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
          {[1, 2, 3, "review"].map((round, index) => {
            const isActive = currentRound === round;
            const isCompleted =
              round !== "review" && completedRounds.has(round as number);
            const isPast =
              round === "review"
                ? false
                : typeof currentRound === "number"
                ? (round as number) < currentRound
                : true;

            return (
              <React.Fragment key={round}>
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
                    "✓"
                  ) : (
                    round
                  )}
                </div>
                {index < 3 && (
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

        {/* Research Running Overlay - locks the form while AI is researching */}
        {isResearchRunning && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center z-10 cursor-not-allowed">
            <div className="flex flex-col items-center gap-3 px-6 py-4 bg-background/90 border rounded-xl shadow-lg">
              <div className="flex items-center gap-2">
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
                <span className="text-sm font-medium">Researching...</span>
              </div>
              <p className="text-xs text-muted-foreground text-center max-w-[200px]">
                Please wait while the AI analyzes your input
              </p>
            </div>
          </div>
        )}
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
