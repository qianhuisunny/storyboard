/**
 * TypeScript types for the Outline Builder component.
 * Defines interfaces for ScreenOutline, component props, and helpers.
 */

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Screen types available
export type ScreenType =
  | "hook"
  | "problem"
  | "solution"
  | "demo"
  | "benefit"
  | "social_proof"
  | "cta"
  | "intro"
  | "step"
  | "tip"
  | "warning"
  | "recap"
  | "outro";

// Visual style for screen type badges
export const SCREEN_TYPE_CONFIG: Record<
  ScreenType,
  { label: string; color: string; icon: string }
> = {
  hook: { label: "Hook", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "zap" },
  problem: { label: "Problem", color: "bg-red-100 text-red-700 border-red-200", icon: "alert-circle" },
  solution: { label: "Solution", color: "bg-green-100 text-green-700 border-green-200", icon: "check-circle" },
  demo: { label: "Demo", color: "bg-blue-100 text-blue-700 border-blue-200", icon: "play-circle" },
  benefit: { label: "Benefit", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "star" },
  social_proof: { label: "Social Proof", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "users" },
  cta: { label: "CTA", color: "bg-orange-100 text-orange-700 border-orange-200", icon: "arrow-right" },
  intro: { label: "Intro", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: "film" },
  step: { label: "Step", color: "bg-teal-100 text-teal-700 border-teal-200", icon: "list-ordered" },
  tip: { label: "Tip", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: "lightbulb" },
  warning: { label: "Warning", color: "bg-rose-100 text-rose-700 border-rose-200", icon: "alert-triangle" },
  recap: { label: "Recap", color: "bg-slate-100 text-slate-700 border-slate-200", icon: "repeat" },
  outro: { label: "Outro", color: "bg-gray-100 text-gray-700 border-gray-200", icon: "flag" },
};

// Individual screen in the outline
export interface Screen {
  screen_number: number;
  screen_type: ScreenType | string;
  voiceover_text: string;
  visual_direction: string;
  text_overlay?: string;
  target_duration_sec?: number;
  notes?: string;
  auto_filled?: boolean;
}

// Processing log entry for outline generation
export interface OutlineProcessingEntry {
  id: string;
  step: string;
  timestamp?: string;
  details?: string;
  data?: unknown;
}

// Main component props
export interface OutlineBuilderProps {
  screens: Screen[];
  stage1Output?: Record<string, unknown> | null; // Full Brief output from Stage 1
  processingLog: OutlineProcessingEntry[];
  onScreensUpdate: (screens: Screen[]) => void;
  onConfirm: () => void;
}

// TabToggle props
export interface TabToggleProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

// UserView props
export interface UserViewProps {
  screens: Screen[];
  stage1Output?: OutlineBuilderProps["stage1Output"];
  onScreensChange: (screens: Screen[]) => void;
  onConfirm: () => void;
}

// ScreenCard props
export interface ScreenCardProps {
  screen: Screen;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (screen: Screen) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

// ProcessingView props
export interface ProcessingViewProps {
  screens: Screen[];
  stage1Output?: OutlineBuilderProps["stage1Output"];
  processingLog: OutlineProcessingEntry[];
}

// OutputView props
export interface OutputViewProps {
  screens: Screen[];
}

// InputView props - shows Stage 1 Output
export interface InputViewProps {
  stage1Output?: Record<string, unknown> | null; // Full Brief from Stage 1
}

/**
 * Normalize a screen object to ensure all fields exist.
 */
export function normalizeScreen(raw: Partial<Screen>, index: number): Screen {
  return {
    screen_number: raw.screen_number ?? index + 1,
    screen_type: raw.screen_type ?? "demo",
    voiceover_text: raw.voiceover_text ?? "",
    visual_direction: raw.visual_direction ?? "",
    text_overlay: raw.text_overlay ?? "",
    target_duration_sec: raw.target_duration_sec ?? 5,
    notes: raw.notes ?? "",
    auto_filled: raw.auto_filled ?? true,
  };
}

/**
 * Parse screens from JSON or array.
 */
export function parseScreens(data: unknown): Screen[] {
  if (!data) return [];

  const arr = Array.isArray(data) ? data : [];
  return arr.map((item, index) => normalizeScreen(item as Partial<Screen>, index));
}

/**
 * Calculate total duration of all screens.
 */
export function calculateTotalDuration(screens: Screen[]): number {
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
