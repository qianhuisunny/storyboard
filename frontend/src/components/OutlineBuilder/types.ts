/**
 * TypeScript types for the Outline Builder component.
 * Text-based outline — no structured screen data.
 */

// Evidence research types
export interface EvidenceFinding {
  title: string;
  snippet: string;
  source_url: string;
  source_domain: string;
}

export interface EvidenceMapEntry {
  claim: string;
  section: string;
  queries: string[];
  findings: EvidenceFinding[];
}

export interface EvidenceResearch {
  evidence_map: EvidenceMapEntry[];
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
