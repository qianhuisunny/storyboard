import { useState } from "react";
import { Plus, Clock, Film, Target, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import ScreenCard from "./ScreenCard";
import type { UserViewProps, Screen, ScreenType } from "../types";
import { calculateTotalDuration, formatDuration, normalizeScreen } from "../types";

/**
 * UserView - Visual editor for the screen outline.
 * Displays screens as cards with drag-drop reordering and inline editing.
 */
export default function UserView({
  screens,
  stage1Output,
  onScreensChange,
  onConfirm,
}: UserViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const totalDuration = calculateTotalDuration(screens);

  const handleScreenChange = (index: number, updatedScreen: Screen) => {
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
    const newScreen = normalizeScreen(
      {
        screen_type: "demo" as ScreenType,
        voiceover_text: "",
        visual_direction: "",
        target_duration_sec: 5,
      },
      screens.length
    );
    onScreensChange([...screens, newScreen]);
    setExpandedIndex(screens.length);
  };

  return (
    <div className="user-view h-full flex flex-col">
      {/* Header with Brief Summary */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Screen Outline
            </h2>
            <p className="text-sm text-muted-foreground">
              Review and arrange your video screens. Click any card to expand and edit.
            </p>
          </div>

          {/* Duration Summary */}
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {formatDuration(totalDuration)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({screens.length} screens)
            </span>
          </div>
        </div>

        {/* Brief Context Pills */}
        {stage1Output && (
          <div className="flex flex-wrap gap-2 mt-3">
            {stage1Output.video_type && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-xs">
                <Film className="w-3 h-3" />
                {String(stage1Output.video_type)}
              </div>
            )}
            {stage1Output.target_audience && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                {String(stage1Output.target_audience).substring(0, 30)}
                {String(stage1Output.target_audience).length > 30 ? "..." : ""}
              </div>
            )}
            {stage1Output.desired_length && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 bg-muted rounded-full text-xs text-muted-foreground">
                <Target className="w-3 h-3" />
                Target: {String(stage1Output.desired_length)}s
              </div>
            )}
          </div>
        )}
      </header>

      {/* Screen Cards */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-3">
          {screens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No screens yet. Add your first screen to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {screens.map((screen, index) => (
                <ScreenCard
                  key={`${screen.screen_number}-${index}`}
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
              ))}
            </div>
          )}

          {/* Add Screen Button */}
          <button
            onClick={handleAddScreen}
            className={cn(
              "w-full py-3 px-4 border-2 border-dashed border-muted-foreground/30 rounded-lg",
              "flex items-center justify-center gap-2 text-sm text-muted-foreground",
              "hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-colors"
            )}
          >
            <Plus className="w-4 h-4" />
            Add Screen
          </button>
        </div>
      </div>

      {/* Footer Actions */}
      <footer className="px-6 py-4 border-t border-border bg-muted/20 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {screens.length} screen{screens.length !== 1 ? "s" : ""} &middot;{" "}
          {formatDuration(totalDuration)} total
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
          Approve & Generate Storyboard
        </button>
      </footer>
    </div>
  );
}
