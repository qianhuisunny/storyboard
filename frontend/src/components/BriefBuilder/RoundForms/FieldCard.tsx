/**
 * FieldCard - Single field component with color-coded status badge.
 * Displays a brief field with edit/confirm actions and visual status indicator.
 */

import { cn } from "@/lib/utils";
import type { BriefField, FieldColor } from "../types";
import { getFieldColor, KNOWLEDGE_SHARE_FIELD_LABELS, KNOWLEDGE_SHARE_OPTIONS, KNOWLEDGE_SHARE_FIELD_TYPES } from "../types";

interface FieldCardProps {
  fieldKey: string;
  field: BriefField;
  isRequired: boolean;
  onChange: (value: string | string[] | boolean) => void;
  onConfirm: () => void;
  disabled?: boolean;
}

const COLOR_CLASSES: Record<FieldColor, { badge: string; border: string; bg: string }> = {
  green: {
    badge: "bg-green-500 text-white",
    border: "border-green-200",
    bg: "bg-green-50",
  },
  blue: {
    badge: "bg-blue-500 text-white",
    border: "border-blue-200",
    bg: "bg-blue-50",
  },
  yellow: {
    badge: "bg-yellow-500 text-white",
    border: "border-yellow-200",
    bg: "bg-yellow-50",
  },
  red: {
    badge: "bg-red-500 text-white",
    border: "border-red-200",
    bg: "bg-red-50",
  },
};

const COLOR_LABELS: Record<FieldColor, string> = {
  green: "Confirmed",
  blue: "Provided",
  yellow: "AI Suggested",
  red: "Needs Input",
};

