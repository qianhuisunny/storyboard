/**
 * TypeScript types for the Brief Builder component.
 * Defines interfaces for the new 3-round briefing flow with field model.
 */

// =============================================================================
// NEW FIELD MODEL (3-Round Briefing Flow)
// =============================================================================

/**
 * Field source - where the field value came from.
 * - extracted: directly from user-provided inputs (form submission or explicit answers)
 * - inferred: suggested by the system (AI inference)
 * - empty: not set
 */
export type FieldSource = "extracted" | "inferred" | "empty";

/**
 * Field color for UI display - derived from source + confirmed state.
 * - green: confirmed = true
 * - blue: confirmed = false AND source = "extracted" (user provided)
 * - yellow: confirmed = false AND source = "inferred" (AI suggested)
 * - red: value is empty AND field is required in current round
 */
export type FieldColor = "green" | "blue" | "yellow" | "red";

/**
 * Single field in the new brief model.
 */
export interface BriefField {
  key?: string;  // Optional - the key is already the property name in Record<string, BriefField>
  value: string | string[] | boolean;
  source: FieldSource;
  confirmed: boolean;
}

/**
 * Get the display color for a field based on its state.
 * @param field - The field to get color for
 * @param isRequired - Whether this field is required in the current round
 * @returns The color to display
 */
export function getFieldColor(field: BriefField, isRequired: boolean = false): FieldColor {
  // If confirmed, always green
  if (field.confirmed) {
    return "green";
  }

  // If empty/missing value
  const isEmpty =
    field.value === "" ||
    field.value === null ||
    field.value === undefined ||
    (Array.isArray(field.value) && field.value.length === 0);

  if (isEmpty) {
    // Red if required, otherwise treat as empty
    return isRequired ? "red" : "yellow";
  }

  // Based on source
  if (field.source === "extracted") {
    return "blue"; // User provided but not confirmed
  }

  if (field.source === "inferred") {
    return "yellow"; // AI suggested
  }

  // Default to yellow for empty source
  return "yellow";
}

/**
 * Current round in the briefing flow.
 */
export type BriefRound = 1 | 2 | 3 | "review";

/**
 * Knowledge Share Brief - the new brief structure for Knowledge Share videos.
 * Contains all 17 fields across 3 sections.
 */
export interface KnowledgeShareBrief {
  video_type: "knowledge_share";
  round: BriefRound;
  fields: Record<string, BriefField>;
}

/**
 * Required fields per round for Knowledge Share.
 */
export const KNOWLEDGE_SHARE_REQUIRED_FIELDS: Record<1 | 2 | 3, string[]> = {
  1: [
    "video_type",
    "primary_goal",
    "target_audience",
    "audience_level",
    "platform",
    "duration",
    "one_big_thing",
    "viewer_next_action",
  ],
  2: [
    "on_camera_presence",
    "broll_type",
    "delivery_tone",
    "freshness_expectation",
  ],
  3: [
    "core_talking_points",
    "misconceptions",
    "practical_takeaway",
  ],
};

/**
 * Field labels for Knowledge Share (user-facing).
 */
export const KNOWLEDGE_SHARE_FIELD_LABELS: Record<string, string> = {
  // Section 1: Core Intent
  video_type: "Video type",
  primary_goal: "What is the main goal of this video?",
  target_audience: "Who is this video for?",
  audience_level: "How familiar is your audience with this topic?",
  platform: "Where will this video be published?",
  duration: "How long should this video be?",
  one_big_thing: "If viewers remember only one thing after watching this video, what should it be?",
  viewer_next_action: "What is the next thing you want people to do after watching this video?",
  // Section 2: Delivery & Format
  on_camera_presence: "Do you want your face on screen?",
  broll_type: "What should viewers mostly see while you explain?",
  delivery_tone: "How should this feel to the viewer?",
  freshness_expectation: "How time-sensitive is this video?",
  // Section 3: Content Spine
  must_avoid: "Anything we should absolutely avoid?",
  source_assets: "Sources / assets provided",
  core_talking_points: "Proposed framework/method",
  misconceptions: "Common misconceptions to address",
  practical_takeaway: "Practical takeaway",
};

/**
 * Field input types for Knowledge Share.
 */
export const KNOWLEDGE_SHARE_FIELD_TYPES: Record<string, string> = {
  video_type: "readonly",
  primary_goal: "textarea",
  target_audience: "text",
  audience_level: "select",
  platform: "select",
  duration: "select",
  one_big_thing: "textarea",
  viewer_next_action: "textarea",
  on_camera_presence: "select",
  broll_type: "multiselect",
  delivery_tone: "select",
  freshness_expectation: "select",
  must_avoid: "list",
  source_assets: "readonly-list",
  core_talking_points: "editable-list",
  misconceptions: "checklist",
  practical_takeaway: "select-editable",
};

/**
 * Select options for Knowledge Share fields.
 */
