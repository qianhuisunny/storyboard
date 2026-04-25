import { Card } from "@/components/ui/card";
import { ScoreDisplay } from "./ScoreDisplay";
import type { QualityLogEntry } from "./EventNode";

interface EventDetailProps {
  entry: QualityLogEntry;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function CodeBlock({ content }: { content: string }) {
  return (
    <pre className="max-h-[300px] overflow-auto rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap break-words">
      {content}
    </pre>
  );
}

function tryPrettyJson(raw: string | null | undefined): string {
  if (!raw) return "—";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="shrink-0 text-muted-foreground w-24">{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}

function GenerateDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <div className="space-y-1">
          <MetaRow label="Model" value={entry.model} />
          <MetaRow label="Prompt" value={entry.prompt_ref} />
          <MetaRow label="Attempt" value={String(entry.attempt ?? "—")} />
          <MetaRow label="Scope" value={entry.scope} />
        </div>
      </Section>
      <Section title="Context (input)">
        <CodeBlock content={tryPrettyJson(entry.context)} />
      </Section>
      <Section title="Raw Response">
        <CodeBlock content={entry.raw_response ?? "—"} />
      </Section>
      {entry.parsed_output != null ? (
        <Section title="Parsed Output">
          <CodeBlock content={JSON.stringify(entry.parsed_output, null, 2)} />
        </Section>
      ) : null}
    </div>
  );
}

function EvalDetail({ entry }: { entry: QualityLogEntry }) {
  const scores = entry.scores;
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <div className="space-y-1">
          <MetaRow label="Model" value={entry.model} />
          <MetaRow label="Prompt" value={entry.prompt_ref} />
          <MetaRow label="Scope" value={entry.scope} />
        </div>
      </Section>
      {scores && (
        <Section title="Scores">
          <div className="space-y-0.5">
            {scores.composite_score != null && (
              <ScoreDisplay label="Composite" score={scores.composite_score} />
            )}
            {scores.gut && (
              <ScoreDisplay label="Gut check" score={scores.gut.score} feedback={scores.gut.feedback} />
            )}
            {scores.dimensions?.map((d) => (
              <ScoreDisplay key={d.dimension} label={d.dimension} score={d.score} feedback={d.feedback} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Context (input)">
        <CodeBlock content={tryPrettyJson(entry.context)} />
      </Section>
      <Section title="Raw Response">
        <CodeBlock content={entry.raw_response ?? "—"} />
      </Section>
    </div>
  );
}

function OverrideDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <MetaRow label="Scope" value={entry.scope} />
      </Section>
      {entry.instruction && (
        <Section title="Instruction">
          <p className="text-sm">{entry.instruction}</p>
        </Section>
      )}
      <Section title="Before">
        <CodeBlock content={tryPrettyJson(entry.before_content)} />
      </Section>
      <Section title="After">
        <CodeBlock content={tryPrettyJson(entry.after_content)} />
      </Section>
    </div>
  );
}

function ApproveDetail({ entry }: { entry: QualityLogEntry }) {
  return (
    <div className="space-y-4">
      <Section title="Metadata">
        <MetaRow label="Scope" value={entry.scope} />
        <MetaRow
          label="Timestamp"
          value={new Date(entry.created_at * 1000).toLocaleString()}
        />
      </Section>
    </div>
  );
}

const DETAIL_RENDERERS: Record<
  QualityLogEntry["event"],
  React.ComponentType<{ entry: QualityLogEntry }>
> = {
  generate: GenerateDetail,
  eval: EvalDetail,
  override: OverrideDetail,
  approve: ApproveDetail,
};

export function EventDetail({ entry }: EventDetailProps) {
  const Renderer = DETAIL_RENDERERS[entry.event];
  return (
    <Card className="p-4">
      <Renderer entry={entry} />
    </Card>
  );
}
