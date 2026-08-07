import type { StoryboardPanelType } from "@/components/StoryboardPanel";

export function getTypeColor(type: StoryboardPanelType["type"]) {
  const colors: Record<StoryboardPanelType["type"], string> = {
    "stock-video": "bg-[#3A6B47]",
    screencast: "bg-[#2D6A4F]",
    "talking-head": "bg-[#626B58]",
    cta: "bg-[#A63228]",
    "text-overlay": "bg-[#7A5C1E]",
  };
  return colors[type];
}

export function getTypeLabel(type: StoryboardPanelType["type"]) {
  const labels: Record<StoryboardPanelType["type"], string> = {
    "stock-video": "Stock Video",
    screencast: "Screencast",
    "talking-head": "Talking Head",
    cta: "Call to Action",
    "text-overlay": "Text Overlay",
  };
  return labels[type];
}
