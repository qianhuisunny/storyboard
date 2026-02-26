/**
 * ResearchPanel component - Right panel showing research activity and findings
 */

import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResearchPanelProps } from "../types";
import { LoadingState } from "./LoadingState";
import { FindingsDisplay } from "./FindingsDisplay";
import { AlertCircle, CheckCircle2, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ResearchPanel({
  status,
  findings,
  searchEvents,
  error,
}: ResearchPanelProps) {
  const getStatusDisplay = () => {
    switch (status) {
      case "idle":
        return {
          icon: <Clock className="w-4 h-4" />,
          text: "Waiting to start",
          color: "text-muted-foreground",
        };
      case "running":
        return {
          icon: <Search className="w-4 h-4 animate-pulse" />,
          text: "Researching...",
          color: "text-blue-600",
        };
      case "complete":
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          text: "Research complete",
          color: "text-green-600",
        };
      case "error":
        return {
          icon: <AlertCircle className="w-4 h-4" />,
          text: "Error occurred",
          color: "text-red-600",
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Research Activity</h2>
          <div className={cn("flex items-center gap-2 text-sm", statusDisplay.color)}>
            {statusDisplay.icon}
            <span>{statusDisplay.text}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {status === "idle"
            ? "Research will begin after you confirm your inputs"
            : status === "running"
            ? "Finding relevant information about your topic"
            : status === "complete"
            ? "Review the findings below"
            : "An error occurred during research"}
        </p>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Error state */}
          {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Research Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Idle state */}
          {status === "idle" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Research will start automatically after you confirm Step 1
              </p>
            </div>
          )}

          {/* Running state - show search queries */}
          {status === "running" && (
            <LoadingState searchEvents={searchEvents} />
          )}

          {/* Complete state - show findings */}
          {status === "complete" && findings && (
            <FindingsDisplay findings={findings} />
          )}
        </div>
      </ScrollArea>

      {/* Footer with search count */}
      {searchEvents.length > 0 && (
        <div className="p-3 border-t bg-background text-xs text-muted-foreground">
          {searchEvents.filter((e) => e.status === "complete").length} of{" "}
          {searchEvents.length} searches completed
        </div>
      )}
    </div>
  );
}

export default ResearchPanel;
