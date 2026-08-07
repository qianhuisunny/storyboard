import React from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTypeColor, getTypeLabel } from "@/components/storyboardPanelUtils";
import type { StoryboardPanelType } from "@/components/StoryboardPanel";

interface StoryboardSidebarProps {
  panels: StoryboardPanelType[];
  selectedPanelId: string | null;
  onPanelSelect: (panelId: string) => void;
  onScrollTo: (panelId: string) => void;
}

const StoryboardSidebar: React.FC<StoryboardSidebarProps> = ({
  panels,
  selectedPanelId,
  onPanelSelect,
  onScrollTo,
}) => {
  const handlePanelClick = (panelId: string) => {
    onPanelSelect(panelId);
    onScrollTo(panelId);
  };

  const totalDuration = panels.reduce(
    (total, panel) => total + panel.duration,
    0
  );

  return (
    <div className="w-80 bg-background border-r border-border flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-lg">Storyboard</h3>
          <Badge variant="outline" className="text-xs">
            {panels.length} Screens
          </Badge>
        </div>
        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          <span>
            Total: {Math.floor(totalDuration / 60)}:
            {(totalDuration % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 italic">
          Click any panel to scroll to position
        </p>
      </div>

      {/* Panels List */}
      <div className="flex-1 overflow-auto">
        <div className="p-2">
          {panels.map((panel, index) => (
            <div
              key={panel.id}
              className={cn(
                "flex flex-col items-start p-3 rounded-lg cursor-pointer transition-all hover:bg-muted/70 hover:shadow-sm mb-2 border",
                selectedPanelId === panel.id
                  ? "bg-primary/10 border-primary/30 shadow-sm"
                  : "border-transparent hover:border-muted-foreground/20"
              )}
              onClick={() => handlePanelClick(panel.id)}
              title={`Scroll to Panel ${
                panels.findIndex((p) => p.id === panel.id) + 1
              }: ${panel.title}`}
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">Panel {index + 1}</span>
                  <Badge
                    className={cn(
                      "text-white text-xs",
                      getTypeColor(panel.type)
                    )}
                    style={{ fontSize: "10px", padding: "2px 6px" }}
                  >
                    {getTypeLabel(panel.type)}
                  </Badge>
                </div>
              </div>

              {/* Panel Title */}
              <h4 className="text-sm font-medium text-foreground line-clamp-2 mb-1 text-left">
                {panel.description}
              </h4>

              {/* Progress Indicator */}
              <div className="mt-2">
                <div className="w-full bg-muted rounded-full h-1">
                  <div
                    className="bg-primary rounded-full h-1 transition-all"
                    style={{
                      width: selectedPanelId === panel.id ? "100%" : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer Stats */}
      <div className="p-4 border-t border-border">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold text-foreground">
              {panels.length}
            </div>
            <div className="text-xs text-muted-foreground">Total Screens</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">
              {totalDuration}s
            </div>
            <div className="text-xs text-muted-foreground">Total Duration</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryboardSidebar;
