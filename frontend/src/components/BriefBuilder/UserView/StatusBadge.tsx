import { cn } from "@/lib/utils";
import type { StatusBadgeProps, FieldStatus, ConfidenceLevel } from "../types";

const statusConfig: Record<
  FieldStatus,
  { label: string; className: string; icon?: string }
> = {
  auto_filled: {
    label: "Auto-filled",
    className: "bg-[#EFF5F0] text-[#3D6B40] border-[#4A7A4D]/20",
    icon: "✓",
  },
  inferred: {
    label: "Inferred",
    className: "bg-[#FBF6ED] text-[#8B6B2A] border-[#9B7730]/20",
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
    className: "text-[#3D6B40]",
  },
  medium: {
    label: "Med",
    className: "text-[#8B6B2A]",
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
