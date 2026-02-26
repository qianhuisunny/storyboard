import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type {
  ProcessingViewProps,
  FieldStatus,
  SourceReference,
  FieldState,
} from "../types";
import { getFieldStatus, getFieldState } from "../types";

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({
  title,
  subtitle,
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

// Status badge configuration for the three states
const statusConfig: Record<FieldStatus, { label: string; className: string; icon: string }> = {
  auto_filled: {
    label: "Auto-filled",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    icon: "✓",
  },
  inferred: {
    label: "Inferred",
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: "?",
  },
  not_applicable: {
    label: "N/A",
    className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
    icon: "—",
  },
};

// Confidence badge colors
const confidenceColors = {
  high: "text-green-600 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-red-600 dark:text-red-400",
};

// Source citation component
function SourceCitation({ sources }: { sources: SourceReference[] }) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-muted-foreground font-medium">Sources:</p>
      <ul className="space-y-1">
        {sources.map((source, index) => (
          <li key={index} className="flex items-center gap-2 text-xs">
            <ExternalLink className="w-3 h-3 text-blue-500" />
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 hover:underline truncate max-w-md"
            >
              {source.title || source.url}
            </a>
            {source.confidence && (
              <span className={`text-[10px] ${confidenceColors[source.confidence]}`}>
                ({source.confidence})
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Field state display component
function FieldStateDisplay({
  fieldName,
  fieldState,
  value,
}: {
  fieldName: string;
  fieldState: FieldState;
  value: unknown;
}) {
  const config = statusConfig[fieldState.status];
  const displayValue =
    typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

  return (
    <li className="p-3 bg-muted/50 rounded-md text-sm border border-border/50">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-foreground">{fieldName}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
          {config.icon} {config.label}
        </span>
        {fieldState.confidence && (
          <span className={`text-xs ${confidenceColors[fieldState.confidence]}`}>
            Confidence: {fieldState.confidence}
          </span>
        )}
      </div>
      {fieldState.reason && (
        <p className="text-xs text-muted-foreground mt-1 italic">
          {fieldState.reason}
        </p>
      )}
      {value !== null && value !== undefined && value !== "" && (
        <pre className="text-muted-foreground mt-2 text-xs bg-muted/30 p-2 rounded overflow-auto max-h-32 whitespace-pre-wrap">
          {displayValue.substring(0, 500)}
          {displayValue.length > 500 ? "..." : ""}
        </pre>
      )}
      <SourceCitation sources={fieldState.sources} />
    </li>
  );
}

/**
 * ProcessingView - Technical log view showing processing steps.
 * Displays field states with sources and gaps.
 */
export default function ProcessingView({
  brief,
  processingLog,
}: ProcessingViewProps) {
  // Categorize fields by status
  const allFields = Object.keys(brief).filter(
    (field) => !["field_states", "auto_filled_fields", "inferred_fields", "missing_fields", "not_applicable_fields", "user_override_fields", "unresolved_questions"].includes(field)
  ) as (keyof typeof brief)[];

  const fieldsByStatus: Record<FieldStatus, string[]> = {
    auto_filled: [],
    inferred: [],
    not_applicable: [],
  };

  allFields.forEach((field) => {
    const status = getFieldStatus(field, brief);
    fieldsByStatus[status].push(field);
  });

  return (
    <div className="processing-view h-full overflow-auto p-6 bg-muted/10">
      <div className="max-w-5xl mx-auto space-y-4">
        <h2 className="text-lg font-semibold text-foreground mb-4">
          Processing Log
        </h2>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {Object.entries(fieldsByStatus).map(([status, fields]) => {
            const config = statusConfig[status as FieldStatus];
            return (
              <div key={status} className={`p-3 rounded-lg ${config.className} border`}>
                <div className="text-2xl font-bold">{fields.length}</div>
                <div className="text-xs">{config.label}</div>
              </div>
            );
          })}
        </div>

        {/* Section 1: Auto-Filled Fields (with sources) */}
        <CollapsibleSection
          title="Auto-Filled Fields"
          subtitle={`${fieldsByStatus.auto_filled.length} fields`}
          defaultOpen={true}
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Fields populated with high confidence from research sources:
            </p>
            {fieldsByStatus.auto_filled.length > 0 ? (
              <ul className="space-y-2">
                {fieldsByStatus.auto_filled.map((field) => (
                  <FieldStateDisplay
                    key={field}
                    fieldName={field}
                    fieldState={getFieldState(field as keyof typeof brief, brief)}
                    value={brief[field as keyof typeof brief]}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No fields were auto-filled with high confidence.
              </p>
            )}
          </div>
        </CollapsibleSection>

        {/* Section 4: Inferred Fields (need confirmation) */}
        <CollapsibleSection
          title="Inferred Fields"
          subtitle={`${fieldsByStatus.inferred.length} fields need review`}
        >
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground mb-3">
              Fields derived from context but requiring user confirmation:
            </p>
            {fieldsByStatus.inferred.length > 0 ? (
              <ul className="space-y-2">
                {fieldsByStatus.inferred.map((field) => (
                  <FieldStateDisplay
                    key={field}
                    fieldName={field}
                    fieldState={getFieldState(field as keyof typeof brief, brief)}
                    value={brief[field as keyof typeof brief]}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                No fields require review.
              </p>
            )}
          </div>
        </CollapsibleSection>

        {/* Section 5: Not Applicable Fields */}
        {fieldsByStatus.not_applicable.length > 0 && (
          <CollapsibleSection
            title="Not Applicable Fields"
            subtitle={`${fieldsByStatus.not_applicable.length} fields`}
          >
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                Fields that don't apply to this video type:
              </p>
              <ul className="space-y-2">
                {fieldsByStatus.not_applicable.map((field) => (
                  <FieldStateDisplay
                    key={field}
                    fieldName={field}
                    fieldState={getFieldState(field as keyof typeof brief, brief)}
                    value={null}
                  />
                ))}
              </ul>
            </div>
          </CollapsibleSection>
        )}

        {/* Processing Log Entries (if any) */}
        {processingLog.length > 0 && (
          <CollapsibleSection
            title="Processing Steps"
            subtitle={`${processingLog.length} steps`}
          >
            <ul className="space-y-2">
              {processingLog.map((entry) => (
                <li
                  key={entry.id}
                  className="p-3 bg-muted/50 rounded-md text-sm border border-border/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      {entry.step}
                    </span>
                    <div className="flex items-center gap-2">
                      {entry.confidence && (
                        <span className={`text-xs ${confidenceColors[entry.confidence]}`}>
                          {entry.confidence}
                        </span>
                      )}
                      {entry.timestamp && (
                        <span className="text-xs text-muted-foreground">
                          {entry.timestamp}
                        </span>
                      )}
                    </div>
                  </div>
                  {entry.details && (
                    <p className="text-muted-foreground mt-1">
                      {entry.details}
                    </p>
                  )}
                  {entry.source && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <ExternalLink className="w-3 h-3 text-blue-500" />
                      <a
                        href={entry.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline"
                      >
                        {entry.source}
                      </a>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
