/**
 * Diff utilities for comparing AI-generated vs human-edited content.
 * Pure functions — no React, no side effects.
 */

import { parseOutline } from "@/components/OutlineBuilder/outlineParser";
import type { OutlineSection } from "@/components/OutlineBuilder/types";
import type { ProductionScreen } from "@/components/DraftBuilder/types";
import { getVisualDirectionArray } from "@/components/DraftBuilder/types";

// --- Types ---

export interface FieldDiff {
  field: string;
  status: "modified" | "added" | "removed" | "unchanged";
  aiValue?: string;
  humanValue?: string;
}

export interface SectionDiff {
  label: string;
  fields: FieldDiff[];
}

export interface DiffResult {
  totalFields: number;
  changedFields: number;
  editRate: number;
  sections: SectionDiff[];
}

// --- Outline Diffing ---

const OUTLINE_FIELDS: (keyof OutlineSection)[] = [
  "title",
  "purpose",
  "entryAssumption",
  "exitState",
  "duration",
];

function diffOutlineSections(
  aiSections: OutlineSection[],
  humanSections: OutlineSection[]
): SectionDiff[] {
  const result: SectionDiff[] = [];
  const maxLen = Math.max(aiSections.length, humanSections.length);

  for (let i = 0; i < maxLen; i++) {
    const ai = aiSections[i];
    const human = humanSections[i];
    const fields: FieldDiff[] = [];

    if (ai && !human) {
      // Section removed by human
      for (const key of OUTLINE_FIELDS) {
        fields.push({ field: key, status: "removed", aiValue: String(ai[key] || "") });
      }
      for (const tp of ai.talkingPoints) {
        fields.push({ field: "talking_point", status: "removed", aiValue: tp });
      }
      result.push({ label: `Section ${ai.sectionNumber}: ${ai.title}`, fields });
      continue;
    }

    if (!ai && human) {
      // Section added by human
      for (const key of OUTLINE_FIELDS) {
        fields.push({ field: key, status: "added", humanValue: String(human[key] || "") });
      }
      for (const tp of human.talkingPoints) {
        fields.push({ field: "talking_point", status: "added", humanValue: tp });
      }
      result.push({ label: `Section ${human.sectionNumber}: ${human.title}`, fields });
      continue;
    }

    // Both exist — compare field by field
    for (const key of OUTLINE_FIELDS) {
      const aiVal = String(ai[key] || "");
      const humanVal = String(human[key] || "");
      if (aiVal === humanVal) {
        fields.push({ field: key, status: "unchanged", aiValue: aiVal, humanValue: humanVal });
      } else {
        fields.push({ field: key, status: "modified", aiValue: aiVal, humanValue: humanVal });
      }
    }

    // Compare talking points
    const aiTPs = ai.talkingPoints;
    const humanTPs = human.talkingPoints;
    const maxTP = Math.max(aiTPs.length, humanTPs.length);
    for (let t = 0; t < maxTP; t++) {
      const aiTP = aiTPs[t];
      const humanTP = humanTPs[t];
      if (aiTP && !humanTP) {
        fields.push({ field: "talking_point", status: "removed", aiValue: aiTP });
      } else if (!aiTP && humanTP) {
        fields.push({ field: "talking_point", status: "added", humanValue: humanTP });
      } else if (aiTP === humanTP) {
        fields.push({ field: "talking_point", status: "unchanged", aiValue: aiTP, humanValue: humanTP });
      } else {
        fields.push({ field: "talking_point", status: "modified", aiValue: aiTP, humanValue: humanTP });
      }
    }

    result.push({ label: `Section ${human.sectionNumber}: ${human.title}`, fields });
  }

  return result;
}

export function diffOutline(aiText: string, humanText: string): DiffResult {
  const aiSections = parseOutline(aiText);
  const humanSections = parseOutline(humanText);
  const sections = diffOutlineSections(aiSections, humanSections);

  let totalFields = 0;
  let changedFields = 0;
  for (const s of sections) {
    for (const f of s.fields) {
      totalFields++;
      if (f.status !== "unchanged") changedFields++;
    }
  }

  return {
    totalFields,
    changedFields,
    editRate: totalFields > 0 ? changedFields / totalFields : 0,
    sections,
  };
}

