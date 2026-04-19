/**
 * TypeScript types for the Draft Builder component.
 * Defines interfaces for ProductionScreen, component props, and helpers.
 */

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Screen types for production (visual format)
export type ProductionScreenType =
  | "talking_head"
  | "slides"
  | "stock_footage"
  | "real_world";

// Visual style for screen type badges
export const SCREEN_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  // Active screen types
  talking_head: { label: "Talking Head", color: "bg-[#E6F2EB] text-[#3A6B47] border-[#2D6A4F]/20", icon: "user" },
  slides: { label: "Slides / Animation", color: "bg-[#F7F0E0] text-[#7A5C1E] border-[#7A5C1E]/20", icon: "presentation" },
  stock_footage: { label: "Stock Video", color: "bg-[#E8F0E9] text-[#3A6B47] border-[#D9DDD2]", icon: "video" },
  real_world: { label: "Real Recording", color: "bg-[#E8F0E9] text-[#5A6352] border-[#D9DDD2]", icon: "camera" },
  // Legacy fallbacks for existing project data
  whiteboard_animation: { label: "Slides / Animation", color: "bg-[#F7F0E0] text-[#7A5C1E] border-[#7A5C1E]/20", icon: "presentation" },
  whiteboard: { label: "Slides / Animation", color: "bg-[#F7F0E0] text-[#7A5C1E] border-[#7A5C1E]/20", icon: "presentation" },
  screen_recording: { label: "Real Recording", color: "bg-[#E8F0E9] text-[#5A6352] border-[#D9DDD2]", icon: "camera" },
  code_editor: { label: "Real Recording", color: "bg-[#E8F0E9] text-[#5A6352] border-[#D9DDD2]", icon: "camera" },
  talking_head_with_split_screens: { label: "Talking Head", color: "bg-[#E6F2EB] text-[#3A6B47] border-[#2D6A4F]/20", icon: "user" },
  talking_head_left_with_notes: { label: "Talking Head", color: "bg-[#E6F2EB] text-[#3A6B47] border-[#2D6A4F]/20", icon: "user" },
  stock_video: { label: "Stock Video", color: "bg-[#E8F0E9] text-[#3A6B47] border-[#D9DDD2]", icon: "video" },
  screencast: { label: "Real Recording", color: "bg-[#E8F0E9] text-[#5A6352] border-[#D9DDD2]", icon: "camera" },
  slide: { label: "Slides / Animation", color: "bg-[#F7F0E0] text-[#7A5C1E] border-[#7A5C1E]/20", icon: "presentation" },
};

// Individual production screen in the storyboard
export interface ProductionScreen {
  screen_number: number;
  section_number?: number;
  section_title?: string;
  narrative_role?: string;
  screen_type: string;
  duration: number;
  voiceover_text: string;
  visual_direction: string | string[];
  on_screen_visual?: string;
  action_notes?: string;
  text_overlay?: string;
}

// Processing log entry for draft generation
export interface DraftProcessingEntry {
  id: string;
  step: string;
  timestamp?: string;
  details?: string;
  data?: unknown;
}

// Main component props
export interface DraftBuilderProps {
  draftData: ProductionScreen[];
  projectId: string;
  outlineSummary?: {
    total_screens?: number;
    target_duration?: string;
    video_type?: string;
  };
  previousStageOutput?: Record<string, unknown> | null; // Stage 2 screen outlines
  processingLog: DraftProcessingEntry[];
  onDraftUpdate: (screens: ProductionScreen[]) => void;
  onConfirm: () => void;
  storyboardEval?: import("../QualityScore").QualityEvalResult | null;
}

// TabToggle props
export interface TabToggleProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

// UserView props
export interface UserViewProps {
  screens: ProductionScreen[];
  projectId: string;
  outlineSummary?: DraftBuilderProps["outlineSummary"];
  onScreensChange: (screens: ProductionScreen[]) => void;
  onConfirm: () => void;
  storyboardEval?: import("../QualityScore").QualityEvalResult | null;
}

// PanelCard props
export interface PanelCardProps {
  screen: ProductionScreen;
  screenIndex: number;
  projectId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (screen: ProductionScreen) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

// ProcessingView props
export interface ProcessingViewProps {
  screens: ProductionScreen[];
  outlineSummary?: DraftBuilderProps["outlineSummary"];
  processingLog: DraftProcessingEntry[];
}

// InputView props - shows Stage 2 output (screen outlines)
export interface InputViewProps {
  previousStageOutput?: Record<string, unknown> | null;
  outlineSummary?: DraftBuilderProps["outlineSummary"];
}

// OutputView props
export interface OutputViewProps {
  screens: ProductionScreen[];
}

/**
 * Normalize a production screen object to ensure all fields exist.
 */
export function normalizeProductionScreen(raw: Partial<ProductionScreen>, index: number): ProductionScreen {
  return {
    screen_number: raw.screen_number ?? index + 1,
    screen_type: raw.screen_type ?? "slides",
    voiceover_text: raw.voiceover_text ?? "",
    visual_direction: raw.visual_direction ?? [],
    on_screen_visual: raw.on_screen_visual ?? "",
    action_notes: raw.action_notes ?? "",
    text_overlay: raw.text_overlay ?? "",
    duration: raw.duration ?? 5,
  };
}

/**
 * Parse production screens from JSON or array.
 */
export function parseProductionScreens(data: unknown): ProductionScreen[] {
  if (!data) return [];

  const arr = Array.isArray(data) ? data : [];
  return arr.map((item, index) => normalizeProductionScreen(item as Partial<ProductionScreen>, index));
}

/**
 * Calculate total duration of all screens.
 */
export function calculateTotalDuration(screens: ProductionScreen[]): number {
  return screens.reduce((sum, s) => sum + (s.duration || 0), 0);
}

/**
 * Format seconds as MM:SS.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Get visual direction as array.
 */
export function getVisualDirectionArray(direction: string | string[]): string[] {
  if (Array.isArray(direction)) return direction;
  if (typeof direction === "string" && direction.trim()) {
    return direction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}
