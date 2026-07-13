import { ensureSession } from "@/lib/session";

export type WorkflowStage = "intake" | "outline" | "storyboard" | "complete";
export type WorkflowJobStatus = "idle" | "running" | "failed";
export type WorkflowJobKind = "outline" | "storyboard" | null;
export type ProductionFormat = "talking_head" | "slides" | "stock_footage" | "real_world";

export interface CanonicalIntakeSource {
  id: string;
  kind: "upload" | "link" | "text";
  name: string;
  status: "pending" | "processing" | "ready" | "failed";
  url?: string;
  title?: string;
  path?: string;
  error?: string;
}

export interface CanonicalIntakeContent {
  prompt: string;
  duration_seconds?: 60 | 90 | 120 | 180 | 240 | 300 | 600 | 900 | 1200;
  platform?: "youtube" | "short_form" | "internal_lms" | "general";
  aspect_ratio?: "16:9" | "4:3" | "1:1" | "3:4" | "9:16";
  note?: string;
  notes?: string;
  source_snapshot?: string;
  source_contents?: Record<string, string>;
  sources: CanonicalIntakeSource[];
  viewer_outcome?: string;
  target_audience?: string;
  audience_level?: string;
  delivery_tone?: string;
  production_formats?: ProductionFormat[];
  format_or_platform?: string;
  company_or_brand_name?: string;
  call_to_action?: string;
  constraints?: string[];
  smart_intake_extra?: Record<string, string | number | boolean | string[]>;
}

export const MAX_SOURCE_CONTENT_CHARS = 50_000;
export const MAX_SOURCE_CONTENT_TOTAL_CHARS = 100_000;
export const MAX_SOURCE_SNAPSHOT_CHARS = 100_000;

const SOURCE_CONTENT_TRUNCATION_MARKER = "\n…[source content truncated]";
const SOURCE_SNAPSHOT_TRUNCATION_MARKER = "\n…[source snapshot truncated]";

function truncateWithMarker(value: string, limit: number, marker: string): string {
  if (value.length <= limit) return value;
  if (limit <= marker.length) return value.slice(0, limit);
  return value.slice(0, limit - marker.length) + marker;
}

function canonicalSourceLabel(source: CanonicalIntakeSource): "File" | "Link" | "Note" {
  return source.kind === "link" ? "Link" : source.kind === "upload" ? "File" : "Note";
}

function canonicalSourceHeader(source: CanonicalIntakeSource): string {
  return `[${canonicalSourceLabel(source)}: ${source.name}]`;
}

function blockContentForExactSource(
  block: string,
  source: CanonicalIntakeSource,
): string | null {
  const normalized = block.replace(/\r\n/g, "\n");
  const header = canonicalSourceHeader(source);
  if (normalized === header) return "";
  if (!normalized.startsWith(`${header}\n`)) return null;
  return normalized.slice(header.length + 1).trim();
}

function hasRecognizedSourceHeader(block: string): boolean {
  const normalized = block.replace(/\r\n/g, "\n").trimStart();
  return /^\[(?:File|Link|Note): [^\n]*\](?:\n|$)/.test(normalized);
}

export function normalizeCanonicalSourceContents(
  sources: CanonicalIntakeSource[],
  sourceContents: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  let remaining = MAX_SOURCE_CONTENT_TOTAL_CHARS;
  for (const source of sources.slice(0, 20)) {
    if (source.status !== "ready" || remaining <= 0) continue;
    const raw = sourceContents[source.id];
    if (typeof raw !== "string" || !raw.trim()) continue;
    const perSource = truncateWithMarker(
      raw.trim(),
      MAX_SOURCE_CONTENT_CHARS,
      SOURCE_CONTENT_TRUNCATION_MARKER,
    );
    const bounded = truncateWithMarker(
      perSource,
      remaining,
      SOURCE_CONTENT_TRUNCATION_MARKER,
    );
    if (!bounded) break;
    normalized[source.id] = bounded;
    remaining -= bounded.length;
  }
  return normalized;
}

export interface SourceContentMigration {
  sourceContents: Record<string, string>;
  complete: boolean;
}

