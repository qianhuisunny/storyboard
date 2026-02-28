/**
 * AngleSummaryCard - Compact card showing the research plan
 * Stays visible during and after research
 */

import { CheckCircle2, Users, Target, Clock, Search } from "lucide-react";
import type { AngleSummary } from "../types";

interface AngleSummaryCardProps {
  angle: AngleSummary;
}

const audienceLevelLabels: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function AngleSummaryCard({ angle }: AngleSummaryCardProps) {
  return (
    <div className="bg-muted/50 rounded-lg p-3 border">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle2 className="w-4 h-4 text-green-600" />
        <span className="text-sm font-medium">Research Plan</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <Users className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate">
            {audienceLevelLabels[angle.audienceLevel] || angle.audienceLevel}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Target className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span className="truncate" title={angle.keyTakeaway}>
            {angle.keyTakeaway.length > 25
              ? `${angle.keyTakeaway.slice(0, 25)}...`
              : angle.keyTakeaway}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span>{angle.durationMinutes} min</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Search className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          <span>{angle.plannedQuestions} questions</span>
        </div>
      </div>
    </div>
  );
}

export default AngleSummaryCard;
