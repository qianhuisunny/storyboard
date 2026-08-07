import { expect, test, type Page, type Route } from "@playwright/test";
import { parseProductionScreens } from "../src/components/DraftBuilder/types";

type Stage = "intake" | "outline" | "storyboard" | "complete";
type Artifact<T> = {
  current_version_id: string | null;
  approved_version_id: string | null;
  needs_update: boolean;
  current_content: T | null;
  approved_content: T | null;
};
type Job = {
  status: "idle" | "running" | "failed";
  job_id: string | null;
  kind: "outline" | "storyboard" | null;
  input_version_id: string | null;
  target_version_id?: string | null;
  error: string | null;
};
type EventRequest = {
  event: string;
  payload: Record<string, unknown>;
};

const PROJECT_ID = "66666666-6666-4666-8666-666666666666";

test("legacy storyboard fields normalize into the editable display contract", () => {
  const [screen] = parseProductionScreens([
    {
      screen_number: 7,
      screen_type: "cta",
      on_screen_visual_keywords: "Large final question; warm brand end card",
      voiceover_text: "What will you change first?",
      duration: 8,
    },
  ]);

  expect(screen.screen_type).toBe("slides");
  expect(screen.narrative_role).toBe("cta");
  expect(screen.visual_direction).toBe("Large final question; warm brand end card");
});
const INTAKE = {
  prompt: "Show product teams how to run a calm launch",
  duration_seconds: 300,
  platform: "youtube",
  aspect_ratio: "16:9",
  viewer_outcome: "Run the launch workflow confidently",
  target_audience: "Product operations leads",
  audience_level: "intermediate",
  delivery_tone: "clear and practical",
  production_formats: ["talking_head", "slides"],
  sources: [],
};
const OUTLINE = `Section 1 — A calm launch

Purpose
Replace launch-day confusion with a clear operating rhythm.

Entry assumption
The viewer has shipped at least one product.

Exit state
The viewer can name the three launch checkpoints.

Duration
1:00

Talking points
- Align owners before launch day
- Make the release checklist visible`;
const STORYBOARD = [
  { screen_number: 1, screen_type: "talking_head", voiceover_text: "A calm launch starts before launch day.", visual_direction: ["Presenter on camera"], duration: 20 },
  { screen_number: 2, screen_type: "slides", voiceover_text: "Name the owner for every checkpoint.", visual_direction: ["Three checkpoint diagram"], duration: 20 },
  { screen_number: 3, screen_type: "real_world", voiceover_text: "Then rehearse the handoff once.", visual_direction: ["Team rehearsal"], duration: 20 },
];

function emptyArtifact<T>(): Artifact<T> {
  return { current_version_id: null, approved_version_id: null, needs_update: false, current_content: null, approved_content: null };
}

function allowedEvents(stage: Stage): string[] {
  if (stage === "intake") return ["save_intake", "approve_intake"];
  if (stage === "outline") return ["save_outline", "revise_outline", "approve_outline", "edit_intake"];
  if (stage === "storyboard") return ["save_storyboard", "revise_storyboard", "approve_storyboard", "edit_outline", "edit_intake", "keep_storyboard"];
  return ["reopen_intake", "reopen_outline", "reopen_storyboard"];
}

