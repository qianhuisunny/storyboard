/**
 * SectionRow — Minimal row in the structured outline grid.
 * Scandinavian design: large light numbers, clean dividers, drag handle on hover.
 * ContentEditable blocks for document-feel editing.
 */

import { useRef, useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal, Trash2, RefreshCw, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutlineSection } from "./types";

interface SectionRowProps {
  section: OutlineSection;
  index: number;
  totalSections: number;
  onUpdate: (id: string, updates: Partial<OutlineSection>) => void;
  onRemove?: (id: string) => void;
  onRegenerate?: (sectionNumber: number, instruction: string) => Promise<void>;
  isRegenerating?: boolean;
  disabled?: boolean;
  isLast?: boolean;
}

/**
 * ContentEditable text block — always looks like regular text.
 * No mode switching, no visible borders. Click to place cursor, type, blur to save.
 */
function EditableBlock({
  value,
  onChange,
  className = "",
  placeholder = "",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleBlur = useCallback(() => {
    if (!ref.current) return;
    const text = ref.current.innerText.trim();
    if (text !== value) {
      onChange(text);
    }
  }, [value, onChange]);

  const handleFocus = useCallback(() => {
    if (ref.current && ref.current.innerText.trim() !== value) {
      ref.current.innerText = value;
    }
  }, [value]);

  return (
    <div
      ref={ref}
      contentEditable={!disabled}
      suppressContentEditableWarning
      onBlur={handleBlur}
      onFocus={handleFocus}
      className={cn(
        "outline-none whitespace-pre-wrap break-words",
        !value && placeholder &&
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none",
        className
      )}
      data-placeholder={placeholder}
    >
      {value}
    </div>
  );
}

/**
 * Bullet list as a single contentEditable block.
 * Each line is a bullet. On blur, splits by newline → string[].
 */
function BulletBlock({
  items,
  onChange,
  placeholder = "",
  disabled = false,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const displayText = items.map((i) => `- ${i}`).join("\n");

  const handleChange = useCallback(
    (text: string) => {
      const lines = text
        .split("\n")
        .map((l) => l.replace(/^[-*]\s*/, "").trim())
        .filter(Boolean);
      onChange(lines);
    },
    [onChange]
  );

  return (
    <EditableBlock
      value={displayText}
      onChange={handleChange}
      className="text-sm text-muted-foreground leading-relaxed"
      placeholder={placeholder}
      disabled={disabled}
    />
  );
}

export default function SectionRow({
  section,
  index,
  totalSections: _totalSections,
  onUpdate,
  onRemove,
  onRegenerate,
  isRegenerating = false,
  disabled = false,
  isLast = false,
}: SectionRowProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showRegenInput, setShowRegenInput] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [regenError, setRegenError] = useState<string | null>(null);

  const handleRegenSubmit = async () => {
    if (!regenInstruction.trim() || !onRegenerate) return;
    setRegenError(null);
    try {
      await onRegenerate(section.sectionNumber, regenInstruction.trim());
      setRegenInstruction("");
      setShowRegenInput(false);
    } catch (err) {
      setRegenError(err instanceof Error ? err.message : "Regeneration failed");
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative grid grid-cols-[32px_56px_1fr] items-start py-8 transition-colors rounded-lg",
        !isLast && "border-b border-border/50",
        index === 0 && "pt-2",
        isDragging
          ? "opacity-50 shadow-lg z-10 bg-muted/20"
          : "hover:bg-muted/10",
        isRegenerating && "opacity-60 pointer-events-none"
      )}
    >
      {/* Drag handle — hidden by default, visible on row hover */}
      <div className="flex items-start justify-center pt-1">
        <button
          {...attributes}
          {...listeners}
          className={cn(
            "cursor-grab active:cursor-grabbing touch-none transition-opacity",
            "opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground"
          )}
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </div>

      {/* Section number — large, light */}
      <div className="text-3xl font-light text-muted-foreground/30 tabular-nums text-right pr-4 pt-0.5 select-none">
        {index + 1}
      </div>

      {/* Main content: title, duration, purpose, talking points */}
      <div className="pr-10 space-y-1.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <EditableBlock
            value={section.title}
            onChange={(v) => onUpdate(section.id, { title: v })}
            className="font-semibold text-[17px] text-foreground flex-1"
            placeholder="Section title"
            disabled={disabled}
          />

          {/* [...] action menu */}
          {!disabled && (onRemove || onRegenerate) && (
            <div className="relative flex-shrink-0" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className={cn(
                  "w-7 h-7 rounded-md flex items-center justify-center transition-all",
                  showMenu
                    ? "bg-muted text-foreground"
                    : "opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:bg-muted"
                )}
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>

              {showMenu && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-8 z-20 w-48 bg-popover border border-border rounded-lg shadow-lg py-1">
                    {onRegenerate && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          setShowRegenInput(true);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Regen with note
                      </button>
                    )}
                    {onRemove && (
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          onRemove(section.id);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Remove section
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <EditableBlock
          value={section.duration}
          onChange={(v) => onUpdate(section.id, { duration: v })}
          className="text-sm text-muted-foreground font-mono"
          placeholder="0:00 – 0:00"
          disabled={disabled}
        />

        <EditableBlock
          value={section.purpose}
          onChange={(v) => onUpdate(section.id, { purpose: v })}
          className="text-[15px] text-muted-foreground leading-relaxed"
          placeholder="Purpose of this section..."
          disabled={disabled}
        />

        <BulletBlock
          items={section.talkingPoints}
          onChange={(items) =>
            onUpdate(section.id, { talkingPoints: items })
          }
          placeholder="Talking points..."
          disabled={disabled}
        />

        {/* Inline regen input */}
        {showRegenInput && (
          <div className="mt-3 flex items-center gap-2">
            <input
              type="text"
              value={regenInstruction}
              onChange={(e) => setRegenInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRegenSubmit();
                if (e.key === "Escape") {
                  setShowRegenInput(false);
                  setRegenInstruction("");
                }
              }}
              placeholder="What should change about this section?"
              className="flex-1 px-3 py-1.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              autoFocus
            />
            <button
              onClick={handleRegenSubmit}
              disabled={!regenInstruction.trim() || isRegenerating}
              className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
            >
              {isRegenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => {
                setShowRegenInput(false);
                setRegenInstruction("");
                setRegenError(null);
              }}
              className="px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        )}
        {regenError && (
          <p className="mt-1 text-xs text-destructive">{regenError}</p>
        )}
      </div>

      {/* Regenerating overlay */}
      {isRegenerating && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Regenerating section...
          </div>
        </div>
      )}
    </div>
  );
}
