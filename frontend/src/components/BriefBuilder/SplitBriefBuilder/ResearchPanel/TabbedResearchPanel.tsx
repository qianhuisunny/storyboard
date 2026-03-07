/**
 * TabbedResearchPanel - Container with tabs for Research Chat and Processing Log
 *
 * Tab 1: Research - Interactive chat for perspective selection and research
 * Tab 2: Processing - LLM call details (requests/responses)
 */

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Cpu } from "lucide-react";
import { ResearchChat } from "./ResearchChat";
import { ProcessingLog } from "./ProcessingLog";
import type { TabbedResearchPanelProps } from "../types";

export function TabbedResearchPanel({
  // ResearchChat props
  researchChatState,
  onSelectPerspective,
  onConfirmTalkingPoints,
  isResearchChatLoading,
  // ProcessingLog props
  projectId,
  processingLogs,
  isPollingLogs,
}: TabbedResearchPanelProps) {
  return (
    <div className="flex flex-col h-full bg-muted/30">
      <Tabs defaultValue="research" className="flex flex-col h-full">
        {/* Tab headers */}
        <div className="px-4 pt-4 bg-background border-b">
          <TabsList className="w-full">
            <TabsTrigger value="research" className="flex-1 gap-2">
              <MessageCircle className="w-4 h-4" />
              Research
            </TabsTrigger>
            <TabsTrigger value="processing" className="flex-1 gap-2">
              <Cpu className="w-4 h-4" />
              Processing
              {processingLogs.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-muted rounded-full">
                  {processingLogs.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab content */}
        <TabsContent value="research" className="flex-1 mt-0 overflow-hidden">
          <ResearchChat
            state={researchChatState}
            onSelectPerspective={onSelectPerspective}
            onConfirmTalkingPoints={onConfirmTalkingPoints}
            isLoading={isResearchChatLoading}
          />
        </TabsContent>

        <TabsContent value="processing" className="flex-1 mt-0 overflow-hidden">
          <ProcessingLog
            projectId={projectId}
            entries={processingLogs}
            isPolling={isPollingLogs}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default TabbedResearchPanel;
