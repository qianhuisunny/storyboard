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
  onUnconfirm?: () => void;
  disabled?: boolean;
}

// Badge inline styles by color
const BADGE_COLORS: Record<FieldColor, { background: string; color: string }> = {
  green: { background: "#E6F2EB", color: "#2D6A4F" },
  blue: { background: "#E6EFF7", color: "#2E5F8A" },
  yellow: { background: "#F7F0E0", color: "#7A5C1E" },
  red: { background: "#F7F0E0", color: "#7A5C1E" },
};

const COLOR_LABELS: Record<FieldColor, string> = {
  green: "Confirmed",
  blue: "Provided",
  yellow: "AI Suggested",
  red: "Needs Input",
};

// Shared input styles
const inputStyle: React.CSSProperties = {
  fontSize: "13.5px",
  color: "#1C2118",
  background: "#F3F5F0",
  border: "1px solid #D9DDD2",
  borderRadius: "6px",
  padding: "9px 12px",
  width: "100%",
  fontFamily: "'Nunito', sans-serif",
};

const inputClassName = "focus:border-[#3A6B47] focus:shadow-[0_0_0_3px_rgba(58,107,71,0.1)] outline-none";

export default function FieldCard({
  fieldKey,
  field,
  isRequired,
  onChange,
  onConfirm,
  onUnconfirm,
  disabled = false,
}: FieldCardProps) {
  const color = getFieldColor(field, isRequired);
  const label = KNOWLEDGE_SHARE_FIELD_LABELS[fieldKey] || fieldKey;
  const fieldType = KNOWLEDGE_SHARE_FIELD_TYPES[fieldKey] || "text";
  const options = KNOWLEDGE_SHARE_OPTIONS[fieldKey] || [];

  const handleValueChange = (newValue: string | string[] | boolean) => {
    onChange(newValue);
  };

  // Check if field has content (for enabling/disabling confirm button)
  const hasContent = (() => {
    if (Array.isArray(field.value)) {
      return field.value.length > 0 && field.value.some(v => v.trim() !== "");
    }
    if (typeof field.value === "boolean") {
      return true;
    }
    return String(field.value || "").trim() !== "";
  })();

  const renderInput = () => {
    const disabledStyle: React.CSSProperties = (disabled || field.confirmed)
      ? { background: "#EEF1E9", cursor: "not-allowed" }
      : {};

    // Read-only fields
    if (fieldType === "readonly") {
      return (
        <div style={{ ...inputStyle, ...disabledStyle }}>
          {String(field.value) || "—"}
        </div>
      );
    }

    // Read-only list
    if (fieldType === "readonly-list") {
      const items = Array.isArray(field.value) ? field.value : [];
      return (
        <div style={{ ...inputStyle, ...disabledStyle }}>
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
          className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
          style={{ ...inputStyle, ...disabledStyle, minHeight: "70px", resize: "vertical" as const }}
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
          className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
          style={{ ...inputStyle, ...disabledStyle }}
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
                "flex items-center gap-2 cursor-pointer",
                (disabled || field.confirmed) && "opacity-50 cursor-not-allowed"
              )}
              style={{
                ...inputStyle,
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderColor: selectedValues.includes(opt.value) ? "#3A6B47" : "#D9DDD2",
                background: selectedValues.includes(opt.value) ? "#E8F0E9" : "#F3F5F0",
              }}
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
                className={cn(inputClassName, "flex-1", (disabled || field.confirmed) && "cursor-not-allowed")}
                style={{ ...inputStyle, ...disabledStyle }}
              />
              {!field.confirmed && !disabled && (
                <button
                  onClick={() => {
                    const newItems = items.filter((_, i) => i !== index);
                    handleValueChange(newItems);
                  }}
                  className="text-destructive hover:text-destructive text-sm"
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
                "flex items-center gap-2 cursor-pointer",
                (disabled || field.confirmed) && "opacity-50 cursor-not-allowed"
              )}
              style={{ ...inputStyle, display: "flex", alignItems: "center", gap: "8px" }}
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
            className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
            style={{ ...inputStyle, ...disabledStyle }}
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
            className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
            style={{ ...inputStyle, ...disabledStyle }}
          />
        </div>
      );
    }

    // Number input
    if (fieldType === "number") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            step="1"
            value={String(field.value) || ""}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "") {
                handleValueChange("");
              } else {
                const parsed = parseInt(val, 10);
                if (!isNaN(parsed) && parsed > 0) {
                  handleValueChange(String(parsed));
                }
              }
            }}
            disabled={disabled || field.confirmed}
            className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
            style={{ ...inputStyle, ...disabledStyle, width: "8rem" }}
            placeholder="e.g., 60"
          />
          <span className="text-sm text-muted-foreground">seconds</span>
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
        className={cn(inputClassName, (disabled || field.confirmed) && "cursor-not-allowed")}
        style={{ ...inputStyle, ...disabledStyle }}
        placeholder={`Enter ${label.toLowerCase()}...`}
      />
    );
  };

  return (
    <div
      className={cn(
        "border transition-colors hover:border-[#BFC6B5]",
        color === "green" ? "border-[#A8CBAF] bg-[#F7FBF7]" : "border-[#D9DDD2] bg-[#FAFBF8]"
      )}
      style={{ borderRadius: "10px", padding: "15px 18px" }}
    >
      {/* Header — label + badges on left, confirm button on right */}
      <div className="flex items-center justify-between" style={{ marginBottom: "10px", gap: "10px" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: "13px", fontWeight: 600, color: "#1C2118" }}>{label}</span>
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.3px",
              padding: "2px 7px",
              borderRadius: "20px",
              textTransform: "uppercase" as const,
              background: BADGE_COLORS[color].background,
              color: BADGE_COLORS[color].color,
            }}
          >
            {COLOR_LABELS[color]}
          </span>
          {isRequired && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 700,
                letterSpacing: "0.3px",
                padding: "2px 7px",
                borderRadius: "20px",
                textTransform: "uppercase" as const,
                background: "transparent",
                color: "#8D9885",
                border: "1px solid #BFC6B5",
              }}
            >
              Required
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Edit button for confirmed fields */}
          {field.confirmed && !disabled && onUnconfirm && fieldType !== "readonly" && fieldType !== "readonly-list" && (
            <button
              onClick={onUnconfirm}
              className="px-3 py-1 text-xs font-semibold text-muted-foreground border border-border rounded-md hover:bg-muted transition-colors"
            >
              Edit
            </button>
          )}
          {/* Confirm button — outline green, fills on hover */}
          {!field.confirmed && !disabled && fieldType !== "readonly" && fieldType !== "readonly-list" && (
            <button
              onClick={onConfirm}
              disabled={!hasContent}
              className="transition-all flex-shrink-0"
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: hasContent ? "#3A6B47" : "#8D9885",
                background: hasContent ? "#E8F0E9" : "#EEF1E9",
                border: hasContent ? "1px solid #A8C8AD" : "1px solid #D9DDD2",
                padding: "5px 13px",
                borderRadius: "6px",
                cursor: hasContent ? "pointer" : "not-allowed",
                opacity: hasContent ? 1 : 0.5,
              }}
              onMouseEnter={(e) => {
                if (hasContent) {
                  e.currentTarget.style.background = "#3A6B47";
                  e.currentTarget.style.borderColor = "#3A6B47";
                  e.currentTarget.style.color = "white";
                }
              }}
              onMouseLeave={(e) => {
                if (hasContent) {
                  e.currentTarget.style.background = "#E8F0E9";
                  e.currentTarget.style.borderColor = "#A8C8AD";
                  e.currentTarget.style.color = "#3A6B47";
                }
              }}
            >
              Confirm
            </button>
          )}
        </div>
      </div>

      {/* Input */}
      {renderInput()}
    </div>
  );
}
