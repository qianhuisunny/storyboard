import { useState } from "react";
import TabToggle from "./TabToggle";
import UserView from "./UserView/UserView";
import InputView from "./InputView/InputView";
import ProcessingView from "./ProcessingView/ProcessingView";
import OutputView from "./OutputView/OutputView";
import type { BriefBuilderProps, TabKey } from "./types";

/**
 * BriefBuilder - Main container component for the Brief Builder interface.
 * Manages tab state and routes to the appropriate view (User, Processing, Output).
 */
export default function BriefBuilder({
  briefData,
  processingLog,
  onBriefUpdate,
  onConfirm,
}: BriefBuilderProps) {
  // Tab state - default to "user" view
  const [activeTab, setActiveTab] = useState<TabKey>("user");

  // User view stage state (1 = required fields, 2 = optional questions)
  const [userStage, setUserStage] = useState<1 | 2>(1);

  return (
    <div className="brief-builder flex flex-col h-full bg-background">
      {/* Split screen container - row on desktop, column on mobile */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        {/* Left column - full width on mobile, 60% on desktop */}
        <div className="w-full md:w-[60%] flex flex-col md:border-r border-border">
          {/* Tab Navigation */}
          <TabToggle activeTab={activeTab} onChange={setActiveTab} />

          {/* Tab Panels */}
          <div className="brief-builder-content flex-1 overflow-auto">
            {/* User View Panel */}
            <div
              id="tabpanel-user"
              role="tabpanel"
              aria-labelledby="tab-user"
              hidden={activeTab !== "user"}
              className="h-full"
            >
              {activeTab === "user" && (
                <UserView
                  brief={briefData}
                  onBriefChange={onBriefUpdate}
                  stage={userStage}
                  onStageChange={setUserStage}
                  onConfirm={onConfirm}
                />
              )}
            </div>

            {/* Input View Panel */}
            <div
              id="tabpanel-input"
              role="tabpanel"
              aria-labelledby="tab-input"
              hidden={activeTab !== "input"}
              className="h-full"
            >
              {activeTab === "input" && (
                <InputView brief={briefData} />
              )}
            </div>

            {/* Output View Panel */}
            <div
              id="tabpanel-output"
              role="tabpanel"
              aria-labelledby="tab-output"
              hidden={activeTab !== "output"}
              className="h-full"
            >
              {activeTab === "output" && <OutputView brief={briefData} />}
            </div>
          </div>
        </div>

        {/* Right column - Processing (always visible, 40% width) */}
        <div className="w-full md:w-[40%] overflow-auto border-t md:border-t-0 border-border">
          <ProcessingView
            brief={briefData}
            processingLog={processingLog}
          />
        </div>
      </div>
    </div>
  );
}
