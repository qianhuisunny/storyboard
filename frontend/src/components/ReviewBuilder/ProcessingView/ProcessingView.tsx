import { useState } from "react";
import { ChevronDown, ChevronRight, Cpu, Layers, Clock, CheckCircle } from "lucide-react";
import type { ProcessingViewProps } from "../types";
import { calculateTotalDuration, formatDuration } from "../types";

/**
 * ProcessingView - Shows the review stage processing log and summary.
 * Displays what happened during the review stage generation.
 */
export default function ProcessingView({ screens, processingLog = [] }: ProcessingViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    summary: true,
    log: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const totalDuration = calculateTotalDuration(screens);
  const totalWords = screens.reduce(
    (sum, s) => sum + (s.voiceover_text?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-purple-500" />
          Review Processing
        </h2>
        <p className="text-sm text-muted-foreground">
          Processing summary and logs for the final review stage.
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Summary Section */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("summary")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.summary ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Layers className="w-4 h-4 text-blue-500" />
                <span className="font-medium">Storyboard Summary</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {screens.length} screen(s)
              </span>
            </button>

            {expandedSections.summary && (
              <div className="p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="p-3 bg-muted/20 rounded-md">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      Total Panels
                    </div>
                    <div className="text-lg font-semibold">{screens.length}</div>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-md">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      Total Duration
                    </div>
                    <div className="text-lg font-semibold flex items-center gap-1">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      {formatDuration(totalDuration)}
                    </div>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-md">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      Total Words
                    </div>
                    <div className="text-lg font-semibold">{totalWords}</div>
                  </div>
                  <div className="p-3 bg-muted/20 rounded-md">
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      Stage Status
                    </div>
                    <div className="text-lg font-semibold flex items-center gap-1 text-green-600">
                      <CheckCircle className="w-4 h-4" />
                      Ready
                    </div>
                  </div>
                </div>

                {/* Screen Types Breakdown */}
                <div className="mt-4 pt-4 border-t border-border">
                  <h4 className="text-sm font-medium mb-3">Screen Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(
                      screens.reduce((acc, s) => {
                        const type = s.screen_type || "unknown";
                        acc[type] = (acc[type] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([type, count]) => (
                      <span
                        key={type}
                        className="text-xs px-2 py-1 bg-muted rounded-full"
                      >
                        {type.replace(/_/g, " ")}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Processing Log */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("log")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.log ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Cpu className="w-4 h-4 text-purple-500" />
                <span className="font-medium">Processing Log</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {processingLog.length} entries
              </span>
            </button>

            {expandedSections.log && (
              <div className="p-4">
                {processingLog.length > 0 ? (
                  <div className="space-y-2">
                    {processingLog.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start gap-3 p-2 bg-muted/20 rounded-md"
                      >
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{entry.step}</div>
                          {entry.details && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {entry.details}
                            </div>
                          )}
                          {entry.timestamp && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {entry.timestamp}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    <p>Review stage processing complete.</p>
                    <p className="mt-2 text-xs">
                      This stage receives the finalized production screens from Stage 3 (Draft)
                      and prepares them for review, export, and sharing.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
