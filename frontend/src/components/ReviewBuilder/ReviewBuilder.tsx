import UserView from "./UserView";
import type { ReviewBuilderProps } from "./types";

/**
 * ReviewBuilder - Main component for Stage 4 (Review & Share).
 * Renders the review editor directly (no tabs).
 */
export default function ReviewBuilder({
  screens,
  projectId,
  projectTitle,
  onScreensUpdate,
  onExport,
  isComplete,
}: ReviewBuilderProps) {
  return (
    <div className="review-builder h-full flex flex-col">
      <UserView
        screens={screens}
        projectId={projectId}
        projectTitle={projectTitle}
        onScreensUpdate={onScreensUpdate}
        onExport={onExport}
        isComplete={isComplete}
      />
    </div>
  );
}
