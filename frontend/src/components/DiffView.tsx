import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, ArrowLeftRight } from "lucide-react";

interface DiffViewProps {
  original: string;
  modified: string;
  originalLabel?: string;
  modifiedLabel?: string;
  className?: string;
}

type ViewMode = "side-by-side" | "inline" | "modified-only";

export default function DiffView({
  original,
  modified,
  originalLabel = "AI Version",
  modifiedLabel = "Your Version",
  className,
}: DiffViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [showDiff, setShowDiff] = useState(true);

  const hasChanges = original !== modified;

  // Simple word-level diff calculation
  const getDiff = () => {
    if (!hasChanges) return { added: 0, removed: 0 };

    const originalWords = original.split(/\s+/);
    const modifiedWords = modified.split(/\s+/);

    // Simple diff: count words that are different
    const originalSet = new Set(originalWords);
    const modifiedSet = new Set(modifiedWords);

    let added = 0;
    let removed = 0;

    modifiedWords.forEach((word) => {
      if (!originalSet.has(word)) added++;
    });

    originalWords.forEach((word) => {
      if (!modifiedSet.has(word)) removed++;
    });

    return { added, removed };
  };

  const diff = getDiff();

  if (!hasChanges) {
    return (
      <div className={cn("p-4 bg-muted/30 rounded-lg", className)}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Eye className="w-4 h-4" />
          No changes made
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm">{modified}</pre>
      </div>
    );
  }

  return (
    <div className={cn("border border-border rounded-lg overflow-hidden", className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Changes</span>
          {showDiff && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-green-600 bg-green-50 px-2 py-0.5 rounded">
                +{diff.added} added
              </span>
              <span className="text-red-600 bg-red-50 px-2 py-0.5 rounded">
                -{diff.removed} removed
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowDiff(!showDiff)}
            className="h-7 text-xs"
          >
            {showDiff ? (
              <>
                <EyeOff className="w-3 h-3 mr-1" />
                Hide Diff
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 mr-1" />
                Show Diff
              </>
            )}
          </Button>
          {showDiff && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setViewMode(viewMode === "side-by-side" ? "inline" : "side-by-side")
              }
              className="h-7 text-xs"
            >
              <ArrowLeftRight className="w-3 h-3 mr-1" />
              {viewMode === "side-by-side" ? "Inline" : "Side by Side"}
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      {showDiff ? (
        viewMode === "side-by-side" ? (
          <div className="grid grid-cols-2 divide-x divide-border">
            {/* Original */}
            <div className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                {originalLabel}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
                {original}
              </pre>
            </div>
            {/* Modified */}
            <div className="p-4">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {modifiedLabel}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm">{modified}</pre>
            </div>
          </div>
        ) : (
          /* Inline view */
          <div className="p-4">
            <div className="space-y-2">
              <div className="p-2 bg-red-50 border-l-2 border-red-400 rounded-r">
                <div className="text-xs font-medium text-red-600 mb-1">
                  {originalLabel} (removed)
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-red-800 line-through">
                  {original}
                </pre>
              </div>
              <div className="p-2 bg-green-50 border-l-2 border-green-400 rounded-r">
                <div className="text-xs font-medium text-green-600 mb-1">
                  {modifiedLabel} (added)
                </div>
                <pre className="whitespace-pre-wrap font-sans text-sm text-green-800">
                  {modified}
                </pre>
              </div>
            </div>
          </div>
        )
      ) : (
        /* No diff - just show modified */
        <div className="p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm">{modified}</pre>
        </div>
      )}
    </div>
  );
}
