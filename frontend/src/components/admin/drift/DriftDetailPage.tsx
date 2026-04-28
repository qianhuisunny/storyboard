/**
 * DriftDetailPage — Track Changes view for AI→Human edits.
 * Route: /admin/drift/:stageName (stageName = "outline" or "storyboard")
 *
 * Layout: left sidebar (project list by ID) + main content (section diffs).
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ArrowLeft, Loader2, Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diffOutline, diffStoryboard } from "./diffUtils";
import type { DiffResult, SectionDiff, FieldDiff } from "./diffUtils";
import { getAnonymousUserId } from "@/lib/anonymousUser";

interface ProjectSnapshot {
  project_id: string;
  project_name: string;
  created_at: string | null;
  stages: Record<string, { ai_version: string | null; human_version: string | null }>;
}

interface ProjectWithDiff {
  project: ProjectSnapshot;
  diff: DiffResult;
}

const STAGE_MAP: Record<string, { id: number; title: string }> = {
  outline: { id: 2, title: "Outline — Edit Diffs" },
  storyboard: { id: 3, title: "Storyboard Draft — Edit Diffs" },
};

function editRateClasses(rate: number): string {
  if (rate > 0.3) return "text-[#3A6B47] bg-[#E6F2EB]";
  if (rate > 0) return "text-[#946B2D] bg-[#FFF8E7]";
  return "text-muted-foreground bg-muted";
}

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

export default function DriftDetailPage() {
  const { stageName } = useParams<{ stageName: string }>();
  const [userId] = useState(() => getAnonymousUserId());
  const [projects, setProjects] = useState<ProjectSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const stageConfig = STAGE_MAP[stageName || ""];
  const stageId = stageConfig?.id;

  useEffect(() => {
    if (!stageId) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/admin/stages/all", {
          headers: { "X-User-Id": userId },
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
  }, [stageId, userId]);

  const projectDiffs = useMemo(() => {
    if (!stageId) return [];
    const result: ProjectWithDiff[] = [];
    for (const p of projects) {
      const stage = p.stages[String(stageId)];
      if (!stage?.ai_version) continue;
      const aiVersion = stage.ai_version;
      const humanVersion = stage.human_version || aiVersion;
      const diff = stageId === 2
        ? diffOutline(aiVersion, humanVersion)
        : diffStoryboard(aiVersion, humanVersion);
      result.push({ project: p, diff });
    }
    result.sort((a, b) => b.diff.editRate - a.diff.editRate);
    return result;
  }, [projects, stageId]);

  // Auto-select first project with edits
  useEffect(() => {
    if (selectedId || projectDiffs.length === 0) return;
    const first = projectDiffs.find(pd => pd.diff.editRate > 0) || projectDiffs[0];
    setSelectedId(first.project.project_id);
  }, [projectDiffs, selectedId]);

  const filteredDiffs = useMemo(() => {
    if (!filter.trim()) return projectDiffs;
    const lc = filter.toLowerCase();
    return projectDiffs.filter(pd => pd.project.project_id.toLowerCase().includes(lc));
  }, [projectDiffs, filter]);

  const avgEditRate = projectDiffs.length > 0
    ? projectDiffs.reduce((sum, pd) => sum + pd.diff.editRate, 0) / projectDiffs.length
    : 0;

  const selected = projectDiffs.find(pd => pd.project.project_id === selectedId);

  if (!stageConfig) {
    return (
      <div className="min-h-screen bg-background p-6">
        <p className="text-muted-foreground">Unknown stage: {stageName}</p>
        <Link to="/admin/dashboard" className="text-primary mt-2 inline-block">← Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card shrink-0 px-6 py-3">
        <div className="flex items-center justify-between">
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

      {/* Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-[240px] border-r shrink-0 flex flex-col bg-muted/30">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter by project ID..."
                className="w-full h-7 rounded-md border bg-background pl-6 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              filteredDiffs.map(({ project, diff }) => {
                const isSelected = project.project_id === selectedId;
                return (
                  <button
                    key={project.project_id}
                    onClick={() => setSelectedId(project.project_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-xs border-b border-border/50 transition-colors border-l-2",
                      isSelected
                        ? "bg-background border-l-[#7C3AED] font-medium"
                        : "hover:bg-background border-l-transparent",
                    )}
                  >
                    <div className={cn(
                      "font-mono truncate leading-snug",
                      diff.editRate > 0 ? "text-foreground" : "text-muted-foreground",
                    )}>
                      {project.project_id}
                    </div>
                    {diff.editRate > 0 ? (
                      <span className={cn(
                        "text-[10px] font-medium",
                        diff.editRate > 0.3 ? "text-[#3A6B47]" : "text-[#946B2D]",
                      )}>
                        {Math.round(diff.editRate * 100)}% edited
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">no edits</span>
                    )}
                  </button>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
            </div>
          ) : error ? (
            <div className="p-8">
              <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
            </div>
          ) : !selected ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a project to view diffs
            </div>
          ) : selected.diff.sections.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No outline data for this project.
            </div>
          ) : (
            <div className="max-w-4xl px-8 py-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{selected.project.project_name}</h2>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{selected.project.project_id}</p>
                </div>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded shrink-0",
                  editRateClasses(selected.diff.editRate),
                )}>
                  {Math.round(selected.diff.editRate * 100)}% edited
                </span>
              </div>

              {selected.diff.sections.map((section, i) => (
                <SectionBlock key={i} section={section} />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
