/**
 * ResearchPanel component - Right panel showing research activity and findings
 *
 * Supports two-phase research flow:
 * - Round 1 research (after Section 1 confirm)
 * - Round 3 research (automatically after Round 1 completes)
 */

import { ScrollArea } from "@/components/ui/scroll-area";
import type { ResearchPanelProps } from "../types";
import { LoadingState } from "./LoadingState";
import { FindingsDisplay } from "./FindingsDisplay";
import { AngleSummaryCard } from "./AngleSummaryCard";
import { AlertCircle, CheckCircle2, Search, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export function ResearchPanel({
  status: _status, // Legacy, kept for backwards compat
  findings,
  searchEvents: _searchEvents, // Legacy, kept for backwards compat
  error,
  angle,
  researchPhase,
  round1Events,
  round1Findings,
  round3Events,
  round3Findings,
}: ResearchPanelProps) {
  const getStatusDisplay = () => {
    switch (researchPhase) {
      case "none":
        return {
          icon: <Clock className="w-4 h-4" />,
          text: "Waiting to start",
          color: "text-muted-foreground",
        };
      case "round1_running":
        return {
          icon: <Search className="w-4 h-4 animate-pulse" />,
          text: "Round 1 research...",
          color: "text-blue-600",
        };
      case "round1_complete":
        return {
          icon: <Search className="w-4 h-4 animate-pulse" />,
          text: "Starting Round 3...",
          color: "text-blue-600",
        };
      case "round3_running":
        return {
          icon: <Search className="w-4 h-4 animate-pulse" />,
          text: "Round 3 research...",
          color: "text-blue-600",
        };
      case "complete":
        return {
          icon: <CheckCircle2 className="w-4 h-4" />,
          text: "All research complete",
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
  const isRound1Running = researchPhase === "round1_running";
  const isRound1Complete = researchPhase === "round1_complete" || researchPhase === "round3_running" || researchPhase === "complete";
  const isRound3Running = researchPhase === "round3_running";
  const isRound3Complete = researchPhase === "complete";

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
          {!angle && researchPhase === "none" && (
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

          {/* Round 1 Research Section */}
          {angle && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isRound1Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : isRound1Running ? (
                  <Search className="w-4 h-4 text-blue-600 animate-pulse" />
                ) : (
                  <Clock className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  isRound1Complete ? "text-green-600" : isRound1Running ? "text-blue-600" : "text-muted-foreground"
                )}>
                  Round 1 Research
                  {isRound1Complete && " ✓"}
                </span>
              </div>

              {/* Round 1 progress */}
              {isRound1Running && round1Events.length > 0 && (
                <LoadingState searchEvents={round1Events} />
              )}

              {/* Round 1 findings summary */}
              {isRound1Complete && round1Findings && (
                <div className="pl-6 text-xs text-muted-foreground">
                  {Object.values(round1Findings).flat().filter(Boolean).length} findings collected
                </div>
              )}
            </div>
          )}

          {/* Round 3 Research Section */}
          {isRound1Complete && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {isRound3Complete ? (
                  <CheckCircle2 className="w-4 h-4 text-green-600" />
                ) : isRound3Running ? (
                  <Search className="w-4 h-4 text-blue-600 animate-pulse" />
                ) : (
                  <Clock className="w-4 h-4 text-muted-foreground" />
                )}
                <span className={cn(
                  "text-sm font-medium",
                  isRound3Complete ? "text-green-600" : isRound3Running ? "text-blue-600" : "text-muted-foreground"
                )}>
                  Round 3 Research
                  {isRound3Complete && " ✓"}
                </span>
              </div>

              {/* Round 3 progress */}
              {isRound3Running && round3Events.length > 0 && (
                <LoadingState searchEvents={round3Events} />
              )}

              {/* Round 3 findings summary */}
              {isRound3Complete && round3Findings && (
                <div className="pl-6 text-xs text-muted-foreground">
                  {Object.values(round3Findings).flat().filter(Boolean).length} findings collected
                </div>
              )}
            </div>
          )}

          {/* Combined findings - show when complete */}
          {researchPhase === "complete" && findings && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-green-600 mb-3">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm font-medium">
                  All research complete ({(round1Events.length || 0) + (round3Events.length || 0)} total queries)
                </span>
              </div>
              <FindingsDisplay findings={findings} />
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with progress */}
      {(isRound1Running || isRound3Running) && (
        <div className="p-3 border-t bg-background text-xs text-muted-foreground">
          {isRound1Running && round1Events.length > 0 && (
            <>Round 1: {round1Events.filter((e) => e.status === "complete").length} of {round1Events.length} searches</>
          )}
          {isRound3Running && round3Events.length > 0 && (
            <>Round 3: {round3Events.filter((e) => e.status === "complete").length} of {round3Events.length} searches</>
          )}
        </div>
      )}
    </div>
  );
}

export default ResearchPanel;
