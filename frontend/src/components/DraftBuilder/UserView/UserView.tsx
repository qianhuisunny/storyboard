import { useState } from "react";
import { Plus, Clock, Film, FileText, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import PanelCard from "./PanelCard";
import type { UserViewProps, ProductionScreen } from "../types";
import { calculateTotalDuration, formatDuration, normalizeProductionScreen } from "../types";

/**
 * UserView - Visual editor for the storyboard draft.
 * Displays production screens as cards with drag-drop reordering and inline editing.
 */
export default function UserView({
  screens,
  outlineSummary,
  onScreensChange,
  onConfirm,
}: UserViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const totalDuration = calculateTotalDuration(screens);
  const totalWords = screens.reduce(
    (sum, s) => sum + (s.voiceover_text?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  const handleScreenChange = (index: number, updatedScreen: ProductionScreen) => {
    const newScreens = [...screens];
    newScreens[index] = updatedScreen;
    onScreensChange(newScreens);
  };

  const handleDeleteScreen = (index: number) => {
    const newScreens = screens.filter((_, i) => i !== index);
    // Renumber screens
    const renumbered = newScreens.map((s, i) => ({ ...s, screen_number: i + 1 }));
    onScreensChange(renumbered);
    if (expandedIndex === index) {
      setExpandedIndex(null);
    } else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  };

  const handleMoveScreen = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= screens.length) return;

    const newScreens = [...screens];
    [newScreens[index], newScreens[newIndex]] = [newScreens[newIndex], newScreens[index]];
    // Renumber screens
    const renumbered = newScreens.map((s, i) => ({ ...s, screen_number: i + 1 }));
    onScreensChange(renumbered);

    // Update expanded index
    if (expandedIndex === index) {
      setExpandedIndex(newIndex);
    } else if (expandedIndex === newIndex) {
      setExpandedIndex(index);
    }
  };

  const handleAddScreen = () => {
    const newScreen = normalizeProductionScreen(
      {
        screen_type: "demo",
        voiceover_text: "",
        visual_direction: [],
        target_duration_sec: 5,
      },
      screens.length
    );
    onScreensChange([...screens, newScreen]);
    setExpandedIndex(screens.length);
  };

  return (
    <div className="user-view h-full flex flex-col">
      {/* Header with Summary */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Storyboard Draft
            </h2>
            <p className="text-sm text-muted-foreground">
              Review and refine your production-ready storyboard panels.
            </p>
          </div>

          {/* Stats Summary */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {formatDuration(totalDuration)}
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
              <Layers className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {screens.length} panels
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                {totalWords} words
              </span>
            </div>
          </div>
        </div>

        {/* Context Pills */}
        {outlineSummary && (
          <div className="flex flex-wrap gap-2 mt-3">
            {outlineSummary.video_type && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs">
                <Film className="w-3 h-3" />
                {outlineSummary.video_type}
              </div>
            )}
            {outlineSummary.target_duration && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Target: {outlineSummary.target_duration}s
              </div>
            )}
          </div>
        )}
      </header>

      {/* Panel Cards */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          {screens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No panels yet. Add your first panel to get started.</p>
            </div>
          ) : (
            <>
              {/* Timeline connector */}
              <div className="relative">
                {screens.map((screen, index) => (
                  <div key={`${screen.screen_number}-${index}`} className="relative">
                    {/* Timeline line */}
                    {index < screens.length - 1 && (
                      <div
                        className="absolute left-[1.25rem] top-[3.5rem] bottom-0 w-0.5 bg-border"
                        style={{ height: "calc(100% - 2rem)" }}
                      />
                    )}

                    <PanelCard
                      screen={screen}
                      isExpanded={expandedIndex === index}
                      onToggleExpand={() =>
                        setExpandedIndex(expandedIndex === index ? null : index)
                      }
                      onChange={(s) => handleScreenChange(index, s)}
                      onDelete={() => handleDeleteScreen(index)}
                      onMoveUp={() => handleMoveScreen(index, "up")}
                      onMoveDown={() => handleMoveScreen(index, "down")}
                      isFirst={index === 0}
                      isLast={index === screens.length - 1}
                    />

                    {/* Spacer for timeline */}
                    {index < screens.length - 1 && <div className="h-3" />}
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Add Panel Button */}
          <button
            onClick={handleAddScreen}
            className={cn(
              "w-full py-3 px-4 border-2 border-dashed border-muted-foreground/30 rounded-lg",
              "flex items-center justify-center gap-2 text-sm text-muted-foreground",
              "hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
            )}
          >
            <Plus className="w-4 h-4" />
            Add Panel
          </button>
        </div>
      </div>

      {/* Footer Actions */}
      <footer className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {screens.length} panel{screens.length !== 1 ? "s" : ""} &middot;{" "}
          {formatDuration(totalDuration)} total &middot;{" "}
          {totalWords} words
        </div>
        <button
          onClick={onConfirm}
          disabled={screens.length < 3}
          className={cn(
            "px-4 py-2 bg-primary text-primary-foreground rounded-md transition-colors",
            screens.length < 3
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-primary/90"
          )}
        >
          Approve & Finalize Storyboard
        </button>
      </footer>
    </div>
  );
}