export function sourceContentsFromIntake(
  content: CanonicalIntakeContent,
): SourceContentMigration {
  if (content.source_contents !== undefined) {
    return {
      sourceContents: normalizeCanonicalSourceContents(content.sources, content.source_contents),
      complete: true,
    };
  }

  const readySources = content.sources.filter((source) => source.status === "ready");
  const snapshot = typeof content.source_snapshot === "string"
    ? content.source_snapshot
    : "";
  if (!snapshot.trim()) return { sourceContents: {}, complete: true };

  if (readySources.length === 1 && !hasRecognizedSourceHeader(snapshot)) {
    return {
      sourceContents: normalizeCanonicalSourceContents(
        content.sources,
        { [readySources[0].id]: snapshot },
      ),
      complete: true,
    };
  }

  const sections = snapshot
    .split(/\r?\n\r?\n---\r?\n\r?\n/)
    .filter((section) => section.trim());
  const migrated: Record<string, string> = {};
  const usedSourceIds = new Set<string>();
  const unmatchedSections: string[] = [];

  for (const section of sections) {
    const matchedSource = readySources.find((source) => (
      !usedSourceIds.has(source.id)
      && blockContentForExactSource(section, source) !== null
    ));
    if (!matchedSource) {
      unmatchedSections.push(section);
      continue;
    }
    usedSourceIds.add(matchedSource.id);
    const extracted = blockContentForExactSource(section, matchedSource);
    if (extracted) migrated[matchedSource.id] = extracted;
  }

  const unmatchedSources = readySources.filter((source) => !usedSourceIds.has(source.id));
  if (
    unmatchedSections.length === 1
    && unmatchedSources.length === 1
    && !hasRecognizedSourceHeader(unmatchedSections[0])
  ) {
    const fallback = unmatchedSections[0].replace(/\r\n/g, "\n").trim();
    if (fallback) migrated[unmatchedSources[0].id] = fallback;
    unmatchedSections.length = 0;
  }

  return {
    sourceContents: normalizeCanonicalSourceContents(content.sources, migrated),
    complete: unmatchedSections.length === 0,
  };
}

export function deriveCanonicalSourceSnapshot(
  sources: CanonicalIntakeSource[],
  sourceContents: Record<string, string>,
): string {
  const blocks = sources.flatMap((source) => {
    if (source.status !== "ready") return [];
    const extracted = sourceContents[source.id];
    if (!extracted) return [];
    return [`${canonicalSourceHeader(source)}\n${extracted}`];
  });
  return truncateWithMarker(
    blocks.join("\n\n---\n\n"),
    MAX_SOURCE_SNAPSHOT_CHARS,
    SOURCE_SNAPSHOT_TRUNCATION_MARKER,
  );
}

export interface ArtifactState<T> {
  current_version_id: string | null;
  approved_version_id: string | null;
  needs_update: boolean;
  current_content: T | null;
  approved_content: T | null;
}

export interface WorkflowJob {
  status: WorkflowJobStatus;
  job_id: string | null;
  kind: WorkflowJobKind;
  input_version_id: string | null;
  error?: string | null;
}

export interface WorkflowResponse {
  success: boolean;
  project_id: string;
  workflow_stage: WorkflowStage;
  phase: string;
  allowed_events: string[];
  job: WorkflowJob;
  artifacts: {
    intake: ArtifactState<CanonicalIntakeContent | Record<string, unknown>>;
    outline: ArtifactState<string>;
    storyboard: ArtifactState<unknown[]>;
  };
  state?: {
    has_story_brief?: boolean;
    has_screen_outline?: boolean;
    has_storyboard?: boolean;
  };
  data?: {
    story_brief?: unknown;
    screen_outline?: unknown;
    storyboard?: unknown;
  };
}

export class WorkflowConflictError extends Error {
  readonly code: string;
  readonly currentVersionId: string | null;
  readonly job: WorkflowJob | null;

  constructor(message: string, code: string, currentVersionId: string | null, job: WorkflowJob | null) {
    super(message);
    this.name = "WorkflowConflictError";
    this.code = code;
    this.currentVersionId = currentVersionId;
    this.job = job;
  }
}

