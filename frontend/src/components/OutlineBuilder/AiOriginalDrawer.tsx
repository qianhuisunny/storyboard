/**
 * AiOriginalDrawer — Read-only side panel showing the AI-generated outline.
 * Slides in from the right when "View AI Original" is clicked.
 */

import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseOutline } from "./outlineParser";
import type { OutlineSection } from "./types";

interface AiOriginalDrawerProps {
  aiContent: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function AiOriginalDrawer({
  aiContent,
  isOpen,
  onClose,
}: AiOriginalDrawerProps) {
  const sections = parseOutline(aiContent);

  return (
    <div
      className={cn(
        "overflow-hidden border-l border-border bg-muted/20 transition-all duration-300 ease-in-out flex-shrink-0",
        isOpen ? "w-[420px]" : "w-0 border-l-0"
      )}
    >
      {isOpen && (
        <div className="w-[420px] h-full flex flex-col">
          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center justify-between shrink-0 bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground">
                AI Original
              </h3>
              <span className="text-[10px] font-medium text-muted-foreground bg-border/60 px-2 py-0.5 rounded">
                Read-only
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-border/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Sections */}
          <div className="flex-1 overflow-y-auto">
            {sections.map((section, i) => (
              <DrawerSection
                key={section.id}
                section={section}
                index={i}
                isLast={i === sections.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DrawerSection({
  section,
  index,
  isLast,
}: {
  section: OutlineSection;
  index: number;
  isLast: boolean;
}) {
  return (
    <div
      className={cn(
        "px-5 py-4",
        !isLast && "border-b border-border/50"
      )}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs font-semibold text-muted-foreground">
          Section {index + 1}
        </span>
        {section.duration && (
          <span className="text-[10px] text-muted-foreground">
            {section.duration}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold mb-3">{section.title}</p>

      {section.purpose && (
        <div className="mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Purpose
          </p>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            {section.purpose}
          </p>
        </div>
      )}

      {section.talkingPoints.length > 0 && (
        <div className="mb-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Talking Points
          </p>
          {section.talkingPoints.map((tp, j) => (
            <p
              key={j}
              className="text-[13px] text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/40 mb-1"
            >
              {tp}
            </p>
          ))}
        </div>
      )}

      {section.evidenceNeeded.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
            Evidence Needed
          </p>
          {section.evidenceNeeded.map((ev, j) => (
            <p
              key={j}
              className="text-[13px] text-muted-foreground leading-relaxed pl-3 border-l-2 border-border/40 mb-1"
            >
              {ev}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
