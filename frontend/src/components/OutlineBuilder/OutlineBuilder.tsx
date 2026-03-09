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
import { Check, Search, Loader2, ExternalLink } from "lucide-react";
import OutlineGrid from "./OutlineGrid";
import { parseOutline, serializeOutline } from "./outlineParser";
import type { OutlineBuilderProps, EvidenceMapEntry, OutlineSection } from "./types";

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
    researchResults && researchResults.evidence_map.length > 0;

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
                Searching for evidence...
              </span>
            </div>
          )}

          {/* Section: Evidence Research Results */}
          {hasResearch && (
            <div id="evidence" className="pt-6 border-t-2 border-border">
              <div className="px-4 sm:px-6 py-3 mb-4">
                <h2 className="text-lg sm:text-xl font-semibold">Evidence Research Results</h2>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Evidence gathered for each claim in the outline. Review, then continue.
                </p>
              </div>
              <div className="space-y-3">
                {researchResults.evidence_map.map((entry, i) => (
                  <EvidenceCard key={i} entry={entry} />
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

/** Single evidence claim card with findings */
function EvidenceCard({ entry }: { entry: EvidenceMapEntry }) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-muted/40 border-b border-border">
        <p className="text-xs text-muted-foreground">{entry.section}</p>
        <p className="text-sm font-medium">{entry.claim}</p>
      </div>
      <div className="px-4 py-2">
        {entry.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No results found
          </p>
        ) : (
          <div className="space-y-2">
            {entry.findings.map((finding, j) => (
              <div key={j} className="text-sm">
                <a
                  href={finding.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {finding.title}
                  <ExternalLink className="w-3 h-3" />
                </a>
                <span className="text-xs text-muted-foreground ml-2">
                  {finding.source_domain}
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {finding.snippet}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
