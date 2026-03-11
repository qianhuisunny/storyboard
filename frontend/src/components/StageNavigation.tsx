import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Check, Circle, AlertCircle, Loader2, FolderOpen } from "lucide-react";

export type StageStatus = "not_started" | "in_progress" | "needs_review" | "approved";

export interface Stage {
  id: number;
  name: string;
  description: string;
  status: StageStatus;
}

interface StageNavigationProps {
  stages: Stage[];
  currentStageId: number;
  activeAnchor?: string | null;
  evidenceStatus?: StageStatus;
  onStageSelect: (stageId: number) => void;
  onAnchorSelect?: (stageId: number, anchor: string) => void;
}

const statusIcons: Record<StageStatus, React.ReactNode> = {
  not_started: <Circle className="w-4 h-4 text-muted-foreground" />,
  in_progress: <Loader2 className="w-4 h-4 text-primary animate-spin" />,
  needs_review: <AlertCircle className="w-4 h-4 text-warning" />,
  approved: <Check className="w-4 h-4 text-success" />,
};

const statusLabels: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  needs_review: "Needs review",
  approved: "Approved",
};

export default function StageNavigation({
  stages,
  currentStageId,
  activeAnchor = null,
  evidenceStatus = "not_started",
  onStageSelect,
  onAnchorSelect,
}: StageNavigationProps) {
  return (
    <nav className="w-56 sm:w-48 h-full border-r border-border bg-white p-4 flex-shrink-0 overflow-y-auto flex flex-col">
      <div className="flex-1">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
          Stages
        </h2>
        <ul className="space-y-1">
          {stages.map((stage) => {
            const isActive = stage.id === currentStageId && activeAnchor !== "evidence";
            const isClickable = stage.status !== "not_started" || stage.id <= currentStageId;

            return (
              <li key={stage.id}>
                <button
                  onClick={() => isClickable && onStageSelect(stage.id)}
                  disabled={!isClickable}
                  className={cn(
                    "w-full text-left px-3 py-2 rounded-md transition-colors",
                    "flex items-center",
                    isActive
                      ? "bg-accent text-primary border-l-2 border-l-primary"
                      : isClickable
                      ? "hover:bg-muted text-foreground"
                      : "text-muted-foreground cursor-not-allowed opacity-50"
                  )}
                  style={{ gap: "8px" }}
                >
                  <span className="flex-shrink-0">{statusIcons[stage.status]}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center" style={{ gap: "4px" }}>
                      <span className="font-medium text-sm truncate">{stage.name}</span>
                    </div>
                    {isActive && (
                      <span className="text-xs text-muted-foreground block">
                        {statusLabels[stage.status]}
                      </span>
                    )}
                  </div>
                </button>

                {/* Evidence Research sub-step — shown after stage 2 */}
                {stage.id === 2 && (
                  <EvidenceSubStep
                    isActive={currentStageId === 2 && activeAnchor === "evidence"}
                    isClickable={isClickable}
                    status={evidenceStatus}
                    onSelect={() => onAnchorSelect?.(2, "evidence")}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* My Projects link at bottom */}
      <div className="pt-4 border-t border-border mt-4">
        <Link
          to="/projects"
          className={cn(
            "w-full text-left px-3 py-2 rounded-md transition-colors",
            "flex items-center gap-2",
            "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <FolderOpen className="w-4 h-4" />
          <span className="font-medium text-sm">My Projects</span>
        </Link>
      </div>
    </nav>
  );
}

/** Evidence Research step rendered between Video Outline and Storyboard Draft */
function EvidenceSubStep({
  isActive,
  isClickable,
  status,
  onSelect,
}: {
  isActive: boolean;
  isClickable: boolean;
  status: StageStatus;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={() => isClickable && onSelect()}
      disabled={!isClickable}
      className={cn(
        "w-full text-left pl-6 pr-3 py-2 rounded-md transition-colors mt-1",
        "flex items-center",
        isActive
          ? "bg-accent text-primary border-l-2 border-l-primary"
          : isClickable
          ? "hover:bg-muted text-foreground"
          : "text-muted-foreground cursor-not-allowed opacity-50"
      )}
      style={{ gap: "8px" }}
    >
      <span className="flex-shrink-0">{statusIcons[status]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center" style={{ gap: "4px" }}>
          <span className="font-medium text-sm truncate">Evidence Research</span>
        </div>
        {isActive && (
          <span className="text-xs text-muted-foreground block">
            {statusLabels[status]}
          </span>
        )}
      </div>
    </button>
  );
}
