import UserView from "./UserView";
import type { ReviewBuilderProps } from "./types";

/**
 * ReviewBuilder - Main component for Stage 4 (Review & Share).
 * Renders the review editor directly (no tabs).
 */
export default function ReviewBuilder({
  screens,
  projectTitle,
  onScreensUpdate,
  onExport,
}: ReviewBuilderProps) {
  return (
    <div className="review-builder h-full flex flex-col">
      <UserView
        screens={screens}
        projectTitle={projectTitle}
        onScreensUpdate={onScreensUpdate}
        onExport={onExport}
      />
    </div>
  );
}
