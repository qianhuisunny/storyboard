import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
  Layers,
  Cpu,
  Film,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcessingViewProps } from "../types";
import { calculateTotalDuration, formatDuration, SCREEN_TYPE_CONFIG } from "../types";

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <span className="font-medium text-sm">{title}</span>
      </button>
      {isOpen && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

/**
 * ProcessingView - Technical view showing draft generation details.
 * Displays script analysis, screen types, timing, and generation steps.
 */
export default function ProcessingView({
  screens,
  outlineSummary,
  processingLog,
}: ProcessingViewProps) {
  const totalDuration = calculateTotalDuration(screens);
  const totalWords = screens.reduce(
    (sum, s) => sum + (s.voiceover_text?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  // Count screen types
  const screenTypeCounts: Record<string, number> = {};
  screens.forEach((s) => {
    screenTypeCounts[s.screen_type] = (screenTypeCounts[s.screen_type] || 0) + 1;
  });

  return (
    <div className="processing-view h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Processing Details
        </h2>
        <p className="text-sm text-muted-foreground">
          Technical information about the storyboard generation process.
        </p>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {/* Script Analysis */}
          <CollapsibleSection
            title="Script Analysis"
            icon={<MessageSquare className="w-4 h-4" />}
            defaultOpen={true}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-foreground">
                  {screens.length}
                </div>
                <div className="text-xs text-muted-foreground">Total Panels</div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-foreground">
                  {totalWords}
                </div>
                <div className="text-xs text-muted-foreground">Total Words</div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-foreground">
                  {formatDuration(totalDuration)}
                </div>
                <div className="text-xs text-muted-foreground">Total Duration</div>
              </div>
              <div className="bg-muted/30 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-foreground">
                  {totalDuration > 0 ? Math.round(totalWords / (totalDuration / 60)) : 0}
                </div>
                <div className="text-xs text-muted-foreground">Words/Min</div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Screen Type Distribution */}
          <CollapsibleSection
            title="Panel Types"
            icon={<Layers className="w-4 h-4" />}
            defaultOpen={true}
          >
            <div className="space-y-2">
              {Object.entries(screenTypeCounts).map(([type, count]) => {
                const config = SCREEN_TYPE_CONFIG[type] || {
                  label: type,
                  color: "bg-gray-100 text-gray-700",
                };
                const percentage = Math.round((count / screens.length) * 100);
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div
                      className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium min-w-[80px] text-center",
                        config.color
                      )}
                    >
                      {config.label}
                    </div>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary/60 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-12 text-right">
                      {count} ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Timing Breakdown */}
          <CollapsibleSection
            title="Timing Breakdown"
            icon={<Clock className="w-4 h-4" />}
            defaultOpen={false}
          >
            <div className="space-y-2">
              {screens.map((screen, index) => {
                const percentage = totalDuration > 0
                  ? Math.round((screen.target_duration_sec / totalDuration) * 100)
                  : 0;
                return (
                  <div key={index} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-8">
                      #{screen.screen_number}
                    </span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {screen.target_duration_sec}s ({percentage}%)
                    </span>
                  </div>
                );
              })}
            </div>
            {outlineSummary?.target_duration && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Target Duration:</span>
                  <span className="font-medium">{outlineSummary.target_duration}s</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Actual Duration:</span>
                  <span className="font-medium">{totalDuration}s</span>
                </div>
              </div>
            )}
          </CollapsibleSection>

          {/* Panel Flow Visualization */}
          <CollapsibleSection
            title="Storyboard Flow"
            icon={<Film className="w-4 h-4" />}
            defaultOpen={false}
          >
            <div className="flex flex-wrap gap-2">
              {screens.map((screen, index) => {
                const config = SCREEN_TYPE_CONFIG[screen.screen_type] || {
                  label: screen.screen_type,
                  color: "bg-gray-100 text-gray-700",
                };
                return (
                  <div key={index} className="flex items-center">
                    <div
                      className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        config.color
                      )}
                    >
                      {screen.screen_number}. {config.label}
                    </div>
                    {index < screens.length - 1 && (
                      <span className="mx-1 text-muted-foreground">→</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* Generation Steps */}
          {processingLog.length > 0 && (
            <CollapsibleSection
              title="Generation Steps"
              icon={<Cpu className="w-4 h-4" />}
              defaultOpen={false}
            >
              <div className="space-y-2">
                {processingLog.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 text-sm"
                  >
                    <div className="w-2 h-2 mt-1.5 rounded-full bg-primary flex-shrink-0" />
                    <div>
                      <div className="font-medium">{entry.step}</div>
                      {entry.details && (
                        <div className="text-muted-foreground text-xs mt-0.5">
                          {entry.details}
                        </div>
                      )}
                      {entry.timestamp && (
                        <div className="text-muted-foreground text-xs">
                          {entry.timestamp}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Raw Input Reference */}
          <CollapsibleSection
            title="Generation Context"
            icon={<FileText className="w-4 h-4" />}
            defaultOpen={false}
          >
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-muted-foreground">Panels Generated:</span>
                <span className="ml-2 font-medium">{screens.length}</span>
              </div>
              {outlineSummary?.video_type && (
                <div>
                  <span className="text-muted-foreground">Video Type:</span>
                  <span className="ml-2 font-medium">{outlineSummary.video_type}</span>
                </div>
              )}
              <div>
                <span className="text-muted-foreground">Average Panel Duration:</span>
                <span className="ml-2 font-medium">
                  {screens.length > 0
                    ? Math.round(totalDuration / screens.length)
                    : 0}s
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>
      </div>
    </div>
  );
}
