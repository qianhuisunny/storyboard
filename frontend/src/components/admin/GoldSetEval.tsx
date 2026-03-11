import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Clock, Film, BarChart3, AlertTriangle } from "lucide-react";
import {
  MetricCard,
  SectionDiff,
  StoryboardDiff,
  type EvalData,
} from "./eval-components";

// ============================================================================
// Main Page
// ============================================================================

export default function GoldSetEval() {
  // Tab state
  const [activeTab, setActiveTab] = useState<"single" | "batch">(() => {
    return window.location.hash === "#batch" ? "batch" : "single";
  });

  // Single tab state
  const [goldSets, setGoldSets] = useState<string[]>([]);
  const [goldSetName, setGoldSetName] = useState("feynman_technique");
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);

  // Update hash on tab change
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Fetch gold set list
  useEffect(() => {
    fetch("/api/eval/gold-sets")
      .then(r => r.json())
      .then(j => {
        if (j.gold_sets) setGoldSets(j.gold_sets);
      })
      .catch(() => {});
  }, []);

  const fetchCached = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/eval/gold-set/${goldSetName}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setIsCached(json.cached);
      } else {
        setError(json.detail || "Failed to load");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [goldSetName]);

  const runEval = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      // Kick off background eval
      const res = await fetch(`/api/eval/gold-set/${goldSetName}`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        setError(json.detail || "Eval failed to start");
        setRunning(false);
        return;
      }
      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/eval/gold-set/${goldSetName}/status`);
          const statusJson = await statusRes.json();
          if (statusJson.status === "done") {
            clearInterval(poll);
            setRunning(false);
            fetchCached(); // Reload the cached result
          } else if (statusJson.status === "error") {
            clearInterval(poll);
            setRunning(false);
            setError(statusJson.error || "Eval failed");
          }
        } catch {
          // Keep polling on network errors
        }
      }, 3000);
    } catch (e) {
      setError(String(e));
      setRunning(false);
    }
  }, [goldSetName, fetchCached]);

  useEffect(() => { fetchCached(); }, [fetchCached]);

  const hasResults = data ? !!data.director_output : false;
  const analysis = data?.analysis;

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Tab Toggle */}
      <div className="flex items-center gap-1 border rounded-lg p-1 w-fit bg-muted/30">
        <button
          onClick={() => setActiveTab("single")}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === "single" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Single
        </button>
        <button
          onClick={() => setActiveTab("batch")}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
            activeTab === "batch" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Batch
        </button>
      </div>

      {activeTab === "single" && (
        <>
          {/* Header with dropdown */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Gold Set Evaluation</h1>
              <div className="flex items-center gap-2 mt-1">
                <select
                  value={goldSetName}
                  onChange={e => setGoldSetName(e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  {goldSets.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data?.timestamp && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(data.timestamp).toLocaleString()}
                  {isCached && <Badge variant="secondary" className="text-xs ml-1">cached</Badge>}
                </span>
              )}
              <Button onClick={runEval} disabled={running} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
                {running ? "Running (~90s)..." : "Run Eval"}
              </Button>
            </div>
          </div>

          {loading && <div className="p-8 text-center text-muted-foreground">Loading gold set...</div>}

          {error && (
            <Card className="p-4 border-destructive">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={fetchCached}>Retry</Button>
            </Card>
          )}

      {!loading && !error && !hasResults && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground mb-4">No eval results yet. Click "Run Eval" to run Director + Writer against the gold set.</p>
          <p className="text-xs text-muted-foreground">This will make LLM API calls and take ~60-90 seconds.</p>
        </Card>
      )}

      {/* Brief / Intake — always show if gold data exists */}
      {data?.gold?.brief && (() => {
        const b = data.gold.brief as Record<string, unknown>;
        return (
          <section>
            <h2 className="text-lg font-medium flex items-center gap-2 mb-3">
              <BarChart3 className="h-5 w-5" />
              Gold Brief (Intake)
            </h2>
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div><span className="text-muted-foreground">Viewer Outcome:</span> <span>{String(b.viewer_outcome)}</span></div>
                <div><span className="text-muted-foreground">Target Audience:</span> <span>{String(b.target_audience)}</span></div>
                <div><span className="text-muted-foreground">Audience Level:</span> <span>{String(b.audience_level)}</span></div>
                <div><span className="text-muted-foreground">Duration:</span> <span>{String(b.total_duration_sec)}s</span></div>
                <div><span className="text-muted-foreground">Platform:</span> <span>{String(b.platform)}</span></div>
                <div><span className="text-muted-foreground">Tone:</span> <span>{String(b.delivery_tone)}</span></div>
                <div><span className="text-muted-foreground">On-Camera:</span> <span>{String(b.on_camera_presence)}</span></div>
                <div><span className="text-muted-foreground">B-Roll Types:</span> <span>{Array.isArray(b.broll_type) ? (b.broll_type as string[]).join(", ") : String(b.broll_type)}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Angle:</span> <span>{String(b.selected_angle)}</span></div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Core Talking Points:</span>
                  <ul className="list-disc list-inside mt-1 text-xs">
                    {Array.isArray(b.core_talking_points) && (b.core_talking_points as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                  </ul>
                </div>
                {Array.isArray(b.misconceptions) && (b.misconceptions as string[]).length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Misconceptions:</span>
                    <ul className="list-disc list-inside mt-1 text-xs">
                      {(b.misconceptions as string[]).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </Card>
          </section>
        );
      })()}

      {hasResults && (
        <>
          {/* ============================================================ */}
          {/* Section 1: Outline Diff                                      */}
          {/* ============================================================ */}
          {analysis && (
            <section>
              <h2 className="text-lg font-medium flex items-center gap-2 mb-3">
                <BarChart3 className="h-5 w-5" />
                Outline Diff — Gold vs AI Director
              </h2>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MetricCard
                  label="Sections"
                  gold={analysis.director.section_count.gold}
                  ai={analysis.director.section_count.ai}
                />
                <MetricCard
                  label="Total Duration"
                  gold={`${analysis.director.gold_duration_sec}s`}
                  ai={analysis.director.ai_duration_estimate}
                />
                <MetricCard
                  label="Talking Points (total)"
                  gold={data.gold.outline.reduce((sum, s) => sum + s.talking_points.length, 0)}
                  ai={analysis.director.ai_sections.reduce((sum, s) => sum + s.talking_points.length, 0)}
                />
              </div>
              <SectionDiff gold={data.gold.outline} aiSections={analysis.director.ai_sections} />
            </section>
          )}

          {/* ============================================================ */}
          {/* Section 4: Storyboard Diff                                   */}
          {/* ============================================================ */}
          {data?.writer_output_path_b && (
            <section>
              <h2 className="text-lg font-medium flex items-center gap-2 mb-3">
                <Film className="h-5 w-5" />
                Storyboard Diff — Gold vs AI
              </h2>

              {/* Path B metrics */}
              {analysis && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <MetricCard label="Screens (Path B)" gold={analysis.writer_path_b.screen_count.gold} ai={analysis.writer_path_b.screen_count.ai} />
                  <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_b.avg_words_per_screen.gold} ai={analysis.writer_path_b.avg_words_per_screen.ai} />
                  <MetricCard label="Total Words" gold={analysis.writer_path_b.total_words.gold} ai={analysis.writer_path_b.total_words.ai} />
                  <MetricCard label="Screen Types (Gold)" gold={Object.entries(analysis.writer_path_b.screen_types.gold).map(([k, v]) => `${k}:${v}`).join(", ")} ai={Object.entries(analysis.writer_path_b.screen_types.ai).map(([k, v]) => `${k}:${v}`).join(", ")} />
                </div>
              )}

              <StoryboardDiff gold={data!.gold.storyboard} ai={data.writer_output_path_b} pathLabel="Path B: Gold Outline → Writer (isolates Writer quality)" />
            </section>
          )}

          {data?.writer_output_path_a && (
            <section className="mt-6">
              {analysis && (
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <MetricCard label="Screens (Path A)" gold={analysis.writer_path_a.screen_count.gold} ai={analysis.writer_path_a.screen_count.ai} />
                  <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_a.avg_words_per_screen.gold} ai={analysis.writer_path_a.avg_words_per_screen.ai} />
                  <MetricCard label="Total Words" gold={analysis.writer_path_a.total_words.gold} ai={analysis.writer_path_a.total_words.ai} />
                  <MetricCard label="Screen Types (Gold)" gold={Object.entries(analysis.writer_path_a.screen_types.gold).map(([k, v]) => `${k}:${v}`).join(", ")} ai={Object.entries(analysis.writer_path_a.screen_types.ai).map(([k, v]) => `${k}:${v}`).join(", ")} />
                </div>
              )}

              <StoryboardDiff gold={data!.gold.storyboard} ai={data.writer_output_path_a} pathLabel="Path A: AI Outline → Writer (end-to-end quality)" />
            </section>
          )}

          {/* ============================================================ */}
          {/* Section 5: Analysis                                          */}
          {/* ============================================================ */}
          {analysis && (
            <section>
              <h2 className="text-lg font-medium flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5" />
                Analysis
              </h2>
              <Card className="p-4 space-y-3">
                {/* Summary bullets */}
                <div>
                  <h3 className="text-sm font-medium mb-2">Key Findings</h3>
                  <ul className="space-y-1">
                    {analysis.summary.map((line, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-destructive mt-0.5">•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Filler phrases */}
                {(analysis.writer_path_b.filler_phrases.length > 0 || analysis.writer_path_a.filler_phrases.length > 0) && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Filler Phrases Detected</h3>
                    {analysis.writer_path_b.filler_phrases.length > 0 && (
                      <div className="mb-2">
                        <span className="text-xs text-muted-foreground">Path B:</span>
                        <ul className="ml-4">
                          {analysis.writer_path_b.filler_phrases.map((f, i) => (
                            <li key={i} className="text-xs text-destructive">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {analysis.writer_path_a.filler_phrases.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">Path A:</span>
                        <ul className="ml-4">
                          {analysis.writer_path_a.filler_phrases.map((f, i) => (
                            <li key={i} className="text-xs text-destructive">{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </section>
          )}
        </>
      )}
        </>
      )}

      {activeTab === "batch" && <BatchTab />}
    </div>
  );
}


// ============================================================================
// Batch Tab
// ============================================================================

function BatchTab() {
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  useEffect(() => {
    fetch("/api/eval/batch/report")
      .then(r => r.json())
      .then(j => { if (j.success) setReport(j.report); })
      .catch(() => {});
  }, []);

  const runBatch = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/eval/batch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const json = await res.json();
      if (!json.success) { setError(json.detail || "Failed to start"); setRunning(false); return; }

      const poll = setInterval(async () => {
        try {
          const sr = await fetch("/api/eval/batch/status");
          const sj = await sr.json();
          setProgress({ completed: sj.completed || 0, total: sj.total || 0 });
          if (sj.status === "done") {
            clearInterval(poll);
            setRunning(false);
            const rr = await fetch("/api/eval/batch/report");
            const rj = await rr.json();
            if (rj.success) setReport(rj.report);
          } else if (sj.status === "error") {
            clearInterval(poll);
            setRunning(false);
            setError(sj.error || "Batch failed");
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) { setError(String(e)); setRunning(false); }
  }, []);

  const stats = report?.descriptive_stats as Record<string, Record<string, Record<string, number>>> | undefined;
  const tagFreq = report?.tag_frequency as Record<string, Record<string, { count: number; videos: string[] }>> | undefined;
  const history = report?.history as { timestamp: string; prompt_versions: Record<string, string>; top_tags: string[]; total_tag_count: Record<string, number> }[] | undefined;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Batch Evaluation</h1>
          {report && (
            <p className="text-xs text-muted-foreground mt-1">
              Last run: {new Date(report.timestamp as string).toLocaleString()} | Prompts: {(report.prompt_versions as Record<string, string>)?.director}, {(report.prompt_versions as Record<string, string>)?.writer}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <span className="text-sm text-muted-foreground">
              {progress.completed}/{progress.total} running...
            </span>
          )}
          <Button onClick={runBatch} disabled={running} size="sm">
            <RefreshCw className={`h-4 w-4 mr-1.5 ${running ? "animate-spin" : ""}`} />
            {running ? "Running..." : "Run Batch"}
          </Button>
          {report && (
            <Link to="/admin/gold-set-eval/diffs" className="text-sm text-blue-600 hover:underline">
              View Diffs →
            </Link>
          )}
        </div>
      </div>

      {error && <Card className="p-4 border-destructive"><p className="text-destructive">{error}</p></Card>}

      {!report && !running && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No batch results yet. Click "Run Batch" to evaluate all gold sets.</p>
        </Card>
      )}

      {report && stats && (
        <>
          {/* Descriptive Stats */}
          <section>
            <h2 className="text-lg font-medium mb-3">Descriptive Stats</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Outline (gold outline vs AI outline)</h3>
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard label="Sections" gold={stats.outline?.section_count?.gold_avg ?? 0} ai={stats.outline?.section_count?.ai_avg ?? 0} />
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Duration Overshoot</div>
                    <span className="font-mono font-medium text-sm">
                      avg {stats.outline?.duration_overshoot_pct?.avg > 0 ? "+" : ""}{stats.outline?.duration_overshoot_pct?.avg ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Storyboard (gold storyboard vs AI storyboard)</h3>
                <div className="grid grid-cols-3 gap-3">
                  <MetricCard label="Screens" gold={stats.storyboard?.screen_count?.gold_avg ?? 0} ai={stats.storyboard?.screen_count?.ai_avg ?? 0} />
                  <MetricCard label="Words/Screen" gold={stats.storyboard?.avg_words_per_screen?.gold_avg ?? 0} ai={stats.storyboard?.avg_words_per_screen?.ai_avg ?? 0} />
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="text-xs text-muted-foreground mb-1">Duration Accuracy</div>
                    <span className="font-mono font-medium text-sm">
                      avg {stats.storyboard?.total_duration_accuracy_pct?.avg > 0 ? "+" : ""}{stats.storyboard?.total_duration_accuracy_pct?.avg ?? 0}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Quality Tags */}
          {tagFreq && (
            <section>
              <h2 className="text-lg font-medium mb-3">Quality Tags</h2>
              {(["outline", "storyboard"] as const).map(layer => {
                const tags = tagFreq[layer];
                if (!tags || Object.keys(tags).length === 0) return null;
                const sorted = Object.entries(tags).sort((a, b) => b[1].count - a[1].count);
                const total = report.videos_completed as number;
                return (
                  <div key={layer} className="mb-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 capitalize">{layer}</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50"><tr>
                          <th className="text-left px-3 py-2 font-medium">Tag</th>
                          <th className="text-left px-3 py-2 font-medium">Count</th>
                          <th className="text-left px-3 py-2 font-medium">Videos</th>
                        </tr></thead>
                        <tbody>
                          {sorted.map(([tag, data]) => (
                            <tr key={tag} className="border-t">
                              <td className="px-3 py-2 font-mono text-xs">{tag}</td>
                              <td className="px-3 py-2">
                                <Badge variant={data.count >= 3 ? "destructive" : "secondary"} className="text-xs">
                                  {data.count}/{total}
                                </Badge>
                              </td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{data.videos.join(", ")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Run History */}
          {history && history.length > 0 && (
            <section>
              <h2 className="text-lg font-medium mb-3">Run History</h2>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50"><tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Prompts</th>
                    <th className="text-left px-3 py-2 font-medium">Outline Tags</th>
                    <th className="text-left px-3 py-2 font-medium">SB Tags</th>
                  </tr></thead>
                  <tbody>
                    {[...history].reverse().map((h, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 text-xs">{new Date(h.timestamp).toLocaleDateString()}</td>
                        <td className="px-3 py-2 text-xs font-mono">{h.prompt_versions.director?.replace("storyboard_director_prompt_", "dir_")}, {h.prompt_versions.writer?.replace("storyboard_writer_prompt_", "wr_")}</td>
                        <td className="px-3 py-2 text-xs">{h.total_tag_count.outline}</td>
                        <td className="px-3 py-2 text-xs">{h.total_tag_count.storyboard}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
