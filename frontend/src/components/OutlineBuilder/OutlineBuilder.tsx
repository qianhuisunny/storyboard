/**
 * OutlineBuilder — Two-phase structured outline editor.
 * Phase 1: Structured grid editor → "Approve & Run Research Plan"
 * Phase 2: Evidence results → "Continue to Storyboard Draft"
 *
 * Parses Director's plain text into OutlineSection[] for visual editing,
 * serializes back to text for backend storage.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Search, Loader2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import OutlineGrid from "./OutlineGrid";
import { parseOutline, serializeOutline } from "./outlineParser";
import type {
  OutlineBuilderProps,
  OutlineSection,
  SectionResearch,
  EvidenceTask,
} from "./types";

export default function OutlineBuilder({
  content,
  onChange,
  onRunResearch,
  onContinue,
  isResearching = false,
  researchResults = null,
}: OutlineBuilderProps) {
  // Parse text → sections on mount and when content changes externally
  const [sections, setSections] = useState<OutlineSection[]>(() =>
    parseOutline(content)
  );

  // Track whether we initiated the content change (to avoid parse loop)
  const internalUpdate = useRef(false);

  // Sync sections when content changes externally (e.g., page refresh restore)
  useEffect(() => {
    if (internalUpdate.current) {
      internalUpdate.current = false;
      return;
    }
    setSections(parseOutline(content));
  }, [content]);

  // Propagate section changes → serialize → onChange
  const propagate = useCallback(
    (updated: OutlineSection[]) => {
      setSections(updated);
      internalUpdate.current = true;
      onChange(serializeOutline(updated));
    },
    [onChange]
  );

  // Handle individual section field update
  const handleUpdateSection = useCallback(
    (id: string, updates: Partial<OutlineSection>) => {
      propagate(
        sections.map((s) => (s.id === id ? { ...s, ...updates } : s))
      );
    },
    [sections, propagate]
  );

  // Handle reorder
  const handleReorder = useCallback(
    (reordered: OutlineSection[]) => {
      propagate(reordered);
    },
    [propagate]
  );

  const hasResearch =
    researchResults && researchResults.sections && researchResults.sections.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
        <h2 className="text-lg sm:text-xl font-semibold">Video Outline</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {hasResearch
            ? "Review the evidence research results, then continue."
            : "Edit sections inline. Drag to reorder. Then run the research plan."}
        </p>
      </div>

      {/* Content Area */}
      <div
        className="flex-1 overflow-y-auto p-4 sm:p-6"
        style={{ minHeight: 0 }}
      >
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Section: Video Outline */}
          <div id="outline">
            {sections.length > 0 ? (
              <OutlineGrid
                sections={sections}
                onReorder={handleReorder}
                onUpdateSection={handleUpdateSection}
                disabled={!!hasResearch}
              />
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No outline yet. The Director will generate one after you approve
                the brief.
              </div>
            )}
          </div>

          {/* Research loading state */}
          {isResearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin mr-3" />
              <span className="text-sm text-muted-foreground">
                Researching evidence across sections...
              </span>
            </div>
          )}

          {/* Section: Evidence Research Results (3-layer) */}
          {hasResearch && (
            <div id="evidence" className="pt-6 border-t-2 border-border">
              <div className="px-4 sm:px-6 py-3 mb-4">
                <h2 className="text-lg sm:text-xl font-semibold">Evidence Research Results</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Structured evidence gathered per section. Review usable lines, then continue.
                </p>
              </div>
              <div className="space-y-6">
                {researchResults.sections.map((section, i) => (
                  <SectionResearchCard key={i} section={section} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-border bg-muted/20 shrink-0">
        <div className="max-w-5xl mx-auto flex justify-end">
          {hasResearch ? (
            <Button onClick={onContinue}>
              <Check className="w-4 h-4 mr-2" />
              Continue to Storyboard Draft
            </Button>
          ) : (
            <Button
              onClick={onRunResearch}
              disabled={sections.length === 0 || isResearching}
            >
              {isResearching ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Search className="w-4 h-4 mr-2" />
              )}
              Approve & Run Research Plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Section-level research card with brief and evidence tasks */
function SectionResearchCard({ section }: { section: SectionResearch }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const taskCount = section.evidence_tasks.length;
  const foundCount = section.evidence_tasks.filter(
    (t) => t.selected_evidence
  ).length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Section header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 bg-muted/40 border-b border-border flex items-center gap-2 hover:bg-muted/60 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{section.section_title}</p>
        </div>
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {foundCount}/{taskCount} found
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Research brief */}
          <div className="text-sm text-muted-foreground bg-muted/20 rounded-md p-3">
            <span className="font-medium text-foreground">Research brief: </span>
            {section.research_brief}
          </div>

          {/* Evidence tasks */}
          <div className="space-y-3">
            {section.evidence_tasks.map((task, j) => (
              <EvidenceTaskCard key={j} task={task} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Single evidence task card with selected evidence */
function EvidenceTaskCard({ task }: { task: EvidenceTask }) {
  const priorityColors: Record<string, string> = {
    required: "bg-[#FBF0ED] text-[#C4644A]",
    helpful: "bg-[#FBF6ED] text-[#C4963C]",
    optional: "bg-muted text-muted-foreground",
  };

  const confidenceColors: Record<string, string> = {
    high: "text-[#5E8C61]",
    medium: "text-[#C4963C]",
    low: "text-[#C4644A]",
  };

  const ev = task.selected_evidence;

  return (
    <div className="border border-border rounded-md">
      {/* Task header */}
      <div className="px-3 py-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{task.task_label}</span>
            <span
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase tracking-wider",
                priorityColors[task.priority] || priorityColors.optional
              )}
            >
              {task.priority}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              {task.evidence_type.replace(/_/g, " ")}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Supports: {task.supports}
          </p>
        </div>
      </div>

      {/* Selected evidence */}
      <div className="px-3 py-2 border-t border-border bg-muted/10">
        {ev ? (
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-[#5E8C61] mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={ev.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                >
                  {ev.source_title}
                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                </a>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] text-muted-foreground capitalize">
                    {ev.source_type} source
                  </span>
                  <span className="text-[10px]">·</span>
                  <span
                    className={cn(
                      "text-[10px] font-medium capitalize",
                      confidenceColors[ev.confidence] || confidenceColors.medium
                    )}
                  >
                    {ev.confidence} confidence
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground pl-5">
              {ev.evidence_summary}
            </p>
            <div className="pl-5 mt-1">
              <p className="text-sm text-foreground bg-muted/30 rounded px-2 py-1 italic">
                "{ev.usable_line}"
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            No suitable source found
          </p>
        )}
      </div>
    </div>
  );
}
