/**
 * TypeScript types for the Split-Screen Brief Builder component.
 * Defines interfaces for the 4-turn chat flow and research streaming.
 */

import type { StoryBrief, SourceReference } from "../types";

// Chat turn numbers (1-4)
export type ChatTurn = 1 | 2 | 3 | 4;

// Status of each turn
export type TurnStatus =
  | "pending"
  | "presenting"
  | "awaiting"
  | "confirmed"
  | "correcting";

// Research status
export type ResearchStatus = "idle" | "running" | "complete" | "error";

// Research phase (for two-phase research flow: Round 1 + Round 3)
export type ResearchPhase =
  | "none"           // Initial state
  | "round1_running" // Round 1 research in progress
  | "round1_complete"// Round 1 done, starting Round 3
  | "round3_running" // Round 3 research in progress
  | "complete";      // Both rounds done

// NEW: Interactive research chat types
export type ResearchChatStatus =
  | "idle"
  | "awaiting_perspective"
  | "awaiting_talking_points_confirm"
  | "researching"
  | "complete";

export interface PerspectiveOption {
  id: number;
  statement: string;
  hook: string;
}

export interface ChatMessage {
  id: string;
  type: "system" | "options" | "user" | "status" | "talking_points";
  content: string;
  perspectives?: PerspectiveOption[];
  talkingPoints?: string[];
  timestamp: Date;
}

export interface ResearchChatState {
  status: ResearchChatStatus;
  messages: ChatMessage[];
  perspectives: PerspectiveOption[];
  selectedPerspective: string | null;
  talkingPoints: string[];
  isLoading: boolean;
  error?: string;
}

// Research angle from Round 1 confirmation
export interface AngleSummary {
  audienceLevel: "beginner" | "intermediate" | "advanced";
  keyTakeaway: string;
  durationTier: "short" | "medium" | "long";
  durationMinutes: number;
  plannedQuestions: number;
  questions: string[];
  topic?: string;
}

// Individual turn state
export interface TurnState {
  status: TurnStatus;
  corrections?: string;
  confirmedAt?: string;
}

// Research finding from Topic Researcher
export interface ResearchFinding {
  category: string;
  title: string;
  content: string;
  sources: SourceReference[];
  confidence: "high" | "medium" | "low";
}

// Research findings grouped by category
export interface ResearchFindings {
  company?: ResearchFinding[];
  product?: ResearchFinding[];
  industry?: ResearchFinding[];
  workflows?: ResearchFinding[];
  terminology?: ResearchFinding[];
  uncertainties?: string[];
}

// Search query event from SSE
export interface SearchEvent {
  id: string;
  query: string;
  purpose: string;
  status: "started" | "complete" | "error";
  timestamp: string;
  resultsCount?: number;
}

// Gap question for Turn 3
export interface GapQuestion {
  id: string;
  field: string;
  question: string;
  type: "text" | "textarea" | "select" | "boolean";
  options?: string[];
  required: boolean;
  value?: string | boolean;
}

// Gap answers from Turn 3
export interface GapAnswers {
  cta?: string;
  examples?: string[];
  additionalNotes?: string;
  [key: string]: string | string[] | boolean | undefined;
}

// Main chat state
export interface BriefChatState {
  currentTurn: ChatTurn;
  turns: Record<ChatTurn, TurnState>;
  researchStatus: ResearchStatus;
  researchFindings: ResearchFindings | null;
  searchEvents: SearchEvent[];
  gapQuestions: GapQuestion[];
  gapAnswers: GapAnswers;
  finalBrief: StoryBrief | null;
  error?: string;
  // Angle-based research
  angle: AngleSummary | null;
  researchPhase: ResearchPhase;
  // Two-phase research tracking
  round1Events: SearchEvent[];
  round1Findings: ResearchFindings | null;
  round3Events: SearchEvent[];
  round3Findings: ResearchFindings | null;
}

// Initial brief data from onboarding
export interface OnboardingData {
  videoType: string;
  description: string;
  duration: number;
  audience: string;
  companyName?: string;
  tone?: string;
  showFace?: boolean;
  platform?: string;
  links?: string[];
  files?: string[];
}

// SSE event types
export type SSEEventType =
  | "search_started"
  | "search_complete"
  | "search_error"
  | "research_complete"
  | "error"
  | "heartbeat";

// SSE message structure
export interface SSEMessage {
  type: SSEEventType;
  data: unknown;
  timestamp: string;
}

// Props for main SplitBriefBuilder component
export interface SplitBriefBuilderProps {
  projectId: string;
  onboardingData: OnboardingData;
  onComplete: (brief: StoryBrief) => void;
  onAdvanceStage: () => void;
}

// Props for ChatPanel
export interface ChatPanelProps {
  state: BriefChatState;
  onboardingData: OnboardingData;
  onConfirm: (turn: ChatTurn) => void;
  onCorrect: (turn: ChatTurn, corrections: string) => void;
  onGapAnswerChange: (answers: GapAnswers) => void;
  onSendToStoryboard: () => void;
  onEditBrief: () => void;
}

// Props for ResearchPanel
export interface ResearchPanelProps {
  status: ResearchStatus;
  findings: ResearchFindings | null;
  searchEvents: SearchEvent[];
  error?: string;
  // Angle-based research
  angle: AngleSummary | null;
  researchPhase: ResearchPhase;
  // Two-phase research
  round1Events: SearchEvent[];
  round1Findings: ResearchFindings | null;
  round3Events: SearchEvent[];
  round3Findings: ResearchFindings | null;
}

