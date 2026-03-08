import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
  Clock,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProcessingViewProps, OutlineProcessingEntry } from "../types";

// Collapsible section for log details
function CollapsibleSection({
  title,
  icon,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        {icon}
        <span className="text-xs font-medium">{title}</span>
      </button>
      {isOpen && <div className="p-2 bg-background">{children}</div>}
    </div>
  );
}

// Single log entry display (mirrors Stage 1's ProcessingLog format)
function LogEntry({ entry }: { entry: OutlineProcessingEntry }) {
  const isRequest = entry.type === "request";
  const timestamp = entry.timestamp
    ? new Date(entry.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "";

  return (
    <div
      className={cn(
        "rounded-lg border p-3 space-y-2",
        isRequest
          ? "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-900/20"
          : "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isRequest ? (
            <ArrowUpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <ArrowDownCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          )}
          <span
            className={cn(
              "text-sm font-medium",
              isRequest
                ? "text-blue-700 dark:text-blue-300"
                : "text-green-700 dark:text-green-300"
            )}
          >
            {entry.phase}() - {isRequest ? "Request" : "Response"}
          </span>
        </div>
        {timestamp && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            {timestamp}
          </div>
        )}
      </div>

      {/* Request details */}
      {isRequest && entry.data.inputFields && (
        <CollapsibleSection
          title="Input Fields"
          icon={<span className="text-xs">📥</span>}
          defaultOpen={true}
        >
          <div className="space-y-1">
            {Object.entries(entry.data.inputFields).map(([key, value]) => (
              <div key={key} className="flex gap-2 text-xs">
                <span className="font-mono text-muted-foreground">{key}:</span>
                <span className="text-foreground truncate">{String(value)}</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {isRequest && entry.data.systemPromptPreview && (
        <CollapsibleSection
          title={`System Prompt (${entry.data.systemPromptLength} chars)`}
          icon={<span className="text-xs">🔧</span>}
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground max-h-32 overflow-y-auto">
            {entry.data.systemPromptPreview}
          </pre>
        </CollapsibleSection>
      )}

      {isRequest && entry.data.userPrompt && (
        <CollapsibleSection
          title="User Prompt"
          icon={<span className="text-xs">📝</span>}
          defaultOpen={true}
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-48 overflow-y-auto">
            {entry.data.userPrompt}
          </pre>
        </CollapsibleSection>
      )}

      {isRequest && entry.data.llmParams && (
        <CollapsibleSection
          title="LLM Parameters"
          icon={<span className="text-xs">⚙️</span>}
        >
          <div className="flex gap-4 text-xs">
            <span>
              <span className="text-muted-foreground">model:</span>{" "}
              {entry.data.llmParams.model}
            </span>
            <span>
              <span className="text-muted-foreground">max_tokens:</span>{" "}
              {entry.data.llmParams.maxTokens}
            </span>
            <span>
              <span className="text-muted-foreground">temperature:</span>{" "}
              {entry.data.llmParams.temperature}
            </span>
          </div>
        </CollapsibleSection>
      )}

      {/* Response details */}
      {!isRequest && entry.data.rawResponse && (
        <CollapsibleSection
          title={`Raw Response (${entry.data.responseLength} chars)`}
          icon={<span className="text-xs">📤</span>}
          defaultOpen={true}
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-64 overflow-y-auto">
            {entry.data.rawResponse}
          </pre>
        </CollapsibleSection>
      )}

      {!isRequest && entry.data.parsedResult !== undefined && (
        <CollapsibleSection
          title="Parsed Result"
          icon={<span className="text-xs">✅</span>}
        >
          <pre className="text-xs font-mono whitespace-pre-wrap text-foreground max-h-48 overflow-y-auto">
            {JSON.stringify(entry.data.parsedResult as Record<string, unknown>, null, 2)}
          </pre>
        </CollapsibleSection>
      )}
    </div>
  );
}

/**
 * ProcessingView - Shows LLM processing details (requests/responses) for outline generation.
 */
export default function ProcessingView({
  screens: _screens,
  stage1Output: _stage1Output,
  processingLog,
}: ProcessingViewProps) {
  return (
    <div className="processing-view h-full overflow-auto p-6 bg-muted/10">
      <div className="max-w-none space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">
            Outline Generation Log
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Cpu className="w-4 h-4" />
            <span>{processingLog.length} events</span>
          </div>
        </div>

        {processingLog.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Cpu className="w-8 h-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">
              No processing events yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              LLM calls will appear here when the outline is generated
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {processingLog.map((entry) => (
              <LogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
