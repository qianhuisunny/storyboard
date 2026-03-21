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
import { Check, Search, Loader2, ChevronDown, ChevronRight, PanelRight } from "lucide-react";
import { cn } from "@/lib/utils";
import OutlineGrid from "./OutlineGrid";
import AiOriginalDrawer from "./AiOriginalDrawer";
import { parseOutline, serializeOutline } from "./outlineParser";
import type {
  OutlineBuilderProps,
  OutlineSection,
  SectionResearch,
  EvidenceItemResearch,
  TalkingPointResearch,
  ResearchBlock,
} from "./types";

export default function OutlineBuilder({
  content,
  aiContent,
  onChange,
  onRunResearch,
  onContinue,
  isResearching = false,
  researchResults = null,
}: OutlineBuilderProps) {
  const [isContinuing, setIsContinuing] = useState(false);

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

  // Handle inserting a new section at a given index
  const handleInsertSection = useCallback(
    (atIndex: number) => {
      const newSection: OutlineSection = {
        id: crypto.randomUUID(),
        sectionNumber: atIndex + 1,
        title: "New Section",
        purpose: "",
        entryAssumption: "",
        exitState: "",
        duration: "1:00–2:00",
        talkingPoints: [],
        evidenceNeeded: [],
      };
      const updated = [...sections];
      updated.splice(atIndex, 0, newSection);
      // Renumber all sections
      const renumbered = updated.map((s, i) => ({
        ...s,
        sectionNumber: i + 1,
      }));
      propagate(renumbered);
    },
    [sections, propagate]
  );

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Show drawer trigger only when both AI and human versions exist (user has edited)
  const hasAiOriginal = Boolean(aiContent && content && aiContent !== content);

  const hasResearch =
    researchResults && researchResults.sections && researchResults.sections.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-6 sm:px-10 py-4 sm:py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Video Outline</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {hasResearch
                ? "Review the evidence research results, then continue."
                : "Edit sections inline. Drag to reorder. Then run the research plan."}
            </p>
          </div>
          {hasAiOriginal && (
            <button
              onClick={() => setIsDrawerOpen(!isDrawerOpen)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                isDrawerOpen
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:border-primary hover:text-primary"
              )}
            >
              <PanelRight className="w-4 h-4" />
              View AI Original
            </button>
          )}
        </div>
      </div>

      {/* Content Area + Drawer */}
      <div className="flex-1 flex min-h-0">
        {/* Main scrollable content */}
        <div
          className="flex-1 overflow-y-auto px-6 sm:px-10 py-6 min-w-0"
        >
          <div className="w-full max-w-5xl space-y-6">
          {/* Section: Video Outline */}
          <div id="outline">
            {sections.length > 0 ? (
              <OutlineGrid
                sections={sections}
                onReorder={handleReorder}
                onUpdateSection={handleUpdateSection}
                onInsertSection={handleInsertSection}
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
              <div className="py-3 mb-4">
                <h2 className="text-xl font-semibold">Evidence Research Results</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
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

        {/* AI Original Drawer */}
        {hasAiOriginal && aiContent && (
          <AiOriginalDrawer
            aiContent={aiContent}
            isOpen={isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
          />
        )}
      </div>

      {/* Action Footer */}
      <div className="px-6 sm:px-10 py-3 sm:py-4 border-t border-border bg-muted/20 shrink-0">
        <div className="w-full flex justify-end">
          {hasResearch ? (
            <Button
              onClick={async () => {
                setIsContinuing(true);
                try { await onContinue(); } finally { setIsContinuing(false); }
              }}
              disabled={isContinuing}
            >
              {isContinuing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {isContinuing ? "Generating storyboard..." : "Continue to Storyboard Draft"}
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

/** Section-level research card — detects v0317 (evidence_items) vs v0316 (talking_points) */
function SectionResearchCard({ section }: { section: SectionResearch }) {
  const [isExpanded, setIsExpanded] = useState(true);

  const isNewSchema = section.evidence_items && section.evidence_items.length > 0;
  const items = isNewSchema ? section.evidence_items! : [];
  const legacyTPs = !isNewSchema ? (section.talking_points ?? []) : [];

  const itemCount = isNewSchema ? items.length : legacyTPs.length;
  const researchedCount = isNewSchema
    ? items.filter((item) => item.research_blocks.length > 0).length
    : legacyTPs.filter((tp) => tp.research_blocks.length > 0).length;

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
          {researchedCount}/{itemCount} evidence items
        </span>
      </button>

      {isExpanded && (
        <div className="p-4 space-y-4">
          {isNewSchema
            ? items.map((item, j) => <EvidenceItemCard key={j} item={item} />)
            : legacyTPs.map((tp, j) => <TalkingPointCard key={j} tp={tp} />)
          }
        </div>
      )}
    </div>
  );
}

/** Evidence item with its research blocks (v0317) */
function EvidenceItemCard({ item }: { item: EvidenceItemResearch }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{item.evidence_needed}</p>
      {item.research_blocks.map((block, k) => (
        <ResearchBlockCard key={k} block={block} />
      ))}
      {item.research_blocks.length === 0 && (
        <p className="text-xs text-muted-foreground italic pl-1">
          No research needed
        </p>
      )}
    </div>
  );
}

/** Talking point with its research blocks (v0316 fallback) */
function TalkingPointCard({ tp }: { tp: TalkingPointResearch }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{tp.talking_point}</p>
      {tp.research_blocks.map((block, k) => (
        <ResearchBlockCard key={k} block={block} />
      ))}
      {tp.research_blocks.length === 0 && (
        <p className="text-xs text-muted-foreground italic pl-1">
          No research needed
        </p>
      )}
    </div>
  );
}

/** Single research block — phrasing is the star */
function ResearchBlockCard({ block }: { block: ResearchBlock }) {
  const [showDetails, setShowDetails] = useState(false);

  const confidenceColors: Record<string, string> = {
    high: "text-[#3A6B47]",
    medium: "text-[#7A5C1E]",
    low: "text-[#A63228]",
  };

  return (
    <div className="border border-border rounded-md">
      {/* Research question — compact */}
      <div className="px-3 py-1.5">
        <p className="text-xs text-muted-foreground">{block.research_question}</p>
      </div>

      {/* Storyboard-usable phrasing — primary content */}
      <div className="px-3 py-2 border-t border-border">
        <ul className="space-y-1">
          {block.storyboard_usable_phrasing.map((line, i) => (
            <li key={i} className="text-sm text-foreground flex items-start gap-2">
              <Check className="w-3.5 h-3.5 text-[#3A6B47] mt-0.5 flex-shrink-0" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Full answer + sources — secondary, collapsible */}
      <div className="px-3 py-1.5 border-t border-border bg-muted/10">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {showDetails ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
          <span>Full answer &amp; sources</span>
          <span className="text-[10px]">·</span>
          <span
            className={cn(
              "text-[10px] font-medium capitalize",
              confidenceColors[block.confidence] || confidenceColors.medium
            )}
          >
            {block.confidence}
          </span>
        </button>
        {showDetails && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs text-muted-foreground">{block.full_answer}</p>
            {block.sources.length > 0 && (
              <div className="text-[10px] text-muted-foreground">
                {block.sources.map((s, i) => (
                  <p key={i}>{s}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
