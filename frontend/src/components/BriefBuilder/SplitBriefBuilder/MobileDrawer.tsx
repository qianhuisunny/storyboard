/**
 * MobileDrawer component - Collapsible research drawer for mobile
 */

import type { MobileDrawerProps } from "./types";
import { ResearchPanel } from "./ResearchPanel";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, Search, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileDrawer({
  isOpen,
  onToggle,
  status,
  findings,
  searchEvents,
  error,
  angle,
  researchPhase,
  round1Events,
  round1Findings,
  round3Events,
  round3Findings,
}: MobileDrawerProps) {
  const getStatusIcon = () => {
    switch (status) {
      case "running":
        return <Search className="w-4 h-4 animate-pulse" />;
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case "error":
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Search className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "running":
        return `Researching... (${searchEvents.filter(e => e.status === "complete").length}/${searchEvents.length})`;
      case "complete":
        return "Research complete";
      case "error":
        return "Error";
      default:
        return "Research";
    }
  };

  return (
    <>
      {/* Toggle button - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 md:hidden z-40">
        <Button
          onClick={onToggle}
          variant="secondary"
          className={cn(
            "w-full rounded-none border-t h-12 justify-between px-4",
            status === "running" && "bg-blue-50",
            status === "complete" && "bg-green-50",
            status === "error" && "bg-red-50"
          )}
        >
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="text-sm font-medium">{getStatusText()}</span>
          </div>
          {isOpen ? (
            <ChevronDown className="w-5 h-5" />
          ) : (
            <ChevronUp className="w-5 h-5" />
          )}
        </Button>
      </div>

      {/* Drawer content */}
      <div
        className={cn(
          "fixed left-0 right-0 bottom-12 md:hidden z-30 bg-background border-t shadow-lg transition-transform duration-300 ease-in-out",
          isOpen ? "translate-y-0" : "translate-y-full"
        )}
        style={{ maxHeight: "60vh" }}
      >
        <div className="h-full overflow-hidden">
          <ResearchPanel
            status={status}
            findings={findings}
            searchEvents={searchEvents}
            error={error}
            angle={angle}
            researchPhase={researchPhase}
            round1Events={round1Events}
            round1Findings={round1Findings}
            round3Events={round3Events}
            round3Findings={round3Findings}
          />
        </div>
      </div>

      {/* Overlay when drawer is open */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-20 md:hidden"
          onClick={onToggle}
        />
      )}
    </>
  );
}

export default MobileDrawer;
