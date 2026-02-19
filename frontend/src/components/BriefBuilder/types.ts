/**
 * TypeScript types for the Brief Builder component.
 * Defines interfaces for StoryBrief, ContextPack, ProcessingLog, and component props.
 */

// Four-state field status system
export type FieldStatus = "auto_filled" | "inferred" | "missing" | "not_applicable";

// Legacy status for backward compatibility (maps to new system)
export type LegacyFieldStatus = "auto_filled" | "needs_review" | "empty";

// Confidence levels for source attribution
export type ConfidenceLevel = "high" | "medium" | "low";

// Source reference with URL and metadata
export interface SourceReference {
  url: string;
  title: string;
  confidence?: ConfidenceLevel;
}

// Field state with full metadata
export interface FieldState {
  status: FieldStatus;
  confidence: ConfidenceLevel;
  sources: SourceReference[];
  reason?: string;
}

// Field states map for all brief fields
export interface FieldStatesMap {
  [fieldName: string]: FieldState;
}

// Search performed during research
export interface SearchPerformed {
  query: string;
  purpose: string;
  results_used: string[];
}

// Tab types for the four-tab system (standardized order: user, input, processing, output)
export type TabKey = "user" | "input" | "processing" | "output";

// Nested types
export interface Problem {
  description: string;
  auto_filled_from_research?: boolean;
}

export interface UnresolvedQuestion {
  id: string;
  note: string;
  context?: string;
  answer_type?: "text" | "textarea" | "select" | "boolean" | "number";
  options?: string[];
  value?: unknown;
  skipped?: boolean;
}

// StoryBrief - main brief object
export interface StoryBrief {
  video_goal: string;
  target_audience: string;
  company_or_brand_name: string;
  tone_and_style: string;
  format_or_platform: string;
  desired_length: string;
  show_face: string;
  cta: string;
  video_type: string;
  user_inputs: string;
  key_points: string[];
  constraints: string[];
  problem: Problem | null;
  core_interaction_steps: string[];
  common_pitfalls: string[] | null;

  // Four-state field metadata
  field_states?: FieldStatesMap;
  auto_filled_fields: string[];
  inferred_fields?: string[];
  missing_fields?: string[];
  not_applicable_fields?: string[];
  user_override_fields: string[];
  unresolved_questions: UnresolvedQuestion[];
}

// ContextPack - research data from Topic Researcher (video-type-aware)
export interface ContextPack {
  [key: string]: unknown;

  // Video type identifier
  video_type_context?: "product_brand" | "knowledge_share" | "how_to";

  // Product/Brand video fields
  company_context?: string;
  company_context_sources?: SourceReference[];
  product_context?: string;
  product_context_sources?: SourceReference[];
  industry_context?: string;
  industry_context_sources?: SourceReference[];
  key_value_propositions?: Record<string, string> | string[];
  key_value_propositions_sources?: SourceReference[];
  typical_workflows?: {
    traditional_process?: string;
    optimized_process?: string;
  };
  typical_workflows_sources?: SourceReference[];
  target_decision_makers?: Record<string, string>;
  target_decision_makers_sources?: SourceReference[];

  // Knowledge Share video fields
  topic_expertise?: string;
  topic_expertise_sources?: SourceReference[];
  learning_objectives?: string[];
  learning_objectives_sources?: SourceReference[];
  key_concepts?: Record<string, string>;
  key_concepts_sources?: SourceReference[];
  knowledge_sources?: Array<{
    type: string;
    title: string;
    url: string;
    key_insight: string;
  }>;
  common_misconceptions?: Array<{
    misconception: string;
    correction: string;
  }>;
  common_misconceptions_sources?: SourceReference[];
  practical_applications?: string[];
  practical_applications_sources?: SourceReference[];

