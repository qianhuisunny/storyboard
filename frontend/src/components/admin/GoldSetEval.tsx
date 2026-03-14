import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Clock, BarChart3, AlertTriangle, Loader2 } from "lucide-react";
import {
  MetricCard,
  SectionDiff,
  StoryboardDiff,
  type EvalData,
  type CitationAnalysis,
  type EvidenceResearch,
  type TokenUsage,
} from "./eval-components";

// ============================================================================
// Tab pill component (reused for top-level and result sub-tabs)
// ============================================================================

function TabPills<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; loading?: boolean; disabled?: boolean }[];
  active: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border rounded-lg p-1 w-fit bg-muted/30">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => !t.disabled && onChange(t.key)}
          disabled={t.disabled}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-1.5 ${
            t.disabled
              ? "text-muted-foreground/40 cursor-not-allowed"
              : active === t.key
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// Main Page
// ============================================================================

export default function GoldSetEval() {
  // Top-level tab state
  const [activeTab, setActiveTab] = useState<"single" | "batch">(() => {
    return window.location.hash === "#batch" ? "batch" : "single";
  });

  // Single tab state
  const [goldSets, setGoldSets] = useState<string[]>([]);
  const [goldSetName, setGoldSetName] = useState("feynman_technique");
  const [models, setModels] = useState<{id: string; label: string}[]>([{id: "gpt-4o", label: "GPT-4o"}]);
  const [selectedModel, setSelectedModel] = useState("gpt-4o");
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningModel, setRunningModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState(false);
  const [availableRuns, setAvailableRuns] = useState<{model: string; timestamp: string}[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [runElapsed, setRunElapsed] = useState(0);

  // Result sub-tab
  const [resultTab, setResultTab] = useState<"outline" | "pathB" | "pathA" | "research">("outline");

  // Update hash on tab change
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  // Fetch gold set list + available models
  useEffect(() => {
    fetch("/api/eval/gold-sets")
      .then(r => r.json())
      .then(j => {
        if (j.gold_sets) setGoldSets(j.gold_sets);
      })
      .catch(() => {});
    fetch("/api/eval/models")
      .then(r => r.json())
      .then(j => {
        if (j.models) setModels(j.models);
      })
      .catch(() => {});
  }, []);

  const formatModelLabel = useCallback((modelId: string) => {
    if (!modelId) return "";
    const found = models.find(m => m.id === modelId);
    if (found) return found.label;
    return modelId.replace(/-\d{8}$/, "");
  }, [models]);

  const fetchForModel = useCallback(async (model?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = model
        ? `/api/eval/gold-set/${goldSetName}?model=${model}`
        : `/api/eval/gold-set/${goldSetName}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json.data);
        setIsCached(json.cached);
        if (json.available_models) {
          setAvailableRuns(json.available_models);
          if (model) {
            const idx = json.available_models.findIndex((r: {model: string}) => r.model === model);
            if (idx >= 0) setViewIndex(idx);
          } else {
            setViewIndex(0);
          }
        }
      } else {
        setError(json.detail || "Failed to load");
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [goldSetName]);

  const goToPrev = useCallback(() => {
    if (viewIndex > 0) {
      const newIdx = viewIndex - 1;
      setViewIndex(newIdx);
      fetchForModel(availableRuns[newIdx].model);
    }
  }, [viewIndex, availableRuns, fetchForModel]);

  const goToNext = useCallback(() => {
    if (viewIndex < availableRuns.length - 1) {
      const newIdx = viewIndex + 1;
      setViewIndex(newIdx);
      fetchForModel(availableRuns[newIdx].model);
    }
  }, [viewIndex, availableRuns, fetchForModel]);

  // Elapsed timer while running
  useEffect(() => {
    if (!runningModel) { setRunElapsed(0); return; }
    const t = setInterval(() => setRunElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [runningModel]);

  // Track completed stages during a run (for progressive loading)
  const [completedStages, setCompletedStages] = useState<string[]>([]);
  const [currentStage, setCurrentStage] = useState<string | null>(null);
  const prevStagesRef = useRef<number>(0);

  const runEval = useCallback(async () => {
    const modelToRun = selectedModel;
    setRunningModel(modelToRun);
    setError(null);
    setRunElapsed(0);
    setCompletedStages([]);
    setCurrentStage("director_and_path_b");
    prevStagesRef.current = 0;
    setData(prev => prev ? { ...prev, director_output: undefined, writer_output_path_b: undefined, writer_output_path_a: undefined, evidence_research: undefined, citation_analysis: undefined, analysis: undefined } as EvalData : prev);
    try {
      const res = await fetch(`/api/eval/gold-set/${goldSetName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelToRun }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.detail || "Eval failed to start");
        setRunningModel(null);
        return;
      }
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/eval/gold-set/${goldSetName}/status?model=${modelToRun}`);
          const statusJson = await statusRes.json();
          const stages: string[] = statusJson.completed_stages || [];
          setCompletedStages(stages);
          setCurrentStage(statusJson.current_stage || null);

          // When new stages complete, refetch data to get partial results
          if (stages.length > prevStagesRef.current) {
            prevStagesRef.current = stages.length;
            fetchForModel(modelToRun);
          }

          if (statusJson.status === "done") {
            clearInterval(poll);
            setRunningModel(null);
            setCurrentStage(null);
            fetchForModel(modelToRun);
          } else if (statusJson.status === "error") {
            clearInterval(poll);
            setRunningModel(null);
            setCurrentStage(null);
            setError(statusJson.error || "Eval failed");
          }
        } catch {
          // Keep polling on network errors
        }
      }, 2000);
    } catch (e) {
      setError(String(e));
      setRunningModel(null);
    }
  }, [goldSetName, selectedModel, fetchForModel]);

  // Load data when gold set changes
  useEffect(() => { fetchForModel(); }, [fetchForModel]);

  // Load data when model dropdown changes
  useEffect(() => {
    fetchForModel(selectedModel);
  }, [selectedModel]); // eslint-disable-line react-hooks/exhaustive-deps

  const isRunning = runningModel === selectedModel;
  const analysis = data?.analysis;

  // Tab availability: during a run, gate by completedStages; otherwise by data presence
  const tabAvailable = {
    outline: isRunning ? completedStages.includes("director_and_path_b") : !!data?.director_output,
    pathB: isRunning ? completedStages.includes("director_and_path_b") : !!data?.writer_output_path_b,
    research: isRunning ? completedStages.includes("research") : !!data?.evidence_research,
    pathA: isRunning ? completedStages.includes("path_a") : !!data?.writer_output_path_a,
  };
  const anyTabAvailable = Object.values(tabAvailable).some(Boolean);

  // Auto-switch to the latest completed tab during a run
  useEffect(() => {
    if (!isRunning || completedStages.length === 0) return;
    const latest = completedStages[completedStages.length - 1];
    const stageToTab: Record<string, "outline" | "pathB" | "research" | "pathA"> = {
      director_and_path_b: "outline",
      research: "research",
      path_a: "pathA",
    };
    const tab = stageToTab[latest];
    if (tab) setResultTab(tab);
  }, [completedStages, isRunning]);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Top-level toggle: Single / Batch */}
      <TabPills
        tabs={[
          { key: "single" as const, label: "Single" },
          { key: "batch" as const, label: "Batch" },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {activeTab === "single" && (
        <>
          {/* Header with selectors + run button */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Gold Set Evaluation</h1>
              <div className="flex items-center gap-3 mt-1">
                <select
                  value={goldSetName}
                  onChange={e => setGoldSetName(e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  {goldSets.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <select
                  value={selectedModel}
                  onChange={e => setSelectedModel(e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-background"
                >
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {data?.timestamp && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(data.timestamp).toLocaleString()}
                  {data.model_used && <Badge variant="outline" className="text-xs ml-1">{data.model_used}</Badge>}
                  {isCached && <Badge variant="secondary" className="text-xs ml-1">cached</Badge>}
                </span>
              )}
              {availableRuns.length > 0 && (
                <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1">
                  <button
                    onClick={goToPrev}
                    disabled={viewIndex === 0}
                    className={`text-lg leading-none px-1 ${viewIndex === 0 ? "text-muted-foreground/30 cursor-default" : "text-foreground hover:text-foreground/80 cursor-pointer"}`}
                  >
                    ‹
                  </button>
                  <span className="text-xs font-medium min-w-[80px] text-center">
                    {formatModelLabel(availableRuns[viewIndex]?.model)}
                    {" "}<span className="text-muted-foreground">{viewIndex + 1}/{availableRuns.length}</span>
                  </span>
                  <button
                    onClick={goToNext}
                    disabled={viewIndex === availableRuns.length - 1}
                    className={`text-lg leading-none px-1 ${viewIndex === availableRuns.length - 1 ? "text-muted-foreground/30 cursor-default" : "text-foreground hover:text-foreground/80 cursor-pointer"}`}
                  >
                    ›
                  </button>
                </div>
              )}
              <Button onClick={runEval} disabled={runningModel === selectedModel} size="sm">
                <RefreshCw className={`h-4 w-4 mr-1.5 ${runningModel === selectedModel ? "animate-spin" : ""}`} />
                {runningModel === selectedModel ? `Running (${runElapsed}s)...` : runningModel ? `${formatModelLabel(runningModel)} running...` : "Run Eval"}
              </Button>
            </div>
          </div>

          {/* Loading / error / running states */}
          {loading && <div className="p-8 text-center text-muted-foreground">Loading gold set...</div>}

          {error && (
            <Card className="p-4 border-destructive">
              <p className="text-destructive">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => fetchForModel(selectedModel)}>Retry</Button>
            </Card>
          )}

          {!loading && !error && !anyTabAvailable && !isRunning && (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground mb-4">No eval results yet. Click "Run Eval" to run Director + Writer against the gold set.</p>
              <p className="text-xs text-muted-foreground">This will make LLM API calls and take ~60-90 seconds.</p>
            </Card>
          )}

          {/* Stage progress bar (compact, replaces big spinner card) */}
          {isRunning && (
            <div className="flex items-center gap-6 text-sm py-2">
              {[
                { stage: "director_and_path_b", label: "Outline + Path B" },
                { stage: "research", label: "Research" },
                { stage: "path_a", label: "Path A" },
              ].map(({ stage, label }) => {
                const done = completedStages.includes(stage);
                const active = currentStage === stage;
                return (
                  <div key={stage} className="flex items-center gap-1.5">
                    {done ? (
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                    ) : active ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                    )}
                    <span className={done ? "text-foreground" : active ? "text-muted-foreground" : "text-muted-foreground/40"}>
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Token usage summary */}
          {data?.token_usage && <TokenUsageSummary usage={data.token_usage} />}

          {/* Gold Brief — always visible when gold data exists */}
          {data?.gold?.brief && <BriefSection brief={data.gold.brief} />}

          {/* Result sub-tabs — show as soon as any stage has data */}
          {anyTabAvailable && (
            <>
              <TabPills
                tabs={[
                  { key: "outline" as const, label: "Outline Diff", disabled: !tabAvailable.outline, loading: isRunning && currentStage === "director_and_path_b" && !tabAvailable.outline },
                  { key: "pathB" as const, label: "Path B", disabled: !tabAvailable.pathB, loading: isRunning && currentStage === "director_and_path_b" && !tabAvailable.pathB },
                  { key: "research" as const, label: "Research", disabled: !tabAvailable.research, loading: isRunning && currentStage === "research" && !tabAvailable.research },
                  { key: "pathA" as const, label: "Path A", disabled: !tabAvailable.pathA, loading: isRunning && currentStage === "path_a" && !tabAvailable.pathA },
                ]}
                active={resultTab}
                onChange={setResultTab}
              />

              {/* Tab content */}
              {resultTab === "outline" && tabAvailable.outline && analysis && (
                <OutlineDiffTab data={data!} analysis={analysis} />
              )}

              {resultTab === "pathB" && tabAvailable.pathB && (
                <PathBTab data={data!} analysis={analysis} />
              )}

              {resultTab === "research" && tabAvailable.research && (
                <ResearchTab
                  evidenceResearch={data!.evidence_research}
                  citationAnalysis={data!.citation_analysis}
                />
              )}

              {resultTab === "pathA" && tabAvailable.pathA && (
                <PathATab data={data!} analysis={analysis} />
              )}

              {/* Analysis — always visible below tabs */}
              {analysis && <AnalysisSection analysis={analysis} />}
            </>
          )}
        </>
      )}

      {activeTab === "batch" && <BatchTab />}
    </div>
  );
}


// ============================================================================
// Gold Brief (above tabs)
// ============================================================================

function BriefSection({ brief }: { brief: Record<string, unknown> }) {
  const b = brief;
  return (
    <section>
      <h2 className="text-xl font-medium flex items-center gap-2 mb-3">
        <BarChart3 className="h-5 w-5" />
        Gold Brief (Intake)
      </h2>
      <Card className="p-4">
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-base">
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
            <ul className="list-disc list-inside mt-1 text-base">
              {Array.isArray(b.core_talking_points) && (b.core_talking_points as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
            </ul>
          </div>
          {Array.isArray(b.misconceptions) && (b.misconceptions as string[]).length > 0 && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Misconceptions:</span>
              <ul className="list-disc list-inside mt-1 text-base">
                {(b.misconceptions as string[]).map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}


// ============================================================================
// Token Usage Summary (admin only)
// ============================================================================

function TokenUsageSummary({ usage }: { usage: Record<string, TokenUsage> }) {
  const stages = [
    { key: "director", label: "Director" },
    { key: "writer_path_b", label: "Writer B" },
    { key: "evidence_research", label: "Research" },
    { key: "writer_path_a", label: "Writer A" },
  ];

  const totalIn = Object.values(usage).reduce((s, u) => s + (u.input_tokens || 0), 0);
  const totalOut = Object.values(usage).reduce((s, u) => s + (u.output_tokens || 0), 0);

  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground py-1 flex-wrap">
      <span className="font-medium text-foreground">Tokens:</span>
      {stages.map(({ key, label }) => {
        const u = usage[key];
        if (!u) return null;
        return (
          <span key={key}>
            {label}{" "}
            <span className="font-mono">{fmt(u.input_tokens)}</span>
            <span className="mx-0.5">/</span>
            <span className="font-mono">{fmt(u.output_tokens)}</span>
          </span>
        );
      })}
      <span className="border-l pl-3 ml-1 font-medium">
        Total{" "}
        <span className="font-mono">{fmt(totalIn)}</span> in /{" "}
        <span className="font-mono">{fmt(totalOut)}</span> out
      </span>
    </div>
  );
}


// ============================================================================
// Tab 1: Outline Diff
// ============================================================================

function OutlineDiffTab({ data, analysis }: { data: EvalData; analysis: NonNullable<EvalData["analysis"]> }) {
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Sections"
          gold={analysis.director.section_count.gold}
          ai={analysis.director.section_count.ai}
        />
        {(() => {
          const est = analysis.director.ai_duration_estimate as { midpoint_sec?: number; min_sec?: number; max_sec?: number } | string | number;
          const isObj = typeof est === "object" && est !== null;
          const midpoint = isObj ? est.midpoint_sec : (typeof est === "string" ? parseInt(est) || 0 : est);
          const rangeLabel = isObj ? `${est.min_sec}\u2013${est.max_sec}` : String(est);
          return (
            <MetricCard
              label="Total Duration"
              gold={analysis.director.gold_duration_sec}
              ai={midpoint ?? 0}
              aiDisplay={rangeLabel}
              unit="s"
            />
          );
        })()}
        <MetricCard
          label="Talking Points (total)"
          gold={data.gold.outline.reduce((sum, s) => sum + s.talking_points.length, 0)}
          ai={analysis.director.ai_sections.reduce((sum, s) => sum + s.talking_points.length, 0)}
        />
      </div>
      <SectionDiff gold={data.gold.outline} aiSections={analysis.director.ai_sections} />
    </section>
  );
}


// ============================================================================
// Tab 2: Path B (Gold Outline -> Writer)
// ============================================================================

function PathBTab({ data, analysis }: { data: EvalData; analysis: EvalData["analysis"] }) {
  if (!data.writer_output_path_b) {
    return <Card className="p-8 text-center text-muted-foreground">No Path B results available.</Card>;
  }
  return (
    <section className="space-y-4">
      {analysis && (
        <div className="grid grid-cols-4 gap-3">
          <MetricCard label="Screens" gold={analysis.writer_path_b.screen_count.gold} ai={analysis.writer_path_b.screen_count.ai} />
          <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_b.avg_words_per_screen.gold} ai={analysis.writer_path_b.avg_words_per_screen.ai} />
          <MetricCard label="Total Words" gold={analysis.writer_path_b.total_words.gold} ai={analysis.writer_path_b.total_words.ai} />
          <MetricCard label="Screen Types" gold={Object.entries(analysis.writer_path_b.screen_types.gold).map(([k, v]) => `${k}:${v}`).join(", ")} ai={Object.entries(analysis.writer_path_b.screen_types.ai).map(([k, v]) => `${k}:${v}`).join(", ")} />
        </div>
      )}
      <StoryboardDiff gold={data.gold.storyboard} ai={data.writer_output_path_b} pathLabel="Path B: Gold Outline \u2192 Writer (isolates Writer quality)" />
    </section>
  );
}


// ============================================================================
// Tab 3: Path A (AI Outline -> Writer)
// ============================================================================

function PathATab({ data, analysis }: { data: EvalData; analysis: EvalData["analysis"] }) {
  if (!data.writer_output_path_a) {
    return <Card className="p-8 text-center text-muted-foreground">No Path A results available.</Card>;
  }
  return (
    <section className="space-y-4">
      {analysis && (
        <div className="grid grid-cols-4 gap-3">
          <MetricCard label="Screens" gold={analysis.writer_path_a.screen_count.gold} ai={analysis.writer_path_a.screen_count.ai} />
          <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_a.avg_words_per_screen.gold} ai={analysis.writer_path_a.avg_words_per_screen.ai} />
          <MetricCard label="Total Words" gold={analysis.writer_path_a.total_words.gold} ai={analysis.writer_path_a.total_words.ai} />
          <MetricCard label="Screen Types" gold={Object.entries(analysis.writer_path_a.screen_types.gold).map(([k, v]) => `${k}:${v}`).join(", ")} ai={Object.entries(analysis.writer_path_a.screen_types.ai).map(([k, v]) => `${k}:${v}`).join(", ")} />
        </div>
      )}
      <StoryboardDiff gold={data.gold.storyboard} ai={data.writer_output_path_a} pathLabel="Path A: AI Outline \u2192 Writer (end-to-end quality)" />
    </section>
  );
}


// ============================================================================
// Tab 4: Research (evidence_needed → question → answer + citation rate)
// ============================================================================

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-emerald-700 bg-emerald-50 border-emerald-200",
  medium: "text-amber-700 bg-amber-50 border-amber-200",
  low: "text-red-700 bg-red-50 border-red-200",
};

function ResearchTab({
  evidenceResearch,
  citationAnalysis,
}: {
  evidenceResearch?: EvidenceResearch;
  citationAnalysis?: CitationAnalysis;
}) {
  if (!evidenceResearch || !evidenceResearch.sections?.length) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No evidence research data. Run a new eval to generate research.
      </Card>
    );
  }

  const rate = citationAnalysis?.citation_rate ?? 0;
  const rateColor = rate >= 0.5 ? "text-emerald-700" : rate >= 0.25 ? "text-amber-700" : "text-red-700";

  return (
    <section className="space-y-6">
      {/* Citation rate summary */}
      {citationAnalysis && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Evidence Tasks</div>
            <span className="font-mono font-medium text-lg">{citationAnalysis.total_tasks}</span>
          </div>
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Cited in Path A</div>
            <span className="font-mono font-medium text-lg">{citationAnalysis.cited_tasks}</span>
            <span className="text-xs text-muted-foreground ml-1">/ {citationAnalysis.total_tasks}</span>
          </div>
          <div className="border rounded-lg p-3 bg-muted/30">
            <div className="text-xs text-muted-foreground mb-1">Citation Rate</div>
            <span className={`font-mono font-medium text-lg ${rateColor}`}>
              {Math.round(rate * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Per-section evidence table */}
      {evidenceResearch.sections.map((section, si) => {
        const citationSection = citationAnalysis?.per_section?.[si];
        return (
          <div key={si} className="border rounded-lg overflow-hidden">
            {/* Section header */}
            <div className="px-4 py-2.5 bg-muted/40 border-b font-medium text-sm">
              {section.section_title}
              {citationSection && (() => {
                const cited = citationSection.tasks.filter(t => t.cited).length;
                const total = citationSection.tasks.length;
                return (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({cited}/{total} cited)
                  </span>
                );
              })()}
            </div>

            {/* Evidence tasks table */}
            <table className="w-full text-sm">
              <thead className="bg-muted/20">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-[22%]">Evidence Needed</th>
                  <th className="text-left px-3 py-2 font-medium w-[22%]">Research Question</th>
                  <th className="text-left px-3 py-2 font-medium w-[36%]">Answer</th>
                  <th className="text-left px-3 py-2 font-medium w-[10%]">Confidence</th>
                  <th className="text-left px-3 py-2 font-medium w-[10%]">Cited?</th>
                </tr>
              </thead>
              <tbody>
                {section.evidence_tasks.map((task, ti) => {
                  const citation = citationSection?.tasks?.[ti];
                  const answer = task.answer;
                  const conf = answer?.confidence || "low";
                  return (
                    <tr key={ti} className="border-t align-top">
                      <td className="px-3 py-2 text-xs">{task.evidence_needed}</td>
                      <td className="px-3 py-2 text-xs italic text-muted-foreground">{task.research_question}</td>
                      <td className="px-3 py-2">
                        {answer ? (
                          <div className="space-y-1">
                            <p className="text-xs">{answer.summary}</p>
                            <p className="text-xs bg-muted/30 rounded px-2 py-1 italic">
                              &ldquo;{answer.usable_line}&rdquo;
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Source: {answer.source_description}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">No answer</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={`text-[10px] ${CONFIDENCE_COLORS[conf] || ""}`}>
                          {conf}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {citation ? (
                          <Badge variant={citation.cited ? "default" : "secondary"} className="text-[10px]">
                            {citation.cited ? "Yes" : "No"}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </section>
  );
}


// ============================================================================
// Analysis (below tabs)
// ============================================================================

function AnalysisSection({ analysis }: { analysis: NonNullable<EvalData["analysis"]> }) {
  return (
    <section>
      <h2 className="text-xl font-medium flex items-center gap-2 mb-3">
        <AlertTriangle className="h-5 w-5" />
        Analysis
      </h2>
      <Card className="p-4 space-y-3">
        <div>
          <h3 className="text-base font-medium mb-2">Key Findings</h3>
          <ul className="space-y-1">
            {analysis.summary.map((line, i) => (
              <li key={i} className="text-base flex items-start gap-2">
                <span className="text-destructive mt-0.5">&bull;</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>

        {(analysis.writer_path_b.filler_phrases.length > 0 || analysis.writer_path_a.filler_phrases.length > 0) && (
          <div>
            <h3 className="text-base font-medium mb-2">Filler Phrases Detected</h3>
            {analysis.writer_path_b.filler_phrases.length > 0 && (
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Path B:</span>
                <ul className="ml-4">
                  {analysis.writer_path_b.filler_phrases.map((f, i) => (
                    <li key={i} className="text-base text-destructive">{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.writer_path_a.filler_phrases.length > 0 && (
              <div>
                <span className="text-xs text-muted-foreground">Path A:</span>
                <ul className="ml-4">
                  {analysis.writer_path_a.filler_phrases.map((f, i) => (
                    <li key={i} className="text-base text-destructive">{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </section>
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
              View Diffs &rarr;
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