// --- Storyboard Diffing ---

const SCREEN_FIELDS: (keyof ProductionScreen)[] = [
  "screen_type",
  "voiceover_text",
  "on_screen_visual",
];

function normalizeVisualDirection(screen: ProductionScreen): string {
  return getVisualDirectionArray(screen.visual_direction).join("; ");
}

function diffScreens(
  aiScreens: ProductionScreen[],
  humanScreens: ProductionScreen[]
): SectionDiff[] {
  const result: SectionDiff[] = [];
  const maxLen = Math.max(aiScreens.length, humanScreens.length);

  for (let i = 0; i < maxLen; i++) {
    const ai = aiScreens[i];
    const human = humanScreens[i];
    const fields: FieldDiff[] = [];

    if (ai && !human) {
      for (const key of SCREEN_FIELDS) {
        fields.push({ field: key, status: "removed", aiValue: String(ai[key] || "") });
      }
      fields.push({ field: "visual_direction", status: "removed", aiValue: normalizeVisualDirection(ai) });
      fields.push({ field: "duration", status: "removed", aiValue: String(ai.duration) });
      result.push({ label: `Screen ${ai.screen_number}`, fields });
      continue;
    }

    if (!ai && human) {
      for (const key of SCREEN_FIELDS) {
        fields.push({ field: key, status: "added", humanValue: String(human[key] || "") });
      }
      fields.push({ field: "visual_direction", status: "added", humanValue: normalizeVisualDirection(human) });
      fields.push({ field: "duration", status: "added", humanValue: String(human.duration) });
      result.push({ label: `Screen ${human.screen_number}`, fields });
      continue;
    }

    // Both exist — compare
    for (const key of SCREEN_FIELDS) {
      const aiVal = String(ai[key] || "");
      const humanVal = String(human[key] || "");
      if (aiVal === humanVal) {
        fields.push({ field: key, status: "unchanged", aiValue: aiVal, humanValue: humanVal });
      } else {
        fields.push({ field: key, status: "modified", aiValue: aiVal, humanValue: humanVal });
      }
    }

    // visual_direction (normalize to string for comparison)
    const aiVD = normalizeVisualDirection(ai);
    const humanVD = normalizeVisualDirection(human);
    if (aiVD === humanVD) {
      fields.push({ field: "visual_direction", status: "unchanged", aiValue: aiVD, humanValue: humanVD });
    } else {
      fields.push({ field: "visual_direction", status: "modified", aiValue: aiVD, humanValue: humanVD });
    }

    // duration
    const aiDur = String(ai.duration);
    const humanDur = String(human.duration);
    if (aiDur === humanDur) {
      fields.push({ field: "duration", status: "unchanged", aiValue: aiDur, humanValue: humanDur });
    } else {
      fields.push({ field: "duration", status: "modified", aiValue: aiDur, humanValue: humanDur });
    }

    result.push({ label: `Screen ${human.screen_number}`, fields });
  }

  return result;
}

export function diffStoryboard(aiJson: string, humanJson: string): DiffResult {
  let aiScreens: ProductionScreen[] = [];
  let humanScreens: ProductionScreen[] = [];
  try { aiScreens = JSON.parse(aiJson); } catch { /* empty */ }
  try { humanScreens = JSON.parse(humanJson); } catch { /* empty */ }

  const sections = diffScreens(aiScreens, humanScreens);

  let totalFields = 0;
  let changedFields = 0;
  for (const s of sections) {
    for (const f of s.fields) {
      totalFields++;
      if (f.status !== "unchanged") changedFields++;
    }
  }

  return {
    totalFields,
    changedFields,
    editRate: totalFields > 0 ? changedFields / totalFields : 0,
    sections,
  };
}
