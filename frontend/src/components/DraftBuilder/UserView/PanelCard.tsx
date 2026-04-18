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
  Sparkles,
  RefreshCw,
  Video,
  Monitor,
  User,
  Presentation,
  Film,
  Type,
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
import "./panel-card.css";

const PLACEHOLDER_IMAGES: Record<string, string> = {
  screen_recording: "/placeholders/screen_recording.png",
  slides: "/placeholders/slides_and_diagrams.png",
  whiteboard_animation: "/placeholders/whiteboard.png",
  whiteboard: "/placeholders/whiteboard.png",
  code_editor: "/placeholders/code_editor.png",
  stock_footage: "/placeholders/stock_footage.png",
  real_world: "/placeholders/real_world.png",
  talking_head: "/placeholders/talking_head.png",
  talking_head_with_split_screens: "/placeholders/talking_head.png",
  talking_head_left_with_notes: "/placeholders/talking_head.png",
};

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

export default function PanelCard({
  screen,
  screenIndex,
  projectId,
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const config = SCREEN_TYPE_CONFIG[screen.screen_type] || {
    label: screen.screen_type,
    color: "bg-muted text-muted-foreground border-border",
    icon: "film",
  };

  const IconComponent = SCREEN_ICONS[config.icon] || Film;
  const visualDirections = getVisualDirectionArray(screen.visual_direction);

  const handleFieldChange = (field: keyof typeof screen, value: string | number | string[]) => {
    onChange({ ...screen, [field]: value });
  };

  const hasGeneratedVisual = screen.on_screen_visual?.startsWith("/generated/") || screen.on_screen_visual?.startsWith("http");
  const placeholderSrc = PLACEHOLDER_IMAGES[screen.screen_type] || "/placeholders/slides_and_diagrams.png";
  const visualSrc = hasGeneratedVisual ? screen.on_screen_visual! : placeholderSrc;

  const handleGenerateVisual = async () => {
    setIsGenerating(true);
    setGenerateError(null);
    try {
      const response = await fetch(
        `/api/project/${projectId}/screen/${screenIndex}/generate-visual`,
        { method: "POST" }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Generation failed" }));
        throw new Error(err.detail || "Generation failed");
      }
      const data = await response.json();
      onChange({ ...screen, on_screen_visual: data.on_screen_visual });
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
      setTimeout(() => setGenerateError(null), 3000);
    } finally {
      setIsGenerating(false);
    }
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
        className="flex items-center gap-4 px-5 py-4 cursor-pointer"
        onClick={onToggleExpand}
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center text-base font-semibold text-muted-foreground">
          {screen.screen_number}
        </div>
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border",
            config.color
          )}
        >
          <IconComponent className="w-4 h-4" />
          <span>{config.label}</span>
        </div>
        <img
          src={visualSrc}
          alt=""
          className="flex-shrink-0 w-14 h-10 object-cover rounded border border-border/50"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
        <div className="flex-1 min-w-0">
          <p className="text-base text-foreground truncate">
            {screen.voiceover_text || "(No voiceover)"}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>{screen.duration || 0}s</span>
        </div>
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

      {/* Expanded Content — Two-column layout */}
      {isExpanded && (
        <div className="border-t border-border">
          <div className="flex">
            {/* Left: Visual Preview — fixed 320px width, 16:9 aspect */}
            <div className="relative bg-muted/30 border-r border-border overflow-hidden rounded-bl-lg flex-shrink-0 w-[320px]">
              <div className={cn(
                "relative w-full aspect-video",
                isGenerating && "visual-shimmer"
              )}>
                <img
                  src={visualSrc}
                  alt="Screen visual"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
                {hasGeneratedVisual && !isGenerating && (
                  <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleGenerateVisual(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 rounded-md text-xs font-semibold text-foreground"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  </div>
                )}
              </div>
              {!hasGeneratedVisual && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleGenerateVisual(); }}
                  disabled={isGenerating}
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold border border-white/70 bg-white/85 backdrop-blur-sm text-foreground hover:bg-white/95 hover:border-primary hover:text-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isGenerating ? "Generating..." : "Generate Visual"}
                </button>
              )}
              {generateError && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 px-3 py-1 bg-destructive/90 text-destructive-foreground text-xs rounded">
                  {generateError}
                </div>
              )}
            </div>

            {/* Right: Content + Footer */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="p-5 space-y-4 flex-1">
                {/* Voiceover Script */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-muted-foreground mb-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-muted-foreground/50" />
                    Voiceover Script
                  </div>
                  {isEditing ? (
                    <textarea
                      value={screen.voiceover_text}
                      onChange={(e) => handleFieldChange("voiceover_text", e.target.value)}
                      className="w-full p-3 text-sm border border-border rounded-md bg-background resize-none"
                      rows={4}
                    />
                  ) : (
                    <p className="text-sm text-foreground bg-muted/20 p-3 rounded-md border border-border/50 italic leading-relaxed">
                      "{screen.voiceover_text || "..."}"
                    </p>
                  )}
                </div>

                {/* Visual Direction */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase text-muted-foreground mb-1.5">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground/50" />
                    Visual Direction
                  </div>
                  {isEditing ? (
                    <textarea
                      value={typeof screen.visual_direction === "string"
                        ? screen.visual_direction
                        : screen.visual_direction.join(", ")}
                      onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                      className="w-full p-3 text-sm border border-border rounded-md bg-background resize-none"
                      rows={3}
                    />
                  ) : (
                    <div className="space-y-1">
                      {visualDirections.map((dir, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="text-muted-foreground/50">•</span>
                          <span>{dir}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-0.5">
                  <button onClick={onMoveUp} disabled={isFirst} className={cn("p-1.5 rounded hover:bg-muted", isFirst && "opacity-30 cursor-not-allowed")}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={onMoveDown} disabled={isLast} className={cn("p-1.5 rounded hover:bg-muted", isLast && "opacity-30 cursor-not-allowed")}>
                    <ArrowDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setIsEditing(!isEditing)} className={cn("px-3 py-1 text-xs font-medium rounded", isEditing ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80")}>
                    {isEditing ? "Done" : "Edit"}
                  </button>
                  <button onClick={onDelete} className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
