/**
 * RoundTwoForm - Section 2: Delivery & Format (4 fields)
 * Second round of the 3-round briefing flow.
 */

import FieldCard from "./FieldCard";
import type { BriefField } from "../types";
import { KNOWLEDGE_SHARE_REQUIRED_FIELDS, areRequiredFieldsFilled } from "../types";

interface RoundTwoFormProps {
  fields: Record<string, BriefField>;
  onFieldChange: (key: string, value: string | string[] | boolean) => void;
  onFieldConfirm: (key: string) => void;
  onFieldUnconfirm?: (key: string) => void;
  onSectionConfirm: () => void;
  disabled?: boolean;
  showConfirmButton?: boolean;
}

const SECTION_2_FIELDS = [
  "on_camera_presence",
  "broll_type",
  "delivery_tone",
  "freshness_expectation",
];

export default function RoundTwoForm({
  fields,
  onFieldChange,
  onFieldConfirm,
  onFieldUnconfirm,
  onSectionConfirm,
  disabled = false,
  showConfirmButton = true,
}: RoundTwoFormProps) {
  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[2];
  const canConfirm = areRequiredFieldsFilled(fields, 2);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div style={{ marginBottom: "22px" }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "28px", fontWeight: 400, color: "#1C2118", letterSpacing: "-0.6px", lineHeight: "1.15", marginBottom: "5px" }}>
          Section 2: Delivery & Format
        </h2>
        <p style={{ fontSize: "13.5px", fontWeight: 300, color: "#5A6352" }}>
          Define how your video will look and feel to viewers.
        </p>
      </div>

      {/* Field Cards */}
      <div className="space-y-4">
        {SECTION_2_FIELDS.map((key) => {
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
            {canConfirm ? "Confirm Section 2 →" : "Fill all required fields to continue"}
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
