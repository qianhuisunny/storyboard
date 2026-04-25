import { Zap, ClipboardCheck, PenLine, CheckCircle } from "lucide-react";

export interface QualityLogEntry {
  id: number;
  event: "generate" | "eval" | "override" | "approve";
  stage: string;
  scope: string | null;
  attempt: number | null;
  model: string | null;
  prompt_ref: string | null;
  context: string | null;
  raw_response: string | null;
  parsed_output: unknown;
  scores: {
    passed?: boolean;
    composite_score?: number;
    gut?: { score: number; feedback: string };
    dimensions?: Array<{ dimension: string; score: number; feedback: string }>;
    attempt?: number;
    total_attempts?: number;
  } | null;
  instruction: string | null;
  before_content: string | null;
  after_content: string | null;
  parent_id: number | null;
  created_at: number;
}

const EVENT_CONFIG: Record<
  QualityLogEntry["event"],
  { icon: typeof Zap; label: string; color: string }
> = {
  generate: { icon: Zap, label: "Generate", color: "text-blue-600 bg-blue-50 border-blue-200" },
  eval: { icon: ClipboardCheck, label: "Evaluate", color: "text-violet-600 bg-violet-50 border-violet-200" },
  override: { icon: PenLine, label: "Override", color: "text-amber-600 bg-amber-50 border-amber-200" },
  approve: { icon: CheckCircle, label: "Approve", color: "text-green-600 bg-green-50 border-green-200" },
};

interface EventNodeProps {
  entry: QualityLogEntry;
  isSelected: boolean;
  onClick: () => void;
}

function formatTime(epoch: number): string {
  return new Date(epoch * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getSummary(entry: QualityLogEntry): string {
  switch (entry.event) {
    case "generate":
      return `Attempt ${entry.attempt ?? "?"}  ·  ${entry.model ?? ""}`;
    case "eval": {
      const s = entry.scores;
      if (!s) return "";
      const verdict = s.passed ? "PASS" : "FAIL";
      return `${verdict}  ·  ${s.composite_score?.toFixed(1) ?? "—"}`;
    }
    case "override":
      return entry.scope ?? "";
    case "approve":
      return entry.scope === "full" ? "Full stage approved" : (entry.scope ?? "");
  }
}

export function EventNode({ entry, isSelected, onClick }: EventNodeProps) {
  const config = EVENT_CONFIG[entry.event];
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      className={`w-full text-left flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
        isSelected
          ? "border-foreground/20 bg-muted/60 shadow-sm"
          : "border-transparent hover:bg-muted/40"
      }`}
    >
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${config.color}`}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{config.label}</span>
          <span className="text-xs text-muted-foreground">{formatTime(entry.created_at)}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{getSummary(entry)}</p>
      </div>
    </button>
  );
}
