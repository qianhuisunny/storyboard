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

export async function getWorkflow(projectId: string, fetchImpl: typeof fetch = fetch): Promise<WorkflowResponse> {
  await ensureSession(fetchImpl);
  const response = await fetchImpl(`/api/project/${projectId}/pipeline-state`, {
    credentials: "same-origin",
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
