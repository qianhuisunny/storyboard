/**
 * CollapsibleSection - Collapsed view of completed sections.
 * Option C neutral card style: #F8F8F6 bg, green checkmark icon, muted badge.
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
    <div>
      {/* Header — Option C neutral card */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          "w-full flex items-center text-left transition-all",
          "hover:bg-[#EEF1E9] hover:border-[#BFC6B5]"
        )}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "13px 16px",
          marginBottom: isExpanded ? "0" : "8px",
          background: "#F8F8F6",
          border: "1px solid #D9DDD2",
          borderRadius: isExpanded ? "8px 8px 0 0" : "8px",
          cursor: "pointer",
        }}
      >
        {/* Status Icon */}
        {completed ? (
          <span
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#3A6B47",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
        ) : (
          <span
            className="flex items-center justify-center"
            style={{
              width: "22px",
              height: "22px",
              borderRadius: "50%",
              background: "#EEF1E9",
              color: "#626B58",
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
            </svg>
          </span>
        )}

        {/* Title */}
        <span style={{ fontSize: "13px", fontWeight: 500, color: "#1C2118" }}>
          {title}
        </span>

        {/* Confirmed badge */}
        {completed && (
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.3px",
              padding: "2px 7px",
              borderRadius: "20px",
              textTransform: "uppercase",
              color: "#626B58",
              background: "#EEF1E9",
            }}
          >
            Confirmed
          </span>
        )}

        {/* Chevron — right-aligned */}
        <svg
          className={cn("transition-transform", isExpanded && "rotate-180")}
          style={{ marginLeft: "auto", color: "#626B58" }}
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Content — collapsible */}
      {isExpanded && (
        <div
          style={{
            padding: "16px",
            borderLeft: "1px solid #D9DDD2",
            borderRight: "1px solid #D9DDD2",
            borderBottom: "1px solid #D9DDD2",
            borderRadius: "0 0 8px 8px",
            background: "white",
            marginBottom: "8px",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
