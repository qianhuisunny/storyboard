/**
 * SectionRow — Single row in the structured outline grid.
 * Document-feel editing: contentEditable blocks, no per-item widgets.
 * Three columns: Handle+Duration | Title+Purpose+Talking Points | Evidence+Visual Intent
 */

import { useRef, useCallback } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { OutlineSection } from "./types";

interface SectionRowProps {
  section: OutlineSection;
  index: number;
  totalSections: number;
  onUpdate: (id: string, updates: Partial<OutlineSection>) => void;
  disabled?: boolean;
}

/** Color accent based on position */
function getAccentColor(index: number, total: number): string {
  if (index === 0) return "border-l-[#7A5C1E]";
  if (index === total - 1) return "border-l-[#3A6B47]";
  return "border-l-[#5A6352]";
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

  // Sync DOM when value changes externally
  const handleFocus = useCallback(() => {
    // On focus, ensure DOM matches current value
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
      className={`outline-none whitespace-pre-wrap break-words ${className} ${
        !value && placeholder ? "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/50 empty:before:pointer-events-none" : ""
      }`}
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
      className="text-sm"
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

  const accentColor = getAccentColor(index, totalSections);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[80px_1fr_35%] border rounded-lg overflow-hidden bg-background ${accentColor} border-l-4 ${
        isDragging ? "opacity-50 shadow-lg z-10" : "shadow-sm"
      }`}
    >
      {/* Column 1: Handle + Duration */}
      <div className="flex flex-col items-center gap-1 py-3 px-2 bg-muted/20 border-r border-border">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <span className="text-xs font-medium text-muted-foreground">
          {index + 1}
        </span>
        <EditableBlock
          value={section.duration}
          onChange={(v) => onUpdate(section.id, { duration: v })}
          className="text-xs text-center font-mono text-muted-foreground"
          placeholder="0:00"
          disabled={disabled}
        />
      </div>

      {/* Column 2: Title + Purpose + Talking Points — flowing text */}
      <div className="py-3 px-4 border-r border-border min-w-0 space-y-1">
        <EditableBlock
          value={section.title}
          onChange={(v) => onUpdate(section.id, { title: v })}
          className="font-semibold text-sm"
          placeholder="Section title"
          disabled={disabled}
        />

        <EditableBlock
          value={section.purpose}
          onChange={(v) => onUpdate(section.id, { purpose: v })}
          className="text-sm text-muted-foreground"
          placeholder="Purpose of this section..."
          disabled={disabled}
        />

        <BulletBlock
          items={section.talkingPoints}
          onChange={(items) => onUpdate(section.id, { talkingPoints: items })}
          placeholder="Talking points..."
          disabled={disabled}
        />
      </div>

      {/* Column 3: Evidence — flowing text */}
      <div className="py-3 px-4 min-w-0 space-y-3">
        <BulletBlock
          items={section.evidenceNeeded}
          onChange={(items) => onUpdate(section.id, { evidenceNeeded: items })}
          placeholder="Evidence needed..."
          disabled={disabled}
        />
      </div>
    </div>
  );
}
