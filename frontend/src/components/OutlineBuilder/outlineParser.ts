/**
 * Parse/serialize outline text ↔ structured OutlineSection[].
 * Pure functions — the only bridge between text-based backend and structured frontend.
 */

import type { OutlineSection } from "./types";

let nextId = 1;
function generateId(): string {
  return `section-${nextId++}-${Date.now()}`;
}

/**
 * Parse Director's plain text outline into structured sections.
 *
 * Expected format:
 *   Section 1 — Hook: The Power of Attention
 *
 *   Purpose
 *   One or two sentences...
 *
 *   Duration
 *   1:00–2:00
 *
 *   Talking points
 *   - Point 1
 *   - Point 2
 *
 *   Evidence needed
 *   - Evidence 1
 *
 *   Visual intent
 *   - Visual 1
 */
export function parseOutline(text: string): OutlineSection[] {
  if (!text || !text.trim()) return [];

  // Split on section headers: "Section N — Title" or "Section N - Title" or "Section N – Title"
  const sectionRegex = /^Section\s+(\d+)\s*[—–\-]\s*(.+)$/gm;
  const headers: { index: number; number: number; title: string }[] = [];

  let match;
  while ((match = sectionRegex.exec(text)) !== null) {
    headers.push({
      index: match.index,
      number: parseInt(match[1], 10),
      title: match[2].trim(),
    });
  }

  if (headers.length === 0) {
    // Can't parse — return single section with all text
    return [
      {
        id: generateId(),
        sectionNumber: 1,
        title: "Outline",
        purpose: text.trim(),
        duration: "",
        talkingPoints: [],
        evidenceNeeded: [],
        visualIntent: [],
      },
    ];
  }

  return headers.map((header, i) => {
    // Get the text block for this section (from header to next header or end)
    const start = header.index;
    const end = i < headers.length - 1 ? headers[i + 1].index : text.length;
    const block = text.slice(start, end);

    return {
      id: generateId(),
      sectionNumber: header.number,
      title: header.title,
      ...parseBlock(block),
    };
  });
}

/**
 * Parse a single section's text block into sub-fields.
 */
function parseBlock(block: string): {
  purpose: string;
  duration: string;
  talkingPoints: string[];
  evidenceNeeded: string[];
  visualIntent: string[];
} {
  const result = {
    purpose: "",
    duration: "",
    talkingPoints: [] as string[],
    evidenceNeeded: [] as string[],
    visualIntent: [] as string[],
  };

  // Known sub-field headers (case-insensitive)
  const fieldHeaders = [
    { key: "purpose" as const, pattern: /^Purpose\s*$/im },
    { key: "duration" as const, pattern: /^Duration\s*$/im },
    { key: "talkingPoints" as const, pattern: /^Talking\s+points?\s*$/im },
    { key: "evidenceNeeded" as const, pattern: /^Evidence\s+needed\s*$/im },
    { key: "visualIntent" as const, pattern: /^Visual\s+intent\s*$/im },
  ];

  // Find positions of each header in the block
  const positions: { key: string; start: number; headerEnd: number }[] = [];
  for (const { key, pattern } of fieldHeaders) {
    const m = block.match(pattern);
    if (m && m.index !== undefined) {
      positions.push({
        key,
        start: m.index,
        headerEnd: m.index + m[0].length,
      });
    }
  }

  // Sort by position
  positions.sort((a, b) => a.start - b.start);

  // Extract content between each header
  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const contentStart = pos.headerEnd;
    const contentEnd = i < positions.length - 1 ? positions[i + 1].start : block.length;
    const content = block.slice(contentStart, contentEnd).trim();

    if (pos.key === "purpose") {
      result.purpose = content;
    } else if (pos.key === "duration") {
      result.duration = content;
    } else if (pos.key === "talkingPoints") {
      result.talkingPoints = parseBullets(content);
    } else if (pos.key === "evidenceNeeded") {
      result.evidenceNeeded = parseBullets(content);
    } else if (pos.key === "visualIntent") {
      result.visualIntent = parseBullets(content);
    }
  }

  return result;
}

/**
 * Extract bullet points from text. Lines starting with "- " or "* ".
 */
function parseBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- ") || line.startsWith("* "))
    .map((line) => line.replace(/^[-*]\s+/, ""));
}

/**
 * Serialize structured sections back to Director's plain text format.
 */
export function serializeOutline(sections: OutlineSection[]): string {
  return sections
    .map((s, i) => {
      const num = i + 1;
      const lines: string[] = [];

      lines.push(`Section ${num} — ${s.title}`);
      lines.push("");

      lines.push("Purpose");
      lines.push(s.purpose);
      lines.push("");

      lines.push("Duration");
      lines.push(s.duration || "0:00–0:00");
      lines.push("");

      lines.push("Talking points");
      for (const tp of s.talkingPoints) {
        lines.push(`- ${tp}`);
      }
      lines.push("");

      lines.push("Evidence needed");
      for (const ev of s.evidenceNeeded) {
        lines.push(`- ${ev}`);
      }
      lines.push("");

      lines.push("Visual intent");
      for (const vi of s.visualIntent) {
        lines.push(`- ${vi}`);
      }

      return lines.join("\n");
    })
    .join("\n\n\n");
}
