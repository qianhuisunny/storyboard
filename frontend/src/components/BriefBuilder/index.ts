// Main component
export { default as BriefBuilder } from "./BriefBuilder";

// Split-screen Brief Builder
export { SplitBriefBuilder } from "./SplitBriefBuilder";

// NEW: Knowledge Share Brief Builder (3-round flow)
export { default as KnowledgeShareBriefBuilder } from "./KnowledgeShareBriefBuilder";

// Round Forms (for 3-round flow)
export * from "./RoundForms";

// Sub-components
export { default as TabToggle } from "./TabToggle";
export { default as UserView } from "./UserView/UserView";
export { default as ProcessingView } from "./ProcessingView/ProcessingView";
export { default as OutputView } from "./OutputView/OutputView";

// Types
export * from "./types";
