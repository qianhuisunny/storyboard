interface ScoreDisplayProps {
  label: string;
  score: number;
  feedback?: string;
}

const scoreColor = (score: number): string => {
  if (score >= 7.0) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 6.0) return "text-yellow-700 bg-yellow-50 border-yellow-200";
  return "text-red-700 bg-red-50 border-red-200";
};

export function ScoreDisplay({ label, score, feedback }: ScoreDisplayProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-sm font-medium tabular-nums ${scoreColor(score)}`}
        >
          {score.toFixed(1)}
        </span>
        {feedback && (
          <span className="text-xs text-muted-foreground max-w-[200px] truncate" title={feedback}>
            {feedback}
          </span>
        )}
      </div>
    </div>
  );
}
