/**
 * OutlineBuilder — Two-phase structured outline editor.
 * Phase 1: Structured grid editor → "Approve & Generate Storyboard"
 * Phase 2: Optional evidence review when research data already exists
 *
 * Parses Director's plain text into OutlineSection[] for visual editing,
 * serializes back to text for backend storage.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Loader2, PanelRight, RefreshCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import OutlineGrid from "./OutlineGrid";
import AiOriginalDrawer from "./AiOriginalDrawer";
import { QualityScore } from "../QualityScore";
import { RegenPopover } from "./RegenPopover";
import StoryboardLoadingPanel from "../StoryboardLoadingPanel";
import { BouncingDots } from "../ui/bouncing-dots";
import { parseOutline, serializeOutline } from "./outlineParser";
import type {
  OutlineBuilderProps,
  OutlineSection,
  EvidenceResearch,
  SectionResearch,
  ResearchBlock,
} from "./types";

export default function OutlineBuilder({
  content,
  aiContent,
  onChange,
  onRerunResearch,
  onContinue,
  onRegenerateSection,
  onRefineOutline,
  isResearching = false,
  researchResults = null,
  researchProgress = null,
  outlineEval = null,
  onGeneratingStateChange,
}: OutlineBuilderProps) {
  const [isContinuing, setIsContinuing] = useState(false);
  const [isRerunningResearch, setIsRerunningResearch] = useState(false);
  const [regeneratingSectionNumber, setRegeneratingSectionNumber] = useState<number | null>(null);
  const [isRefiningOutline, setIsRefiningOutline] = useState(false);
  const [showOutlineRegenPopover, setShowOutlineRegenPopover] = useState(false);

  // Snippet deletion: key = "sectionIdx-evidenceIdx-blockIdx", value = set of struck phrase indices
  const [deletedSnippets, setDeletedSnippets] = useState<Record<string, Set<number>>>({});

  const toggleSnippet = useCallback((key: string, phraseIdx: number) => {
    setDeletedSnippets((prev) => {
      const next = { ...prev };
      const set = new Set(next[key] || []);
      if (set.has(phraseIdx)) {
        set.delete(phraseIdx);
      } else {
        set.add(phraseIdx);
      }
      next[key] = set;
      return next;
    });
  }, []);

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

  // Handle removing a section (local only, no LLM call)
  const handleRemoveSection = useCallback(
    (id: string) => {
      const updated = sections.filter((s) => s.id !== id);
      const renumbered = updated.map((s, i) => ({
        ...s,
        sectionNumber: i + 1,
      }));
      propagate(renumbered);
    },
    [sections, propagate]
  );

  // Handle regenerating a single section
  const handleRegenerateSection = useCallback(
    async (sectionNumber: number, instruction: string) => {
      if (!onRegenerateSection) return;
      setRegeneratingSectionNumber(sectionNumber);
      try {
        await onRegenerateSection(sectionNumber, instruction);
      } finally {
        setRegeneratingSectionNumber(null);
      }
    },
    [onRegenerateSection]
  );

  // Handle regenerating the full outline
  const handleRefineOutline = useCallback(async (instruction: string) => {
    if (!onRefineOutline || !instruction.trim()) return;
    setIsRefiningOutline(true);
    try {
      await onRefineOutline(instruction.trim());
    } finally {
      setIsRefiningOutline(false);
    }
  }, [onRefineOutline]);

  /** Return research with struck-through snippets filtered out (used by continue handler). */
  const getFilteredEvidence = useCallback((): EvidenceResearch | null => {
    if (!researchResults) return null;
    return {
      sections: researchResults.sections.map((sec, si) => ({
        ...sec,
        evidence_items: sec.evidence_items?.map((ei, ei_idx) => ({
          ...ei,
          research_blocks: ei.research_blocks.map((rb, bi) => {
            const key = `${si}-${ei_idx}-${bi}`;
            const struck = deletedSnippets[key];
            if (!struck || struck.size === 0) return rb;
            return {
              ...rb,
              storyboard_usable_phrasing: rb.storyboard_usable_phrasing.filter((_, pi) => !struck.has(pi)),
            };
          }),
        })),
        talking_points: sec.talking_points?.map((tp, tp_idx) => ({
          ...tp,
          research_blocks: tp.research_blocks.map((rb, bi) => {
            const key = `${si}-tp${tp_idx}-${bi}`;
            const struck = deletedSnippets[key];
            if (!struck || struck.size === 0) return rb;
            return {
              ...rb,
              storyboard_usable_phrasing: rb.storyboard_usable_phrasing.filter((_, pi) => !struck.has(pi)),
            };
          }),
        })),
      })),
    };
  }, [researchResults, deletedSnippets]);

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
            <h2 className="text-xl font-semibold">
              {isContinuing ? "Storyboard Draft" : "Video Outline"}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isContinuing
                ? "Generating your storyboard..."
                : hasResearch
                ? "Review the evidence research results, then continue."
                : "Edit sections inline, drag to reorder, then approve to generate the storyboard."}
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
          {isContinuing ? (
            <StoryboardLoadingPanel loaderState={{ kind: "indeterminate" }} sectionCount={sections.length || 6} />
          ) : (
          <div className="w-full max-w-5xl space-y-6">
          <p className="text-sm text-muted-foreground leading-relaxed mb-5">
            Review each section before moving on. What you confirm here shapes everything the writer produces downstream.
          </p>
          {outlineEval && <QualityScore eval={outlineEval} />}

          {/* Section: Video Outline */}
          <div id="outline">
            {sections.length > 0 ? (
              <div className="border border-border rounded-[10px] mb-6">
                {/* Header — same grid as section rows for sparkle alignment */}
                <div className="grid grid-cols-[28px_40px_1fr_32px] gap-x-2 items-center px-5 py-3 border-b border-border">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground" style={{ gridColumn: "1 / 4" }}>
                    Video Outline
                  </h3>
                  {onRefineOutline && (
                    <button
                      onClick={() => setShowOutlineRegenPopover((v) => !v)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all justify-self-center"
                      title="Regenerate entire outline"
                    >
                      <Sparkles className="w-[15px] h-[15px]" />
                    </button>
                  )}
                </div>

                {/* Outline-level regen popover */}
                {showOutlineRegenPopover && (
                  <div className="mx-5 my-3">
                    <RegenPopover
                      title="Regenerate entire outline"
                      onRegenerate={(instruction) => {
                        handleRefineOutline(instruction);
                        setShowOutlineRegenPopover(false);
                      }}
                      onClose={() => setShowOutlineRegenPopover(false)}
                      isRegenerating={isRefiningOutline}
                    />
                  </div>
                )}

                {/* Grid content */}
                <div className="px-5">
                  <OutlineGrid
                    sections={sections}
                    onReorder={handleReorder}
                    onUpdateSection={handleUpdateSection}
                    onInsertSection={handleInsertSection}
                    onRemoveSection={handleRemoveSection}
                    onRegenerateSection={onRegenerateSection ? handleRegenerateSection : undefined}
                    regeneratingSectionNumber={regeneratingSectionNumber}
                  />
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                No outline yet. The Director will generate one after you approve
                the brief.
              </div>
            )}
          </div>

          {/* Section: Evidence Research */}
          {(hasResearch || isResearching) && (
            <div className="border border-border rounded-[10px]" id="evidence">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Evidence Research
                </h3>
                {onRerunResearch && hasResearch && (
                  <button
                    onClick={async () => {
                      setIsRerunningResearch(true);
                      try { await onRerunResearch(); } finally { setIsRerunningResearch(false); }
                    }}
                    disabled={isRerunningResearch}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRerunningResearch ? "animate-spin" : ""}`} />
                    Re-run Research
                  </button>
                )}
              </div>
              <div className="px-5">
                {/* Render completed sections as they arrive */}
                {researchResults?.sections.map((sectionRes, i) => (
                  <SectionResearchCard
                    key={i}
                    sectionRes={sectionRes}
                    sectionIndex={i}
                    deletedSnippets={deletedSnippets}
                    onToggleSnippet={toggleSnippet}
                  />
                ))}
                {/* Progress indicator while researching */}
                {isResearching && (
                  <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">
                      {researchProgress
                        ? `${researchProgress.completed} of ${researchProgress.total} sections researched...`
                        : "Researching evidence across sections..."}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
          )}
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
        <div className="w-full flex justify-end gap-3">
          <Button
            onClick={async () => {
              setIsContinuing(true);
              onGeneratingStateChange?.(true);
              try {
                await Promise.all([
                  onContinue(hasResearch ? getFilteredEvidence() : null),
                  new Promise((r) => setTimeout(r, 1500)),
                ]);
              } finally {
                setIsContinuing(false);
                onGeneratingStateChange?.(false);
              }
            }}
            disabled={isContinuing || sections.length === 0}
          >
            {isContinuing ? (
              <>
                <BouncingDots size={7} gap={4} light />
                <span className="ml-2">Generating storyboard…</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Approve & Generate Storyboard
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Confidence color mapping for research blocks */
const CONFIDENCE_STYLES = {
  high: { border: "#3A6B47", badgeBg: "rgba(58,107,71,0.1)", badgeText: "#3A6B47" },
  medium: { border: "#B8960C", badgeBg: "rgba(184,150,12,0.1)", badgeText: "#7A5C1E" },
  low: { border: "#A63228", badgeBg: "rgba(166,50,40,0.1)", badgeText: "#A63228" },
} as const;

/** Single research block — confidence-first with colored left accent */
function ResearchBlockCard({
  block,
  blockKey,
  deletedIndices,
  onToggleSnippet,
}: {
  block: ResearchBlock;
  blockKey: string;
  deletedIndices?: Set<number>;
  onToggleSnippet?: (key: string, idx: number) => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const style = CONFIDENCE_STYLES[block.confidence] || CONFIDENCE_STYLES.medium;

  return (
    <div
      className="py-2.5 px-3.5 mb-3 rounded-r-md last:mb-0"
      style={{ borderLeft: `3px solid ${style.border}`, background: "rgba(245,245,243,0.3)" }}
    >
      {/* Header: question + confidence badge */}
      <div className="flex items-center gap-2.5 mb-2">
        <span className="flex-1 text-xs text-muted-foreground">{block.research_question}</span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded shrink-0"
          style={{ background: style.badgeBg, color: style.badgeText }}
        >
          {block.confidence}
        </span>
      </div>

      {/* Snippet lines — clickable with strikethrough */}
      {block.storyboard_usable_phrasing.map((line, i) => {
        const isStruck = deletedIndices?.has(i) ?? false;
        return (
          <div
            key={i}
            onClick={() => onToggleSnippet?.(blockKey, i)}
            className={`group/snippet flex items-start gap-2 py-1 rounded cursor-pointer hover:bg-muted/30 transition-opacity ${
              isStruck ? "opacity-40" : ""
            }`}
          >
            <span className={`text-sm leading-relaxed flex-1 ${isStruck ? "line-through decoration-muted-foreground/35" : ""}`}>
              {line}
            </span>
            <span className="w-5 h-5 flex items-center justify-center shrink-0 text-muted-foreground opacity-0 group-hover/snippet:opacity-60 hover:!opacity-100 hover:text-destructive text-lg">
              &times;
            </span>
          </div>
        );
      })}

      {/* Expandable sources */}
      {block.sources.length > 0 && (
        <>
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1 cursor-pointer"
          >
            <span>{showDetails ? "\u25BE" : "\u25B8"}</span>
            Sources: {block.sources[0]}
            {block.sources.length > 1 && ` (+${block.sources.length - 1})`}
          </button>
          {showDetails && (
            <div className="text-[11px] text-muted-foreground leading-relaxed pt-1 pl-3">
              {block.sources.map((s, i) => <div key={i}>{s}</div>)}
              {block.full_answer && (
                <div className="mt-2 italic">{block.full_answer}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Section-level research card — detects v0317 (evidence_items) vs v0316 (talking_points) */
function SectionResearchCard({
  sectionRes,
  sectionIndex,
  deletedSnippets,
  onToggleSnippet,
}: {
  sectionRes: SectionResearch;
  sectionIndex: number;
  deletedSnippets: Record<string, Set<number>>;
  onToggleSnippet: (key: string, idx: number) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const evidenceItems = sectionRes.evidence_items || [];
  const talkingPoints = sectionRes.talking_points || [];
  const itemCount = evidenceItems.length || talkingPoints.length;

  return (
    <div className="py-4 border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="flex items-center gap-2 w-full text-left"
      >
        <span className="text-muted-foreground text-xs">{isExpanded ? "\u25BE" : "\u25B8"}</span>
        <span className="text-sm font-semibold flex-1">{sectionRes.section_title}</span>
        <span className="text-xs text-muted-foreground">{itemCount} evidence items</span>
      </button>

      {isExpanded && (
        <div className="pl-6 mt-3">
          {evidenceItems.map((item, ei) => (
            <div key={ei}>
              <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{item.evidence_needed}</div>
              {item.research_blocks.map((block, bi) => {
                const key = `${sectionIndex}-${ei}-${bi}`;
                return (
                  <ResearchBlockCard
                    key={bi}
                    block={block}
                    blockKey={key}
                    deletedIndices={deletedSnippets[key]}
                    onToggleSnippet={onToggleSnippet}
                  />
                );
              })}
            </div>
          ))}
          {!evidenceItems.length && talkingPoints.map((tp, ti) => (
            <div key={ti}>
              <div className="text-[13px] font-medium mb-1.5 mt-3 first:mt-0">{tp.talking_point}</div>
              {tp.research_blocks.map((block, bi) => {
                const key = `${sectionIndex}-tp${ti}-${bi}`;
                return (
                  <ResearchBlockCard
                    key={bi}
                    block={block}
                    blockKey={key}
                    deletedIndices={deletedSnippets[key]}
                    onToggleSnippet={onToggleSnippet}
                  />
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
