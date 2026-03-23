/**
 * OutlineGrid — Sortable container for SectionRow components.
 * Scandinavian minimal design: no column headers, insert zones between rows.
 * Wraps @dnd-kit SortableContext for drag-and-drop reordering.
 */

import { Fragment } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement,
} from "@dnd-kit/modifiers";
import { Plus } from "lucide-react";
import SectionRow from "./SectionRow";
import type { OutlineSection } from "./types";

interface OutlineGridProps {
  sections: OutlineSection[];
  onReorder: (sections: OutlineSection[]) => void;
  onUpdateSection: (id: string, updates: Partial<OutlineSection>) => void;
  onInsertSection?: (atIndex: number) => void;
  onRemoveSection?: (id: string) => void;
  onRegenerateSection?: (sectionNumber: number, instruction: string) => Promise<void>;
  regeneratingSectionNumber?: number | null;
  disabled?: boolean;
}

/** Insert zone between rows — green line + circular + button on hover */
function InsertZone({ onInsert }: { onInsert: () => void }) {
  return (
    <div
      className="group/insert relative h-3 flex items-center justify-center cursor-pointer"
      onClick={onInsert}
    >
      <div className="absolute inset-x-0 h-0.5 bg-transparent group-hover/insert:bg-primary/50 transition-colors rounded-full" />
      <button
        className="relative z-10 w-6 h-6 rounded-full bg-background border-2 border-transparent text-transparent group-hover/insert:border-primary group-hover/insert:text-primary group-hover/insert:bg-primary/5 group-hover/insert:shadow-sm flex items-center justify-center transition-all"
        onClick={(e) => {
          e.stopPropagation();
          onInsert();
        }}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function OutlineGrid({
  sections,
  onReorder,
  onUpdateSection,
  onInsertSection,
  onRemoveSection,
  onRegenerateSection,
  regeneratingSectionNumber = null,
  disabled = false,
}: OutlineGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = [...sections];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Renumber
    const renumbered = reordered.map((s, i) => ({
      ...s,
      sectionNumber: i + 1,
    }));

    onReorder(renumbered);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext
        items={sections.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <div>
          {sections.map((section, index) => (
            <Fragment key={section.id}>
              <SectionRow
                section={section}
                index={index}
                totalSections={sections.length}
                onUpdate={onUpdateSection}
                onRemove={onRemoveSection}
                onRegenerate={onRegenerateSection}
                isRegenerating={regeneratingSectionNumber === section.sectionNumber}
                disabled={disabled}
                isLast={index === sections.length - 1}
              />
              {!disabled && onInsertSection && index < sections.length - 1 && (
                <InsertZone
                  onInsert={() => onInsertSection(index + 1)}
                />
              )}
            </Fragment>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
