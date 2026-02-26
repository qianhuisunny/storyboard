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
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case "complete":
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "error":
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors",
        event.status === "started" && "bg-blue-50 border-blue-200",
        event.status === "complete" && "bg-green-50 border-green-200",
        event.status === "error" && "bg-red-50 border-red-200"
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
          <p className="text-xs text-green-600 mt-1">
            Found {event.resultsCount} result{event.resultsCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </div>
  );
}

export default LoadingState;
