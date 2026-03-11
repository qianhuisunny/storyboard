/**
 * LoadingState component - Shows streaming search queries with progress
 */

import type { LoadingStateProps, SearchEvent } from "../types";
import { Search, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function LoadingState({ searchEvents }: LoadingStateProps) {
  if (searchEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          Starting research...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Searching for relevant information...
      </p>
      {searchEvents.map((event) => (
        <SearchQueryItem key={event.id} event={event} />
      ))}
    </div>
  );
}

function SearchQueryItem({ event }: { event: SearchEvent }) {
  const getIcon = () => {
    switch (event.status) {
      case "started":
        return <Loader2 className="w-4 h-4 animate-spin text-[#3A6B47]" />;
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-[#3A6B47]" />;
      case "error":
        return <XCircle className="w-4 h-4 text-[#A63228]" />;
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        event.status === "started" && "bg-[#E8F0E9] border-[#5A6352]/20",
        event.status === "complete" && "bg-[#E6F2EB] border-[#2D6A4F]/20",
        event.status === "error" && "bg-[#FBEAE8] border-[#A63228]/20"
      )}
    >
      <div className="flex-shrink-0 mt-0.5">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Search className="w-3 h-3 text-muted-foreground" />
          <span className="text-sm font-medium truncate">{event.query}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{event.purpose}</p>
        {event.status === "complete" && event.resultsCount !== undefined && (
          <p className="text-xs text-[#3A6B47] mt-1">
            Found {event.resultsCount} result{event.resultsCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export default LoadingState;
