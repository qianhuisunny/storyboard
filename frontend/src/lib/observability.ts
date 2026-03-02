/**
 * Observability utilities for tracking user edits.
 *
 * Inspired by OpenAI's Harness Engineering:
 * "When the agent struggles, treat it as a signal."
 *
 * Usage:
 * ```typescript
 * import { editTracker } from '@/lib/observability';
 *
 * // Track a field edit
 * editTracker.trackFieldEdit({
 *   projectId: '123',
 *   stage: 'outline',
 *   screenNumber: 3,
 *   fieldName: 'voiceover_text',
 *   beforeValue: 'AI generated text...',
 *   afterValue: 'User edited text...',
 * });
 *
 * // Create a snapshot on AI generation
 * editTracker.createSnapshot({
 *   projectId: '123',
 *   stage: 'outline',
 *   trigger: 'ai_generation',
 *   content: { screens: [...] },
 * });
 * ```
 */

type Stage = 'brief' | 'outline' | 'draft' | 'review';
type EditType = 'field_edit' | 'screen_add' | 'screen_delete' | 'screen_reorder' | 'regenerate' | 'approve';
type SnapshotTrigger = 'ai_generation' | 'human_save' | 'stage_approval';

interface EditEventParams {
  projectId: string;
  stage: Stage;
  editType: EditType;
  fieldName: string;
  screenNumber?: number;
  beforeValue?: string | null;
  afterValue?: string | null;
  stageRound?: number;
  timeSinceGenerationSec?: number;
}

interface SnapshotParams {
  projectId: string;
  stage: Stage;
  trigger: SnapshotTrigger;
  content: Record<string, unknown>;
}

interface DiffResult {
  ai_version: Record<string, unknown>;
  human_version: Record<string, unknown>;
  edit_events: Array<Record<string, unknown>>;
}

class EditTracker {
  private generationTimestamps: Map<string, number> = new Map();
  private pendingEdits: Map<string, NodeJS.Timeout> = new Map();
  private debounceMs = 500; // Debounce rapid edits

  /**
   * Mark when AI generation completed for a stage.
   * Used to calculate time_since_generation_sec.
   */
  markGeneration(projectId: string, stage: Stage): void {
    const key = `${projectId}:${stage}`;
    this.generationTimestamps.set(key, Date.now());
  }

  /**
   * Get time since last AI generation for a stage.
   */
  getTimeSinceGeneration(projectId: string, stage: Stage): number | undefined {
    const key = `${projectId}:${stage}`;
    const timestamp = this.generationTimestamps.get(key);
    if (!timestamp) return undefined;
    return (Date.now() - timestamp) / 1000;
  }

  /**
   * Track a field-level edit.
   * Debounced to avoid flooding the server with rapid typing.
   */
  async trackFieldEdit(params: Omit<EditEventParams, 'editType'>): Promise<void> {
    const key = `${params.projectId}:${params.stage}:${params.screenNumber}:${params.fieldName}`;

    // Clear any pending edit for this field
    const existing = this.pendingEdits.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    // Debounce the edit
    return new Promise((resolve) => {
      const timeout = setTimeout(async () => {
        this.pendingEdits.delete(key);
        await this.sendEditEvent({
          ...params,
          editType: 'field_edit',
          timeSinceGenerationSec: this.getTimeSinceGeneration(params.projectId, params.stage),
        });
        resolve();
      }, this.debounceMs);

      this.pendingEdits.set(key, timeout);
    });
  }

  /**
   * Track a screen deletion.
   */
  async trackScreenDelete(
    projectId: string,
    stage: Stage,
    screenNumber: number,
    screenContent?: Record<string, unknown>
  ): Promise<void> {
    await this.sendEditEvent({
      projectId,
      stage,
      editType: 'screen_delete',
      fieldName: 'screen',
      screenNumber,
      beforeValue: screenContent ? JSON.stringify(screenContent) : undefined,
    });
  }

  /**
   * Track a screen addition.
   */
  async trackScreenAdd(
    projectId: string,
    stage: Stage,
    screenNumber: number,
    screenContent?: Record<string, unknown>
  ): Promise<void> {
    await this.sendEditEvent({
      projectId,
      stage,
      editType: 'screen_add',
      fieldName: 'screen',
      screenNumber,
      afterValue: screenContent ? JSON.stringify(screenContent) : undefined,
    });
  }

  /**
   * Track a regeneration request.
   */
  async trackRegenerate(
    projectId: string,
    stage: Stage,
    feedback?: string
  ): Promise<void> {
    await this.sendEditEvent({
      projectId,
      stage,
      editType: 'regenerate',
      fieldName: 'full_stage',
      afterValue: feedback,
    });
  }

