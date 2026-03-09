/**
 * OutlineGrid — Sortable container for SectionRow components.
 * Wraps @dnd-kit SortableContext for drag-and-drop reordering.
 */

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
import SectionRow from "./SectionRow";
import type { OutlineSection } from "./types";

interface OutlineGridProps {
  sections: OutlineSection[];
  onReorder: (sections: OutlineSection[]) => void;
  onUpdateSection: (id: string, updates: Partial<OutlineSection>) => void;
  disabled?: boolean;
}

export default function OutlineGrid({
  sections,
  onReorder,
  onUpdateSection,
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
        {/* Column headers */}
        <div className="grid grid-cols-[80px_1fr_35%] text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pb-1">
          <span className="text-center">Time</span>
          <span className="pl-4">Title and Description</span>
          <span className="pl-4">Evidence & Visuals</span>
        </div>

        <div className="space-y-2">
          {sections.map((section, index) => (
            <SectionRow
              key={section.id}
              section={section}
              index={index}
              totalSections={sections.length}
              onUpdate={onUpdateSection}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
