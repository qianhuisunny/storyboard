import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EventNode, type QualityLogEntry } from "./EventNode";

interface Chain {
  root_id: number;
  events: QualityLogEntry[];
}

interface StageGroup {
  stage: string;
  chains: Chain[];
}

interface ChainTimelineProps {
  stages: StageGroup[];
  selectedId: number | null;
  onSelect: (entry: QualityLogEntry) => void;
}

function chainSummary(events: QualityLogEntry[]): string {
  const attempts = events.filter((e) => e.event === "generate").length;
  const lastEval = [...events].reverse().find((e) => e.event === "eval");
  const passed = lastEval?.scores?.passed;
  const score = lastEval?.scores?.composite_score;
  const parts: string[] = [];
  if (attempts > 1) parts.push(`${attempts} attempts`);
  if (score != null) parts.push(`score: ${score.toFixed(1)}`);
  if (passed != null) parts.push(passed ? "passed" : "failed");
  return parts.join("  ·  ");
}

const STAGE_LABELS: Record<string, string> = {
  outline: "Outline (Director)",
  storyboard: "Storyboard (Writer)",
};

export function ChainTimeline({ stages, selectedId, onSelect }: ChainTimelineProps) {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const toggle = (rootId: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(rootId)) next.delete(rootId);
      else next.add(rootId);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {stages.map((sg) => (
        <div key={sg.stage}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {STAGE_LABELS[sg.stage] ?? sg.stage}
          </h3>
          <div className="space-y-3">
            {sg.chains.map((chain) => {
              const isCollapsed = collapsed.has(chain.root_id);
              return (
                <div key={chain.root_id} className="rounded-lg border bg-card">
                  <button
                    onClick={() => toggle(chain.root_id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="font-medium">
                      Chain #{chain.root_id}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {chainSummary(chain.events)}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <div className="relative ml-6 border-l border-border pb-2">
                      {chain.events.map((entry) => (
                        <div key={entry.id} className="relative pl-4 -ml-px">
                          <div className="absolute left-0 top-4 h-2 w-2 -translate-x-[5px] rounded-full border-2 border-background bg-border" />
                          <EventNode
                            entry={entry}
                            isSelected={entry.id === selectedId}
                            onClick={() => onSelect(entry)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
