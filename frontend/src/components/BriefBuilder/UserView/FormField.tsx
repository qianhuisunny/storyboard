import { useId } from "react";
import { cn } from "@/lib/utils";
import StatusBadge from "./StatusBadge";
import EditableList from "./EditableList";
import type { FormFieldProps } from "../types";

/**
 * FormField - Reusable form field component with status badge.
 * Supports text, textarea, select, toggle, and list input types.
 */
export default function FormField({
  label,
  name,
  value,
  onChange,
  type,
  options = [],
  helperText,
  required = false,
  status,
  error,
  ordered = false,
  placeholder,
  suffix,
}: FormFieldProps) {
  const id = useId();
  const inputId = `${id}-${name}`;

  const renderInput = () => {
    switch (type) {
      case "textarea":
        return (
          <textarea
            id={inputId}
            name={name}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className={cn(
              "w-full px-3 py-2 border rounded-md text-sm",
              "bg-background text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
              "resize-y min-h-[80px]",
              error ? "border-red-500" : "border-border"
            )}
          />
        );

      case "select":
        return (
          <select
            id={inputId}
            name={name}
            value={value as string}
            onChange={(e) => onChange(e.target.value)}
            className={cn(
              "w-full px-3 py-2 border rounded-md text-sm",
              "bg-background text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
              error ? "border-red-500" : "border-border"
            )}
          >
            <option value="">Select an option</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case "toggle":
        return (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={value === true || value === "Yes"}
              onClick={() => {
                const newValue = value === true || value === "Yes" ? "No" : "Yes";
                onChange(newValue);
              }}
              className={cn(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                value === true || value === "Yes"
                  ? "bg-primary"
                  : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                  value === true || value === "Yes"
                    ? "translate-x-6"
                    : "translate-x-1"
                )}
              />
            </button>
            <span className="text-sm text-foreground">
              {value === true || value === "Yes" ? "Yes" : "No"}
            </span>
          </div>
        );

      case "list":
        return (
          <EditableList
            items={value as string[]}
            onChange={(items) => onChange(items)}
            ordered={ordered}
            placeholder={placeholder}
          />
        );

      case "text":
      default:
        return (
          <div className="relative">
            <input
              type="text"
              id={inputId}
              name={name}
              value={value as string}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={cn(
                "w-full px-3 py-2 border rounded-md text-sm",
                "bg-background text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent",
                suffix ? "pr-16" : "",
                error ? "border-red-500" : "border-border"
              )}
            />
            {suffix && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {suffix}
              </span>
            )}
          </div>
        );
    }
  };

  return (
    <div className="form-field space-y-2">
      {/* Label row with status badge */}
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-foreground"
        >
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
        <StatusBadge status={status} />
      </div>

      {/* Helper text */}
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {/* Input */}
      {renderInput()}

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
