import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import StoryboardImage from "@/components/StoryboardImage";
import { getTypeColor, getTypeLabel } from "@/components/storyboardPanelUtils";

export interface StoryboardPanelType {
  id: string;
  title: string;
  description: string;
  type: "stock-video" | "screencast" | "talking-head" | "cta" | "text-overlay";
  duration: number;
  imageUrl?: string;
  notes?: string;
}

interface StoryboardPanelProps {
  panel: StoryboardPanelType;
  index: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

const StoryboardPanel: React.FC<StoryboardPanelProps> = ({
  panel,
  index,
  isSelected,
  onSelect,
}) => {
  return (
    <Card
      className={cn(
        "p-4 cursor-pointer transition-all hover:shadow-md w-full",
        isSelected && "ring-2 ring-primary"
      )}
      onClick={() => onSelect(panel.id)}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
        <div className="flex items-center space-x-3">
          <span className="text-lg font-semibold text-foreground">
            Panel {index + 1}
          </span>
          <Badge className={cn("text-white", getTypeColor(panel.type))}>
            {getTypeLabel(panel.type)}
          </Badge>
          <div className="flex items-center space-x-1 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{panel.duration}s</span>
          </div>
        </div>
        {/* Additional Actions */}
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              // Add edit functionality here
            }}
          >
            <Edit className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      </div>

      {/* Panel Content - Image Left, Metadata Right */}
      <div className="flex gap-6">
        {/* Panel Image - Left Side */}
        <StoryboardImage
          imageUrl={panel.imageUrl}
          alt={`${panel.title} preview`}
        />

        {/* Panel Metadata - Right Side */}
        <div className="flex-1 space-y-3">
          <div>
            <h3 className="font-semibold text-base text-foreground mb-2 text-left">
              {panel.description}
            </h3>
          </div>

          {panel.notes && (
            <div className="pt-2 border-t border-border">
              <p className="text-sm text-[#3A6B47] italic text-left">
                <span className="font-medium">Note:</span> {panel.notes}
              </p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default StoryboardPanel;
