import { useEffect, useMemo, useState } from "react";
import { Check, FileText, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deriveCanonicalSourceSnapshot,
  getWorkflow,
  normalizeCanonicalSourceContents,
  sendWorkflowGenerationEvent,
  sendWorkflowEvent,
  sourceContentsFromIntake,
  type CanonicalIntakeContent,
  type CanonicalIntakeSource,
  type ProductionFormat,
  type WorkflowResponse,
} from "@/lib/workflow";
import { cn } from "@/lib/utils";

interface SmartIntakeBuilderProps {
  projectId: string;
  workflow: WorkflowResponse;
  onWorkflowChange: (workflow: WorkflowResponse) => void;
}

type IntakeDraft = {
  prompt: string;
  duration_seconds: CanonicalIntakeContent["duration_seconds"];
  platform: CanonicalIntakeContent["platform"];
  aspect_ratio: CanonicalIntakeContent["aspect_ratio"];
  viewer_outcome: string;
  target_audience: string;
  audience_level: string;
  delivery_tone: string;
  production_formats: ProductionFormat[];
  sources: CanonicalIntakeSource[];
  source_contents: Record<string, string>;
};

const DURATION_OPTIONS = [60, 90, 120, 180, 240, 300, 600, 900, 1200] as const;
const PLATFORM_OPTIONS = [
  ["youtube", "YouTube"],
  ["short_form", "Short-form social"],
  ["internal_lms", "Internal LMS"],
  ["general", "General"],
] as const;
const ASPECT_OPTIONS = ["16:9", "4:3", "1:1", "3:4", "9:16"] as const;
const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "mixed"] as const;
const TONE_OPTIONS = ["conversational", "professional", "warm", "bold"] as const;
const FORMAT_OPTIONS: Array<[ProductionFormat, string]> = [
  ["talking_head", "Talking head"],
  ["slides", "Slides"],
  ["stock_footage", "Stock footage"],
  ["real_world", "Real-world"],
];

function initialDraft(content: CanonicalIntakeContent): IntakeDraft {
  return {
    prompt: content.prompt,
    duration_seconds: content.duration_seconds,
    platform: content.platform,
    aspect_ratio: content.aspect_ratio,
    viewer_outcome: content.viewer_outcome ?? "",
    target_audience: content.target_audience ?? "",
    audience_level: content.audience_level ?? "",
    delivery_tone: content.delivery_tone ?? "",
    production_formats: content.production_formats ?? [],
    sources: (content.sources ?? []).map((source) => ({ ...source })),
    source_contents: sourceContentsFromIntake(content),
  };
}

function hasAnswer(content: CanonicalIntakeContent, key: keyof CanonicalIntakeContent): boolean {
  const value = content[key];
  if (Array.isArray(value)) return value.length > 0;
  return typeof value === "string" && value.trim().length > 0;
}

function formatDuration(seconds: number): string {
  if (seconds < 120) return seconds === 60 ? "1 minute" : `${seconds} seconds`;
  return `${seconds / 60} minutes`;
}

function ChoiceGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly T[];
  selected: T | "";
  onSelect: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={selected === option}
          onClick={() => onSelect(option)}
          className={cn(
            "rounded-full border px-3.5 py-2 text-sm font-medium capitalize transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3A6B47] focus-visible:ring-offset-2",
            selected === option
              ? "border-[#3A6B47] bg-[#E8F0E9] text-[#274F32]"
              : "border-[#D9DDD2] bg-white text-[#4E5848] hover:border-[#9EAA96]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function ChoiceWithCustom<T extends string>({
  label,
  customLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  customLabel: string;
  options: readonly T[];
  value: string;
  onChange: (value: string) => void;
}) {
  const isPreset = options.some((option) => option === value);
  return (
    <div className="space-y-3">
      <ChoiceGroup
        label={label}
        options={options}
        selected={isPreset ? value as T : ""}
        onSelect={onChange}
      />
      <input
        aria-label={customLabel}
        value={isPreset ? "" : value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Or enter your own"
        className="h-11 w-full rounded-xl border border-[#D9DDD2] bg-[#FBFBF8] px-4 text-sm text-[#1C2118] outline-none transition focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
      />
    </div>
  );
}

function FormatChoiceGroup({
  selected,
  onToggle,
}: {
  selected: ProductionFormat[];
  onToggle: (format: ProductionFormat) => void;
}) {
  return (
    <div role="group" aria-label="Production formats" className="flex flex-wrap gap-2">
      {FORMAT_OPTIONS.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={selected.includes(value)}
          onClick={() => onToggle(value)}
          className={cn(
            "rounded-full border px-3.5 py-2 text-sm font-medium",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3A6B47]",
            selected.includes(value)
              ? "border-[#3A6B47] bg-[#E8F0E9] text-[#274F32]"
              : "border-[#D9DDD2] bg-white text-[#4E5848]",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function QuestionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#D9DDD2] bg-white p-5 shadow-[0_1px_0_rgba(28,33,24,0.03)] sm:p-6">
      <h3 className="font-medium text-[#1C2118]">{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function SmartIntakeBuilder({ projectId, workflow, onWorkflowChange }: SmartIntakeBuilderProps) {
  const intakeArtifact = workflow.artifacts.intake;
  const content = intakeArtifact.current_content as CanonicalIntakeContent;
  const [draft, setDraft] = useState<IntakeDraft>(() => initialDraft(content));
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initialDraft(content));
  }, [intakeArtifact.current_version_id, content]);

  const missing = useMemo(() => ({
    viewer_outcome: !hasAnswer(content, "viewer_outcome"),
    target_audience: !hasAnswer(content, "target_audience"),
    audience_level: !hasAnswer(content, "audience_level"),
    delivery_tone: !hasAnswer(content, "delivery_tone"),
    production_formats: !hasAnswer(content, "production_formats"),
  }), [content]);
  const hasKnownDirection = Object.values(missing).some((isMissing) => !isMissing);
  const hasMissingDirection = Object.values(missing).some(Boolean);
  const isDirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft(content)),
    [content, draft],
  );

  const buildContent = (): CanonicalIntakeContent => {
    const next: CanonicalIntakeContent = {
      ...content,
      prompt: draft.prompt.trim(),
      sources: draft.sources.map((source) => ({
        ...source,
        name: source.name.trim(),
        ...(source.title !== undefined ? { title: source.name.trim() } : {}),
      })),
    };
    const sourceContents = normalizeCanonicalSourceContents(
      next.sources,
      draft.source_contents,
    );
    const sourceSnapshot = deriveCanonicalSourceSnapshot(next.sources, sourceContents);
    if (Object.keys(sourceContents).length > 0) next.source_contents = sourceContents;
    else delete next.source_contents;
    if (sourceSnapshot) next.source_snapshot = sourceSnapshot;
    else delete next.source_snapshot;
    if (draft.duration_seconds === undefined) delete next.duration_seconds;
    else next.duration_seconds = draft.duration_seconds;
    if (draft.platform === undefined) delete next.platform;
    else next.platform = draft.platform;
    if (draft.aspect_ratio === undefined) delete next.aspect_ratio;
    else next.aspect_ratio = draft.aspect_ratio;
    const optionalText = ["viewer_outcome", "target_audience", "audience_level", "delivery_tone"] as const;
    for (const key of optionalText) {
      if (draft[key].trim() || Object.prototype.hasOwnProperty.call(content, key)) next[key] = draft[key].trim();
      else delete next[key];
    }
    if (draft.production_formats.length || Object.prototype.hasOwnProperty.call(content, "production_formats")) {
      next.production_formats = draft.production_formats;
    } else {
      delete next.production_formats;
    }
    return next;
  };

  const submit = async (event: "save_intake" | "approve_intake") => {
    if (!draft.prompt.trim()) {
      setError("Add a video brief before continuing.");
      return;
    }
    if (draft.sources.some((source) => !source.name.trim())) {
      setError("Give every retained source a name before continuing.");
      return;
    }
    setError(null);
    setSaveState("saving");
    try {
      const payload = {
        content: buildContent(),
        expected_version_id: intakeArtifact.current_version_id,
      };
      const next = event === "approve_intake"
        ? await sendWorkflowGenerationEvent(projectId, event, payload, onWorkflowChange)
        : await sendWorkflowEvent(projectId, event, payload);
      setSaveState("saved");
      onWorkflowChange(next);
    } catch (caught) {
      setSaveState("idle");
      setError(caught instanceof Error ? caught.message : "Could not save Smart Intake.");
      if (event === "approve_intake") {
        try {
          onWorkflowChange(await getWorkflow(projectId));
        } catch {
          // Keep the original request error visible if refresh also fails.
        }
      }
    }
  };

  const toggleFormat = (format: ProductionFormat) => {
    setDraft((current) => ({
      ...current,
      production_formats: current.production_formats.includes(format)
        ? current.production_formats.filter((item) => item !== format)
        : [...current.production_formats, format],
    }));
  };

  const textField = (key: "viewer_outcome" | "target_audience", label: string) => (
    <textarea
      id={`smart-intake-${key}`}
      aria-label={label}
      value={draft[key]}
      onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
      rows={3}
      className="w-full resize-y rounded-xl border border-[#D9DDD2] bg-[#FBFBF8] px-4 py-3 text-sm leading-6 text-[#1C2118] outline-none transition focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#F7F6F1] text-[#1C2118]">
      <header className="shrink-0 border-b border-[#E1E3DB] bg-[#FBFBF8] px-5 py-5 sm:px-10">
        <div className="max-w-4xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#3A6B47]">
            <Sparkles className="h-3.5 w-3.5" />
            Story setup
          </div>
          <h1 className="mt-2 font-serif text-3xl font-normal tracking-[-0.02em]">Smart Intake</h1>
          <p className="mt-1 text-sm text-[#626B58]">Review what Plotline already knows, then fill only the gaps.</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-10 sm:py-8">
        <div className="w-full max-w-4xl space-y-7">
          <section aria-labelledby="known-setup-heading" className="rounded-2xl border border-[#D9DDD2] bg-[#FBFBF8] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="known-setup-heading" className="font-serif text-xl">Your setup</h2>
                <p className="mt-1 text-sm text-[#626B58]">These details came from Create. You can still edit them.</p>
              </div>
              <Check className="mt-1 h-5 w-5 text-[#3A6B47]" aria-hidden="true" />
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <label className="sm:col-span-3">
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#626B58]">Video brief</span>
                <textarea
                  aria-label="Video brief"
                  value={draft.prompt}
                  onChange={(event) => setDraft((current) => ({ ...current, prompt: event.target.value }))}
                  rows={3}
                  className="w-full resize-y rounded-xl border border-[#D9DDD2] bg-white px-4 py-3 text-sm leading-6 outline-none focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
                />
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#626B58]">Duration</span>
                <select
                  aria-label="Duration"
                  value={draft.duration_seconds ?? ""}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    duration_seconds: event.target.value
                      ? Number(event.target.value) as IntakeDraft["duration_seconds"]
                      : undefined,
                  }))}
                  className="h-11 w-full rounded-xl border border-[#D9DDD2] bg-white px-3 text-sm outline-none focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
                >
                  <option value="">Not set</option>
                  {DURATION_OPTIONS.map((duration) => <option key={duration} value={duration}>{formatDuration(duration)}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#626B58]">Platform</span>
                <select
                  aria-label="Platform"
                  value={draft.platform ?? ""}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    platform: event.target.value
                      ? event.target.value as IntakeDraft["platform"]
                      : undefined,
                  }))}
                  className="h-11 w-full rounded-xl border border-[#D9DDD2] bg-white px-3 text-sm outline-none focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
                >
                  <option value="">Not set</option>
                  {PLATFORM_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[#626B58]">Aspect ratio</span>
                <select
                  aria-label="Aspect ratio"
                  value={draft.aspect_ratio ?? ""}
                  onChange={(event) => setDraft((current) => ({
                    ...current,
                    aspect_ratio: event.target.value
                      ? event.target.value as IntakeDraft["aspect_ratio"]
                      : undefined,
                  }))}
                  className="h-11 w-full rounded-xl border border-[#D9DDD2] bg-white px-3 text-sm outline-none focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
                >
                  <option value="">Not set</option>
                  {ASPECT_OPTIONS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                </select>
              </label>
            </div>
            {draft.sources.length > 0 && (
              <div className="mt-5 border-t border-[#E1E3DB] pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#626B58]">Sources</p>
                <ul className="mt-3 space-y-2">
                  {draft.sources.map((source) => (
                    <li key={source.id} className="flex flex-col gap-2 rounded-xl border border-[#D9DDD2] bg-white p-3 sm:flex-row sm:items-center">
                      <FileText className="hidden h-4 w-4 shrink-0 text-[#626B58] sm:block" aria-hidden="true" />
                      <input
                        aria-label={`Source name ${source.name}`}
                        value={source.name}
                        maxLength={255}
                        onChange={(event) => setDraft((current) => ({
                          ...current,
                          sources: current.sources.map((item) => item.id === source.id
                            ? {
                                ...item,
                                name: event.target.value,
                                ...(item.title !== undefined ? { title: event.target.value } : {}),
                              }
                            : item),
                        }))}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-[#E1E3DB] bg-[#FBFBF8] px-3 text-sm outline-none focus:border-[#3A6B47] focus:ring-2 focus:ring-[#3A6B47]/15"
                      />
                      {source.kind === "link" && (
                        <input
                          aria-label={`Source URL ${source.name}`}
                          value={source.url ?? ""}
                          readOnly
                          className="h-10 min-w-0 flex-[1.4] rounded-lg border border-[#E1E3DB] bg-[#F3F3EF] px-3 text-sm text-[#626B58] outline-none"
                        />
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Remove ${source.name}`}
                        onClick={() => setDraft((current) => ({
                          ...current,
                          sources: current.sources.filter((item) => item.id !== source.id),
                        }))}
                        className="self-end text-[#626B58] hover:text-red-700 sm:self-auto"
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {hasKnownDirection && (
            <section aria-labelledby="known-intake-heading" className="space-y-4 rounded-2xl border border-[#D9DDD2] bg-[#FBFBF8] p-5 sm:p-6">
              <div>
                <h2 id="known-intake-heading" className="font-serif text-xl">Story direction</h2>
                <p className="mt-1 text-sm text-[#626B58]">Saved answers remain editable here.</p>
              </div>
              {!missing.viewer_outcome && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Viewer outcome</span>
                  {textField("viewer_outcome", "Viewer outcome")}
                </label>
              )}
              {!missing.target_audience && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Target audience</span>
                  {textField("target_audience", "Target audience")}
                </label>
              )}
              {!missing.audience_level && (
                <div>
                  <p className="mb-2 text-sm font-medium">Audience level</p>
                  <ChoiceWithCustom
                    label="Audience level"
                    customLabel="Custom audience level"
                    options={LEVEL_OPTIONS}
                    value={draft.audience_level}
                    onChange={(value) => setDraft((current) => ({ ...current, audience_level: value }))}
                  />
                </div>
              )}
              {!missing.delivery_tone && (
                <div>
                  <p className="mb-2 text-sm font-medium">Delivery tone</p>
                  <ChoiceWithCustom
                    label="Delivery tone"
                    customLabel="Custom delivery tone"
                    options={TONE_OPTIONS}
                    value={draft.delivery_tone}
                    onChange={(value) => setDraft((current) => ({ ...current, delivery_tone: value }))}
                  />
                </div>
              )}
              {!missing.production_formats && (
                <div>
                  <p className="mb-2 text-sm font-medium">Production formats</p>
                  <FormatChoiceGroup selected={draft.production_formats} onToggle={toggleFormat} />
                </div>
              )}
            </section>
          )}

          {hasMissingDirection && (
            <div>
              <h2 className="font-serif text-2xl">A few useful details</h2>
              <p className="mt-1 text-sm text-[#626B58]">Answer what you know. Plotline will work with the rest.</p>
              <div className="mt-4 space-y-3">
                {missing.viewer_outcome && (
                  <QuestionCard title="What should viewers be able to do or understand?">
                    {textField("viewer_outcome", "Viewer outcome")}
                  </QuestionCard>
                )}
                {missing.target_audience && (
                  <QuestionCard title="Who is this for?">
                    {textField("target_audience", "Target audience")}
                  </QuestionCard>
                )}
                {missing.audience_level && (
                  <QuestionCard title="How familiar is your audience?">
                    <ChoiceWithCustom
                      label="Audience level"
                      customLabel="Custom audience level"
                      options={LEVEL_OPTIONS}
                      value={draft.audience_level}
                      onChange={(value) => setDraft((current) => ({ ...current, audience_level: value }))}
                    />
                  </QuestionCard>
                )}
                {missing.delivery_tone && (
                  <QuestionCard title="How should it sound?">
                    <ChoiceWithCustom
                      label="Delivery tone"
                      customLabel="Custom delivery tone"
                      options={TONE_OPTIONS}
                      value={draft.delivery_tone}
                      onChange={(value) => setDraft((current) => ({ ...current, delivery_tone: value }))}
                    />
                  </QuestionCard>
                )}
                {missing.production_formats && (
                  <QuestionCard title="Which production formats should we plan for?">
                    <FormatChoiceGroup selected={draft.production_formats} onToggle={toggleFormat} />
                  </QuestionCard>
                )}
              </div>
            </div>
          )}

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>

      <footer className="shrink-0 border-t border-[#D9DDD2] bg-[#FBFBF8] px-5 py-4 sm:px-10">
        <div className="flex w-full max-w-4xl flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
          {saveState === "saved" && !isDirty && <span className="mr-auto flex items-center gap-1.5 text-sm text-[#3A6B47]"><Check className="h-4 w-4" />Saved</span>}
          {isDirty && <span className="mr-auto text-sm text-[#626B58]">Unsaved changes</span>}
          <Button type="button" variant="outline" disabled={saveState === "saving"} onClick={() => void submit("save_intake")}>
            {saveState === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
          <Button type="button" disabled={saveState === "saving"} onClick={() => void submit("approve_intake")} className="bg-[#3A6B47] text-white hover:bg-[#2F593B]">
            Save &amp; Generate Outline
          </Button>
        </div>
      </footer>
    </div>
  );
}
