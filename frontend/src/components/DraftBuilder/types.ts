/**
 * TypeScript types for the Draft Builder component.
 * Defines interfaces for ProductionScreen, component props, and helpers.
 */

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Screen types for production
export type ProductionScreenType =
  | "stock_video"
  | "screencast"
  | "talking_head"
  | "slide"
  | "animation"
  | "b_roll"
  | "text_overlay"
  | "demo"
  | "intro"
  | "outro";

// Visual style for screen type badges
export const SCREEN_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  stock_video: { label: "Stock Video", color: "bg-blue-100 text-blue-700 border-blue-200", icon: "video" },
  screencast: { label: "Screencast", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "monitor" },
  talking_head: { label: "Talking Head", color: "bg-green-100 text-green-700 border-green-200", icon: "user" },
  slide: { label: "Slide", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "presentation" },
  animation: { label: "Animation", color: "bg-pink-100 text-pink-700 border-pink-200", icon: "sparkles" },
  b_roll: { label: "B-Roll", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: "film" },
  text_overlay: { label: "Text Overlay", color: "bg-orange-100 text-orange-700 border-orange-200", icon: "type" },
  demo: { label: "Demo", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "play-circle" },
  intro: { label: "Intro", color: "bg-teal-100 text-teal-700 border-teal-200", icon: "flag" },
  outro: { label: "Outro", color: "bg-gray-100 text-gray-700 border-gray-200", icon: "flag" },
  // Fallbacks for outline screen types
  hook: { label: "Hook", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "zap" },
  problem: { label: "Problem", color: "bg-red-100 text-red-700 border-red-200", icon: "alert-circle" },
  solution: { label: "Solution", color: "bg-green-100 text-green-700 border-green-200", icon: "check-circle" },
  benefit: { label: "Benefit", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "star" },
  social_proof: { label: "Social Proof", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "users" },
  cta: { label: "CTA", color: "bg-orange-100 text-orange-700 border-orange-200", icon: "arrow-right" },
  step: { label: "Step", color: "bg-teal-100 text-teal-700 border-teal-200", icon: "list-ordered" },
  tip: { label: "Tip", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "lightbulb" },
  warning: { label: "Warning", color: "bg-rose-100 text-rose-700 border-rose-200", icon: "alert-triangle" },
  recap: { label: "Recap", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "repeat" },
};

// Individual production screen in the storyboard
export interface ProductionScreen {
  screen_number: number;
  screen_type: string;
  target_duration_sec: number;
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
  outlineSummary?: {
    total_screens?: number;
    target_duration?: string;
    video_type?: string;
  };
  previousStageOutput?: Record<string, unknown> | null; // Stage 2 screen outlines
  processingLog: DraftProcessingEntry[];
  onDraftUpdate: (screens: ProductionScreen[]) => void;
  onConfirm: () => void;
}

// TabToggle props
export interface TabToggleProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

// UserView props
export interface UserViewProps {
  screens: ProductionScreen[];
  outlineSummary?: DraftBuilderProps["outlineSummary"];
  onScreensChange: (screens: ProductionScreen[]) => void;
  onConfirm: () => void;
}

// PanelCard props
export interface PanelCardProps {
  screen: ProductionScreen;
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
    screen_type: raw.screen_type ?? "demo",
    voiceover_text: raw.voiceover_text ?? "",
    visual_direction: raw.visual_direction ?? [],
    on_screen_visual: raw.on_screen_visual ?? "",
    action_notes: raw.action_notes ?? "",
    text_overlay: raw.text_overlay ?? "",
    target_duration_sec: raw.target_duration_sec ?? 5,
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
  return screens.reduce((sum, s) => sum + (s.target_duration_sec || 0), 0);
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
