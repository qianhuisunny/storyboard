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

export const PHASE1_QUESTIONS: Phase1Question[] = [
  {
    fieldKey: "viewer_outcome",
    aiMessage:
      "What do you want people to know, do, or believe by the end of watching this video?",
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
      { value: "fast_changing", label: "Fast-changing" },
    ],
  },
];
