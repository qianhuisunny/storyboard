/**
 * CollapsibleSection - Collapsed view of completed sections.
 * Shows a green checkmark and can be expanded to view content.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  completed: boolean;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

export default function CollapsibleSection({
  title,
  completed,
  children,
  defaultExpanded = false,
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={cn("border rounded-lg overflow-hidden", completed ? "border-green-200" : "border-border")}>
      {/* Header - clickable to toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center justify-between px-4 py-3 text-left transition-colors",
          completed ? "bg-green-50 hover:bg-green-100" : "bg-muted/50 hover:bg-muted"
        )}
      >
        <div className="flex items-center gap-3">
          {/* Status Icon */}
          {completed ? (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </span>
          ) : (
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-muted-foreground/20 text-muted-foreground">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
          )}

          {/* Title */}
          <span className={cn("font-medium", completed ? "text-green-700" : "text-foreground")}>
            {title}
          </span>

          {/* Completed badge */}
          {completed && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded">
              Confirmed
            </span>
          )}
        </div>

        {/* Expand/Collapse Icon */}
        <svg
          className={cn(
            "w-5 h-5 text-muted-foreground transition-transform",
            isExpanded && "rotate-180"
          )}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Content - collapsible */}
      {isExpanded && (
        <div className="px-4 py-4 border-t border-border/50 bg-background">{children}</div>
      )}
    </div>
  );
}
