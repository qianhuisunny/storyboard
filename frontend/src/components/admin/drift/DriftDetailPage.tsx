/**
 * DriftDetailPage — Track Changes view for AI→Human edits.
 * Route: /admin/drift/:stageName (stageName = "outline" or "storyboard")
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { diffOutline, diffStoryboard } from "./diffUtils";
import type { DiffResult, SectionDiff, FieldDiff } from "./diffUtils";

interface ProjectSnapshot {
  project_id: string;
  project_name: string;
  created_at: string | null;
  stages: Record<string, { ai_version: string | null; human_version: string | null }>;
}

// Stage name → stage_id in StageSnapshot table
const STAGE_MAP: Record<string, { id: number; title: string }> = {
  outline: { id: 2, title: "Outline — Edit Diffs" },
  storyboard: { id: 3, title: "Storyboard Draft — Edit Diffs" },
};

function FieldDiffLine({ diff }: { diff: FieldDiff }) {
  if (diff.status === "unchanged") {
    return (
      <div className="py-1 text-muted-foreground">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        {diff.humanValue}
      </div>
    );
  }

  if (diff.status === "removed") {
    return (
      <div className="py-1">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        <span className="text-[#A63228] line-through bg-[#FDDDD9] px-0.5 rounded-sm">{diff.aiValue}</span>
        <span className="text-[9px] text-[#A63228] italic ml-1">(removed)</span>
      </div>
    );
  }

  if (diff.status === "added") {
    return (
      <div className="py-1">
        <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
        <span className="text-[#3A6B47] bg-[#D4EDDA] px-0.5 rounded-sm">{diff.humanValue}</span>
        <span className="text-[9px] text-[#3A6B47] italic ml-1">(added)</span>
      </div>
    );
  }

  // modified
  return (
    <div className="py-1">
      <span className="text-[10px] uppercase text-muted-foreground/60 mr-2">{diff.field}</span>
      <span className="text-[#A63228] line-through bg-[#FDDDD9] px-0.5 rounded-sm">{diff.aiValue}</span>
      {" "}
      <span className="text-[#3A6B47] bg-[#D4EDDA] px-0.5 rounded-sm">{diff.humanValue}</span>
    </div>
  );
}

function SectionBlock({ section }: { section: SectionDiff }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold text-[#7C3AED] uppercase tracking-wide mb-2 pb-1 border-b border-[#F0EEFF]">
        {section.label}
      </div>
      <div className="text-[12.5px] leading-[1.8]">
        {section.fields.map((f, i) => (
          <FieldDiffLine key={i} diff={f} />
        ))}
      </div>
    </div>
  );
}

function ProjectDiffCard({
  project,
  diff,
}: {
  project: ProjectSnapshot;
  diff: DiffResult;
}) {
  const [expanded, setExpanded] = useState(diff.editRate > 0);

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 bg-[#f6f6f3] border-b border-border flex justify-between items-center text-left hover:bg-[#f0f0ec] transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-semibold text-sm">{project.project_name}</span>
        </div>
        <span
          className={cn(
            "text-xs font-semibold px-2 py-0.5 rounded",
            diff.editRate > 0.3
              ? "text-[#3A6B47] bg-[#E6F2EB]"
              : diff.editRate > 0
                ? "text-[#946B2D] bg-[#FFF8E7]"
                : "text-muted-foreground bg-muted"
          )}
        >
          {Math.round(diff.editRate * 100)}% edited
        </span>
      </button>
      {expanded && (
        <div className="px-4 py-4">
          {diff.sections.map((section, i) => (
            <SectionBlock key={i} section={section} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function DriftDetailPage() {
  const { stageName } = useParams<{ stageName: string }>();
  const { user } = useUser();
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stageConfig = STAGE_MAP[stageName || ""];
  const stageId = stageConfig?.id;

  useEffect(() => {
    if (!stageId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stages/all", {
          headers: { "X-User-Id": user?.id || "" },
        });
        if (!res.ok) throw new Error("Failed to fetch stage data");
        const data = await res.json();
        setProjects(data.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [stageId, user?.id]);

  if (!stageConfig) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-muted-foreground">Unknown stage: {stageName}</p>
          <Link to="/admin/dashboard" className="text-primary mt-2 inline-block">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  // Compute diffs for each project that has data for this stage
  const projectDiffs: { project: ProjectSnapshot; diff: DiffResult }[] = [];
  for (const p of projects) {
    const stage = p.stages[String(stageId)];
    if (!stage?.ai_version) continue;

    const aiVersion = stage.ai_version;
    const humanVersion = stage.human_version || aiVersion; // null humanVersion = no edits

    const diff =
      stageId === 2
        ? diffOutline(aiVersion, humanVersion)
        : diffStoryboard(aiVersion, humanVersion);

    projectDiffs.push({ project: p, diff });
  }

  // Sort by edit rate descending (most edited first)
  projectDiffs.sort((a, b) => b.diff.editRate - a.diff.editRate);

  const avgEditRate =
    projectDiffs.length > 0
      ? projectDiffs.reduce((sum, pd) => sum + pd.diff.editRate, 0) / projectDiffs.length
      : 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-1 text-sm text-[#7C3AED] hover:text-[#6D28D9] transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <span className="font-semibold text-lg">{stageConfig.title}</span>
          </div>
          <span className="text-sm text-muted-foreground">
            {projectDiffs.length} projects · Avg edit rate: {Math.round(avgEditRate * 100)}%
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-6 space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-48 mb-2" />
                <div className="h-3 bg-muted rounded w-32" />
              </Card>
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 text-center">
            <p className="text-destructive">{error}</p>
          </Card>
        ) : projectDiffs.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-muted-foreground">No projects have data for this stage yet.</p>
          </Card>
        ) : (
          projectDiffs.map(({ project, diff }) => (
            <ProjectDiffCard key={project.project_id} project={project} diff={diff} />
          ))
        )}
      </main>
    </div>
  );
}
