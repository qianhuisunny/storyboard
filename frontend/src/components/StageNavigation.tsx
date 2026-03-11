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
    <nav className="h-full border-r border-border bg-[#FAFBF8] flex-shrink-0 overflow-y-auto flex flex-col" style={{ width: "220px", padding: "22px 0" }}>
      <div className="flex-1">
        <h2 className="uppercase text-[#8D9885]" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.9px", padding: "0 18px 10px" }}>
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
                    "w-full text-left transition-colors relative",
                    "flex items-center",
                    isActive
                      ? "bg-[#E8F0E9]"
                      : isClickable
                      ? "hover:bg-[#EEF1E9]"
                      : "text-[#8D9885] cursor-not-allowed opacity-50"
                  )}
                  style={{ padding: "10px 18px", gap: "11px" }}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#3A6B47] rounded-r-sm" />
                  )}
                  <span
                    className={cn(
                      "rounded-full flex items-center justify-center flex-shrink-0",
                      isActive
                        ? "bg-[#3A6B47] text-white"
                        : stage.status === "approved"
                        ? "bg-[#E6F2EB] text-[#2D6A4F]"
                        : "text-[#8D9885]"
                    )}
                    style={{
                      width: "24px",
                      height: "24px",
                      border: isActive
                        ? "1.5px solid #3A6B47"
                        : stage.status === "approved"
                        ? "1.5px solid #2D6A4F"
                        : "1.5px solid #BFC6B5",
                      fontSize: "11px",
                      fontWeight: 600,
                      fontFamily: "'Fraunces', serif",
                    }}
                  >
                    {stage.status === "approved" ? <Check className="w-3.5 h-3.5" /> : stage.id}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={cn("truncate", isActive ? "text-[#3A6B47]" : "text-[#1C2118]")} style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, lineHeight: "1.2" }}>
                      {stage.name}
                    </span>
                    {isActive && (
                      <span className="block text-[#8D9885]" style={{ fontSize: "11px", marginTop: "2px" }}>
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
      <div className="bg-[#D9DDD2]" style={{ height: "1px", margin: "14px 18px" }} />
      <Link
        to="/projects"
        className="flex items-center text-[#5A6352] hover:bg-[#EEF1E9] hover:text-[#1C2118] transition-all"
        style={{ padding: "8px 18px", gap: "8px", fontSize: "13px" }}
      >
        <FolderOpen className="w-4 h-4" />
        <span style={{ fontWeight: 500 }}>My Projects</span>
      </Link>
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
        "w-full text-left transition-colors mt-1 relative",
        "flex items-center",
        isActive
          ? "bg-[#E8F0E9]"
          : isClickable
          ? "hover:bg-[#EEF1E9]"
          : "text-[#8D9885] cursor-not-allowed opacity-50"
      )}
      style={{ padding: "10px 18px 10px 42px", gap: "11px" }}
    >
      {isActive && (
        <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#3A6B47] rounded-r-sm" />
      )}
      <span className="flex-shrink-0">{statusIcons[status]}</span>
      <div className="flex-1 min-w-0">
        <span className={cn("truncate", isActive ? "text-[#3A6B47]" : "text-[#1C2118]")} style={{ fontSize: "13px", fontWeight: isActive ? 600 : 500, lineHeight: "1.2" }}>
          Evidence Research
        </span>
        {isActive && (
          <span className="block text-[#8D9885]" style={{ fontSize: "11px", marginTop: "2px" }}>
            {statusLabels[status]}
          </span>
        )}
      </div>
    </button>
  );
}
