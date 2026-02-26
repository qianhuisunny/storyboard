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
  onSectionConfirm: () => void;
  disabled?: boolean;
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
  onSectionConfirm,
  disabled = false,
}: RoundTwoFormProps) {
  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[2];
  const canConfirm = areRequiredFieldsFilled(fields, 2);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-foreground">Section 2: Delivery & Format</h2>
        <p className="text-sm text-muted-foreground mt-1">
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
          {canConfirm ? "Confirm Section 2 →" : "Fill all required fields to continue"}
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
