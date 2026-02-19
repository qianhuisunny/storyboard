import { cn } from "@/lib/utils";
import { Pencil, FileInput, Cpu, Code } from "lucide-react";
import type { TabKey, TabToggleProps } from "./types";

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "user", label: "Review & Edit", icon: <Pencil className="w-4 h-4" /> },
  { key: "input", label: "Input", icon: <FileInput className="w-4 h-4" /> },
  { key: "processing", label: "Processing", icon: <Cpu className="w-4 h-4" /> },
  { key: "output", label: "Output", icon: <Code className="w-4 h-4" /> },
];

/**
 * TabToggle - Four-tab navigation for the Review Builder.
 * Switches between Review & Edit, Input, Processing, and Output views.
 */
export default function TabToggle({ activeTab, onChange }: TabToggleProps) {
  return (
    <div className="flex border-b border-border bg-muted/30">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={cn(
            "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
            "border-b-2 -mb-px",
            activeTab === tab.key
              ? "border-primary text-primary bg-background"
              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          {tab.icon}
          <span className="hidden sm:inline">{tab.label}</span>
        </button>
      ))}
    </div>
  );
}
