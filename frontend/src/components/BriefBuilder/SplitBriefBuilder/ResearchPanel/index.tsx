/**
 * ResearchPanel component - Right panel showing research activity and findings
 *
 * Now supports angle-based research with:
 * - Angle summary card (parked at top once calculated)
 * - Research progress below angle card
 */

import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResearchPanelProps } from "../types";
import { LoadingState } from "./LoadingState";
import { FindingsDisplay } from "./FindingsDisplay";
import { AngleSummaryCard } from "./AngleSummaryCard";
import { AlertCircle, CheckCircle2, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ResearchPanel({
  status,
  findings,
  searchEvents,
  error,
  angle,
  researchPhase,
}: ResearchPanelProps) {
  const getStatusDisplay = () => {
    // Use researchPhase if available, fall back to status
    const phase = researchPhase || (status === "idle" ? "none" : status);

    switch (phase) {
      case "none":
        return {
          icon: <Clock className="w-4 h-4" />,
          text: "Waiting to start",
          color: "text-muted-foreground",
        };
      case "planned":
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          text: "Plan ready",
          color: "text-green-600",
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
      default:
        if (error) {
          return {
            icon: <AlertCircle className="w-4 h-4" />,
            text: "Error occurred",
            color: "text-red-600",
          };
        }
        return {
          icon: <Clock className="w-4 h-4" />,
          text: "Waiting to start",
          color: "text-muted-foreground",
        };
    }
  };

  const statusDisplay = getStatusDisplay();
  const effectivePhase = researchPhase || (status === "idle" ? "none" : status);

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Processing Log</h2>
          <div className={cn("flex items-center gap-2 text-sm", statusDisplay.color)}>
            {statusDisplay.icon}
            <span>{statusDisplay.text}</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Research activity and findings
        </p>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Error state */}
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-700">Research Error</p>
                  <p className="text-sm text-red-600 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Idle state - only when no angle yet */}
          {!angle && effectivePhase === "none" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Waiting for Section 1 completion
              </p>
            </div>
          )}

          {/* Angle summary card - always visible once calculated */}
          {angle && <AngleSummaryCard angle={angle} />}

          {/* Running state - show search progress below angle */}
          {effectivePhase === "running" && (
            <>
              <div className="flex items-center gap-2 text-blue-600">
                <Search className="w-4 h-4 animate-pulse" />
                <span className="text-sm font-medium">Researching...</span>
              </div>
              <LoadingState searchEvents={searchEvents} />
            </>
          )}

          {/* Complete state - show findings below angle */}
          {effectivePhase === "complete" && findings && (
            <>
              <div className="flex items-center gap-2 text-green-600">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Research complete{" "}
                  {searchEvents.length > 0 && `(${searchEvents.length} queries)`}
                </span>
              </div>
              <FindingsDisplay findings={findings} />
            </>
          )}
        </div>
      </ScrollArea>

      {/* Footer with progress - only during running phase */}
      {effectivePhase === "running" && searchEvents.length > 0 && (
        <div className="p-3 border-t bg-background text-xs text-muted-foreground">
          {searchEvents.filter((e) => e.status === "complete").length} of{" "}
          {searchEvents.length} searches completed
        </div>
      )}
    </div>
  );
}

export default ResearchPanel;
