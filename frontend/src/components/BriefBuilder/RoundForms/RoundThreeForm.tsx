/**
 * RoundThreeForm - Section 3: Content Spine (5 fields)
 * Third round of the 3-round briefing flow, after research completes.
 */

import FieldCard from "./FieldCard";
import type { BriefField } from "../types";
import { KNOWLEDGE_SHARE_REQUIRED_FIELDS, areRequiredFieldsFilled } from "../types";

interface RoundThreeFormProps {
  fields: Record<string, BriefField>;
  onFieldChange: (key: string, value: string | string[] | boolean) => void;
  onFieldConfirm: (key: string) => void;
  onFieldUnconfirm?: (key: string) => void;
  onSectionConfirm: () => void;
  disabled?: boolean;
  researchComplete?: boolean;
}

const SECTION_3_FIELDS = [
  "source_assets",
  "must_avoid",
  "core_talking_points",
  "misconceptions",
  "practical_takeaway",
];

export default function RoundThreeForm({
  fields,
  onFieldChange,
  onFieldConfirm,
  onFieldUnconfirm,
  onSectionConfirm,
  disabled = false,
  researchComplete = true,
}: RoundThreeFormProps) {
  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[3];
  const canConfirm = areRequiredFieldsFilled(fields, 3);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-foreground">Section 3: Content Spine</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define the structure and key points for your video content.
        </p>
        {!researchComplete && (
          <div className="mt-2 flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 px-3 py-2 rounded">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Research is still running. Content suggestions will update when complete.
          </div>
        )}
      </div>

      {/* Field Cards */}
      <div className="space-y-4">
        {SECTION_3_FIELDS.map((key) => {
          const field = fields[key];
          if (!field) return null;

          return (
            <FieldCard
              key={key}
              fieldKey={key}
              field={field}
              isRequired={requiredFields.includes(key)}
              onChange={(value) => onFieldChange(key, value)}
              onConfirm={() => onFieldConfirm(key)}
              onUnconfirm={onFieldUnconfirm ? () => onFieldUnconfirm(key) : undefined}
              disabled={disabled}
            />
          );
        })}
      </div>

      {/* Section Confirm Button */}
      <div className="border-t pt-4">
        <button
          onClick={onSectionConfirm}
          disabled={!canConfirm || disabled}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            canConfirm && !disabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {canConfirm ? "Confirm Section 3 →" : "Fill all required fields to continue"}
        </button>
        {!canConfirm && (
          <p className="text-xs text-muted-foreground mt-2 text-center">
            Fields marked with * are required
          </p>
        )}
      </div>
    </div>
  );
}
