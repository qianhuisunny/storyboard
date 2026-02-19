import { cn } from "@/lib/utils";
import { FileText, Search, Sparkles } from "lucide-react";

export type SourceType = "user_input" | "web_search" | "ai_generated";

interface Source {
  type: SourceType;
  reference?: string;
}

interface SourceBadgeProps {
  source: Source;
  showReference?: boolean;
  className?: string;
}

const sourceConfig: Record<
  SourceType,
  {
    icon: React.ElementType;
    label: string;
    bgColor: string;
    textColor: string;
  }
> = {
  user_input: {
    icon: FileText,
    label: "Your Input",
    bgColor: "bg-blue-50",
    textColor: "text-blue-700",
  },
  web_search: {
    icon: Search,
    label: "Web Search",
    bgColor: "bg-purple-50",
    textColor: "text-purple-700",
  },
  ai_generated: {
    icon: Sparkles,
    label: "AI Generated",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
  },
};

export default function SourceBadge({
  source,
  showReference = false,
  className,
}: SourceBadgeProps) {
  const config = sourceConfig[source.type];
  const Icon = config.icon;

  return (
    <div className={cn("inline-flex items-center gap-1", className)}>
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
          config.bgColor,
          config.textColor
        )}
      >
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
      {showReference && source.reference && (
        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
          {source.reference}
        </span>
      )}
    </div>
  );
}

interface SourceListProps {
  sources: Source[];
  className?: string;
}

export function SourceList({ sources, className }: SourceListProps) {
  if (!sources || sources.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {sources.map((source, index) => (
        <SourceBadge key={index} source={source} showReference />
      ))}
    </div>
  );
}
