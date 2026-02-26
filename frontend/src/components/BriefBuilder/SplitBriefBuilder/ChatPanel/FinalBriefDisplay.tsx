/**
 * FinalBriefDisplay component - Shows the completed brief with action buttons
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Edit2, CheckCircle2 } from "lucide-react";
import type { FinalBriefDisplayProps } from "../types";

export function FinalBriefDisplay({
  brief,
  onSendToStoryboard,
  onEditBrief,
}: FinalBriefDisplayProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              Story Brief Complete
            </CardTitle>
            <Badge variant="secondary">{brief.video_type}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Video Goal */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Video Goal</h4>
            <p className="text-sm mt-1">{brief.video_goal}</p>
          </div>

          {/* Target Audience */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground">Target Audience</h4>
            <p className="text-sm mt-1">{brief.target_audience}</p>
          </div>

          {/* Key Points */}
          {brief.key_points && brief.key_points.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Key Points</h4>
              <ul className="text-sm mt-1 space-y-1">
                {brief.key_points.map((point, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-green-600">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Problem */}
          {brief.problem && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Problem Addressed</h4>
              <p className="text-sm mt-1">{brief.problem.description}</p>
            </div>
          )}

          {/* Core Interaction Steps */}
          {brief.core_interaction_steps && brief.core_interaction_steps.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Core Steps</h4>
              <ol className="text-sm mt-1 space-y-1 list-decimal list-inside">
                {brief.core_interaction_steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {/* Constraints */}
          {brief.constraints && brief.constraints.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Constraints</h4>
              <ul className="text-sm mt-1 space-y-1">
                {brief.constraints.map((constraint, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-600">!</span>
                    {constraint}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* CTA */}
          {brief.cta && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground">Call to Action</h4>
              <p className="text-sm mt-1">{brief.cta}</p>
            </div>
          )}

          {/* Metadata row */}
          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Badge variant="outline">{brief.tone_and_style}</Badge>
            <Badge variant="outline">{brief.desired_length}s</Badge>
            <Badge variant="outline">{brief.format_or_platform}</Badge>
            {brief.show_face === "Yes" && <Badge variant="outline">Face on camera</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onSendToStoryboard}
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          Send to Storyboard
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
        <Button onClick={onEditBrief} variant="outline">
          <Edit2 className="w-4 h-4 mr-2" />
          Edit Brief
        </Button>
      </div>
    </div>
  );
}

export default FinalBriefDisplay;