// Props for ConfirmationGate
export interface ConfirmationGateProps {
  turn: ChatTurn;
  status: TurnStatus;
  onConfirm: () => void;
  onCorrect: (corrections: string) => void;
  disabled?: boolean;
}

// Props for TurnContent
export interface TurnContentProps {
  turn: ChatTurn;
  state: BriefChatState;
  onboardingData: OnboardingData;
  onGapAnswerChange?: (answers: GapAnswers) => void;
}

// Props for FinalBriefDisplay
export interface FinalBriefDisplayProps {
  brief: StoryBrief;
  onSendToStoryboard: () => void;
  onEditBrief: () => void;
}

// Props for LoadingState
export interface LoadingStateProps {
  searchEvents: SearchEvent[];
}

// Props for FindingsDisplay
export interface FindingsDisplayProps {
  findings: ResearchFindings;
}

// Props for MobileDrawer
export interface MobileDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  status: ResearchStatus;
  findings: ResearchFindings | null;
  searchEvents: SearchEvent[];
  error?: string;
  // Angle-based research
  angle: AngleSummary | null;
  researchPhase: ResearchPhase;
  // Two-phase research
  round1Events: SearchEvent[];
  round1Findings: ResearchFindings | null;
  round3Events: SearchEvent[];
  round3Findings: ResearchFindings | null;
}

// Props for ResearchChat
export interface ResearchChatProps {
  state: ResearchChatState;
  onSelectPerspective: (perspective: PerspectiveOption | string) => void;
  onConfirmTalkingPoints: (feedback?: string, editedPoints?: string[]) => void;
  isLoading: boolean;
}

// Processing log entry for LLM calls
export interface ProcessingLogEntry {
  id: string;
  timestamp: string;
  phase: string;  // e.g., "generate_perspectives", "generate_talking_points"
  type: "request" | "response";
  data: {
    // For requests
    inputFields?: Record<string, string>;
    systemPromptLength?: number;
    systemPromptPreview?: string;
    userPrompt?: string;
    llmParams?: {
      model: string;
      maxTokens: number;
      temperature: number;
    };
    // For responses
    rawResponse?: string;
    responseLength?: number;
    parsedResult?: unknown;
  };
}

// Processing log state
export interface ProcessingLogState {
  entries: ProcessingLogEntry[];
  isPolling: boolean;
}

// Props for ProcessingLog component
export interface ProcessingLogProps {
  projectId: string;
  entries: ProcessingLogEntry[];
  isPolling: boolean;
}

// Props for TabbedResearchPanel
export interface TabbedResearchPanelProps {
  // ResearchChat props
  researchChatState: ResearchChatState;
  onSelectPerspective: (perspective: PerspectiveOption | string) => void;
  onConfirmTalkingPoints: (feedback?: string, editedPoints?: string[]) => void;
  isResearchChatLoading: boolean;
  // ProcessingLog props
  projectId: string;
  processingLogs: ProcessingLogEntry[];
  isPollingLogs: boolean;
}

// Action types for state reducer
export type ChatAction =
  | { type: "SET_TURN"; turn: ChatTurn }
  | { type: "SET_TURN_STATUS"; turn: ChatTurn; status: TurnStatus }
  | { type: "SET_CORRECTIONS"; turn: ChatTurn; corrections: string }
  | { type: "CONFIRM_TURN"; turn: ChatTurn }
  | { type: "START_RESEARCH" }
  | { type: "ADD_SEARCH_EVENT"; event: SearchEvent }
  | { type: "UPDATE_SEARCH_EVENT"; id: string; status: "complete" | "error"; resultsCount?: number }
  | { type: "SET_RESEARCH_COMPLETE"; findings: ResearchFindings }
  | { type: "SET_RESEARCH_ERROR"; error: string }
  | { type: "SET_GAP_QUESTIONS"; questions: GapQuestion[] }
  | { type: "SET_GAP_ANSWERS"; answers: GapAnswers }
  | { type: "SET_FINAL_BRIEF"; brief: StoryBrief }
  | { type: "RESET_RESEARCH" }
  | { type: "SET_ANGLE"; angle: AngleSummary }
  | { type: "SET_RESEARCH_PHASE"; phase: ResearchPhase }
  // Two-phase research actions
  | { type: "ADD_ROUND1_EVENT"; event: SearchEvent }
  | { type: "UPDATE_ROUND1_EVENT"; id: string; status: "complete" | "error"; resultsCount?: number }
  | { type: "SET_ROUND1_COMPLETE"; findings: ResearchFindings }
  | { type: "ADD_ROUND3_EVENT"; event: SearchEvent }
  | { type: "UPDATE_ROUND3_EVENT"; id: string; status: "complete" | "error"; resultsCount?: number }
  | { type: "SET_ROUND3_COMPLETE"; findings: ResearchFindings };

// Initial state factory
export function createInitialChatState(): BriefChatState {
  return {
    currentTurn: 1,
    turns: {
      1: { status: "presenting" },
      2: { status: "pending" },
      3: { status: "pending" },
      4: { status: "pending" },
    },
    researchStatus: "idle",
    researchFindings: null,
    searchEvents: [],
    gapQuestions: [],
    gapAnswers: {},
    finalBrief: null,
    // Angle-based research
    angle: null,
    researchPhase: "none",
    // Two-phase research
    round1Events: [],
    round1Findings: null,
    round3Events: [],
    round3Findings: null,
  };
}