  // How-to video fields
  task_overview?: string;
  task_overview_sources?: SourceReference[];
  step_prerequisites?: string[];
  step_prerequisites_sources?: SourceReference[];
  detailed_steps?: Array<{
    step_number: number;
    action: string;
    expected_result: string;
    tips?: string;
  }>;
  detailed_steps_sources?: SourceReference[];
  common_mistakes?: Array<{
    mistake: string;
    consequence: string;
    prevention: string;
  }>;
  common_mistakes_sources?: SourceReference[];
  success_criteria?: string[];
  success_criteria_sources?: SourceReference[];
  troubleshooting?: Record<string, string>;
  troubleshooting_sources?: SourceReference[];

  // Common fields
  terminology_glossary?: Record<string, string>;
  uncertainties?: string[];
  searches_performed?: SearchPerformed[];

  // Legacy fields (backward compatibility)
  topic_summary?: string;
  source_references?: string[];
}

// ProcessingLogEntry - for Processing view
export interface ProcessingLogEntry {
  id: string;
  step: string;
  timestamp?: string;
  details?: string;
  data?: unknown;
  source?: string;
  confidence?: "high" | "medium" | "low";
}

// Main component props
export interface BriefBuilderProps {
  briefData: StoryBrief;
  contextPack: ContextPack;
  processingLog: ProcessingLogEntry[];
  onBriefUpdate: (brief: StoryBrief) => void;
  onConfirm: () => void;
}

// TabToggle props
export interface TabToggleProps {
  activeTab: TabKey;
  onChange: (tab: TabKey) => void;
}

// UserView props
export interface UserViewProps {
  brief: StoryBrief;
  onBriefChange: (brief: StoryBrief) => void;
  stage: 1 | 2;
  onStageChange: (stage: 1 | 2) => void;
  onConfirm: () => void;
}

// RequiredFieldsForm props
export interface RequiredFieldsFormProps {
  brief: StoryBrief;
  onBriefChange: (brief: StoryBrief) => void;
  onValidatedNext: () => void;
  errors: ValidationErrors;
  setErrors: (errors: ValidationErrors) => void;
}

// OptionalQuestionsForm props
export interface OptionalQuestionsFormProps {
  brief: StoryBrief;
  onBriefChange: (brief: StoryBrief) => void;
  onFinish: () => void;
  onBack: () => void;
}

// FormField props
export interface FormFieldProps {
  label: string;
  name: string;
  value: string | string[] | boolean;
  onChange: (value: string | string[] | boolean) => void;
  type: "text" | "textarea" | "select" | "toggle" | "list";
  options?: { value: string; label: string }[];
  helperText?: string;
  required?: boolean;
  status: FieldStatus;
  error?: string;
  ordered?: boolean; // For ordered lists
  placeholder?: string;
  suffix?: string; // For inputs like "seconds"
}

// EditableList props
export interface EditableListProps {
  items: string[];
  onChange: (items: string[]) => void;
  ordered?: boolean;
  placeholder?: string;
  addLabel?: string;
}

// StatusBadge props
export interface StatusBadgeProps {
  status: FieldStatus;
}

// ProcessingView props
export interface ProcessingViewProps {
  brief: StoryBrief;
  contextPack: ContextPack;
  processingLog: ProcessingLogEntry[];
}

// CollapsibleSection props
export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  subtitle?: string;
}

// InputView props - shows user inputs and context pack for Stage 1
export interface InputViewProps {
  brief: StoryBrief;
  contextPack: ContextPack;
}

// OutputView props
export interface OutputViewProps {
  brief: StoryBrief;
}

// JsonDisplay props
export interface JsonDisplayProps {
  data: unknown;
}

// Validation types
export type ValidationErrors = {
  [K in keyof StoryBrief]?: string;
};

// Required fields list
export const REQUIRED_FIELDS: (keyof StoryBrief)[] = [
  "video_goal",
  "target_audience",
  "company_or_brand_name",
  "tone_and_style",
  "desired_length",
  "video_type",
];

// Tone and style options
export const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "inspirational", label: "Inspirational" },
  { value: "technical", label: "Technical" },
];

// Video type options
export const VIDEO_TYPE_OPTIONS = [
  { value: "Product Release", label: "Product Release" },
  { value: "How-to Video", label: "How-to Demo" },
  { value: "Knowledge Sharing", label: "Knowledge Share" },
];

