import FormField from "./FormField";
import type { RequiredFieldsFormProps, StoryBrief } from "../types";
import {
  getFieldStatus,
  TONE_OPTIONS,
  VIDEO_TYPE_OPTIONS,
  FORMAT_OPTIONS,
} from "../types";

/**
 * RequiredFieldsForm - Stage 1 form for required brief fields.
 * Displays all mandatory fields with status badges and validation errors.
 */
export default function RequiredFieldsForm({
  brief,
  onBriefChange,
  errors,
}: RequiredFieldsFormProps) {
  // Helper to update a single field
  const updateField = <K extends keyof StoryBrief>(
    field: K,
    value: StoryBrief[K]
  ) => {
    // Track user override if this field was auto-filled
    const newOverrides = brief.user_override_fields.includes(field as string)
      ? brief.user_override_fields
      : brief.auto_filled_fields.includes(field as string)
      ? [...brief.user_override_fields, field as string]
      : brief.user_override_fields;

    onBriefChange({
      ...brief,
      [field]: value,
      user_override_fields: newOverrides,
    });
  };

  return (
    <form className="required-fields-form space-y-6" onSubmit={(e) => e.preventDefault()}>
      {/* Video Goal - Primary field */}
      <FormField
        label="What is the goal of this video?"
        name="video_goal"
        value={brief.video_goal}
        onChange={(value) => updateField("video_goal", value as string)}
        type="textarea"
        required
        status={getFieldStatus("video_goal", brief)}
        error={errors.video_goal}
        placeholder="e.g., Increase brand awareness for our new product launch"
        helperText="Describe the primary objective you want this video to achieve"
      />

      {/* Target Audience */}
      <FormField
        label="Who is your target audience?"
        name="target_audience"
        value={brief.target_audience}
        onChange={(value) => updateField("target_audience", value as string)}
        type="textarea"
        required
        status={getFieldStatus("target_audience", brief)}
        error={errors.target_audience}
        placeholder="e.g., Tech-savvy millennials interested in productivity tools"
        helperText="Describe demographics, interests, and pain points of your ideal viewers"
      />

      {/* Video Type */}
      <FormField
        label="Video Type"
        name="video_type"
        value={brief.video_type}
        onChange={(value) => updateField("video_type", value as string)}
        type="select"
        options={VIDEO_TYPE_OPTIONS}
        required
        status={getFieldStatus("video_type", brief)}
        error={errors.video_type}
        helperText="Select the type of video that best fits your needs"
      />

      {/* Tone and Style */}
      <FormField
        label="Tone and Style"
        name="tone_and_style"
        value={brief.tone_and_style}
        onChange={(value) => updateField("tone_and_style", value as string)}
        type="select"
        options={TONE_OPTIONS}
        required
        status={getFieldStatus("tone_and_style", brief)}
        error={errors.tone_and_style}
        helperText="Choose the overall mood and voice for your video"
      />

      {/* Desired Length */}
      <FormField
        label="Desired Video Length"
        name="desired_length"
        value={brief.desired_length}
        onChange={(value) => updateField("desired_length", value as string)}
        type="text"
        required
        status={getFieldStatus("desired_length", brief)}
        error={errors.desired_length}
        placeholder="60"
        suffix="seconds"
        helperText="Recommended lengths: 15s (TikTok), 60s (Instagram), 90-180s (YouTube)"
      />

      {/* Format/Platform - Optional but shown in required form */}
      <FormField
        label="Platform"
        name="format_or_platform"
        value={brief.format_or_platform}
        onChange={(value) => updateField("format_or_platform", value as string)}
        type="select"
        options={FORMAT_OPTIONS}
        status={getFieldStatus("format_or_platform", brief)}
        helperText="Where will this video be published?"
      />

      {/* Key Points */}
      <FormField
        label="Key Points to Cover"
        name="key_points"
        value={brief.key_points}
        onChange={(value) => updateField("key_points", value as string[])}
        type="list"
        status={getFieldStatus("key_points", brief)}
        placeholder="Add a key point..."
        helperText="Main messages or features that must be highlighted"
      />

      {/* Call to Action */}
      <FormField
        label="Call to Action (CTA)"
        name="cta"
        value={brief.cta}
        onChange={(value) => updateField("cta", value as string)}
        type="text"
        status={getFieldStatus("cta", brief)}
        placeholder="e.g., Visit our website, Sign up for free trial"
        helperText="What action should viewers take after watching?"
      />

      {/* Show Face Toggle */}
      <FormField
        label="Will talent appear on camera?"
        name="show_face"
        value={brief.show_face}
        onChange={(value) => updateField("show_face", value as string)}
        type="toggle"
        status={getFieldStatus("show_face", brief)}
        helperText="Choose 'Yes' if a person will be speaking directly to camera"
      />
    </form>
  );
}
