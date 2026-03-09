/**
 * TypeScript types for the Outline Builder component.
 */

// Structured outline section (parsed from Director's plain text)
export interface OutlineSection {
  id: string;
  sectionNumber: number;
  title: string;
  purpose: string;
  duration: string;
  talkingPoints: string[];
  evidenceNeeded: string[];
  visualIntent: string[];
}

// 3-Layer Evidence Research types

export interface SelectedEvidence {
  source_title: string;
  source_url: string;
  source_type: "primary" | "official" | "educational" | "secondary";
  why_selected: string;
  evidence_summary: string;
  usable_line: string;
  confidence: "high" | "medium" | "low";
}

export interface EvidenceTask {
  task_label: string;
  supports: string;
  evidence_type: string;
  priority: "required" | "helpful" | "optional";
  queries: string[];
  selection_criteria: string;
  selected_evidence: SelectedEvidence | null;
}

export interface SectionResearch {
  section_title: string;
  research_brief: string;
  evidence_tasks: EvidenceTask[];
}

export interface EvidenceResearch {
  sections: SectionResearch[];
}

// Main component props
export interface OutlineBuilderProps {
  content: string;
  onChange: (content: string) => void;
  onRunResearch: () => void;
  onContinue: () => void;
  isResearching?: boolean;
  researchResults?: EvidenceResearch | null;
}
