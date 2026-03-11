import { cn } from "@/lib/utils";
import type { StatusBadgeProps, FieldStatus, ConfidenceLevel } from "../types";

const statusConfig: Record<
  FieldStatus,
  { label: string; className: string; icon?: string }
> = {
  auto_filled: {
    label: "Auto-filled",
    className: "bg-[#E6F2EB] text-[#3A6B47] border-[#2D6A4F]/20",
    icon: "✓",
  },
  inferred: {
    label: "Inferred",
    className: "bg-[#F7F0E0] text-[#7A5C1E] border-[#7A5C1E]/20",
    icon: "?",
  },
  not_applicable: {
    label: "N/A",
    className: "bg-muted text-muted-foreground border-border",
    icon: "—",
  },
};

const confidenceConfig: Record<ConfidenceLevel, { label: string; className: string }> = {
  high: {
    label: "High",
    className: "text-[#3A6B47]",
  },
  medium: {
    label: "Med",
    className: "text-[#7A5C1E]",
  },
  low: {
    label: "Low",
    className: "text-destructive",
  },
};

interface ExtendedStatusBadgeProps extends StatusBadgeProps {
  confidence?: ConfidenceLevel;
  showConfidence?: boolean;
}

/**
 * StatusBadge - Visual indicator for field status (three-state system).
 * Shows Auto-filled (green), Inferred (yellow), or N/A (gray).
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
        "inline-flex items-center border",
        config.className
      )}
      style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px", padding: "2px 7px", borderRadius: "20px", textTransform: "uppercase" as const, gap: "4px" }}
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