export default function FieldCard({
  fieldKey,
  field,
  isRequired,
  onChange,
  onConfirm,
  disabled = false,
}: FieldCardProps) {
  const color = getFieldColor(field, isRequired);
  const colorClasses = COLOR_CLASSES[color];
  const label = KNOWLEDGE_SHARE_FIELD_LABELS[fieldKey] || fieldKey;
  const fieldType = KNOWLEDGE_SHARE_FIELD_TYPES[fieldKey] || "text";
  const options = KNOWLEDGE_SHARE_OPTIONS[fieldKey] || [];

  const handleValueChange = (newValue: string | string[] | boolean) => {
    onChange(newValue);
  };

  const renderInput = () => {
    // Read-only fields
    if (fieldType === "readonly") {
      return (
        <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
          {String(field.value) || "—"}
        </div>
      );
    }

    // Read-only list
    if (fieldType === "readonly-list") {
      const items = Array.isArray(field.value) ? field.value : [];
      return (
        <div className="text-sm text-muted-foreground bg-muted px-3 py-2 rounded">
          {items.length > 0 ? items.join(", ") : "No assets uploaded"}
        </div>
      );
    }

    // Textarea
    if (fieldType === "textarea") {
      return (
        <textarea
          value={String(field.value) || ""}
          onChange={(e) => handleValueChange(e.target.value)}
          disabled={disabled || field.confirmed}
          className={cn(
            "w-full px-3 py-2 text-sm border rounded-md resize-none",
            "focus:outline-none focus:ring-2 focus:ring-primary/20",
            disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
          )}
          rows={3}
          placeholder={`Enter ${label.toLowerCase()}...`}
        />
      );
    }

    // Select
    if (fieldType === "select") {
      return (
        <select
          value={String(field.value) || ""}
          onChange={(e) => handleValueChange(e.target.value)}
          disabled={disabled || field.confirmed}
          className={cn(
            "w-full px-3 py-2 text-sm border rounded-md",
            "focus:outline-none focus:ring-2 focus:ring-primary/20",
            disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
          )}
        >
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    // Multi-select
    if (fieldType === "multiselect") {
      const selectedValues = Array.isArray(field.value) ? field.value : [];
      return (
        <div className="space-y-2">
          {options.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm border rounded-md cursor-pointer",
                selectedValues.includes(opt.value)
                  ? "bg-primary/10 border-primary"
                  : "bg-background border-border",
                (disabled || field.confirmed) && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(opt.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    handleValueChange([...selectedValues, opt.value]);
                  } else {
                    handleValueChange(selectedValues.filter((v) => v !== opt.value));
                  }
                }}
                disabled={disabled || field.confirmed}
                className="rounded"
              />
              {opt.label}
            </label>
          ))}
        </div>
      );
    }

    // Editable list
    if (fieldType === "editable-list" || fieldType === "list") {
      const items = Array.isArray(field.value) ? field.value : [];
      return (
        <div className="space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="text"
                value={item}
                onChange={(e) => {
                  const newItems = [...items];
                  newItems[index] = e.target.value;
                  handleValueChange(newItems);
                }}
                disabled={disabled || field.confirmed}
                className={cn(
                  "flex-1 px-3 py-2 text-sm border rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20",
                  disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
                )}
              />
              {!field.confirmed && !disabled && (
                <button
                  onClick={() => {
                    const newItems = items.filter((_, i) => i !== index);
                    handleValueChange(newItems);
                  }}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {!field.confirmed && !disabled && (
            <button
              onClick={() => handleValueChange([...items, ""])}
              className="text-sm text-primary hover:underline"
            >
              + Add item
            </button>
          )}
        </div>
      );
    }

    // Checklist
    if (fieldType === "checklist") {
      const items = Array.isArray(field.value) ? field.value : [];
      return (
        <div className="space-y-2">
          {items.map((item, index) => (
            <label
              key={index}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm border rounded-md cursor-pointer",
                "bg-background border-border",
                (disabled || field.confirmed) && "opacity-50 cursor-not-allowed"
              )}
            >
              <input
                type="checkbox"
                checked={true}
                onChange={() => {
                  const newItems = items.filter((_, i) => i !== index);
                  handleValueChange(newItems);
                }}
                disabled={disabled || field.confirmed}
                className="rounded"
              />
              {item}
            </label>
          ))}
        </div>
      );
    }

    // Select + editable
    if (fieldType === "select-editable") {
      const currentValue = String(field.value) || "";
      const isCustom = currentValue && !options.some((o) => currentValue.startsWith(o.value));

      return (
        <div className="space-y-2">
          <select
            value={isCustom ? "custom" : currentValue.split(":")[0] || ""}
            onChange={(e) => {
              if (e.target.value === "custom") {
                handleValueChange("");
              } else {
                handleValueChange(e.target.value);
              }
            }}
            disabled={disabled || field.confirmed}
            className={cn(
              "w-full px-3 py-2 text-sm border rounded-md",
              "focus:outline-none focus:ring-2 focus:ring-primary/20",
              disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
            )}
          >
            <option value="">Select format...</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={currentValue}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled || field.confirmed}
            placeholder="Customize the takeaway..."
            className={cn(
              "w-full px-3 py-2 text-sm border rounded-md",
              "focus:outline-none focus:ring-2 focus:ring-primary/20",
              disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
            )}
          />
        </div>
      );
    }

    // Default: text input
    return (
      <input
        type="text"
        value={String(field.value) || ""}
        onChange={(e) => handleValueChange(e.target.value)}
        disabled={disabled || field.confirmed}
        className={cn(
          "w-full px-3 py-2 text-sm border rounded-md",
          "focus:outline-none focus:ring-2 focus:ring-primary/20",
          disabled || field.confirmed ? "bg-muted cursor-not-allowed" : "bg-background"
        )}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    );
  };

  return (
    <div className={cn("rounded-lg border p-4", colorClasses.border, colorClasses.bg)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={cn("px-2 py-0.5 text-xs font-medium rounded", colorClasses.badge)}>
            {COLOR_LABELS[color]}
          </span>
          {isRequired && !field.confirmed && (
            <span className="text-xs text-red-500">*Required</span>
          )}
        </div>
        {!field.confirmed && !disabled && fieldType !== "readonly" && fieldType !== "readonly-list" && (
          <button
            onClick={onConfirm}
            className="px-3 py-1 text-xs font-medium text-white bg-green-500 rounded hover:bg-green-600 transition-colors"
          >
            Confirm
          </button>
        )}
      </div>

      {/* Label */}
      <label className="block text-sm font-medium text-foreground mb-2">{label}</label>

      {/* Input */}
      {renderInput()}
    </div>
  );
}
