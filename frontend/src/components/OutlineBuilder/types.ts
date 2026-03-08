/**
 * TypeScript types for the Outline Builder component.
 * Defines interfaces for ScreenOutline, component props, and helpers.
 */

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Screen types available (visual format — what the viewer sees)
export type ScreenType =
  | "screen_recording"
  | "slides"
  | "whiteboard"
  | "code_editor"
  | "stock_footage"
  | "real_world"
  | "talking_head";

// Visual style for screen type badges
export const SCREEN_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  screen_recording: { label: "Screen Recording", color: "bg-purple-100 text-purple-700 border-purple-200", icon: "monitor" },
  slides: { label: "Slides", color: "bg-amber-100 text-amber-700 border-amber-200", icon: "presentation" },
  whiteboard: { label: "Whiteboard", color: "bg-orange-100 text-orange-700 border-orange-200", icon: "edit-3" },
  code_editor: { label: "Code Editor", color: "bg-indigo-100 text-indigo-700 border-indigo-200", icon: "code" },
  stock_footage: { label: "Stock Footage", color: "bg-blue-100 text-blue-700 border-blue-200", icon: "video" },
  real_world: { label: "Real-World", color: "bg-cyan-100 text-cyan-700 border-cyan-200", icon: "camera" },
  talking_head: { label: "Talking Head", color: "bg-green-100 text-green-700 border-green-200", icon: "user" },
};

// Display config for fixed narrative roles
export const NARRATIVE_ROLE_CONFIG: Record<
  string,
  { label: string }
> = {
  hook: { label: "Hook" },
  takeaway: { label: "Takeaway" },
  cta: { label: "CTA" },
};

/**
 * Get display label for a narrative role.
 * Fixed roles use NARRATIVE_ROLE_CONFIG labels.
 * Body sections ("Talking Point N: ...") use the role string as-is.
 */
export function getNarrativeRoleConfig(role: string): { label: string } {
  if (NARRATIVE_ROLE_CONFIG[role]) {
    return NARRATIVE_ROLE_CONFIG[role];
  }
  return { label: role || "" };
}

// Individual screen in the outline
export interface Screen {
  screen_number: number;
  narrative_role?: string;
  screen_type: ScreenType | string;
  voiceover_text: string;
  visual_direction: string;
  text_overlay?: string;
  duration?: number;
  notes?: string;
  auto_filled?: boolean;
}

// Processing log entry for outline generation (matches backend ProcessingLogEntry format)
export interface OutlineProcessingEntry {
  id: string;
  timestamp?: string;
  phase: string;       // e.g., "storyboard_director_initial"
  type: "request" | "response";
  data: {
    // Request fields
    inputFields?: Record<string, string>;
    systemPromptLength?: number;
    systemPromptPreview?: string;
    userPrompt?: string;
    llmParams?: {
      model: string;
      maxTokens: number;
      temperature: number;
    };
    // Response fields
    rawResponse?: string;
    responseLength?: number;
    parsedResult?: unknown;
  };
  // Legacy fields (backwards compat)
  step?: string;
  details?: string;
}

// Main component props
export interface OutlineBuilderProps {
  screens: Screen[];
  stage1Output?: Record<string, unknown> | null; // Full Brief output from Stage 1
  researchDetails?: Record<string, unknown> | null; // Research details (from Knowledge Share flow)
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

// InputView props - shows Stage 1 Output and Research Data
export interface InputViewProps {
  stage1Output?: Record<string, unknown> | null; // Full Brief from Stage 1
  researchDetails?: Record<string, unknown> | null; // Research details (from Knowledge Share flow)
}

/**
 * Normalize a screen object to ensure all fields exist.
 */
export function normalizeScreen(raw: Partial<Screen>, index: number): Screen {
  return {
    screen_number: raw.screen_number ?? index + 1,
    narrative_role: raw.narrative_role ?? "",
    screen_type: raw.screen_type ?? "slides",
    voiceover_text: raw.voiceover_text ?? "",
    visual_direction: raw.visual_direction ?? "",
    text_overlay: raw.text_overlay ?? "",
    duration: raw.duration ?? 5,
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
