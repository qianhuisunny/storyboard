export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  chips?: { value: string; label: string }[];
  selectedChip?: string;
  fieldKey?: string;
  phase: 1 | 2 | 3;
}

export interface Phase1Question {
  fieldKey: string;
  aiMessage: string;
  chips?: { value: string; label: string }[];
}

const DEFAULT_PHASE1_QUESTIONS: Phase1Question[] = [
  {
    fieldKey: "viewer_outcome",
    aiMessage:
      "That's a strong starting point. What should viewers know, do, feel, or believe by the end?",
  },
  {
    fieldKey: "audience_level",
    aiMessage: "How familiar is your audience with this topic?",
    chips: [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    fieldKey: "freshness_expectation",
    aiMessage: "How time-sensitive is this content?",
    chips: [
      { value: "evergreen", label: "Evergreen" },
      { value: "current_year", label: "Current-year" },
      { value: "recent", label: "Fast-changing" },
    ],
  },
];

const ROUTE_QUESTIONS: Record<string, Phase1Question[]> = {
  talking_script: [
    {
      fieldKey: "viewer_outcome",
      aiMessage:
        "What's the one thing you want to say clearly in this talking video?",
    },
    {
      fieldKey: "delivery_tone",
      aiMessage: "What should the delivery feel like?",
      chips: [
        { value: "direct_conversational", label: "Direct" },
        { value: "mentor_peer", label: "Mentor-peer" },
        { value: "analytical_informative", label: "Thoughtful" },
        { value: "clear_practical", label: "Practical" },
      ],
    },
    {
      fieldKey: "on_camera_presence",
      aiMessage: "Will this mostly be spoken to camera?",
      chips: [
        { value: "yes", label: "Yes" },
        { value: "no", label: "Voiceover only" },
      ],
    },
  ],
  deep_explainer: DEFAULT_PHASE1_QUESTIONS,
  tutorial_demo: [
    {
      fieldKey: "viewer_outcome",
      aiMessage:
        "What should viewers be able to do successfully after watching this walkthrough?",
    },
    {
      fieldKey: "audience_level",
      aiMessage: "How experienced are they with this workflow?",
      chips: [
        { value: "beginner", label: "Beginner" },
        { value: "intermediate", label: "Intermediate" },
        { value: "advanced", label: "Advanced" },
        { value: "mixed", label: "Mixed" },
      ],
    },
    {
      fieldKey: "broll_type",
      aiMessage: "What should the viewer mainly see?",
      chips: [
        { value: "screen_recording", label: "Screen recording" },
        { value: "code_editor", label: "Code / notebook" },
        { value: "slides", label: "Slides / diagrams" },
      ],
    },
  ],
  planner_lifestyle: [
    {
      fieldKey: "viewer_outcome",
      aiMessage:
        "What should the viewer take away from this planner or lifestyle video?",
    },
    {
      fieldKey: "delivery_tone",
      aiMessage: "What should the mood feel like?",
      chips: [
        { value: "calm_reflective", label: "Calm" },
        { value: "mentor_peer", label: "Cozy peer" },
        { value: "clear_practical", label: "Practical" },
        { value: "inspirational", label: "Aspirational" },
      ],
    },
    {
      fieldKey: "broll_type",
      aiMessage: "What kind of visuals should carry the story?",
      chips: [
        { value: "real_world", label: "Real life footage" },
        { value: "slides", label: "Planner pages" },
        { value: "stock_footage", label: "Atmospheric b-roll" },
      ],
    },
  ],
  product_release: [
    {
      fieldKey: "viewer_outcome",
      aiMessage:
        "What should viewers understand or do after seeing this product story?",
    },
    {
      fieldKey: "delivery_tone",
      aiMessage: "How should the product message feel?",
      chips: [
        { value: "executive_briefing", label: "Executive" },
        { value: "clear_practical", label: "Practical" },
        { value: "analytical_informative", label: "Analytical" },
        { value: "mentor_peer", label: "Peer-led" },
      ],
    },
    {
      fieldKey: "freshness_expectation",
      aiMessage: "How time-sensitive is this release or update?",
      chips: [
        { value: "current_year", label: "Current-year" },
        { value: "recent", label: "Recent / fast-changing" },
        { value: "evergreen", label: "Evergreen" },
      ],
    },
  ],
};

export function getPhase1Questions(intentRoute?: string | null): Phase1Question[] {
  if (intentRoute && ROUTE_QUESTIONS[intentRoute]) {
    return ROUTE_QUESTIONS[intentRoute];
  }
  return DEFAULT_PHASE1_QUESTIONS;
}
