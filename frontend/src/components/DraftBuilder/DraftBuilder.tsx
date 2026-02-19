import { useState } from "react";
import TabToggle from "./TabToggle";
import UserView from "./UserView/UserView";
import InputView from "./InputView/InputView";
import ProcessingView from "./ProcessingView/ProcessingView";
import OutputView from "./OutputView/OutputView";
import type { DraftBuilderProps, TabKey } from "./types";

/**
 * DraftBuilder - Main component for Stage 3 (Storyboard Draft).
 * Provides four views: Visual Editor, Input, Processing, and Output.
 */
export default function DraftBuilder({
  draftData,
  outlineSummary,
  previousStageOutput,
  processingLog,
  onDraftUpdate,
  onConfirm,
}: DraftBuilderProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("user");

  return (
    <div className="draft-builder h-full flex flex-col">
      {/* Tab Navigation */}
      <TabToggle activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === "user" && (
          <UserView
            screens={draftData}
            outlineSummary={outlineSummary}
            onScreensChange={onDraftUpdate}
            onConfirm={onConfirm}
          />
        )}
        {activeTab === "input" && (
          <InputView
            previousStageOutput={previousStageOutput}
            outlineSummary={outlineSummary}
          />
        )}
        {activeTab === "processing" && (
          <ProcessingView
            screens={draftData}
            outlineSummary={outlineSummary}
            processingLog={processingLog}
          />
        )}
        {activeTab === "output" && <OutputView screens={draftData} />}
      </div>
    </div>
  );
}
