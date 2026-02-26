/**
 * BriefReview - Full brief summary for final review before proceeding.
 * Shows all 17 fields in a read-only format with "Edit" and "Approve" actions.
 */

import type { BriefField } from "../types";
import { KNOWLEDGE_SHARE_FIELD_LABELS, KNOWLEDGE_SHARE_OPTIONS } from "../types";

interface BriefReviewProps {
  fields: Record<string, BriefField>;
  onEditBrief: () => void;
  onApproveBrief: () => void;
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

const SECTION_2_FIELDS = [
  "on_camera_presence",
  "broll_type",
  "delivery_tone",
  "freshness_expectation",
];

const SECTION_3_FIELDS = [
  "source_assets",
  "must_avoid",
  "core_talking_points",
  "misconceptions",
  "practical_takeaway",
];

function getDisplayValue(field: BriefField, fieldKey: string): string {
  const value = field.value;
  const options = KNOWLEDGE_SHARE_OPTIONS[fieldKey] || [];

  // Array values
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    // Map option values to labels if available
    return value
      .map((v) => {
        const opt = options.find((o) => o.value === v);
        return opt ? opt.label : v;
      })
      .join(", ");
  }

  // String values - check for option mapping
  if (typeof value === "string" && value) {
    const opt = options.find((o) => o.value === value);
    return opt ? opt.label : value;
  }

  // Boolean
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value) || "—";
}

function FieldRow({ fieldKey, field }: { fieldKey: string; field: BriefField }) {
  const label = KNOWLEDGE_SHARE_FIELD_LABELS[fieldKey] || fieldKey;
  const displayValue = getDisplayValue(field, fieldKey);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start py-2 border-b border-border last:border-0">
      <dt className="text-sm font-medium text-muted-foreground sm:w-1/3 sm:flex-shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-foreground sm:w-2/3 mt-1 sm:mt-0">{displayValue}</dd>
    </div>
  );
}

function Section({
  title,
  fieldKeys,
  fields,
}: {
  title: string;
  fieldKeys: string[];
  fields: Record<string, BriefField>;
}) {
  return (
    <div className="mb-6">
      <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3 pb-2 border-b-2 border-primary/20">
        {title}
      </h3>
      <dl className="space-y-0">
        {fieldKeys.map((key) => {
          const field = fields[key];
          if (!field) return null;
          return <FieldRow key={key} fieldKey={key} field={field} />;
        })}
      </dl>
    </div>
  );
}

export default function BriefReview({
  fields,
  onEditBrief,
  onApproveBrief,
  disabled = false,
}: BriefReviewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <span className="text-2xl">📋</span>
          Your Video Brief — Final Review
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Review your complete brief before proceeding to outline generation.
        </p>
      </div>

      {/* Sections */}
      <div className="bg-card rounded-lg border p-6">
        <Section title="Section 1: Core Intent" fieldKeys={SECTION_1_FIELDS} fields={fields} />
        <Section title="Section 2: Delivery & Format" fieldKeys={SECTION_2_FIELDS} fields={fields} />
        <Section title="Section 3: Content Spine" fieldKeys={SECTION_3_FIELDS} fields={fields} />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
        <button
          onClick={onEditBrief}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg font-medium border transition-colors ${
            disabled
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-background text-foreground border-border hover:bg-muted"
          }`}
        >
          ← Edit Brief
        </button>
        <button
          onClick={onApproveBrief}
          disabled={disabled}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            disabled
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
        >
          Approve & Continue to Outline
        </button>
      </div>
    </div>
  );
}
