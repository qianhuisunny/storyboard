import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  MessageSquare,
  Eye,
  Type,
  Image,
  FileText,
  Video,
  Monitor,
  User,
  Presentation,
  Sparkles,
  Film,
  PlayCircle,
  Flag,
  Zap,
  AlertCircle,
  CheckCircle,
  Star,
  Users,
  ArrowRight,
  ListOrdered,
  Lightbulb,
  AlertTriangle,
  Repeat,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PanelCardProps } from "../types";
import { SCREEN_TYPE_CONFIG, getVisualDirectionArray } from "../types";

// Icon mapping for screen types
const SCREEN_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  video: Video,
  monitor: Monitor,
  user: User,
  presentation: Presentation,
  sparkles: Sparkles,
  film: Film,
  type: Type,
  "play-circle": PlayCircle,
  flag: Flag,
  zap: Zap,
  "alert-circle": AlertCircle,
  "check-circle": CheckCircle,
  star: Star,
  users: Users,
  "arrow-right": ArrowRight,
  "list-ordered": ListOrdered,
  lightbulb: Lightbulb,
  "alert-triangle": AlertTriangle,
  repeat: Repeat,
};

/**
 * PanelCard - Visual card for a single production screen in the storyboard draft.
 * Shows screen type badge, voiceover preview, visual direction, and expandable details.
 */
