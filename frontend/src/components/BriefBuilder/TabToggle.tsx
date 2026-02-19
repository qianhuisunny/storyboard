import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { TabKey, TabToggleProps } from "./types";

interface Tab {
  key: TabKey;
  label: string;
}

const tabs: Tab[] = [
  { key: "user", label: "User" },
  { key: "input", label: "Input" },
  { key: "processing", label: "Processing" },
  { key: "output", label: "Output" },
];

/**
 * TabToggle - Three-tab navigation component with accessibility support.
 * Follows WAI-ARIA tab patterns with keyboard navigation.
 */
export default function TabToggle({ activeTab, onChange }: TabToggleProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let newIndex = currentIndex;

      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
          break;
        case "ArrowRight":
          event.preventDefault();
          newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
          break;
        case "Home":
          event.preventDefault();
          newIndex = 0;
          break;
        case "End":
          event.preventDefault();
          newIndex = tabs.length - 1;
          break;
        default:
          return;
      }

      // Focus and activate the new tab
      tabRefs.current[newIndex]?.focus();
      onChange(tabs[newIndex].key);
    },
    [onChange]
  );

  return (
    <div
      role="tablist"
      aria-label="Brief Builder Views"
      className="flex border-b border-border bg-background"
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.key;

        return (
          <button
            key={tab.key}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${tab.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              "px-4 py-3 text-sm font-medium transition-colors relative",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "hover:text-foreground hover:bg-muted/50",
              isActive
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            {tab.label}
            {/* Active indicator */}
            {isActive && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
