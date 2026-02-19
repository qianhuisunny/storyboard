import { useState } from "react";
import TabToggle from "./TabToggle";
import UserView from "./UserView/UserView";
import ProcessingView from "./ProcessingView/ProcessingView";
import InputView from "./InputView/InputView";
import OutputView from "./OutputView/OutputView";
import type { OutlineBuilderProps, TabKey } from "./types";

/**
 * OutlineBuilder - Main container component for the Screen Outline Builder interface.
 * Manages tab state and routes to the appropriate view (Visual Editor, Processing, Output).
 */
export default function OutlineBuilder({
  screens,
  stage1Output,
  contextPack,
  processingLog,
  onScreensUpdate,
  onConfirm,
}: OutlineBuilderProps) {
  // Tab state - default to "user" view (Visual Editor)
  const [activeTab, setActiveTab] = useState<TabKey>("user");

  return (
    <div className="outline-builder flex flex-col h-full bg-background">
      {/* Tab Navigation */}
      <TabToggle activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Panels */}
      <div className="outline-builder-content flex-1 overflow-hidden">
        {/* Visual Editor Panel */}
        <div
          id="outline-tabpanel-user"
          role="tabpanel"
          aria-labelledby="outline-tab-user"
          hidden={activeTab !== "user"}
          className="h-full"
        >
          {activeTab === "user" && (
            <UserView
              screens={screens}
              stage1Output={stage1Output}
              onScreensChange={onScreensUpdate}
              onConfirm={onConfirm}
            />
          )}
        </div>

        {/* Processing View Panel */}
        <div
          id="outline-tabpanel-processing"
          role="tabpanel"
          aria-labelledby="outline-tab-processing"
          hidden={activeTab !== "processing"}
          className="h-full"
        >
          {activeTab === "processing" && (
            <ProcessingView
              screens={screens}
              stage1Output={stage1Output}
              processingLog={processingLog}
            />
          )}
        </div>

        {/* Input View Panel - shows data from previous stage */}
        <div
          id="outline-tabpanel-input"
          role="tabpanel"
          aria-labelledby="outline-tab-input"
          hidden={activeTab !== "input"}
          className="h-full"
        >
          {activeTab === "input" && (
            <InputView
              stage1Output={stage1Output}
              contextPack={contextPack}
            />
          )}
        </div>

        {/* Output View Panel */}
        <div
          id="outline-tabpanel-output"
          role="tabpanel"
          aria-labelledby="outline-tab-output"
          hidden={activeTab !== "output"}
          className="h-full"
        >
          {activeTab === "output" && <OutputView screens={screens} />}
        </div>
      </div>
    </div>
  );
}
