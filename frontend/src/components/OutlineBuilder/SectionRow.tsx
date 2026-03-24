/**
 * SectionRow — Minimal row in the structured outline grid.
 * Scandinavian design: large light numbers, clean dividers, drag handle on hover.
 * ContentEditable blocks for document-feel editing.
 */

import { useRef, useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2, X, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutlineSection } from "./types";
import { RegenPopover } from "./RegenPopover";

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
  const [showRegenPopover, setShowRegenPopover] = useState(false);

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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative grid grid-cols-[28px_40px_1fr_32px] items-start py-8 transition-colors rounded-lg",
        !isLast && "border-b border-border/50",
        index === 0 && "pt-2",
        isDragging
          ? "opacity-50 shadow-lg z-10 bg-muted/20"
          : "hover:bg-muted/10",
        isRegenerating && "opacity-60 pointer-events-none"
      )}
    >
      {/* Column 1: Drag handle — hidden by default, visible on row hover */}
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

      {/* Column 2: Section number — large, light */}
      <div className="text-3xl font-light text-muted-foreground/30 tabular-nums text-right pr-4 pt-0.5 select-none">
        {index + 1}
      </div>

      {/* Column 3: Main content: title, duration, purpose, talking points */}
      <div className="space-y-1.5 min-w-0">
        <EditableBlock
          value={section.title}
          onChange={(v) => onUpdate(section.id, { title: v })}
          className="font-semibold text-[17px] text-foreground"
          placeholder="Section title"
          disabled={disabled}
        />

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

        {showRegenPopover && onRegenerate && (
          <RegenPopover
            title="Regenerate this section"
            onRegenerate={(instruction) => {
              onRegenerate(section.sectionNumber, instruction);
              setShowRegenPopover(false);
            }}
            onClose={() => setShowRegenPopover(false)}
            isRegenerating={isRegenerating}
          />
        )}
      </div>

      {/* Column 4: Actions */}
      <div className="flex flex-col items-center gap-0.5">
        {!disabled && onRemove && (
          <button
            onClick={() => onRemove(section.id)}
            className="w-7 h-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-35 hover:!opacity-100 hover:text-destructive hover:bg-destructive/5 transition-all text-muted-foreground"
            title="Remove section"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        {!disabled && onRegenerate && (
          <button
            onClick={() => setShowRegenPopover((v) => !v)}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all"
            title="Regenerate this section"
          >
            <Sparkles className="w-[15px] h-[15px]" />
          </button>
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
