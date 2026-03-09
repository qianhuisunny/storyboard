import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Search, Loader2, ExternalLink } from "lucide-react";
import type { OutlineBuilderProps, EvidenceMapEntry } from "./types";

/**
 * OutlineBuilder - Two-phase outline editor.
 * Phase 1: Edit outline → "Approve & Run Research Plan"
 * Phase 2: View evidence mapping table → "Continue to Storyboard Draft"
 */
export default function OutlineBuilder({
  content,
  onChange,
  onRunResearch,
  onContinue,
  isResearching = false,
  researchResults = null,
}: OutlineBuilderProps) {
  const [isEditing, setIsEditing] = useState(false);

  const hasResearch = researchResults && researchResults.evidence_map.length > 0;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border shrink-0">
        <h2 className="text-lg sm:text-xl font-semibold">Video Outline</h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {hasResearch
            ? "Review the evidence research results, then continue."
            : "Review and edit the outline, then run the research plan."}
        </p>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6" style={{ minHeight: 0 }}>
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Outline Text */}
          {!hasResearch && isEditing ? (
            <>
              <Textarea
                value={content}
                onChange={(e) => onChange(e.target.value)}
                className="min-h-[400px] sm:min-h-[500px] font-mono text-sm w-full"
                placeholder="Outline will appear here..."
              />
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(false)}
                >
                  Done Editing
                </Button>
              </div>
            </>
          ) : (
            <div
              className={`prose prose-sm max-w-none p-3 sm:p-4 bg-muted/30 rounded-lg ${
                hasResearch ? "" : "cursor-pointer hover:bg-muted/50"
              } transition-colors`}
              onClick={hasResearch ? undefined : () => setIsEditing(true)}
            >
              <pre className="whitespace-pre-wrap font-sans text-sm" style={{ wordBreak: "break-word" }}>
                {content || "No outline yet. Click to edit."}
              </pre>
            </div>
          )}

          {/* Research loading state */}
          {isResearching && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-primary animate-spin mr-3" />
              <span className="text-sm text-muted-foreground">
                Searching for evidence...
              </span>
            </div>
          )}

          {/* Evidence mapping table */}
          {hasResearch && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold">Evidence Research Results</h3>
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
              disabled={!content.trim() || isResearching}
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
      {/* Claim header */}
      <div className="px-4 py-2 bg-muted/40 border-b border-border">
        <p className="text-xs text-muted-foreground">{entry.section}</p>
        <p className="text-sm font-medium">{entry.claim}</p>
      </div>

      {/* Findings */}
      <div className="px-4 py-2">
        {entry.findings.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No results found</p>
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
