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
  isAlreadyApproved?: boolean; // Brief was already approved, hide approve button
}

const SECTION_1_FIELDS = [
  "video_type",
  "viewer_outcome",
  "target_audience",
  "audience_level",
  "platform",
  "duration",
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
  isAlreadyApproved = false,
}: BriefReviewProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <span className="text-2xl">📋</span>
          {isAlreadyApproved ? "Your Video Brief — Approved" : "Your Video Brief — Final Review"}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isAlreadyApproved
            ? "This brief has been approved. View the outline stage for next steps."
            : "Review your complete brief before proceeding to outline generation."}
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
        {!isAlreadyApproved && (
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
        )}
        {!isAlreadyApproved && (
          <button
            onClick={() => {
              console.log("[BriefReview] Approve button clicked");
              onApproveBrief();
            }}
            disabled={disabled}
            className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
              disabled
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            }`}
          >
            Approve & Continue to Outline
          </button>
        )}
        {isAlreadyApproved && (
          <div className="flex-1 py-3 px-4 rounded-lg font-medium bg-[#EFF5F0] text-[#3D6B40] text-center border border-[#4A7A4D]/20">
            ✓ Brief Approved — Click "Video Outline" in the sidebar to continue
          </div>
        )}
      </div>
    </div>
  );
}
