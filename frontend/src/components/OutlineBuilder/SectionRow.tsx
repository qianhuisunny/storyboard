/**
 * SectionRow — Minimal row in the structured outline grid.
 * Scandinavian design: large light numbers, clean dividers, drag handle on hover.
 * ContentEditable blocks for document-feel editing.
 */

import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutlineSection } from "./types";

interface SectionRowProps {
  section: OutlineSection;
  index: number;
  totalSections: number;
  onUpdate: (id: string, updates: Partial<OutlineSection>) => void;
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
  totalSections,
  onUpdate,
  disabled = false,
  isLast = false,
}: SectionRowProps) {
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
        "group grid grid-cols-[32px_56px_1fr_36%] items-start py-8 transition-colors rounded-lg",
        !isLast && "border-b border-border/50",
        index === 0 && "pt-2",
        isDragging
          ? "opacity-50 shadow-lg z-10 bg-muted/20"
          : "hover:bg-muted/10"
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
      </div>

      {/* Evidence column */}
      <div className="min-w-0 pt-1">
        <BulletBlock
          items={section.evidenceNeeded}
          onChange={(items) =>
            onUpdate(section.id, { evidenceNeeded: items })
          }
          placeholder="Evidence needed..."
          disabled={disabled}
        />
      </div>
    </div>
  );
}