// Format/platform options
export const FORMAT_OPTIONS = [
  { value: "youtube", label: "YouTube" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "general", label: "General" },
];

/**
 * Get the field status using the four-state system.
 * Checks field_states first, then falls back to legacy arrays.
 */
export function getFieldStatus(
  fieldName: keyof StoryBrief,
  brief: StoryBrief
): FieldStatus {
  // Check field_states map first (new system)
  if (brief.field_states && brief.field_states[fieldName as string]) {
    return brief.field_states[fieldName as string].status;
  }

  // Fallback to legacy arrays for backward compatibility
  const value = brief[fieldName];

  // Check if value is empty
  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return "missing";
  }

  // Check if auto-filled
  if (brief.auto_filled_fields?.includes(fieldName as string)) {
    return "auto_filled";
  }

  // Check if inferred
  if (brief.inferred_fields?.includes(fieldName as string)) {
    return "inferred";
  }

  // Check if not applicable
  if (brief.not_applicable_fields?.includes(fieldName as string)) {
    return "not_applicable";
  }

  // Default to inferred for non-empty fields (needs user review)
  return "inferred";
}

/**
 * Get the full field state with sources and metadata.
 */
export function getFieldState(
  fieldName: keyof StoryBrief,
  brief: StoryBrief
): FieldState {
  // Check field_states map first
  if (brief.field_states && brief.field_states[fieldName as string]) {
    return brief.field_states[fieldName as string];
  }

  // Create a default field state based on legacy data
  const status = getFieldStatus(fieldName, brief);
  return {
    status,
    confidence: status === "auto_filled" ? "high" : status === "inferred" ? "medium" : "low",
    sources: [],
    reason: undefined,
  };
}

/**
 * Map legacy field status to new four-state system.
 */
export function mapLegacyStatus(legacyStatus: LegacyFieldStatus): FieldStatus {
  switch (legacyStatus) {
    case "auto_filled":
      return "auto_filled";
    case "needs_review":
      return "inferred";
    case "empty":
      return "missing";
    default:
      return "missing";
  }
}

/**
 * Validate required fields and return errors object.
 */
export function validateRequiredFields(brief: StoryBrief): ValidationErrors {
  const errors: ValidationErrors = {};

  for (const field of REQUIRED_FIELDS) {
    const value = brief[field];
    if (value == null || value === "") {
      errors[field] = "This field is required.";
    }
  }

  return errors;
}

/**
 * Normalize a raw brief object to ensure all fields exist with defaults.
 */
export function normalizeBrief(raw: Partial<StoryBrief>): StoryBrief {
  return {
    video_goal: raw.video_goal ?? "",
    target_audience: raw.target_audience ?? "",
    company_or_brand_name: raw.company_or_brand_name ?? "",
    tone_and_style: raw.tone_and_style ?? "professional",
    format_or_platform: raw.format_or_platform ?? "general",
    desired_length: raw.desired_length ?? "60",
    show_face: raw.show_face ?? "No",
    cta: raw.cta ?? "",
    video_type: raw.video_type ?? "Product Release",
    user_inputs: raw.user_inputs ?? "",
    key_points: raw.key_points ?? [],
    constraints: raw.constraints ?? [],
    problem: raw.problem ?? null,
    core_interaction_steps: raw.core_interaction_steps ?? [],
    common_pitfalls: raw.common_pitfalls ?? null,
    field_states: raw.field_states ?? {},
    auto_filled_fields: raw.auto_filled_fields ?? [],
    inferred_fields: raw.inferred_fields ?? [],
    missing_fields: raw.missing_fields ?? [],
    not_applicable_fields: raw.not_applicable_fields ?? [],
    user_override_fields: raw.user_override_fields ?? [],
    unresolved_questions: raw.unresolved_questions ?? [],
  };
}

/**
 * Create an empty StoryBrief for testing.
 */
export function createEmptyBrief(): StoryBrief {
  return normalizeBrief({});
}
