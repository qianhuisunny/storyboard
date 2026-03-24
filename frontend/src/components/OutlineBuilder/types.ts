/**
 * TypeScript types for the Outline Builder component.
 */

// Structured outline section (parsed from Director's JSON output)
export interface OutlineSection {
  id: string;
  sectionNumber: number;
  title: string;
  purpose: string;
  entryAssumption: string;
  exitState: string;
  duration: string;
  talkingPoints: string[];
  evidenceNeeded?: string[];  // Legacy — no longer produced by Director v0323+
}

// Evidence Research types (from EvidenceResearcher agent)

export interface ResearchBlock {
  research_question: string;
  storyboard_usable_phrasing: string[];
  full_answer: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
}

// v0317: evidence-item-based research
export interface EvidenceItemResearch {
  evidence_needed: string;
  research_blocks: ResearchBlock[];
}

// v0316 backward compat
export interface TalkingPointResearch {
  talking_point: string;
  research_blocks: ResearchBlock[];
}

export interface SectionResearch {
  section_title: string;
  evidence_items?: EvidenceItemResearch[];
  talking_points?: TalkingPointResearch[];  // v0316 fallback
}

export interface EvidenceResearch {
  sections: SectionResearch[];
}

// Main component props
export interface OutlineBuilderProps {
  content: string;
  aiContent?: string | null;  // AI original version for drawer comparison
  onChange: (content: string) => void;
  onRunResearch: () => void;
  onRerunResearch?: () => Promise<void>;
  onContinue: (filteredEvidence?: EvidenceResearch | null) => void | Promise<void>;
  onRegenerateSection?: (sectionNumber: number, instruction: string) => Promise<void>;
  onRefineOutline?: (instruction: string) => Promise<void>;
  isResearching?: boolean;
  isRegenerating?: boolean;
  researchResults?: EvidenceResearch | null;
}
