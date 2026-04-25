/**
 * QualityLogDashboard — Per-project quality event viewer.
 * Route: /admin/quality-log/:projectId?
 *
 * Layout: left sidebar (project list by ID) + middle timeline + right detail panel.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { ArrowLeft, Search, Loader2 } from "lucide-react";
import { ChainTimeline } from "./quality-log/ChainTimeline";
import { EventDetail } from "./quality-log/EventDetail";
import type { QualityLogEntry } from "./quality-log/EventNode";

interface Chain {
  root_id: number;
  events: QualityLogEntry[];
}

interface StageGroup {
  stage: string;
  chains: Chain[];
}

interface ChainsResponse {
  project_id: string;
  stages: StageGroup[];
}

interface ProjectListItem {
  project_id: string;
  event_count: number;
}

export function QualityLogDashboard() {
  const { projectId: paramProjectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [projectList, setProjectList] = useState<ProjectListItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [filter, setFilter] = useState("");

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(paramProjectId ?? null);
  const [data, setData] = useState<ChainsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<QualityLogEntry | null>(null);

  // Fetch project list for sidebar
  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/quality-log/projects/list");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const json = await resp.json();
        setProjectList(json.projects || []);
      } catch {
        // Sidebar fails silently — user can still type project ID
      } finally {
        setProjectsLoading(false);
      }
    })();
  }, []);

  const fetchChains = useCallback(async (pid: string) => {
    if (!pid.trim()) return;
    setLoading(true);
    setError(null);
    setSelectedEntry(null);
    try {
      const resp = await fetch(`/api/quality-log/${encodeURIComponent(pid)}/chains`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json: ChainsResponse = await resp.json();
      setData(json);
      if (json.stages.length > 0 && json.stages[0].chains.length > 0) {
        setSelectedEntry(json.stages[0].chains[0].events[0]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load chains when selected project changes
  useEffect(() => {
    if (selectedProjectId) {
      fetchChains(selectedProjectId);
    }
  }, [selectedProjectId, fetchChains]);

  // Sync URL param on mount
  useEffect(() => {
    if (paramProjectId && paramProjectId !== selectedProjectId) {
      setSelectedProjectId(paramProjectId);
    }
  }, [paramProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectProject = (pid: string) => {
    setSelectedProjectId(pid);
    navigate(`/admin/quality-log/${encodeURIComponent(pid)}`, { replace: true });
  };

  const filteredProjects = useMemo(() => {
    if (!filter.trim()) return projectList;
    const lc = filter.toLowerCase();
    return projectList.filter(p => p.project_id.toLowerCase().includes(lc));
  }, [projectList, filter]);

  const totalEvents = data?.stages.reduce(
    (sum, s) => sum + s.chains.reduce((cs, c) => cs + c.events.length, 0),
    0,
  ) ?? 0;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="border-b px-6 py-3 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/admin/dashboard")}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Admin
          </Button>
          <h1 className="text-lg font-semibold">Quality Log</h1>
          {projectList.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {projectList.length} projects
            </span>
          )}
        </div>
      </div>

      {/* Sidebar + Timeline + Detail */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: project list */}
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
            {projectsLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                No projects found.
              </div>
            ) : (
              filteredProjects.map((p) => {
                const isSelected = p.project_id === selectedProjectId;
                return (
                  <button
                    key={p.project_id}
                    onClick={() => handleSelectProject(p.project_id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-xs border-b border-border/50 transition-colors border-l-2",
                      isSelected
                        ? "bg-background border-l-foreground font-medium"
                        : "hover:bg-background border-l-transparent",
                    )}
                  >
                    <div className="font-mono truncate leading-snug text-foreground">
                      {p.project_id}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {p.event_count} events
                    </span>
                  </button>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Middle: Timeline */}
        <ScrollArea className="w-[40%] border-r p-4">
          {!selectedProjectId && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a project to view its quality log
            </div>
          )}
          {selectedProjectId && error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {selectedProjectId && loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading...
            </div>
          )}
          {selectedProjectId && !loading && data && data.stages.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              No quality log entries for this project.
            </div>
          )}
          {selectedProjectId && !loading && data && data.stages.length > 0 && (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                {totalEvents} events across {data.stages.length} stage{data.stages.length > 1 ? "s" : ""}
              </p>
              <ChainTimeline
                stages={data.stages}
                selectedId={selectedEntry?.id ?? null}
                onSelect={setSelectedEntry}
              />
            </>
          )}
        </ScrollArea>

        {/* Right: Detail panel */}
        <ScrollArea className="flex-1 p-4">
          {selectedEntry ? (
            <EventDetail entry={selectedEntry} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select an event to view details
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}

export default QualityLogDashboard;
