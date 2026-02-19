/**
 * TypeScript types for the Review Builder component.
 * Reuses ProductionScreen from DraftBuilder for consistency.
 */

// Re-export production screen type from DraftBuilder
export type { ProductionScreen } from "../DraftBuilder/types";
export {
  SCREEN_TYPE_CONFIG,
  parseProductionScreens,
  normalizeProductionScreen,
  calculateTotalDuration,
  formatDuration,
  getVisualDirectionArray,
} from "../DraftBuilder/types";

// Import ProductionScreen for local use
import type { ProductionScreen } from "../DraftBuilder/types";

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Processing log entry for review stage
export interface ReviewProcessingEntry {
  id: string;
  step: string;
  timestamp?: string;
  details?: string;
  data?: unknown;
}

// Main component props
export interface ReviewBuilderProps {
  screens: ProductionScreen[];
  projectTitle?: string;
  previousStageOutput?: Record<string, unknown> | null; // Stage 3 production screens
  processingLog?: ReviewProcessingEntry[];
  onScreensUpdate: (screens: ProductionScreen[]) => void;
  onExport: () => void;
}

// TabToggle props
export interface TabToggleProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

// UserView props (main review interface)
export interface UserViewProps {
  screens: ProductionScreen[];
  projectTitle?: string;
  onScreensUpdate: (screens: ProductionScreen[]) => void;
  onExport: () => void;
}

// InputView props - shows Stage 3 output
export interface InputViewProps {
  previousStageOutput?: Record<string, unknown> | null;
}

// ProcessingView props
export interface ProcessingViewProps {
  screens: ProductionScreen[];
  processingLog?: ReviewProcessingEntry[];
}

// OutputView props
export interface OutputViewProps {
  screens: ProductionScreen[];
}

// ReviewCard props
export interface ReviewCardProps {
  screen: ProductionScreen;
  onChange: (screen: ProductionScreen) => void;
  onSave: () => void;
}
