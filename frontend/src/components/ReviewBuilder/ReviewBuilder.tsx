import { useState } from "react";
import TabToggle from "./TabToggle";
import UserView from "./UserView";
import InputView from "./InputView/InputView";
import ProcessingView from "./ProcessingView/ProcessingView";
import OutputView from "./OutputView/OutputView";
import type { ReviewBuilderProps, TabKey } from "./types";

/**
 * ReviewBuilder - Main component for Stage 4 (Review & Share).
 * Provides four views: Review & Edit, Input, Processing, and Output.
 */
export default function ReviewBuilder({
  screens,
  projectTitle,
  previousStageOutput,
  processingLog,
  onScreensUpdate,
  onExport,
}: ReviewBuilderProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("user");

  return (
    <div className="review-builder h-full flex flex-col">
      {/* Tab Navigation */}
      <TabToggle activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "user" && (
          <UserView
            screens={screens}
            projectTitle={projectTitle}
            onScreensUpdate={onScreensUpdate}
            onExport={onExport}
          />
        )}
        {activeTab === "input" && (
          <InputView previousStageOutput={previousStageOutput} />
        )}
        {activeTab === "processing" && (
          <ProcessingView screens={screens} processingLog={processingLog} />
        )}
        {activeTab === "output" && <OutputView screens={screens} />}
      </div>
    </div>
  );
}
