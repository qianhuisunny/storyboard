import UserView from "./UserView/UserView";
import type { DraftBuilderProps } from "./types";

/**
 * DraftBuilder - Main component for Stage 3 (Storyboard Draft).
 * Renders the visual editor directly (no tabs).
 */
export default function DraftBuilder({
  draftData,
  projectId,
  outlineSummary,
  onDraftUpdate,
  onConfirm,
  storyboardGrade,
  crossStageGrade,
}: DraftBuilderProps) {
  return (
    <div className="draft-builder h-full flex flex-col">
      <UserView
        screens={draftData}
        projectId={projectId}
        outlineSummary={outlineSummary}
        onScreensChange={onDraftUpdate}
        onConfirm={onConfirm}
        storyboardGrade={storyboardGrade}
        crossStageGrade={crossStageGrade}
      />
    </div>
  );
}
