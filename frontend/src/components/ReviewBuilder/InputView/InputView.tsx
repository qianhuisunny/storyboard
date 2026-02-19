import { useState } from "react";
import { ChevronDown, ChevronRight, Layers, Copy, Check } from "lucide-react";
import type { InputViewProps } from "../types";

/**
 * InputView - Displays Stage 3 output (production screens) for Stage 4 (Review).
 * Shows what was passed from the Draft stage to this final review stage.
 */
export default function InputView({ previousStageOutput }: InputViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    screens: true,
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

  // Parse screens from previousStageOutput
  const screens = Array.isArray(previousStageOutput)
    ? previousStageOutput
    : (previousStageOutput?.screens as Array<Record<string, unknown>>) ||
      (previousStageOutput?.production_screens as Array<Record<string, unknown>>) ||
      [];

  const hasScreens = screens.length > 0;

  // Calculate stats
  const totalDuration = screens.reduce(
    (sum: number, s: Record<string, unknown>) =>
      sum + (Number(s.target_duration_sec) || 0),
    0
  );

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Input from Stage 3 (Draft)
        </h2>
        <p className="text-sm text-muted-foreground">
          Production screens passed to this final review stage.
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Summary Stats */}
          {hasScreens && (
            <div className="bg-background rounded-lg border border-border p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-muted/20 rounded-md">
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Total Screens
                  </div>
                  <div className="text-sm font-medium">{screens.length}</div>
                </div>
                <div className="p-3 bg-muted/20 rounded-md">
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                    Total Duration
                  </div>
                  <div className="text-sm font-medium">{totalDuration}s</div>
                </div>
              </div>
            </div>
          )}

          {/* Production Screens */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("screens")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.screens ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <Layers className="w-4 h-4 text-purple-500" />
                <span className="font-medium">Production Screens</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {hasScreens ? `${screens.length} screen(s)` : "No data"}
              </span>
            </button>

            {expandedSections.screens && hasScreens && (
              <div className="p-4 space-y-3">
                {screens.map((screen: Record<string, unknown>, index: number) => (
                  <div
                    key={index}
                    className="p-3 bg-muted/20 rounded-md border border-border/50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Screen {(screen.screen_number as number) || index + 1}
                        </span>
                        {screen.screen_type && (
                          <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                            {String(screen.screen_type).replace(/_/g, " ")}
                          </span>
                        )}
                      </div>
                      {screen.target_duration_sec && (
                        <span className="text-xs text-muted-foreground">
                          {String(screen.target_duration_sec)}s
                        </span>
                      )}
                    </div>

                    {screen.voiceover_text && (
                      <div className="text-sm text-foreground mb-2">
                        <span className="text-xs text-muted-foreground">Voiceover: </span>
                        {String(screen.voiceover_text)}
                      </div>
                    )}

                    {screen.visual_direction && (
                      <div className="text-sm text-muted-foreground">
                        <span className="text-xs">Visual: </span>
                        {Array.isArray(screen.visual_direction)
                          ? screen.visual_direction.join("; ")
                          : String(screen.visual_direction)}
                      </div>
                    )}

                    {screen.text_overlay && (
                      <div className="text-sm text-muted-foreground mt-1">
                        <span className="text-xs">Text Overlay: </span>
                        {String(screen.text_overlay)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {expandedSections.screens && !hasScreens && (
              <div className="p-4 text-sm text-muted-foreground">
                No production screens available from Stage 3.
              </div>
            )}
          </div>

          {/* Full JSON Output */}
          {previousStageOutput && (
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between bg-muted/30">
                <span className="text-sm font-medium">Full Stage 3 Output (JSON)</span>
                <button
                  onClick={() => copyToClipboard(JSON.stringify(previousStageOutput, null, 2), "json")}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  {copied === "json" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied === "json" ? "Copied" : "Copy"}
                </button>
              </div>
              <pre className="p-4 overflow-auto text-xs font-mono max-h-60 bg-muted/10">
                {JSON.stringify(previousStageOutput, null, 2)}
              </pre>
            </div>
          )}

          {/* No Data State */}
          {!previousStageOutput && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No input data available from Stage 3.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