  /**
   * Track stage approval.
   */
  async trackApproval(projectId: string, stage: Stage): Promise<void> {
    await this.sendEditEvent({
      projectId,
      stage,
      editType: 'approve',
      fieldName: 'full_stage',
    });
  }

  /**
   * Create a snapshot of stage content.
   */
  async createSnapshot(params: SnapshotParams): Promise<{ snapshotId: string; version: number } | null> {
    try {
      const response = await fetch(`/api/project/${params.projectId}/snapshot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: params.stage,
          trigger: params.trigger,
          content: params.content,
        }),
      });

      if (!response.ok) {
        console.warn('[Observability] Failed to create snapshot:', response.statusText);
        return null;
      }

      const data = await response.json();
      return {
        snapshotId: data.snapshot_id,
        version: data.version,
      };
    } catch (error) {
      console.warn('[Observability] Error creating snapshot:', error);
      return null;
    }
  }

  /**
   * Get the diff between AI and human versions of a stage.
   */
  async getStageDiff(projectId: string, stage: Stage): Promise<DiffResult | null> {
    try {
      const response = await fetch(`/api/project/${projectId}/diff/${stage}`);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.diff;
    } catch (error) {
      console.warn('[Observability] Error getting diff:', error);
      return null;
    }
  }

  /**
   * Get edit history for a project.
   */
  async getEditHistory(projectId: string, stage?: Stage): Promise<Array<Record<string, unknown>>> {
    try {
      const url = stage
        ? `/api/project/${projectId}/edit-history?stage=${stage}`
        : `/api/project/${projectId}/edit-history`;

      const response = await fetch(url);

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.events || [];
    } catch (error) {
      console.warn('[Observability] Error getting edit history:', error);
      return [];
    }
  }

  /**
   * Internal: Send an edit event to the server.
   */
  private async sendEditEvent(params: EditEventParams): Promise<void> {
    try {
      const response = await fetch(`/api/project/${params.projectId}/edit-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: params.stage,
          edit_type: params.editType,
          field_name: params.fieldName,
          screen_number: params.screenNumber,
          before_value: params.beforeValue,
          after_value: params.afterValue,
          stage_round: params.stageRound || 1,
          time_since_generation_sec: params.timeSinceGenerationSec,
        }),
      });

      if (!response.ok) {
        console.warn('[Observability] Failed to log edit event:', response.statusText);
      }
    } catch (error) {
      // Fail silently - observability should not break the app
      console.warn('[Observability] Error logging edit event:', error);
    }
  }
}

// Export singleton instance
export const editTracker = new EditTracker();

// Export types for consumers
export type { Stage, EditType, SnapshotTrigger, EditEventParams, SnapshotParams, DiffResult };


/**
 * React hook for edit tracking.
 *
 * Usage:
 * ```tsx
 * const { trackEdit, trackSnapshot } = useEditTracking(projectId, 'outline');
 *
 * // On field change
 * trackEdit('voiceover_text', oldValue, newValue, screenNumber);
 *
 * // On AI generation
 * trackSnapshot('ai_generation', generatedContent);
 * ```
 */
export function useEditTracking(projectId: string, stage: Stage) {
  const trackEdit = (
    fieldName: string,
    beforeValue: string | null,
    afterValue: string | null,
    screenNumber?: number
  ) => {
    editTracker.trackFieldEdit({
      projectId,
      stage,
      fieldName,
      beforeValue: beforeValue ?? undefined,
      afterValue: afterValue ?? undefined,
      screenNumber,
    });
  };

  const trackSnapshot = (trigger: SnapshotTrigger, content: Record<string, unknown>) => {
    return editTracker.createSnapshot({
      projectId,
      stage,
      trigger,
      content,
    });
  };

  const markGeneration = () => {
    editTracker.markGeneration(projectId, stage);
  };

  const trackScreenDelete = (screenNumber: number, content?: Record<string, unknown>) => {
    return editTracker.trackScreenDelete(projectId, stage, screenNumber, content);
  };

  const trackScreenAdd = (screenNumber: number, content?: Record<string, unknown>) => {
    return editTracker.trackScreenAdd(projectId, stage, screenNumber, content);
  };

  const trackRegenerate = (feedback?: string) => {
    return editTracker.trackRegenerate(projectId, stage, feedback);
  };

  const trackApproval = () => {
    return editTracker.trackApproval(projectId, stage);
  };

  return {
    trackEdit,
    trackSnapshot,
    markGeneration,
    trackScreenDelete,
    trackScreenAdd,
    trackRegenerate,
    trackApproval,
  };
}
