import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import type { InputViewProps } from "../types";

/**
 * InputView - Displays data passed from Stage 1 (Brief) to Stage 2 (Outline).
 * Shows the approved Brief from Stage 1.
 */
export default function InputView({ stage1Output }: InputViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stage1Output: true,
  });
  const [copied, setCopied] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const hasStage1Output = stage1Output && Object.keys(stage1Output).length > 0;

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Input from Previous Stage
        </h2>
        <p className="text-sm text-muted-foreground">
          Data that was used to generate this video outline.
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Section 1: Stage 1 Output (Brief) */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("stage1Output")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.stage1Output ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <span className="font-medium">Stage 1 Output (Brief)</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {hasStage1Output ? "Approved Brief" : "No data"}
              </span>
            </button>

            {expandedSections.stage1Output && hasStage1Output && (
              <div className="p-4 space-y-4">
                {/* Key Fields as Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {stage1Output.video_goal && (
                    <div className="p-3 bg-muted/20 rounded-md">
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Video Goal
                      </div>
                      <div className="text-sm">{String(stage1Output.video_goal)}</div>
                    </div>
                  )}
                  {stage1Output.target_audience && (
                    <div className="p-3 bg-muted/20 rounded-md">
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Target Audience
                      </div>
                      <div className="text-sm">{String(stage1Output.target_audience)}</div>
                    </div>
                  )}
                  {stage1Output.video_type && (
                    <div className="p-3 bg-muted/20 rounded-md">
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Video Type
                      </div>
                      <div className="text-sm">{String(stage1Output.video_type)}</div>
                    </div>
                  )}
                  {stage1Output.desired_length && (
                    <div className="p-3 bg-muted/20 rounded-md">
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Desired Length
                      </div>
                      <div className="text-sm">{String(stage1Output.desired_length)} seconds</div>
                    </div>
                  )}
                </div>

                {/* Full JSON */}
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-muted-foreground">Full Brief JSON</span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(stage1Output, null, 2), "stage1")}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      {copied === "stage1" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied === "stage1" ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-3 bg-muted/30 rounded-md overflow-auto text-xs font-mono max-h-60">
                    {JSON.stringify(stage1Output, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {expandedSections.stage1Output && !hasStage1Output && (
              <div className="p-4 text-sm text-muted-foreground">
                No Stage 1 output available.
              </div>
            )}
          </div>

          {/* No Data State */}
          {!hasStage1Output && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No input data available from previous stage.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
