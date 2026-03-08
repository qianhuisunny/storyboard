import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";
import type { InputViewProps } from "../types";

/**
 * InputView - Displays data passed from Stage 1 (Brief) to Stage 2 (Outline).
 * Shows the approved Brief from Stage 1 and research results if available.
 * Handles both Knowledge Share brief format (with fields wrapper) and legacy format.
 */

// Field display labels for Knowledge Share format
const FIELD_LABELS: Record<string, string> = {
  video_type: "Video Type",
  primary_goal: "Primary Goal",
  target_audience: "Target Audience",
  audience_level: "Audience Level",
  platform: "Platform",
  duration: "Duration",
  one_big_thing: "One Big Thing",
  viewer_next_action: "Viewer Next Action",
  on_camera_presence: "On-Camera Presence",
  broll_type: "B-Roll Types",
  delivery_tone: "Delivery Tone",
  freshness_expectation: "Freshness Expectation",
  source_assets: "Source Assets",
  must_avoid: "Must Avoid",
  core_talking_points: "Core Talking Points",
  misconceptions: "Misconceptions",
  practical_takeaway: "Practical Takeaway",
  // Legacy fields
  video_goal: "Video Goal",
  target_duration: "Target Duration",
  desired_length: "Desired Length",
  key_points: "Key Points",
  tone_and_style: "Tone & Style",
};

// Extract field value from either format
function getFieldValue(data: Record<string, unknown>, key: string): unknown {
  // Knowledge Share format: fields.key.value
  if (data.fields && typeof data.fields === "object") {
    const fields = data.fields as Record<string, unknown>;
    const field = fields[key];
    if (field && typeof field === "object" && "value" in (field as Record<string, unknown>)) {
      return (field as Record<string, unknown>).value;
    }
  }
  // Legacy format: key directly
  return data[key];
}

// Format value for display
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function InputView({ stage1Output, researchDetails }: InputViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    stage1Output: true,
    research: false,
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
  const hasResearchDetails = researchDetails && Object.keys(researchDetails).length > 0;

  // Determine if this is Knowledge Share format (has fields wrapper)
  const isKnowledgeShare = hasStage1Output && "fields" in (stage1Output as object);

  // Define field groups
  const coreIntentFields = ["video_type", "primary_goal", "target_audience", "audience_level", "platform", "duration", "one_big_thing", "viewer_next_action"];
  const deliveryFields = ["on_camera_presence", "broll_type", "delivery_tone", "freshness_expectation"];
  const contentFields = ["source_assets", "must_avoid", "core_talking_points", "misconceptions", "practical_takeaway"];
  const legacyFields = ["video_goal", "target_audience", "video_type", "desired_length", "key_points", "tone_and_style"];

  // Get relevant fields based on format
  const relevantFields = isKnowledgeShare
    ? [...coreIntentFields, ...deliveryFields, ...contentFields]
    : legacyFields;

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
        <div className="max-w-none space-y-6">
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
                  {relevantFields.map((key) => {
                    const value = getFieldValue(stage1Output as Record<string, unknown>, key);
                    if (value === undefined || value === null || value === "") return null;
                    return (
                      <div key={key} className="p-3 bg-muted/20 rounded-md">
                        <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                          {FIELD_LABELS[key] || key}
                        </div>
                        <div className="text-sm">{formatValue(value)}</div>
                      </div>
                    );
                  })}
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

          {/* Section 2: Research Details */}
          {hasResearchDetails && (
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggleSection("research")}
                className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.research ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium">Research Results</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  AI-gathered insights
                </span>
              </button>

              {expandedSections.research && (
                <div className="p-4 space-y-4">
                  {/* Research sections */}
                  {Object.entries(researchDetails as Record<string, unknown>).map(([key, value]) => {
                    if (!value) return null;
                    const label = key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={key} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                        <div className="text-xs font-medium text-blue-700 dark:text-blue-300 uppercase mb-2">
                          {label}
                        </div>
                        {Array.isArray(value) ? (
                          <ul className="list-disc list-inside text-sm space-y-1">
                            {value.map((item, i) => (
                              <li key={i}>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>
                            ))}
                          </ul>
                        ) : typeof value === "object" ? (
                          <pre className="text-xs font-mono overflow-auto">{JSON.stringify(value, null, 2)}</pre>
                        ) : (
                          <div className="text-sm">{String(value)}</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Full JSON */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Full Research JSON</span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(researchDetails, null, 2), "research")}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {copied === "research" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied === "research" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="p-3 bg-muted/30 rounded-md overflow-auto text-xs font-mono max-h-60">
                      {JSON.stringify(researchDetails, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Data State */}
          {!hasStage1Output && !hasResearchDetails && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No input data available from previous stage.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