export const KNOWLEDGE_SHARE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  audience_level: [
    { value: "beginner", label: "Beginner" },
    { value: "intermediate", label: "Intermediate" },
    { value: "advanced", label: "Advanced" },
    { value: "mixed", label: "Mixed" },
  ],
  platform: [
    { value: "youtube", label: "YouTube" },
    { value: "internal_lms", label: "Internal LMS" },
  ],
  duration: [
    { value: "60-90s", label: "60–90 seconds" },
    { value: "2-5min", label: "2–5 minutes" },
    { value: "5-10min", label: "5–10 minutes" },
    { value: "10+min", label: "10+ minutes" },
  ],
  on_camera_presence: [
    { value: "no", label: "No" },
    { value: "yes_throughout", label: "Yes — throughout" },
    { value: "yes_intro_outro", label: "Yes — intro/outro/transition" },
  ],
  broll_type: [
    { value: "screen_recording", label: "Screen recording (product/demo/document)" },
    { value: "slides", label: "Slides / key points" },
    { value: "diagrams", label: "Diagrams / frameworks" },
    { value: "whiteboard", label: "Whiteboard drawing" },
    { value: "code_editor", label: "Code editor / notebook" },
    { value: "stock_footage", label: "Stock footage" },
    { value: "real_world", label: "Real-world footage / camera shots" },
  ],
  delivery_tone: [
    { value: "clear_practical", label: "Clear & practical" },
    { value: "analytical_informative", label: "Analytical & informative" },
    { value: "mentor_peer", label: "Mentor & Peer" },
    { value: "executive_briefing", label: "Executive briefing" },
  ],
  freshness_expectation: [
    { value: "evergreen", label: "Evergreen (should stay useful for a long time)" },
    { value: "current_year", label: "Current-year (should reflect this year's context)" },
    { value: "recent", label: "Recent / fast-changing (needs the latest info)" },
  ],
  practical_takeaway: [
    { value: "checklist", label: "Checklist" },
    { value: "decision_tree", label: "Decision tree" },
    { value: "scorecard", label: "Scorecard" },
    { value: "3_step_action", label: "3-step action plan" },
  ],
};

/**
 * Create an empty BriefField.
 */
export function createEmptyField(key: string): BriefField {
  return {
    key,
    value: "",
    source: "empty",
    confirmed: false,
  };
}

/**
 * Create initial fields for a Knowledge Share brief (Round 1).
 */
export function createInitialKnowledgeShareFields(): Record<string, BriefField> {
  const fields: Record<string, BriefField> = {};

  // Section 1 fields
  const section1Fields = [
    "video_type", "primary_goal", "target_audience", "audience_level",
    "platform", "duration", "one_big_thing", "viewer_next_action"
  ];

  // Section 2 fields
  const section2Fields = [
    "on_camera_presence", "broll_type", "delivery_tone", "freshness_expectation"
  ];

  // Section 3 fields
  const section3Fields = [
    "must_avoid", "source_assets", "core_talking_points", "misconceptions", "practical_takeaway"
  ];

  [...section1Fields, ...section2Fields, ...section3Fields].forEach(key => {
    fields[key] = createEmptyField(key);
  });

  // video_type is always extracted and confirmed for Knowledge Share
  fields.video_type = {
    key: "video_type",
    value: "knowledge_share",
    source: "extracted",
    confirmed: true,
  };

  return fields;
}

/**
 * Check if all required fields in a round are filled (non-empty).
 */
export function areRequiredFieldsFilled(
  fields: Record<string, BriefField>,
  round: 1 | 2 | 3
): boolean {
  const requiredKeys = KNOWLEDGE_SHARE_REQUIRED_FIELDS[round];
  return requiredKeys.every(key => {
    const field = fields[key];
    if (!field) return false;

    const isEmpty =
      field.value === "" ||
      field.value === null ||
      field.value === undefined ||
      (Array.isArray(field.value) && field.value.length === 0);

    return !isEmpty;
  });
}

/**
 * Check if all required fields in a round are confirmed.
 */
export function areRequiredFieldsConfirmed(
  fields: Record<string, BriefField>,
  round: 1 | 2 | 3
): boolean {
  const requiredKeys = KNOWLEDGE_SHARE_REQUIRED_FIELDS[round];
  return requiredKeys.every(key => {
    const field = fields[key];
    return field?.confirmed === true;
  });
}

// =============================================================================
// LEGACY TYPES (for backward compatibility)
// =============================================================================

// Three-state field status system (legacy)
export type FieldStatus = "auto_filled" | "inferred" | "not_applicable";

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

// Tab types for the three-tab system (Processing is always visible in right column)
export type TabKey = "user" | "input" | "output";

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
  processingLog: ProcessingLogEntry[];
}

// CollapsibleSection props
export interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  subtitle?: string;
}

// InputView props - shows user inputs for Stage 1
export interface InputViewProps {
  brief: StoryBrief;
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
  { value: "Product Demo Video", label: "Product Demo" },
  { value: "Knowledge Sharing", label: "Knowledge Share" },
];

// Format/platform options
export const FORMAT_OPTIONS = [
  { value: "youtube", label: "YouTube" },
  { value: "lms", label: "LMS" },
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

  // Check if value is empty - return inferred (needs user input/AI generation)
  if (
    value == null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  ) {
    return "inferred";
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
      return "inferred";
    default:
      return "inferred";
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
    format_or_platform: raw.format_or_platform ?? "youtube",
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
