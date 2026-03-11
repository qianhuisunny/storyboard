import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Check, FolderOpen } from "lucide-react";

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

const statusLabels: Record<StageStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  needs_review: "Needs review",
  approved: "Approved",
};

/** Visual stage item for the 5-stage sidebar display */
interface VisualStage {
  visualNumber: number;
  name: string;
  status: StageStatus;
  isActive: boolean;
  isClickable: boolean;
  onClick: () => void;
}

export default function StageNavigation({
  stages,
  currentStageId,
  activeAnchor = null,
  evidenceStatus = "not_started",
  onStageSelect,
  onAnchorSelect,
}: StageNavigationProps) {
  // Build 5 visual stages from 4 internal stages + Evidence Research
  // Internal stages: 1=Brief, 2=Outline, 3=Draft, 4=Review
  // Visual stages:   1=Brief, 2=Outline, 3=Evidence, 4=Draft, 5=Review
  const internalStage = (id: number) => stages.find((s) => s.id === id);

  const brief = internalStage(1);
  const outline = internalStage(2);
  const draft = internalStage(3);
  const review = internalStage(4);

  const isOutlineClickable = outline
    ? outline.status !== "not_started" || 2 <= currentStageId
    : false;

  const visualStages: VisualStage[] = [
    {
      visualNumber: 1,
      name: "Video Briefing",
      status: brief?.status ?? "not_started",
      isActive: currentStageId === 1,
      isClickable: brief ? brief.status !== "not_started" || 1 <= currentStageId : false,
      onClick: () => onStageSelect(1),
    },
    {
      visualNumber: 2,
      name: "Video Outline",
      status: outline?.status ?? "not_started",
      isActive: currentStageId === 2 && activeAnchor !== "evidence",
      isClickable: isOutlineClickable,
      onClick: () => onStageSelect(2),
    },
    {
      visualNumber: 3,
      name: "Evidence Research",
      status: evidenceStatus,
      isActive: currentStageId === 2 && activeAnchor === "evidence",
      isClickable: isOutlineClickable,
      onClick: () => onAnchorSelect?.(2, "evidence"),
    },
    {
      visualNumber: 4,
      name: "Storyboard Draft",
      status: draft?.status ?? "not_started",
      isActive: currentStageId === 3,
      isClickable: draft ? draft.status !== "not_started" || 3 <= currentStageId : false,
      onClick: () => onStageSelect(3),
    },
    {
      visualNumber: 5,
      name: "Review and Share",
      status: review?.status ?? "not_started",
      isActive: currentStageId === 4,
      isClickable: review ? review.status !== "not_started" || 4 <= currentStageId : false,
      onClick: () => onStageSelect(4),
    },
  ];

  return (
    <nav className="h-full border-r border-border bg-white flex-shrink-0 overflow-y-auto flex flex-col" style={{ width: "220px", padding: "22px 0" }}>
      <div className="flex-1">
        <h2 className="uppercase text-[#626B58]" style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.9px", padding: "0 18px 10px" }}>
          Stages
        </h2>
        <ul>
          {visualStages.map((vs) => (
            <li key={vs.visualNumber}>
              <button
                onClick={() => vs.isClickable && vs.onClick()}
                disabled={!vs.isClickable}
                className={cn(
                  "w-full text-left transition-colors relative",
                  "flex items-center",
                  vs.isActive
                    ? "bg-[#E8F0E9]"
                    : vs.isClickable
                    ? "hover:bg-[#EEF1E9]"
                    : "text-[#626B58] cursor-not-allowed opacity-50"
                )}
                style={{ padding: "10px 18px", gap: "11px" }}
              >
                {vs.isActive && (
                  <span className="absolute left-0 top-2 bottom-2 w-[3px] bg-[#3A6B47] rounded-r-sm" />
                )}
                <span
                  className={cn(
                    "rounded-full flex items-center justify-center flex-shrink-0",
                    vs.isActive
                      ? "bg-[#3A6B47] text-white"
                      : vs.status === "approved"
                      ? "bg-[#E6F2EB] text-[#2D6A4F]"
                      : "text-[#626B58]"
                  )}
                  style={{
                    width: "24px",
                    height: "24px",
                    border: vs.isActive
                      ? "1.5px solid #3A6B47"
                      : vs.status === "approved"
                      ? "1.5px solid #2D6A4F"
                      : "1.5px solid #BFC6B5",
                    fontSize: "11px",
                    fontWeight: 600,
                    fontFamily: "'Fraunces', serif",
                  }}
                >
                  {vs.status === "approved" ? <Check className="w-3.5 h-3.5" /> : vs.visualNumber}
                </span>
                <div className="flex-1 min-w-0">
                  <span className={cn("block truncate", vs.isActive ? "text-[#3A6B47]" : "text-[#1C2118]")} style={{ fontSize: "13px", fontWeight: vs.isActive ? 600 : 500, lineHeight: "1.2" }}>
                    {vs.name}
                  </span>
                  <span className="block text-[#626B58]" style={{ fontSize: "11px", marginTop: "2px" }}>
                    {statusLabels[vs.status]}
                  </span>
                </div>
              </button>
            </li>
          ))}
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
