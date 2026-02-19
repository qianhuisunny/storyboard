import { useState, useRef, useEffect } from "react";
import {
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
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ReviewCardProps } from "./types";
import { SCREEN_TYPE_CONFIG, getVisualDirectionArray } from "./types";

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
 * ReviewCard - Non-collapsible card showing all screen details.
 * Hover reveals edit controls, auto-saves on blur.
 */
export default function ReviewCard({
  screen,
  onChange,
  onSave,
}: ReviewCardProps) {
  const [isHovering, setIsHovering] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const config = SCREEN_TYPE_CONFIG[screen.screen_type] || {
    label: screen.screen_type,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    icon: "film",
  };

  const IconComponent = SCREEN_ICONS[config.icon] || Film;
  const visualDirections = getVisualDirectionArray(screen.visual_direction);

  // Auto-save when field loses focus
  const handleBlur = () => {
    setEditingField(null);
    // Debounce save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      onSave();
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleFieldChange = (field: keyof typeof screen, value: string | number) => {
    onChange({ ...screen, [field]: value });
  };

  const EditableText = ({
    field,
    value,
    multiline = false,
    placeholder = "",
    className = "",
  }: {
    field: keyof typeof screen;
    value: string;
    multiline?: boolean;
    placeholder?: string;
    className?: string;
  }) => {
    const isEditing = editingField === field;

    if (isEditing) {
      if (multiline) {
        return (
          <textarea
            autoFocus
            value={value}
            onChange={(e) => handleFieldChange(field, e.target.value)}
            onBlur={handleBlur}
            className={cn(
              "w-full p-2 text-sm border border-primary rounded bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20",
              className
            )}
            rows={3}
            placeholder={placeholder}
          />
        );
      }
      return (
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => handleFieldChange(field, e.target.value)}
          onBlur={handleBlur}
          className={cn(
            "w-full p-2 text-sm border border-primary rounded bg-background focus:outline-none focus:ring-2 focus:ring-primary/20",
            className
          )}
          placeholder={placeholder}
        />
      );
    }

    return (
      <div
        onClick={() => isHovering && setEditingField(field)}
        className={cn(
          "text-sm text-foreground transition-colors rounded p-1 -m-1",
          isHovering && "cursor-text hover:bg-muted/50",
          !value && "text-muted-foreground italic"
        )}
      >
        {value || placeholder || "(empty)"}
        {isHovering && (
          <Pencil className="w-3 h-3 inline-block ml-2 text-muted-foreground" />
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "review-card border rounded-xl overflow-hidden transition-all bg-card",
        isHovering ? "shadow-lg border-primary/30" : "shadow-sm border-border"
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        if (editingField) {
          handleBlur();
        }
      }}
    >
      {/* Card Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/20">
        {/* Screen Number */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
          {screen.screen_number}
        </div>

        {/* Screen Type Badge */}
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border",
            config.color
          )}
        >
          <IconComponent className="w-4 h-4" />
          <span>{config.label}</span>
        </div>

        {/* Duration */}
        <div className="ml-auto flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span className="font-medium">{screen.target_duration_sec}s</span>
        </div>
      </div>

      {/* Card Body - All fields visible */}
      <div className="p-5 space-y-5">
        {/* Voiceover Script */}
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <MessageSquare className="w-4 h-4" />
            <span className="font-medium uppercase tracking-wide">Voiceover Script</span>
          </div>
          <div className="bg-muted/30 rounded-lg p-3">
            <EditableText
              field="voiceover_text"
              value={screen.voiceover_text}
              multiline
              placeholder="Enter voiceover text..."
            />
          </div>
        </div>

        {/* Visual Direction */}
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
            <Eye className="w-4 h-4" />
            <span className="font-medium uppercase tracking-wide">Visual Direction</span>
          </div>
          <div className="bg-gradient-to-r from-muted/40 to-muted/20 rounded-lg p-3">
            {editingField === "visual_direction" ? (
              <textarea
                autoFocus
                value={
                  typeof screen.visual_direction === "string"
                    ? screen.visual_direction
                    : screen.visual_direction.join(", ")
                }
                onChange={(e) => handleFieldChange("visual_direction", e.target.value)}
                onBlur={handleBlur}
                className="w-full p-2 text-sm border border-primary rounded bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
                placeholder="Describe visual elements..."
              />
            ) : (
              <div
                onClick={() => isHovering && setEditingField("visual_direction")}
                className={cn(
                  "space-y-1 rounded p-1 -m-1 transition-colors",
                  isHovering && "cursor-text hover:bg-muted/30"
                )}
              >
                {visualDirections.length > 0 ? (
                  visualDirections.map((dir, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-sm text-foreground">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{dir}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {typeof screen.visual_direction === "string" && screen.visual_direction
                      ? screen.visual_direction
                      : "(No visual direction)"}
                  </p>
                )}
                {isHovering && (
                  <Pencil className="w-3 h-3 inline-block ml-2 text-muted-foreground" />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Two-column layout for smaller fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Text Overlay */}
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Type className="w-4 h-4" />
              <span className="font-medium uppercase tracking-wide">Text Overlay</span>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 min-h-[60px]">
              <EditableText
                field="text_overlay"
                value={screen.text_overlay || ""}
                placeholder="On-screen text..."
              />
            </div>
          </div>

          {/* On-Screen Visual */}
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <Image className="w-4 h-4" />
              <span className="font-medium uppercase tracking-wide">Visual Asset</span>
            </div>
            <div className="bg-muted/20 rounded-lg p-3 min-h-[60px]">
              {screen.on_screen_visual?.startsWith("http") ? (
                <div className="flex items-center gap-3">
                  <img
                    src={screen.on_screen_visual}
                    alt="Visual"
                    className="w-16 h-12 object-cover rounded border border-border"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                  <span className="text-xs text-muted-foreground truncate flex-1">
                    {screen.on_screen_visual}
                  </span>
                </div>
              ) : (
                <EditableText
                  field="on_screen_visual"
                  value={screen.on_screen_visual || ""}
                  placeholder="Image URL or reference..."
                />
              )}
            </div>
          </div>
        </div>

        {/* Action Notes (if present) */}
        {screen.action_notes && (
          <div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
              <FileText className="w-4 h-4" />
              <span className="font-medium uppercase tracking-wide">Notes</span>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {screen.action_notes}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
