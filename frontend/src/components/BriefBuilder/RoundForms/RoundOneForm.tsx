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
  onSectionConfirm: () => void;
  disabled?: boolean;
}

const SECTION_1_FIELDS = [
  "video_type",
  "primary_goal",
  "target_audience",
  "audience_level",
  "platform",
  "duration",
  "one_big_thing",
  "viewer_next_action",
];

export default function RoundOneForm({
  fields,
  onFieldChange,
  onFieldConfirm,
  onSectionConfirm,
  disabled = false,
}: RoundOneFormProps) {
  const requiredFields = KNOWLEDGE_SHARE_REQUIRED_FIELDS[1];
  const canConfirm = areRequiredFieldsFilled(fields, 1);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-foreground">Section 1: Core Intent</h2>
        <p className="text-sm text-muted-foreground mt-1">
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
          {canConfirm ? "Confirm Section 1 →" : "Fill all required fields to continue"}
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
