import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Layers, Clock, Wand2 } from "lucide-react";
import type { ProcessingViewProps } from "../types";
import { calculateTotalDuration, formatDuration, SCREEN_TYPE_CONFIG } from "../types";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  subtitle,
  icon,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          {icon}
          <span className="font-medium text-foreground">{title}</span>
          {subtitle && (
            <span className="text-sm text-muted-foreground">({subtitle})</span>
          )}
        </div>
      </button>
      {isOpen && (
        <div className="p-4 bg-background border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * ProcessingView - Technical log view showing outline generation steps.
 */
export default function ProcessingView({
  screens,
  stage1Output,
  processingLog,
}: ProcessingViewProps) {
  const totalDuration = calculateTotalDuration(screens);

  // Count screen types
  const screenTypeCounts = screens.reduce((acc, screen) => {
    const type = screen.screen_type;
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="processing-view h-full overflow-auto p-6 bg-muted/10">
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Outline Generation Log
        </h2>

        {/* Section 1: Brief Input Summary */}
        <CollapsibleSection
          title="Story Brief Input"
          icon={<FileText className="w-4 h-4 text-blue-500" />}
          defaultOpen={true}
        >
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The outline was generated from this Story Brief:
            </p>
            {stage1Output ? (
              <div className="grid gap-2">
                {stage1Output.video_type && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Video Type:</span>
                    <span className="font-medium">{stage1Output.video_type}</span>
                  </div>
                )}
                {stage1Output.video_goal && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Goal:</span>
                    <p className="mt-1 p-2 bg-muted rounded text-foreground">
                      {stage1Output.video_goal}
                    </p>
                  </div>
                )}
                {stage1Output.target_audience && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Target Audience:</span>
                    <p className="mt-1 p-2 bg-muted rounded text-foreground">
                      {stage1Output.target_audience}
                    </p>
                  </div>
                )}
                {stage1Output.desired_length && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Target Length:</span>
                    <span className="font-medium">{stage1Output.desired_length} seconds</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Brief summary not available.
              </p>
            )}
          </div>
        </CollapsibleSection>

        {/* Section 2: Structure Analysis */}
        <CollapsibleSection
          title="Screen Structure"
          subtitle={`${screens.length} screens`}
          icon={<Layers className="w-4 h-4 text-purple-500" />}
        >
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Screen type distribution:
            </p>

            {/* Screen Type Breakdown */}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(screenTypeCounts).map(([type, count]) => {
                const config = SCREEN_TYPE_CONFIG[type as keyof typeof SCREEN_TYPE_CONFIG] || {
                  label: type,
                  color: "bg-gray-100 text-gray-700",
                };
                return (
                  <div
                    key={type}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded"
                  >
                    <span
                      className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.color}`}
                    >
                      {config.label}
                    </span>
                    <span className="text-sm font-medium">{count}</span>
                  </div>
                );
              })}
            </div>

            {/* Screen Flow */}
            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">Screen flow:</p>
              <div className="flex flex-wrap gap-1">
                {screens.map((screen, i) => {
                  const config =
                    SCREEN_TYPE_CONFIG[
                      screen.screen_type as keyof typeof SCREEN_TYPE_CONFIG
                    ] || { label: screen.screen_type, color: "bg-gray-100" };
                  return (
                    <span key={i} className="flex items-center">
                      <span
                        className={`px-1.5 py-0.5 text-xs rounded ${config.color}`}
                      >
                        {i + 1}
                      </span>
                      {i < screens.length - 1 && (
                        <span className="mx-1 text-muted-foreground">→</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 3: Timing Analysis */}
        <CollapsibleSection
          title="Timing Breakdown"
          subtitle={formatDuration(totalDuration)}
          icon={<Clock className="w-4 h-4 text-green-500" />}
        >
          <div className="space-y-3">
            {/* Duration Bar */}
            <div className="h-8 flex rounded-lg overflow-hidden">
              {screens.map((screen, i) => {
                const width = ((screen.target_duration_sec || 0) / totalDuration) * 100;
                const config =
                  SCREEN_TYPE_CONFIG[
                    screen.screen_type as keyof typeof SCREEN_TYPE_CONFIG
                  ] || { color: "bg-gray-200" };
                const bgColor = config.color.split(" ")[0]; // Get just the bg class
                return (
                  <div
                    key={i}
                    className={`${bgColor} flex items-center justify-center text-xs font-medium`}
                    style={{ width: `${width}%` }}
                    title={`Screen ${i + 1}: ${screen.target_duration_sec}s`}
                  >
                    {width > 8 && `${screen.target_duration_sec}s`}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {screens.map((screen, i) => (
                <div key={i} className="flex justify-between">
                  <span className="text-muted-foreground">Screen {i + 1}:</span>
                  <span className="font-medium">{screen.target_duration_sec || 0}s</span>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="pt-2 border-t border-border flex justify-between font-medium">
              <span>Total Duration:</span>
              <span>{formatDuration(totalDuration)} ({totalDuration}s)</span>
            </div>
          </div>
        </CollapsibleSection>

        {/* Section 4: AI Generation Steps */}
        <CollapsibleSection
          title="Generation Steps"
          subtitle={`${processingLog.length || 0} steps`}
          icon={<Wand2 className="w-4 h-4 text-amber-500" />}
        >
          {processingLog.length > 0 ? (
            <ul className="space-y-2">
              {processingLog.map((entry) => (
                <li
                  key={entry.id}
                  className="p-2 bg-muted/50 rounded-md text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {entry.step}
                    </span>
                    {entry.timestamp && (
                      <span className="text-xs text-muted-foreground">
                        {entry.timestamp}
                      </span>
                    )}
                  </div>
                  {entry.details && (
                    <p className="text-muted-foreground mt-1">{entry.details}</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p>AI generated {screens.length} screens based on:</p>
              <ul className="mt-2 space-y-1 list-disc list-inside">
                <li>Video type: {stage1Output?.video_type || "General"}</li>
                <li>Target duration: {stage1Output?.desired_length || "60"}s</li>
                <li>Optimal pacing for audience engagement</li>
                <li>Screen type best practices for {stage1Output?.video_type || "video"}</li>
              </ul>
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  );
}
