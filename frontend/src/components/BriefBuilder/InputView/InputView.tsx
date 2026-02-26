import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import type { InputViewProps } from "../types";

/**
 * InputView - Displays user inputs for Stage 1 (Brief).
 * Shows what the user provided as input to generate the brief.
 */
export default function InputView({ brief }: InputViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    userInputs: true,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Input Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Original user inputs used to generate this brief.
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Section 1: User Inputs */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("userInputs")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.userInputs ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="font-medium">User Inputs</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Original prompt & uploads
              </span>
            </button>

            {expandedSections.userInputs && (
              <div className="p-4 space-y-4">
                {/* Original Prompt */}
                {brief.user_inputs && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      Original Prompt
                    </div>
                    <div className="p-3 bg-muted/20 rounded-md text-sm whitespace-pre-wrap">
                      {brief.user_inputs}
                    </div>
                  </div>
                )}

                {/* Video Type & Other Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {brief.video_type && (
                    <div className="p-2 bg-muted/20 rounded-md">
                      <div className="text-xs text-muted-foreground">Video Type</div>
                      <div className="text-sm font-medium">{brief.video_type}</div>
                    </div>
                  )}
                  {brief.video_goal && (
                    <div className="p-2 bg-muted/20 rounded-md col-span-2">
                      <div className="text-xs text-muted-foreground">Goal</div>
                      <div className="text-sm font-medium truncate">{brief.video_goal}</div>
                    </div>
                  )}
                  {brief.target_audience && (
                    <div className="p-2 bg-muted/20 rounded-md">
                      <div className="text-xs text-muted-foreground">Audience</div>
                      <div className="text-sm font-medium truncate">{brief.target_audience}</div>
                    </div>
                  )}
                </div>

                {/* No inputs message */}
                {!brief.user_inputs && (
                  <div className="text-sm text-muted-foreground italic">
                    No user inputs recorded.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* No Data State */}
          {!brief.user_inputs && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No input data available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
