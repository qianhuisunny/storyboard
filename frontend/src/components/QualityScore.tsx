import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "./ui/card";

interface DimensionScore {
  dimension: string;
  score: number;
  feedback: string;
}

interface GutScore {
  score: number;
  feedback: string;
}

export interface GradeResult {
  passed: boolean;
  gut: GutScore;
  dimensions: DimensionScore[] | null;
  composite_score: number;
  attempt: number;
  total_attempts: number;
}

const DIMENSION_LABELS: Record<string, string> = {
  flow_coherence: "Flow",
  talking_point_sharpness: "Sharpness",
  evidence_fitness: "Evidence",
  brief_pov_alignment: "POV",
  section_necessity: "Necessity",
  instructional_progression: "Progression",
  context_rot: "Context",
  specificity_retention: "Specificity",
  source_fidelity: "Fidelity",
  redundancy: "Redundancy",
  handoff_integrity: "Handoff",
};

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-700";
  if (score >= 6) return "text-yellow-700";
  return "text-red-700";
}

export function QualityScore({ grade }: { grade: GradeResult }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">
            LLM as a Judge:{" "}
            <span className={scoreColor(grade.composite_score)}>
              {grade.composite_score}/10
            </span>
          </span>
          {grade.total_attempts > 1 && (
            <span className="text-xs text-muted-foreground">
              (attempt {grade.attempt} of {grade.total_attempts})
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Watchability
              </span>
              <span className={`text-sm font-medium ${scoreColor(grade.gut.score)}`}>
                {grade.gut.score}/10
              </span>
            </div>
            <p className="text-sm text-foreground/80 italic">
              &ldquo;{grade.gut.feedback}&rdquo;
            </p>
          </div>

          {grade.dimensions && (
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {grade.dimensions.map((d) => (
                <span key={d.dimension} className="text-xs text-muted-foreground">
                  {DIMENSION_LABELS[d.dimension] || d.dimension}:{" "}
                  <span className={`font-medium ${scoreColor(d.score)}`}>
                    {d.score}
                  </span>
                </span>
              ))}
            </div>
          )}

          {grade.dimensions && (
            <details className="group">
              <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:text-foreground">
                Detailed feedback
              </summary>
              <div className="mt-2 space-y-2 pl-2 border-l-2 border-border">
                {grade.dimensions.map((d) => (
                  <div key={d.dimension}>
                    <span className="text-xs font-medium text-foreground">
                      {DIMENSION_LABELS[d.dimension] || d.dimension}{" "}
                      <span className={scoreColor(d.score)}>({d.score}/10)</span>
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.feedback}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
