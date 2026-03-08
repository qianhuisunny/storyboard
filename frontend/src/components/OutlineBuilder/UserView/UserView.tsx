import { useState } from "react";
import { Plus, Clock, Film, Target, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import ScreenCard from "./ScreenCard";
import type { UserViewProps, Screen, ScreenType } from "../types";
import { calculateTotalDuration, formatDuration, normalizeScreen, getNarrativeRoleConfig } from "../types";

// Left-border accent colors for narrative role groups (subtle, not garish)
const ROLE_BORDER_COLORS: Record<string, string> = {
  hook: "border-l-red-400",
  takeaway: "border-l-emerald-400",
  cta: "border-l-orange-400",
};

function getRoleBorderColor(role: string): string {
  if (ROLE_BORDER_COLORS[role]) return ROLE_BORDER_COLORS[role];
  // Body sections get a subtle violet accent
  return "border-l-violet-400";
}

/**
 * Group screens by narrative_role, preserving order.
 * Consecutive screens with the same role are grouped together.
 * Empty roles are NOT grouped — they render as flat cards.
 */
function groupScreensByRole(screens: Screen[]): { role: string; items: { screen: Screen; globalIndex: number }[] }[] {
  const groups: { role: string; items: { screen: Screen; globalIndex: number }[] }[] = [];

  for (let i = 0; i < screens.length; i++) {
    const role = screens[i].narrative_role || "";
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.role === role) {
      lastGroup.items.push({ screen: screens[i], globalIndex: i });
    } else {
      groups.push({ role, items: [{ screen: screens[i], globalIndex: i }] });
    }
  }

  return groups;
}

/**
 * UserView - Visual editor for the screen outline.
 * Screens with narrative_role are grouped in collapsible sections.
 * Screens without narrative_role render as flat cards (no group wrapper).
 */
export default function UserView({
  screens,
  stage1Output,
  onScreensChange,
  onConfirm,
}: UserViewProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());

  const totalDuration = calculateTotalDuration(screens);
  const groups = groupScreensByRole(screens);
  const hasAnyRoles = screens.some((s) => s.narrative_role);

  const toggleGroupCollapse = (groupIndex: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupIndex)) {
        next.delete(groupIndex);
      } else {
        next.add(groupIndex);
      }
      return next;
    });
  };

  const handleScreenChange = (index: number, updatedScreen: Screen) => {
    const newScreens = [...screens];
    newScreens[index] = updatedScreen;
    onScreensChange(newScreens);
  };

  const handleDeleteScreen = (index: number) => {
    const newScreens = screens.filter((_, i) => i !== index);
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
    const renumbered = newScreens.map((s, i) => ({ ...s, screen_number: i + 1 }));
    onScreensChange(renumbered);

    if (expandedIndex === index) {
      setExpandedIndex(newIndex);
    } else if (expandedIndex === newIndex) {
      setExpandedIndex(index);
    }
  };

  const handleAddScreen = (narrativeRole?: string) => {
    const newScreen = normalizeScreen(
      {
        screen_type: "slides" as ScreenType,
        narrative_role: narrativeRole || "",
        voiceover_text: "",
        visual_direction: "",
        duration: 5,
      },
      screens.length
    );
    onScreensChange([...screens, newScreen]);
    setExpandedIndex(screens.length);
  };

  const renderScreenCard = (screen: Screen, globalIndex: number) => (
    <ScreenCard
      key={`${screen.screen_number}-${globalIndex}`}
      screen={screen}
      isExpanded={expandedIndex === globalIndex}
      onToggleExpand={() =>
        setExpandedIndex(expandedIndex === globalIndex ? null : globalIndex)
      }
      onChange={(s) => handleScreenChange(globalIndex, s)}
      onDelete={() => handleDeleteScreen(globalIndex)}
      onMoveUp={() => handleMoveScreen(globalIndex, "up")}
      onMoveDown={() => handleMoveScreen(globalIndex, "down")}
      isFirst={globalIndex === 0}
      isLast={globalIndex === screens.length - 1}
    />
  );

  return (
    <div className="user-view h-full flex flex-col">
      {/* Header with Brief Summary */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <div className="max-w-none">
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
        </div>
      </header>

      {/* Screen Cards */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-none space-y-3">
          {screens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Film className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No screens yet. Add your first screen to get started.</p>
            </div>
          ) : hasAnyRoles ? (
            /* Grouped layout: screens have narrative_role */
            <div className="space-y-4">
              {groups.map((group, groupIndex) => {
                // No role — render cards flat without group wrapper
                if (!group.role) {
                  return (
                    <div key={`flat-${groupIndex}`} className="space-y-3">
                      {group.items.map(({ screen, globalIndex }) =>
                        renderScreenCard(screen, globalIndex)
                      )}
                    </div>
                  );
                }

                const roleConfig = getNarrativeRoleConfig(group.role);
                const isCollapsed = collapsedGroups.has(groupIndex);
                const groupDuration = group.items.reduce(
                  (sum, { screen }) => sum + (screen.duration || 0),
                  0
                );

                return (
                  <div
                    key={`group-${groupIndex}-${group.role}`}
                    className={cn(
                      "border-l-4 rounded-r-lg",
                      getRoleBorderColor(group.role)
                    )}
                  >
                    {/* Group Header — clean, minimal */}
                    <button
                      onClick={() => toggleGroupCollapse(groupIndex)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className="font-semibold text-sm text-foreground">
                        {roleConfig.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {group.items.length} screen{group.items.length !== 1 ? "s" : ""} · {formatDuration(groupDuration)}
                      </span>
                    </button>

                    {/* Group Content */}
                    {!isCollapsed && (
                      <div className="pl-4 pb-2 space-y-3">
                        {group.items.map(({ screen, globalIndex }) =>
                          renderScreenCard(screen, globalIndex)
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat layout: no narrative_role on any screen (legacy data) */
            <div className="space-y-3">
              {screens.map((screen, index) =>
                renderScreenCard(screen, index)
              )}
            </div>
          )}

          {/* Add Screen Button */}
          <button
            onClick={() => handleAddScreen()}
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
      <footer className="px-6 py-4 border-t border-border bg-muted/20">
        <div className="max-w-none flex items-center justify-between">
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
        </div>
      </footer>
    </div>
  );
}
