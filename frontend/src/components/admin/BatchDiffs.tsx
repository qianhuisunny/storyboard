import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router-dom";
import { ChevronRight, ChevronDown, ArrowLeft } from "lucide-react";
import {
  MetricCard,
  SectionDiff,
  StoryboardDiff,
  type EvalData,
} from "./eval-components";

interface BatchReport {
  gold_sets_run: string[];
  videos_completed: number;
}

interface DiffRowProps {
  name: string;
}

function DiffRow({ name }: DiffRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<EvalData | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = () => {
    if (!expanded && !data) {
      setLoading(true);
      fetch(`/api/eval/gold-set/${name}`)
        .then(r => r.json())
        .then(j => { if (j.success) setData(j.data); })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    setExpanded(!expanded);
  };

  const analysis = data?.analysis;
  const judge = data?.judge;

  const secGold = analysis?.director.section_count.gold ?? "?";
  const secAi = analysis?.director.section_count.ai ?? "?";
  const scrGold = analysis?.writer_path_b.screen_count.gold ?? "?";
  const scrAi = analysis?.writer_path_b.screen_count.ai ?? "?";
  const tagCount = judge
    ? Object.values(judge.outline_quality ?? {}).reduce((s, d) => s + (d.tags?.length ?? 0), 0) +
      Object.values(judge.storyboard_quality ?? {}).reduce((s, d) => s + (d.tags?.length ?? 0), 0)
    : 0;

  return (
    <div className="border rounded-lg">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="font-medium text-sm flex-1">{name}</span>
        {data && (
          <span className="text-xs text-muted-foreground font-mono">
            Sec: {secGold}&rarr;{secAi}  Scr: {scrGold}&rarr;{scrAi}  Tags: {tagCount}
          </span>
        )}
        {!data && !loading && <span className="text-xs text-muted-foreground">Click to load</span>}
        {loading && <span className="text-xs text-muted-foreground">Loading...</span>}
      </button>

      {expanded && data && (
        <div className="px-4 pb-4 space-y-6 border-t">
          {/* Quality Tags */}
          {judge && (
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Quality Tags</h3>
              <div className="space-y-2">
                {(["outline_quality", "storyboard_quality"] as const).map(layerKey => {
                  const layer = judge[layerKey];
                  if (!layer) return null;
                  const hasTags = Object.values(layer).some(d => d.tags?.length > 0);
                  if (!hasTags) return null;
                  return (
                    <div key={layerKey}>
                      <span className="text-xs font-medium text-muted-foreground capitalize">
                        {layerKey.replace("_quality", "")}
                      </span>
                      {Object.entries(layer).map(([dim, d]) => {
                        if (!d.tags?.length) return null;
                        return (
                          <div key={dim} className="ml-2 mt-1">
                            <span className="text-xs">
                              <span className="font-mono">{dim}</span>:{" "}
                              {d.tags.map((t: string, i: number) => (
                                <Badge key={i} variant="destructive" className="text-xs mr-1">{t}</Badge>
                              ))}
                            </span>
                            {d.notes && <p className="text-xs text-muted-foreground ml-2 mt-0.5">&ldquo;{d.notes}&rdquo;</p>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Outline Diff */}
          {analysis && (
            <div>
              <h3 className="text-sm font-medium mb-2">Outline — Gold vs AI</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MetricCard label="Sections" gold={analysis.director.section_count.gold} ai={analysis.director.section_count.ai} />
                <MetricCard label="Total Duration" gold={`${analysis.director.gold_duration_sec}s`} ai={analysis.director.ai_duration_estimate} />
                <MetricCard
                  label="Talking Points"
                  gold={data.gold.outline.reduce((s: number, sec) => s + sec.talking_points.length, 0)}
                  ai={analysis.director.ai_sections.reduce((s: number, sec) => s + sec.talking_points.length, 0)}
                />
              </div>
              <SectionDiff gold={data.gold.outline} aiSections={analysis.director.ai_sections} />
            </div>
          )}

          {/* Storyboard Diff */}
          {data.writer_output_path_b && analysis && (
            <div>
              <h3 className="text-sm font-medium mb-2">Storyboard — Gold vs AI</h3>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <MetricCard label="Screens" gold={analysis.writer_path_b.screen_count.gold} ai={analysis.writer_path_b.screen_count.ai} />
                <MetricCard label="Avg Words/Screen" gold={analysis.writer_path_b.avg_words_per_screen.gold} ai={analysis.writer_path_b.avg_words_per_screen.ai} />
                <MetricCard label="Total Words" gold={analysis.writer_path_b.total_words.gold} ai={analysis.writer_path_b.total_words.ai} />
              </div>
              <StoryboardDiff gold={data.gold.storyboard} ai={data.writer_output_path_b} pathLabel="Gold Outline → Writer" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function BatchDiffs() {
  const [report, setReport] = useState<BatchReport | null>(null);

  useEffect(() => {
    fetch("/api/eval/batch/report")
      .then(r => r.json())
      .then(j => { if (j.success) setReport(j.report); })
      .catch(() => {});
  }, []);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin/gold-set-eval#batch" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to Batch
        </Link>
        <h1 className="text-2xl font-semibold">
          Batch Diffs — {report?.videos_completed ?? 0} gold sets
        </h1>
      </div>

      {!report && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">No batch report found. Run a batch evaluation first.</p>
        </Card>
      )}

      {report && (
        <div className="space-y-2">
          {report.gold_sets_run.map(name => (
            <DiffRow key={name} name={name} />
          ))}
        </div>
      )}
    </div>
  );
}
