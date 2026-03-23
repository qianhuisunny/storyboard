/**
 * RoundOneForm - Section 1: Core Intent (8 fields)
 * First round of the 3-round briefing flow.
 */

import FieldCard from "./FieldCard";
import type { BriefField } from "../types";
import { KNOWLEDGE_SHARE_REQUIRED_FIELDS, areRequiredFieldsFilled } from "../types";

interface RoundOneFormProps {
  fields: Record<string, BriefField>;
  onFieldChange: (key: string, value: string | string[] | boolean) => void;
  onFieldConfirm: (key: string) => void;
  onFieldUnconfirm?: (key: string) => void;
  onSectionConfirm: () => void;
  disabled?: boolean;
  showConfirmButton?: boolean;
}

const SECTION_1_FIELDS = [
  "video_type",
  "viewer_outcome",
  "target_audience",
  "audience_level",
  // "platform", // Commented out: platform-aware narrative (YouTube vs LMS) not yet implemented — see task #77
  "duration",
];

export default function RoundOneForm({
  fields,
  onFieldChange,
  onFieldConfirm,
  onFieldUnconfirm,
  onSectionConfirm,
  disabled = false,
  showConfirmButton = true,
}: RoundOneFormProps) {
  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[1];
  const canConfirm = areRequiredFieldsFilled(fields, 1);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div style={{ marginBottom: "22px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 400, color: "#1C2118", letterSpacing: "-0.6px", lineHeight: "1.15", marginBottom: "5px" }}>
          Section 1: Core Intent
        </h2>
        <p style={{ fontSize: "13.5px", fontWeight: 300, color: "#5A6352" }}>
          Define the purpose and audience for your Knowledge Share video.
        </p>
      </div>

      {/* Field Cards */}
      <div className="space-y-4">
        {SECTION_1_FIELDS.map((key) => {
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
      {showConfirmButton && (
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
            {canConfirm ? "Confirm Section 1 →" : "Fill all required fields to continue"}
          </button>
          {!canConfirm && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Fields marked with * are required
            </p>
          )}
        </div>
      )}
    </div>
  );
}