export default function PanelCard({
  screen,
  isExpanded,
  onToggleExpand,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: PanelCardProps) {
  const [isEditing, setIsEditing] = useState(false);

  const config = SCREEN_TYPE_CONFIG[screen.screen_type] || {
    label: screen.screen_type,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: "film",
  };

  const IconComponent = SCREEN_ICONS[config.icon] || Film;
  const visualDirections = getVisualDirectionArray(screen.visual_direction);

  const handleFieldChange = (field: keyof typeof screen, value: string | number | string[]) => {
    onChange({ ...screen, [field]: value });
  };

  return (
    <div
      className={cn(
        "panel-card border rounded-lg overflow-hidden transition-all",
        "bg-card hover:shadow-md",
        isExpanded ? "ring-2 ring-primary/20" : "border-border"
      )}
    >
      {/* Card Header - Always visible */}
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        {/* Screen Number */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground">
          {screen.screen_number}
        </div>

        {/* Screen Type Badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
            config.color
          )}
        >
          <IconComponent className="w-3.5 h-3.5" />
          <span>{config.label}</span>
        </div>

        {/* Voiceover Preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground truncate">
            {screen.voiceover_text || "(No voiceover)"}
          </p>
        </div>

        {/* Duration */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>{screen.target_duration_sec || 0}s</span>
        </div>

        {/* Expand/Collapse */}
        <button
          className="p-1 hover:bg-muted rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Visual Direction Section */}
          <div className="px-4 py-3 bg-gradient-to-r from-muted/50 to-muted/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Eye className="w-3.5 h-3.5" />
              <span className="font-medium">Visual Direction</span>
            </div>
            {isEditing ? (
              <textarea
                value={typeof screen.visual_direction === 'string'
                  ? screen.visual_direction
                  : screen.visual_direction.join(", ")}
                onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                className="w-full p-2 text-sm border border-border rounded bg-background resize-none"
                rows={3}
                placeholder="Describe the visual elements..."
              />
            ) : (
              <div className="space-y-1">
                {visualDirections.length > 0 ? (
                  visualDirections.map((dir, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="text-muted-foreground">•</span>
                      <span>{dir}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {typeof screen.visual_direction === 'string' && screen.visual_direction
                      ? screen.visual_direction
                      : "(No visual direction)"}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* On-Screen Visual Preview */}
          {(isEditing || screen.on_screen_visual) && (
            <div className="px-4 py-3 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Image className="w-3.5 h-3.5" />
                <span className="font-medium">On-Screen Visual</span>
              </div>
              {isEditing ? (
                <input
                  type="text"
                  value={screen.on_screen_visual || ""}
                  onChange={(e) => handleFieldChange("on_screen_visual", e.target.value)}
                  className="w-full p-2 text-sm border border-border rounded bg-background"
                  placeholder="Image URL or asset reference..."
                />
              ) : (
                <div className="flex items-center gap-3">
                  {screen.on_screen_visual?.startsWith("http") ? (
                    <img
                      src={screen.on_screen_visual}
                      alt="Visual reference"
                      className="w-20 h-14 object-cover rounded border border-border"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <div className="w-20 h-14 bg-muted rounded border border-border flex items-center justify-center">
                      <Image className="w-6 h-6 text-muted-foreground/50" />
                    </div>
                  )}
                  <p className="text-sm text-foreground flex-1 truncate">
                    {screen.on_screen_visual}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Editable Fields */}
          <div className="p-4 space-y-4">
            {/* Voiceover */}
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <MessageSquare className="w-3.5 h-3.5" />
                <span className="font-medium">Voiceover Script</span>
              </div>
              {isEditing ? (
                <textarea
                  value={screen.voiceover_text}
                  onChange={(e) => handleFieldChange("voiceover_text", e.target.value)}
                  className="w-full p-2 text-sm border border-border rounded bg-background resize-none"
                  rows={3}
                  placeholder="Enter voiceover text..."
                />
              ) : (
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded">
                  "{screen.voiceover_text || "..."}"
                </p>
              )}
            </div>

            {/* Text Overlay */}
            {(isEditing || screen.text_overlay) && (
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Type className="w-3.5 h-3.5" />
                  <span className="font-medium">Text Overlay</span>
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={screen.text_overlay || ""}
                    onChange={(e) => handleFieldChange("text_overlay", e.target.value)}
                    className="w-full p-2 text-sm border border-border rounded bg-background"
                    placeholder="On-screen text (optional)"
                  />
                ) : (
                  <p className="text-sm text-foreground">{screen.text_overlay}</p>
                )}
              </div>
            )}

            {/* Action Notes (read-only) */}
            {screen.action_notes && (
              <div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <FileText className="w-3.5 h-3.5" />
                  <span className="font-medium">Action Notes</span>
                </div>
                <p className="text-sm text-muted-foreground bg-muted/20 p-2 rounded italic">
                  {screen.action_notes}
                </p>
              </div>
            )}

            {/* Duration & Screen Type Row */}
            <div className="flex gap-4">
              {/* Duration */}
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span className="font-medium">Duration</span>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={screen.target_duration_sec || 5}
                      onChange={(e) =>
                        handleFieldChange("target_duration_sec", parseInt(e.target.value) || 5)
                      }
                      className="w-20 p-2 text-sm border border-border rounded bg-background"
                    />
                    <span className="text-sm text-muted-foreground">seconds</span>
                  </div>
                ) : (
                  <p className="text-sm text-foreground">
                    {screen.target_duration_sec || 5} seconds
                  </p>
                )}
              </div>

              {/* Screen Type (edit mode only) */}
              {isEditing && (
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Film className="w-3.5 h-3.5" />
                    <span className="font-medium">Screen Type</span>
                  </div>
                  <select
                    value={screen.screen_type}
                    onChange={(e) => handleFieldChange("screen_type", e.target.value)}
                    className="w-full p-2 text-sm border border-border rounded bg-background"
                  >
                    {Object.entries(SCREEN_TYPE_CONFIG).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Card Actions */}
          <div className="px-4 py-3 bg-muted/20 border-t border-border flex items-center justify-between">
            <div className="flex items-center gap-1">
              {/* Move Up */}
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className={cn(
                  "p-1.5 rounded hover:bg-muted transition-colors",
                  isFirst && "opacity-30 cursor-not-allowed"
                )}
                title="Move up"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              {/* Move Down */}
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className={cn(
                  "p-1.5 rounded hover:bg-muted transition-colors",
                  isLast && "opacity-30 cursor-not-allowed"
                )}
                title="Move down"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              {/* Edit Toggle */}
              <button
                onClick={() => setIsEditing(!isEditing)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  isEditing
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                )}
              >
                {isEditing ? "Done" : "Edit"}
              </button>

              {/* Delete */}
              <button
                onClick={onDelete}
                className="p-1.5 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete panel"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