export function isCanonicalIntakeContent(value: unknown): value is CanonicalIntakeContent {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const intake = value as Record<string, unknown>;
  return typeof intake.prompt === "string" && Array.isArray(intake.sources);
}

export function isCanonicalIntakeArtifact(
  value: unknown,
): value is ArtifactState<CanonicalIntakeContent> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Partial<ArtifactState<unknown>>;
  return typeof artifact.current_version_id === "string"
    && artifact.current_version_id.length > 0
    && isCanonicalIntakeContent(artifact.current_content);
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as {
      detail?: string | { message?: string };
      error?: string;
    };
    if (typeof body.detail === "string") return body.detail;
    if (typeof body.detail?.message === "string") return body.detail.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // The stable fallback covers non-JSON errors.
  }
  return fallback;
}

async function parseConflict(response: Response): Promise<WorkflowConflictError> {
  const body = await response.json().catch(() => ({})) as {
    detail?: {
      code?: string;
      current_version_id?: string | null;
      job?: WorkflowJob;
      message?: string;
    };
  };
  const detail = body.detail ?? {};
  const code = typeof detail.code === "string" ? detail.code : "workflow_conflict";
  const currentVersionId = typeof detail.current_version_id === "string" || detail.current_version_id === null
    ? detail.current_version_id
    : null;
  const message = detail.message ?? (
    code === "version_conflict"
      ? "This project changed in another tab. Reload the latest version before saving."
      : "A matching generation is already running."
  );
  return new WorkflowConflictError(message, code, currentVersionId, detail.job ?? null);
}

async function parseWorkflowResponse(response: Response): Promise<WorkflowResponse> {
  if (response.status === 409) throw await parseConflict(response);
  if (!response.ok) throw new Error(await parseErrorMessage(response, "The workflow request failed."));
  const body = await response.json() as WorkflowResponse;
  if (!body?.success || !body.artifacts || !body.workflow_stage) {
    throw new Error("The server returned an invalid workflow response.");
  }
  return body;
}

export async function getWorkflow(
  projectId: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<WorkflowResponse> {
  await ensureSession(fetchImpl);
  const response = await fetchImpl(`/api/project/${projectId}/pipeline-state`, {
    credentials: "same-origin",
    signal,
  });
  return parseWorkflowResponse(response);
}

export async function sendWorkflowEvent(
  projectId: string,
  event: string,
  payload: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkflowResponse> {
  await ensureSession(fetchImpl);
  const response = await fetchImpl(`/api/project/${projectId}/event`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload }),
  });
  return parseWorkflowResponse(response);
}

export async function sendWorkflowGenerationEvent(
  projectId: string,
  event: string,
  payload: Record<string, unknown>,
  onObservedWorkflow: (workflow: WorkflowResponse) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<WorkflowResponse> {
  let previousJobId: string | null = null;
  try {
    const before = await getWorkflow(projectId, fetchImpl);
    previousJobId = before.job.job_id;
  } catch {
    // The event can still proceed. Polling below accepts only a running job,
    // never a pre-existing terminal overlay.
  }

  let settled = false;
  const outcomePromise = sendWorkflowEvent(projectId, event, payload, fetchImpl).then(
    (workflow) => {
      settled = true;
      return { workflow } as const;
    },
    (error: unknown) => {
      settled = true;
      return { error } as const;
    },
  );

  // Generation endpoints return only after the generator completes. Observe the
  // committed job overlay while that request remains in flight so navigation and
  // refresh use backend state rather than a component-local spinner.
  for (let attempt = 0; attempt < 20 && !settled; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 75));
    try {
      const observed = await getWorkflow(projectId, fetchImpl);
      if (
        observed.job.status === "running"
        && typeof observed.job.job_id === "string"
        && observed.job.job_id !== previousJobId
      ) {
        onObservedWorkflow(observed);
        break;
      }
    } catch {
      // The original event remains authoritative; a transient observation
      // failure should not turn a successful generation into an error.
    }
  }

  const outcome = await outcomePromise;
  if ("error" in outcome) throw outcome.error;
  return outcome.workflow;
}
