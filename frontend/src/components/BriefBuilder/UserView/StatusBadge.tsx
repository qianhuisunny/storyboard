import { cn } from "@/lib/utils";
import type { StatusBadgeProps, FieldStatus, ConfidenceLevel } from "../types";

const statusConfig: Record<
  FieldStatus,
  { label: string; className: string; icon?: string }
> = {
  auto_filled: {
    label: "Auto-filled",
    className: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800",
    icon: "✓",
  },
  inferred: {
    label: "Inferred",
    className: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800",
    icon: "?",
  },
  missing: {
    label: "Missing",
    className: "bg-red-100 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
    icon: "!",
  },
  not_applicable: {
    label: "N/A",
    className: "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
    icon: "—",
  },
};

const confidenceConfig: Record<ConfidenceLevel, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "text-green-600 dark:text-green-400",
  },
  medium: {
    label: "Med",
    className: "text-yellow-600 dark:text-yellow-400",
  },
  low: {
    label: "Low",
    className: "text-red-600 dark:text-red-400",
  },
};

interface ExtendedStatusBadgeProps extends StatusBadgeProps {
  confidence?: ConfidenceLevel;
  showConfidence?: boolean;
}

/**
 * StatusBadge - Visual indicator for field status (four-state system).
 * Shows Auto-filled (green), Inferred (yellow), Missing (red), or N/A (gray).
 * Optionally displays confidence level.
 */
export default function StatusBadge({
  status,
  confidence,
  showConfidence = false
}: ExtendedStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border",
        config.className
      )}
    >
      {config.icon && <span className="text-[10px]">{config.icon}</span>}
      {config.label}
      {showConfidence && confidence && (
        <span className={cn("ml-1 text-[10px]", confidenceConfig[confidence].className)}>
          ({confidenceConfig[confidence].label})
        </span>
      )}
    </span>
  );
}
