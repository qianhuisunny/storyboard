/**
 * Analytics Hook for Plotline Monitoring Dashboard
 *
 * Provides fire-and-forget tracking methods for:
 * - Stage enter/exit timing
 * - Field-level edits (for prompt refinement)
 * - Regeneration events
 * - Go-back navigation
 * - Satisfaction ratings
 */

import { useCallback, useRef } from "react";

interface FieldEditParams {
  stageId: number;
  fieldName: string;
  aiValue: string;
  humanValue: string;
}

interface UseAnalyticsReturn {
  trackStageEnter: (stageId: number, stageName?: string) => void;
  trackStageExit: (stageId: number) => void;
  trackFieldEdit: (params: FieldEditParams) => void;
  trackRegeneration: (stageId: number) => void;
  trackGoBack: (fromStage: number, toStage: number) => void;
  submitRating: (rating: number, feedback?: string) => Promise<void>;
}

/**
 * Hook for tracking analytics events.
 *
 * All tracking methods are fire-and-forget to avoid blocking the UI.
 * Failures are logged but don't interrupt the user experience.
 *
 * @param projectId - The current project ID
 * @param userId - Optional user ID for attribution
 */
export function useAnalytics(
  projectId: string | undefined,
  userId?: string
): UseAnalyticsReturn {
  const stageEnterTimeRef = useRef<number | null>(null);

  /**
   * Track when user enters a stage.
   * Records the timestamp for calculating time spent.
   */
  const trackStageEnter = useCallback(
    (stageId: number, stageName?: string) => {
      if (!projectId) return;

      stageEnterTimeRef.current = Date.now();

      // Fire-and-forget API call
      fetch(`/api/analytics/${projectId}/stage-enter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          stage_name: stageName || `stage_${stageId}`,
          user_id: userId,
        }),
      }).catch((err) => console.error("[Analytics] Stage enter error:", err));
    },
    [projectId, userId]
  );

  /**
   * Track when user exits a stage.
   * Calculates and records time spent on the stage.
   */
  const trackStageExit = useCallback(
    (stageId: number) => {
      if (!projectId) return;

      let timeSpentSeconds: number | undefined;

      if (stageEnterTimeRef.current) {
        timeSpentSeconds = (Date.now() - stageEnterTimeRef.current) / 1000;
        stageEnterTimeRef.current = null;
      }

      // Fire-and-forget API call
      fetch(`/api/analytics/${projectId}/stage-exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          time_spent_seconds: timeSpentSeconds,
        }),
      }).catch((err) => console.error("[Analytics] Stage exit error:", err));
    },
    [projectId]
  );

  /**
   * Track a field-level edit for prompt refinement analysis.
   * Records the AI value, human value, and field name.
   */
  const trackFieldEdit = useCallback(
    ({ stageId, fieldName, aiValue, humanValue }: FieldEditParams) => {
      if (!projectId) return;

      // Only track if there's an actual change
      if (aiValue === humanValue) return;

      // Fire-and-forget API call
      fetch(`/api/analytics/${projectId}/field-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          field_name: fieldName,
          ai_value: aiValue,
          human_value: humanValue,
        }),
      }).catch((err) => console.error("[Analytics] Field edit error:", err));
    },
    [projectId]
  );

  /**
   * Track a regeneration event.
   */
  const trackRegeneration = useCallback(
    (stageId: number) => {
      if (!projectId) return;

      // Fire-and-forget API call
      fetch(`/api/analytics/${projectId}/regeneration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId }),
      }).catch((err) => console.error("[Analytics] Regeneration error:", err));
    },
    [projectId]
  );

  /**
   * Track when user navigates back to a previous stage.
   */
  const trackGoBack = useCallback(
    (fromStage: number, toStage: number) => {
      if (!projectId) return;

      // Fire-and-forget API call
      fetch(`/api/analytics/${projectId}/go-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_stage: fromStage,
          to_stage: toStage,
        }),
      }).catch((err) => console.error("[Analytics] Go-back error:", err));
    },
    [projectId]
  );

  /**
   * Submit user satisfaction rating.
   * This is awaitable since the user needs to see confirmation.
   */
  const submitRating = useCallback(
    async (rating: number, feedback?: string) => {
      if (!projectId) return;

      const response = await fetch(`/api/analytics/${projectId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
          feedback: feedback || null,
          user_id: userId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit rating");
      }
    },
    [projectId, userId]
  );

  return {
    trackStageEnter,
    trackStageExit,
    trackFieldEdit,
    trackRegeneration,
    trackGoBack,
    submitRating,
  };
}

export default useAnalytics;