function workflowBody(
  stage: Stage,
  outline: Artifact<string>,
  storyboard: Artifact<typeof STORYBOARD>,
  job: Job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null },
  intake: Artifact<typeof INTAKE> = {
    current_version_id: "intake-v1",
    approved_version_id: stage === "intake" ? null : "intake-v1",
    needs_update: false,
    current_content: INTAKE,
    approved_content: stage === "intake" ? null : INTAKE,
  },
) {
  return {
    success: true,
    project_id: PROJECT_ID,
    workflow_stage: stage,
    phase: stage,
    allowed_events: allowedEvents(stage),
    job,
    artifacts: {
      intake,
      outline,
      storyboard,
    },
    state: { has_story_brief: true, has_screen_outline: Boolean(outline.current_content), has_storyboard: Boolean(storyboard.current_content) },
    data: { story_brief: INTAKE, screen_outline: outline.current_content, storyboard: storyboard.current_content },
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

type MockOptions = {
  initialStage?: Stage;
  initialOutline?: string | null;
  initialStoryboard?: typeof STORYBOARD;
  storyboardNeedsUpdate?: boolean;
  failedStoryboardJob?: boolean;
  initialJob?: Job;
  conflictOnOutlineSave?: boolean;
  failStoryboardRevision?: boolean;
  deferStoryboardRevision?: boolean;
  deferFirstStoryboardSave?: boolean;
  deferSecondStoryboardSave?: boolean;
  startFromCreate?: boolean;
  settleRunningJobAfterReads?: number;
};

async function mockWorkflow(page: Page, options: MockOptions = {}) {
  let intake: Artifact<typeof INTAKE> = options.startFromCreate
    ? emptyArtifact<typeof INTAKE>()
    : {
        current_version_id: "intake-v1",
        approved_version_id: options.initialStage === "intake" ? null : "intake-v1",
        needs_update: false,
        current_content: structuredClone(INTAKE),
        approved_content: options.initialStage === "intake" ? null : structuredClone(INTAKE),
      };
  const initialOutline = options.initialOutline === undefined ? OUTLINE : options.initialOutline;
  let outline: Artifact<string> = {
    current_version_id: initialOutline === null ? null : "outline-v1",
    approved_version_id: options.initialStage === "outline" ? null : "outline-v1",
    needs_update: false,
    current_content: initialOutline,
    approved_content: options.initialStage === "outline" ? null : initialOutline,
  };
  const initialStoryboard = options.initialStoryboard ?? (options.initialStage === "outline" ? null : STORYBOARD);
  let storyboard: Artifact<typeof STORYBOARD> = initialStoryboard
    ? {
        current_version_id: "storyboard-v1",
        approved_version_id: options.initialStage === "complete" ? "storyboard-v1" : null,
        needs_update: Boolean(options.storyboardNeedsUpdate),
        current_content: structuredClone(initialStoryboard),
        approved_content: options.initialStage === "complete" ? structuredClone(initialStoryboard) : null,
      }
    : emptyArtifact<typeof STORYBOARD>();
  let stage = options.initialStage ?? "outline";
  let job: Job = options.initialJob ?? (options.failedStoryboardJob
    ? { status: "failed", job_id: "storyboard-job-failed", kind: "storyboard", input_version_id: "outline-v1", target_version_id: storyboard.current_version_id, error: "Writer timed out" }
    : { status: "idle", job_id: null, kind: null, input_version_id: null, error: null });
  let workflow = workflowBody(stage, outline, storyboard, job, intake);
  const events: EventRequest[] = [];
  let outlineVersion = 1;
  let storyboardVersion = 1;
  let conflictPending = Boolean(options.conflictOnOutlineSave);
  let releaseStoryboardRevision: (() => void) | null = null;
  let releaseFirstStoryboardSave: (() => void) | null = null;
  let storyboardSaveCount = 0;
  let pipelineReadCount = 0;

  const refresh = () => {
    workflow = workflowBody(stage, outline, storyboard, job, intake);
    return workflow;
  };

  await page.route("**/api/session", (route) => json(route, { success: true }));
  await page.route("**/api/create-project", async (route) => {
    const request = route.request().postDataJSON() as { projectId: string };
    expect(request.projectId).toBe(PROJECT_ID);
    await json(route, { success: true, projectId: PROJECT_ID });
  });
  await page.route(`**/api/project/${PROJECT_ID}`, (route) => json(route, {
    success: true,
    project: { id: PROJECT_ID, userInput: INTAKE.prompt, typeName: "Video storyboard" },
  }));
  await page.route(`**/api/project/${PROJECT_ID}/stages`, (route) => json(route, {
    success: true,
    stages: { 2: { aiVersion: "STALE SNAPSHOT MUST NOT RENDER", humanVersion: null } },
    currentStageId: 1,
  }));
  await page.route(`**/api/project/${PROJECT_ID}/pipeline-state`, (route) => {
    pipelineReadCount += 1;
    if (
      options.settleRunningJobAfterReads
      && pipelineReadCount >= options.settleRunningJobAfterReads
      && job.status === "running"
    ) {
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      refresh();
    }
    return json(route, workflow);
  });
  await page.route(`**/api/project/${PROJECT_ID}/event`, async (route) => {
    const request = route.request().postDataJSON() as EventRequest;
    events.push(request);

    if (request.event === "save_intake") {
      expect(request.payload.expected_version_id).toBe(intake.current_version_id);
      intake = {
        current_version_id: intake.current_version_id ? "intake-v2" : "intake-v1",
        approved_version_id: null,
        needs_update: false,
        current_content: structuredClone(request.payload.content as typeof INTAKE),
        approved_content: null,
      };
      await json(route, refresh());
      return;
    }

    if (request.event === "save_outline") {
      if (conflictPending) {
        conflictPending = false;
        await json(route, { detail: { code: "version_conflict", current_version_id: "outline-v9" } }, 409);
        return;
      }
      expect(request.payload.expected_version_id).toBe(outline.current_version_id);
      outlineVersion += 1;
      outline = { ...outline, current_version_id: `outline-v${outlineVersion}`, current_content: request.payload.content as string };
      if (storyboard.current_version_id) storyboard = { ...storyboard, needs_update: true };
      await json(route, refresh());
      return;
    }

    if (request.event === "revise_outline") {
      expect(request.payload.expected_version_id).toBe(outline.current_version_id);
      expect(request.payload.instruction).toEqual(expect.any(String));
      job = { status: "running", job_id: "outline-job-1", kind: "outline", input_version_id: "intake-v1", error: null };
      refresh();
      outlineVersion += 1;
      outline = { ...outline, current_version_id: `outline-v${outlineVersion}`, current_content: `${outline.current_content}\n\nAI revision applied.` };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      await json(route, refresh());
      return;
    }

    if (request.event === "approve_intake") {
      expect(request.payload.expected_version_id).toBe(intake.current_version_id);
      intake = {
        ...intake,
        current_content: structuredClone(request.payload.content as typeof INTAKE),
        approved_version_id: intake.current_version_id,
        approved_content: structuredClone(request.payload.content as typeof INTAKE),
      };
      stage = "outline";
      job = { status: "running", job_id: "outline-job-retry", kind: "outline", input_version_id: "intake-v1", error: null };
      outlineVersion += 1;
      outline = { current_version_id: `outline-v${outlineVersion}`, approved_version_id: null, needs_update: false, current_content: OUTLINE, approved_content: null };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      await json(route, refresh());
      return;
    }

    if (request.event === "approve_outline") {
      expect(request.payload.expected_version_id).toBe(outline.current_version_id);
      expect(request.payload.content).toBe(outline.current_content);
      outline = { ...outline, approved_version_id: outline.current_version_id, approved_content: outline.current_content };
      stage = "storyboard";
      job = { status: "running", job_id: "storyboard-job-1", kind: "storyboard", input_version_id: outline.current_version_id, error: null };
      refresh();
      await new Promise((resolve) => setTimeout(resolve, 150));
      storyboardVersion += 1;
      storyboard = { current_version_id: `storyboard-v${storyboardVersion}`, approved_version_id: null, needs_update: false, current_content: structuredClone(STORYBOARD), approved_content: null };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      await json(route, refresh());
      return;
    }

    if (request.event === "save_storyboard") {
      expect(request.payload.expected_version_id).toBe(storyboard.current_version_id);
      storyboardSaveCount += 1;
      if (
        (options.deferFirstStoryboardSave && storyboardSaveCount === 1)
        || (options.deferSecondStoryboardSave && storyboardSaveCount === 2)
      ) {
        await new Promise<void>((resolve) => { releaseFirstStoryboardSave = resolve; });
      }
      storyboardVersion += 1;
      storyboard = { ...storyboard, current_version_id: `storyboard-v${storyboardVersion}`, current_content: structuredClone(request.payload.content as typeof STORYBOARD), needs_update: false };
      await json(route, refresh());
      return;
    }

    if (request.event === "revise_storyboard") {
      expect(request.payload.expected_version_id).toBe(storyboard.current_version_id);
      const revisionInputVersion = storyboard.current_version_id;
      const revisionBase = structuredClone(storyboard.current_content ?? STORYBOARD);
      job = { status: "running", job_id: `storyboard-job-${events.length}`, kind: "storyboard", input_version_id: outline.approved_version_id, target_version_id: revisionInputVersion, error: null };
      refresh();
      if (options.deferStoryboardRevision) {
        await new Promise<void>((resolve) => { releaseStoryboardRevision = resolve; });
      }
      if (options.failStoryboardRevision) {
        job = { ...job, status: "failed", error: "Writer timed out" };
        refresh();
        await json(route, { detail: { code: "workflow_generation_failed", message: "Writer timed out", job } }, 502);
        return;
      }
      if (storyboard.current_version_id !== revisionInputVersion) {
        job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
        await json(route, refresh());
        return;
      }
      storyboardVersion += 1;
      const revised = revisionBase;
      revised[0].voiceover_text = "The revised calm launch starts before launch day.";
      storyboard = { ...storyboard, current_version_id: `storyboard-v${storyboardVersion}`, current_content: revised, needs_update: false };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      await json(route, refresh());
      return;
    }

    if (request.event === "keep_storyboard") {
      expect(request.payload.expected_version_id).toBe(storyboard.current_version_id);
      storyboardVersion += 1;
      storyboard = { ...storyboard, current_version_id: `storyboard-v${storyboardVersion}`, needs_update: false };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      await json(route, refresh());
      return;
    }

    if (request.event === "approve_storyboard") {
      expect(request.payload.expected_version_id).toBe(storyboard.current_version_id);
      const approvedContent = structuredClone(request.payload.content as typeof STORYBOARD);
      if (JSON.stringify(approvedContent) !== JSON.stringify(storyboard.current_content)) {
        storyboardVersion += 1;
      }
      storyboard = {
        ...storyboard,
        current_version_id: `storyboard-v${storyboardVersion}`,
        current_content: approvedContent,
        approved_version_id: `storyboard-v${storyboardVersion}`,
        approved_content: approvedContent,
      };
      stage = "complete";
      await json(route, refresh());
      return;
    }

    const reopenStages: Record<string, Stage> = {
      edit_intake: "intake",
      edit_outline: "outline",
      reopen_intake: "intake",
      reopen_outline: "outline",
      reopen_storyboard: "storyboard",
    };
    if (reopenStages[request.event]) {
      stage = reopenStages[request.event];
      await json(route, refresh());
      return;
    }

    await json(route, { detail: `Unexpected event ${request.event}` }, 500);
  });

  return {
    events,
    releaseStoryboardRevision: () => releaseStoryboardRevision?.(),
    releaseFirstStoryboardSave: () => releaseFirstStoryboardSave?.(),
    releaseSecondStoryboardSave: () => releaseFirstStoryboardSave?.(),
    getPipelineReadCount: () => pipelineReadCount,
    forceComplete() {
      stage = "complete";
      workflow = workflowBody(stage, outline, storyboard, job, intake);
    },
    getWorkflow: () => structuredClone(workflow),
    installNewerStoryboard() {
      storyboardVersion += 1;
      const newer = structuredClone(STORYBOARD);
      newer[0].voiceover_text = "A newer storyboard version wins.";
      storyboard = {
        ...storyboard,
        current_version_id: `storyboard-v${storyboardVersion}`,
        current_content: newer,
      };
      job = { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
      refresh();
    },
  };
}

type LegacyPhase =
  | "brief_round1"
  | "brief_round2"
  | "brief_round3"
  | "angle_selection"
  | "review"
  | "done";

async function mockLegacyProject(
  page: Page,
  phase: LegacyPhase,
  stages: Record<string, { aiVersion: string | null; humanVersion: string | null }> = {},
  options: { guidedBrief?: boolean; eventLog?: string[] } = {},
) {
  const workflowStage: Stage = phase === "done"
    ? "complete"
    : phase === "review"
    ? "storyboard"
    : "intake";
  const storyBrief = {
    fields: {
      topic: {
        value: `Historical ${phase} brief`,
        source: "extracted",
        confirmed: false,
      },
      ...(options.guidedBrief ? {
        video_type: { value: "knowledge_sharing", source: "extracted", confirmed: false },
        viewer_outcome: { value: "Advance the restored brief", source: "extracted", confirmed: false },
        target_audience: { value: "Legacy project owners", source: "extracted", confirmed: false },
        core_talking_points: { value: ["Retain the original context"], source: "generated", confirmed: false },
      } : {}),
    },
  };
  const body = {
    success: true,
    project_id: PROJECT_ID,
    workflow_stage: workflowStage,
    phase,
    allowed_events: allowedEvents(workflowStage),
    job: { status: "idle", job_id: null, kind: null, input_version_id: null, error: null },
    artifacts: {
      intake: { ...emptyArtifact<typeof storyBrief>(), current_content: storyBrief },
      outline: { ...emptyArtifact<string>(), current_content: OUTLINE },
      storyboard: { ...emptyArtifact<typeof STORYBOARD>(), current_content: structuredClone(STORYBOARD) },
    },
    state: { has_story_brief: true, has_screen_outline: true, has_storyboard: true },
    data: {
      story_brief: storyBrief,
      screen_outline: OUTLINE,
      storyboard: structuredClone(STORYBOARD),
    },
  };

  await page.route("**/api/session", (route) => json(route, { success: true }));
  await page.route(`**/api/project/${PROJECT_ID}`, (route) => json(route, {
    success: true,
    project: { id: PROJECT_ID, userInput: `Historical ${phase} project`, typeName: "Legacy" },
  }));
  await page.route(`**/api/project/${PROJECT_ID}/stages`, (route) => json(route, {
    success: true,
    stages,
    currentStageId: 4,
    stageStatuses: [
      { id: 1, status: "approved" },
      { id: 2, status: "approved" },
      { id: 3, status: "approved" },
      { id: 4, status: "needs_review" },
    ],
  }));
  await page.route(`**/api/project/${PROJECT_ID}/chat-messages`, (route) => json(route, {
    success: true,
    messages: [],
  }));
  await page.route(`**/api/project/${PROJECT_ID}/pipeline-state`, (route) => json(route, body));
  await page.route(`**/api/project/${PROJECT_ID}/event`, async (route) => {
    const request = route.request().postDataJSON() as {
      event: string;
      payload?: { all_fields?: typeof storyBrief.fields };
    };
    options.eventLog?.push(request.event);
    if (request.event === "chat_brief_approve") {
      await json(route, {
        success: true,
        phase: "gate1",
        story_brief: {
          ...storyBrief,
          fields: request.payload?.all_fields ?? storyBrief.fields,
        },
      });
      return;
    }
    if (request.event === "approve") {
      await json(route, {
        success: true,
        phase: "gate2",
        screen_outline: OUTLINE,
      });
      return;
    }
    await json(route, body);
  });

  return { storyBrief };
}

async function editFirstStoryboardVoiceover(page: Page, value: string) {
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator("textarea").first().fill(value);
  await page.getByRole("button", { name: "Done", exact: true }).first().click();
}

test("legacy review phase opens Storyboard despite an approved Stage 3 snapshot", async ({ page }) => {
  await mockLegacyProject(page, "review", {
    "3": { aiVersion: JSON.stringify(STORYBOARD), humanVersion: null },
  });

  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("heading", { name: "Storyboard Draft" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review & Share" })).toHaveCount(0);
});

for (const [caseName, snapshots] of [
  ["without snapshots", {}],
  ["with a Stage 3 snapshot", { "3": { aiVersion: JSON.stringify(STORYBOARD), humanVersion: null } }],
] as const) {
  test(`legacy done renders retained storyboard on Complete ${caseName}`, async ({ page }) => {
    await mockLegacyProject(page, "done", snapshots);

    await page.goto(`/storyboard/${PROJECT_ID}`);

    await expect(page.getByRole("heading", { name: "Review & Share" })).toBeVisible();
    await expect(page.getByRole("row", { name: /A calm launch starts before launch day\./ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Complete Approved/ })).toBeVisible();
  });
}

for (const phase of ["brief_round1", "brief_round2", "brief_round3", "angle_selection"] as const) {
  test(`historical ${phase} hydrates as in-progress Smart Intake`, async ({ page }) => {
    await mockLegacyProject(page, phase);

    await page.goto(`/storyboard/${PROJECT_ID}`);

    const smartIntake = page.getByRole("button", { name: /Smart Intake/ });
    await expect(smartIntake).toContainText("In progress");
    await expect(page.getByRole("heading", { name: "Smart Intake", exact: true })).toBeVisible();
    await expect(page.getByText(`Historical ${phase} brief`, { exact: false })).toBeVisible();
    await expect(page.getByText("Loading project... Generation will start automatically.")).toHaveCount(0);
  });
}

test("a restored historical brief approves through the existing path to Outline", async ({ page }) => {
  const eventLog: string[] = [];
  const { storyBrief } = await mockLegacyProject(page, "brief_round3", {}, {
    guidedBrief: true,
    eventLog,
  });
  await page.addInitScript(({ projectId, fields }) => {
    sessionStorage.setItem(`chat-brief-${projectId}`, JSON.stringify({
      messages: [],
      phase: 3,
      questionIndex: 0,
      fields,
    }));
  }, { projectId: PROJECT_ID, fields: storyBrief.fields });

  await page.goto(`/storyboard/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Approve & Continue to Outline" }).click();

  await expect(page.getByRole("heading", { name: "Video Outline", level: 2 })).toBeVisible();
  expect(eventLog).toEqual(["chat_brief_approve", "approve"]);
  await expect(page.getByText("Failed to approve brief")).toHaveCount(0);
});

async function editOutlineTitle(page: Page, nextTitle: string) {
  const title = page.locator('[contenteditable="true"]').filter({ hasText: "A calm launch" }).first();
  await expect(title).toBeVisible();
  await title.click();
  await title.press("ControlOrMeta+A");
  await page.keyboard.type(nextTitle);
  await page.keyboard.press("Tab");
  await expect(page.getByText(nextTitle, { exact: true })).toBeVisible();
}

test("editable Outline and Storyboard persist canonical versions through Complete", async ({ page }) => {
  const mock = await mockWorkflow(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("heading", { name: "Video Outline", level: 2 })).toBeVisible();
  await expect(page.getByText("STALE SNAPSHOT MUST NOT RENDER")).toHaveCount(0);
  await editOutlineTitle(page, "A calm, owned launch");
  await expect.poll(() => mock.events.some((item) => item.event === "save_outline")).toBe(true);

  await page.getByTitle("Regenerate entire outline").click();
  await page.getByPlaceholder("Regenerate with my feedback").fill("Make the checkpoints more concrete");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => mock.events.some((item) => item.event === "revise_outline")).toBe(true);

  await page.getByRole("button", { name: "Approve & Generate Storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Storyboard Draft" })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.locator("textarea").first().fill("A user-edited launch starts before launch day.");
  await page.getByRole("button", { name: "Done", exact: true }).first().click();
  await expect.poll(() => mock.events.some((item) => item.event === "save_storyboard")).toBe(true);

  await page.getByRole("button", { name: "Approve & Finalize Storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Review & Share" })).toBeVisible();
  await expect.poll(() => mock.events.at(-1)?.event).toBe("approve_storyboard");
  await expect(page.getByText("A user-edited launch starts before launch day.")).toBeVisible();
});

test("stale-tab autosave offers Reload or Keep Copy and never overwrites", async ({ page }) => {
  const mock = await mockWorkflow(page, { conflictOnOutlineSave: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editOutlineTitle(page, "My unsaved local outline");
  await expect(page.getByRole("alertdialog", { name: "Version conflict" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reload latest" })).toBeVisible();
  await page.getByRole("button", { name: "Keep my copy" }).click();
  await expect(page.getByText("My unsaved local outline")).toBeVisible();
  await page.waitForTimeout(900);
  expect(mock.events.filter((item) => item.event === "save_outline")).toHaveLength(1);
});

test("Reload latest discards the isolated stale-tab copy", async ({ page }) => {
  const mock = await mockWorkflow(page, { conflictOnOutlineSave: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editOutlineTitle(page, "Discard this stale local outline");
  await expect(page.getByRole("alertdialog", { name: "Version conflict" })).toBeVisible();
  await page.getByRole("button", { name: "Reload latest" }).click();

  await expect(page.getByText("A calm launch", { exact: true })).toBeVisible();
  await expect(page.getByText("Discard this stale local outline", { exact: true })).toHaveCount(0);
  expect(mock.events.filter((item) => item.event === "save_outline")).toHaveLength(1);
});

test("leaving an edited artifact flushes it, then requires an explicit unlock upstream", async ({ page }) => {
  const mock = await mockWorkflow(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editOutlineTitle(page, "Flush this outline before leaving");
  await page.getByRole("button", { name: "Smart Intake" }).click();

  await expect.poll(() => mock.events.map((item) => item.event)).toEqual(["save_outline"]);
  await expect(page.getByRole("status", { name: "Smart Intake locked" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock to edit" }).click();
  await expect.poll(() => mock.events.map((item) => item.event)).toEqual(["save_outline", "edit_intake"]);
  expect(mock.events[0].payload.content).toContain("Flush this outline before leaving");
});

test("failed stale Storyboard keeps panels and offers one explicit regenerate or keep override", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    storyboardNeedsUpdate: true,
    failedStoryboardJob: true,
    failStoryboardRevision: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("alert").filter({ hasText: "Writer timed out" })).toBeVisible();
  await expect(page.getByText("A calm launch starts before launch day.", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Storyboard needs update" })).toBeVisible();
  await page.getByRole("button", { name: "Regenerate storyboard" }).click();
  await expect.poll(() => mock.events.filter((item) => item.event === "revise_storyboard").length).toBe(1);
  await expect(page.getByText("A calm launch starts before launch day.", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Keep as-is" }).click();
  await expect.poll(() => mock.events.at(-1)?.event).toBe("keep_storyboard");
  await expect(page.getByRole("status", { name: "Storyboard needs update" })).toHaveCount(0);
});

test("generation disables duplicate submission and Complete keeps retained artifacts locked until unlock", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    storyboardNeedsUpdate: true,
    deferStoryboardRevision: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  const regenerate = page.getByRole("button", { name: "Regenerate storyboard" });
  await regenerate.click();
  await expect(page.getByRole("status", { name: "Storyboard generation status" })).toContainText("Generating your storyboard");
  await expect(page.getByText("Drafting the opening shot", { exact: true })).toBeVisible();
  await expect(regenerate).toHaveCount(0);
  expect(mock.events.filter((item) => item.event === "revise_storyboard")).toHaveLength(1);
  mock.releaseStoryboardRevision();
  await expect(page.getByText("The revised calm launch starts before launch day.", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Approve & Finalize Storyboard" }).click();
  for (const [label, event] of [
    ["Smart Intake", "reopen_intake"],
    ["Outline", "reopen_outline"],
    ["Storyboard", "reopen_storyboard"],
  ] as const) {
    // Return the mock to Complete between independent reopen checks, mirroring a refresh.
    mock.forceComplete();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Review & Share" })).toBeVisible();
    await page.getByRole("button", { name: label }).click();
    await expect(page.getByText("Approved", { exact: true })).toHaveCount(4);
    await expect(page.getByRole("status", { name: `${label} locked` })).toBeVisible();
    expect(mock.events.at(-1)?.event).not.toBe(event);
    if (label === "Smart Intake") {
      await expect(page.getByLabel("Video brief")).toHaveValue(INTAKE.prompt);
    } else if (label === "Outline") {
      await expect(page.getByText("A calm launch", { exact: true })).toBeVisible();
    } else {
      await expect(page.getByText("The revised calm launch starts before launch day.", { exact: true }).first()).toBeVisible();
    }
    await page.getByRole("button", { name: "Unlock to edit" }).click();
    await expect.poll(() => mock.events.at(-1)?.event).toBe(event);
  }
});

test("primary editor actions remain reachable on a narrow viewport and by keyboard", async ({ page }) => {
  await mockWorkflow(page);
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  const approve = page.getByRole("button", { name: "Approve & Generate Storyboard" });
  await expect(approve).toBeVisible();
  const box = await approve.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  await approve.focus();
  await expect(approve).toBeFocused();
  const regenerate = page.getByTitle("Regenerate entire outline");
  await regenerate.focus();
  await expect(regenerate).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByPlaceholder("Regenerate with my feedback")).toBeVisible();
});

test("a delayed Storyboard save acknowledgement never resets a newer local edit", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    deferFirstStoryboardSave: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editFirstStoryboardVoiceover(page, "Save A waits on the server.");
  await expect.poll(() => mock.events.filter((item) => item.event === "save_storyboard").length).toBe(1);
  await editFirstStoryboardVoiceover(page, "Edit B must remain authoritative.");
  mock.releaseFirstStoryboardSave();

  await expect(page.getByText("Edit B must remain authoritative.", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Approve & Finalize Storyboard" }).click();
  await expect.poll(() => mock.events.at(-1)?.event).toBe("approve_storyboard");
  const approval = mock.events.findLast((item) => item.event === "approve_storyboard");
  expect((approval?.payload.content as typeof STORYBOARD)[0].voiceover_text).toBe("Edit B must remain authoritative.");
});

test("retry selects initial generation or retained-artifact revision from job lineage", async ({ page }) => {
  const cases: Array<{
    label: string;
    options: MockOptions;
    expected: string[];
  }> = [
    {
      label: "initial outline",
      options: {
        initialStage: "outline",
        initialOutline: null,
        initialJob: { status: "failed", job_id: "outline-initial", kind: "outline", input_version_id: "intake-v1", target_version_id: null, error: "Director timed out" },
      },
      expected: ["edit_intake", "approve_intake"],
    },
    {
      label: "outline revision",
      options: {
        initialStage: "outline",
        initialJob: { status: "failed", job_id: "outline-revision", kind: "outline", input_version_id: "intake-v1", target_version_id: "outline-v1", error: "Director timed out" },
      },
      expected: ["revise_outline"],
    },
    {
      label: "initial storyboard",
      options: {
        initialStage: "storyboard",
        initialJob: { status: "failed", job_id: "storyboard-initial", kind: "storyboard", input_version_id: "outline-v1", target_version_id: null, error: "Writer timed out" },
      },
      expected: ["edit_outline", "approve_outline"],
    },
    {
      label: "storyboard revision",
      options: {
        initialStage: "storyboard",
        initialStoryboard: STORYBOARD,
        initialJob: { status: "failed", job_id: "storyboard-revision", kind: "storyboard", input_version_id: "outline-v1", target_version_id: "storyboard-v1", error: "Writer timed out" },
      },
      expected: ["revise_storyboard"],
    },
  ];

  for (const retryCase of cases) {
    await test.step(retryCase.label, async () => {
      const mock = await mockWorkflow(page, retryCase.options);
      await page.goto(`/storyboard/${PROJECT_ID}`);
      await page.getByRole("button", { name: /Retry (outline|storyboard)/ }).click();
      await expect.poll(() => mock.events.map((item) => item.event).slice(-retryCase.expected.length)).toEqual(retryCase.expected);
      await expect(page.getByRole("button", { name: /Retry (outline|storyboard)/ })).toHaveCount(0);
      await page.unrouteAll({ behavior: "wait" });
    });
  }
});

test("Keep as-is flushes an edited stale Storyboard before recording the override", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    storyboardNeedsUpdate: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editFirstStoryboardVoiceover(page, "Keep this edited stale storyboard.");
  await page.getByRole("button", { name: "Keep as-is" }).click();

  await expect.poll(() => mock.events.map((item) => item.event).slice(-2)).toEqual([
    "save_storyboard",
    "keep_storyboard",
  ]);
  expect((mock.events.at(-2)?.payload.content as typeof STORYBOARD)[0].voiceover_text).toBe("Keep this edited stale storyboard.");
});

test("a backend-observed running job keeps the animated loader in place of stale editor content", async ({ page }) => {
  await mockWorkflow(page, {
    initialStage: "outline",
    initialJob: { status: "running", job_id: "outline-running", kind: "outline", input_version_id: "outline-v1", error: null },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  const outlineGeneration = page.getByRole("status", { name: "Outline generation status" });
  await expect(outlineGeneration).toContainText("Generating your outline");
  await expect(outlineGeneration.locator("p").filter({ hasText: "Generating outline..." })).toBeVisible();
  await expect(page.getByText("A calm launch", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve & Generate Storyboard" })).toHaveCount(0);
  await expect(page.getByTitle("Regenerate entire outline")).toHaveCount(0);
  await expect(page.getByTitle("Regenerate this section")).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    storyboardNeedsUpdate: true,
    initialJob: { status: "running", job_id: "storyboard-running", kind: "storyboard", input_version_id: "storyboard-v1", error: null },
  });
  await page.reload();
  const storyboardGeneration = page.getByRole("status", { name: "Storyboard generation status" });
  await expect(storyboardGeneration).toContainText("Generating your storyboard");
  await expect(page.getByText("Drafting the opening shot", { exact: true })).toBeVisible();
  await expect(page.getByText("A calm launch starts before launch day.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revise with AI" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve & Finalize Storyboard" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Regenerate storyboard" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Keep as-is" })).toHaveCount(0);
});

test("a refreshed tab polls a running canonical job until the backend settles it", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "outline",
    initialJob: { status: "running", job_id: "outline-running", kind: "outline", input_version_id: "intake-v1", error: null },
    settleRunningJobAfterReads: 2,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  const outlineGeneration = page.getByRole("status", { name: "Outline generation status" });
  await expect(outlineGeneration).toContainText("Generating your outline");
  await expect(outlineGeneration).toBeHidden({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: "Approve & Generate Storyboard" })).toBeEnabled();
  expect(mock.getPipelineReadCount()).toBeGreaterThanOrEqual(2);
});

test("the version-conflict dialog traps focus, closes on Escape, and restores focus", async ({ page }) => {
  await mockWorkflow(page, { conflictOnOutlineSave: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editOutlineTitle(page, "Trigger an accessible conflict");
  const restoreTarget = page.getByTitle("Regenerate entire outline");
  await restoreTarget.focus();
  const dialog = page.getByRole("alertdialog", { name: "Version conflict" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Reload latest" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Keep my copy" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(restoreTarget).toBeFocused();
});

test("Storyboard and Complete controls do not overflow a 360px viewport", async ({ page }) => {
  const mock = await mockWorkflow(page, { initialStage: "storyboard", initialStoryboard: STORYBOARD });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  for (const locator of [
    page.getByRole("heading", { name: "Storyboard Draft" }),
    page.getByRole("button", { name: "Approve & Finalize Storyboard" }),
    page.getByRole("button", { name: "Edit", exact: true }).first(),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);

  mock.forceComplete();
  await page.reload();
  for (const locator of [
    page.getByRole("button", { name: "Share" }),
    page.getByRole("button", { name: "Download PDF" }),
  ]) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test("mocked Create flows through Smart Intake, Outline, Storyboard, and Complete", async ({ page }) => {
  await page.addInitScript((projectId) => {
    Object.defineProperty(globalThis.crypto, "randomUUID", {
      configurable: true,
      value: () => projectId,
    });
  }, PROJECT_ID);
  const mock = await mockWorkflow(page, { initialStage: "intake", initialOutline: null, startFromCreate: true });
  await page.goto("/");

  await page.getByLabel("Describe your video").fill("Show product teams how to run a calm launch");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(`/storyboard/${PROJECT_ID}`);
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();

  await page.getByLabel("Viewer outcome").fill("Run the launch workflow confidently");
  await page.getByLabel("Target audience").fill("Product operations leads");
  await page.getByRole("button", { name: "Intermediate" }).click();
  await page.getByRole("button", { name: "Professional" }).click();
  await page.getByRole("button", { name: "Talking head" }).click();
  await page.getByRole("button", { name: "Slides" }).click();
  await page.getByRole("button", { name: "Save & Generate Outline" }).click();

  await expect(page.getByRole("heading", { name: "Video Outline", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "Approve & Generate Storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Storyboard Draft" })).toBeVisible();
  await page.getByRole("button", { name: "Approve & Finalize Storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Review & Share" })).toBeVisible();
  await expect(page.getByText("Storyboard complete")).toBeVisible();
  expect(mock.events.map((item) => item.event)).toEqual([
    "save_intake",
    "approve_intake",
    "approve_outline",
    "approve_storyboard",
  ]);
});

test("editing an Outline retains the existing Storyboard and marks its lineage stale", async ({ page }) => {
  const mock = await mockWorkflow(page, { initialStage: "storyboard", initialStoryboard: STORYBOARD });
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Outline" }).click();
  await expect(page.getByRole("status", { name: "Outline locked" })).toBeVisible();
  await page.getByRole("button", { name: "Unlock to edit" }).click();
  await expect(page.getByRole("heading", { name: "Video Outline", level: 2 })).toBeVisible();
  await editOutlineTitle(page, "An outline changed after storyboard generation");
  await expect.poll(() => mock.events.at(-1)?.event).toBe("save_outline");

  const retained = mock.getWorkflow().artifacts.storyboard;
  expect(retained.current_content?.[0].voiceover_text).toBe(STORYBOARD[0].voiceover_text);
  expect(retained.needs_update).toBe(true);
});

test("Storyboard revision saves current edits before revising the latest version", async ({ page }) => {
  const mock = await mockWorkflow(page, { initialStage: "storyboard", initialStoryboard: STORYBOARD });
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await editFirstStoryboardVoiceover(page, "Revise this latest human edit.");
  await page.getByRole("button", { name: "Revise with AI" }).click();
  await page.getByPlaceholder("Regenerate with my feedback").fill("Tighten the opening");
  await page.getByRole("button", { name: "Confirm" }).click();

  await expect.poll(() => mock.events.map((item) => item.event).slice(-2)).toEqual([
    "save_storyboard",
    "revise_storyboard",
  ]);
  const saved = mock.events.find((item) => item.event === "save_storyboard");
  expect((saved?.payload.content as typeof STORYBOARD)[0].voiceover_text).toBe("Revise this latest human edit.");
});

test("a late old revision cannot replace a newer Storyboard observed after refresh", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    deferStoryboardRevision: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Revise with AI" }).click();
  await page.getByPlaceholder("Regenerate with my feedback").fill("This old revision will finish late");
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect.poll(() => mock.events.some((item) => item.event === "revise_storyboard")).toBe(true);

  mock.installNewerStoryboard();
  await page.reload();
  await expect(page.getByText("A newer storyboard version wins.", { exact: true }).first()).toBeVisible();
  mock.releaseStoryboardRevision();
  await page.waitForTimeout(250);
  await expect(page.getByText("A newer storyboard version wins.", { exact: true }).first()).toBeVisible();
  expect(mock.getWorkflow().artifacts.storyboard.current_content?.[0].voiceover_text).toBe("A newer storyboard version wins.");
});

test("an older Saved timer cannot clear a newer save-in-progress indicator", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    deferSecondStoryboardSave: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await editFirstStoryboardVoiceover(page, "First persisted edit.");
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();
  await page.waitForTimeout(700);

  await editFirstStoryboardVoiceover(page, "Second save remains in progress.");
  await expect.poll(() => mock.events.filter((item) => item.event === "save_storyboard").length).toBe(2);
  await expect(page.getByText("Saving...", { exact: true }).last()).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page.getByText("Saving...", { exact: true }).last()).toBeVisible();
  mock.releaseSecondStoryboardSave();
  await expect(page.getByText("Saved", { exact: true }).last()).toBeVisible();
});
