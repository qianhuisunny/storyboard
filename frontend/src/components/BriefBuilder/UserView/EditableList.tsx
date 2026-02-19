import { useState, useRef } from "react";
import type { KeyboardEvent } from "react";
import { Plus, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EditableListProps } from "../types";

/**
 * EditableList - Editable list component for array fields.
 * Supports ordered (numbered) and unordered lists with add/remove/reorder.
 */
export default function EditableList({
  items,
  onChange,
  ordered = false,
  placeholder = "Add new item...",
  addLabel = "Add item",
}: EditableListProps) {
  const [newItem, setNewItem] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    const trimmed = newItem.trim();
    if (trimmed && !items.includes(trimmed)) {
      onChange([...items, trimmed]);
      setNewItem("");
      inputRef.current?.focus();
    }
  };

  const handleRemove = (index: number) => {
    const updated = items.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleEdit = (index: number, value: string) => {
    const updated = [...items];
    updated[index] = value;
    onChange(updated);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...items];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  };

  const handleMoveDown = (index: number) => {
    if (index === items.length - 1) return;
    const updated = [...items];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  };

  const ListWrapper = ordered ? "ol" : "ul";

  return (
    <div className="editable-list space-y-2">
      {/* Existing items */}
      {items.length > 0 && (
        <ListWrapper
          className={cn(
            "space-y-2",
            ordered && "list-decimal list-inside"
          )}
        >
          {items.map((item, index) => (
            <li
              key={index}
              className="flex items-start gap-2 group bg-muted/30 rounded-md p-2"
            >
              {/* Drag handle / order number */}
              <div className="flex items-center gap-1 pt-1">
                {ordered ? (
                  <span className="text-xs text-muted-foreground font-medium w-5">
                    {index + 1}.
                  </span>
                ) : (
                  <GripVertical className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                )}
              </div>

              {/* Editable text */}
              <input
                type="text"
                value={item}
                onChange={(e) => handleEdit(index, e.target.value)}
                className={cn(
                  "flex-1 px-2 py-1 text-sm bg-transparent border-0",
                  "focus:outline-none focus:ring-1 focus:ring-primary rounded"
                )}
              />

              {/* Actions */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {ordered && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleMoveUp(index)}
                      disabled={index === 0}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move up"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveDown(index)}
                      disabled={index === items.length - 1}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Move down"
                    >
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="p-1 text-muted-foreground hover:text-red-500"
                  aria-label="Remove item"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </li>
          ))}
        </ListWrapper>
      )}

      {/* Add new item */}
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            "flex-1 px-3 py-2 text-sm border border-dashed border-muted-foreground/30 rounded-md",
            "bg-background text-foreground placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          )}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={!newItem.trim()}
          className={cn(
            "inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md transition-colors",
            "bg-muted hover:bg-muted/80 text-foreground",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <Plus className="w-4 h-4" />
          <span>{addLabel}</span>
        </button>
      </div>
    </div>
  );
}
