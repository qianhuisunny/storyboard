import { expect, test, type Page, type Route } from "@playwright/test";

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
  error: string | null;
};
type EventRequest = {
  event: string;
  payload: Record<string, unknown>;
};

const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
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
) {
  return {
    success: true,
    project_id: PROJECT_ID,
    workflow_stage: stage,
    phase: stage,
    allowed_events: allowedEvents(stage),
    job,
    artifacts: {
      intake: {
        current_version_id: "intake-v1",
        approved_version_id: "intake-v1",
        needs_update: false,
        current_content: INTAKE,
        approved_content: INTAKE,
      },
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
  initialStoryboard?: typeof STORYBOARD;
  storyboardNeedsUpdate?: boolean;
  failedStoryboardJob?: boolean;
  conflictOnOutlineSave?: boolean;
  failStoryboardRevision?: boolean;
  deferStoryboardRevision?: boolean;
};

async function mockWorkflow(page: Page, options: MockOptions = {}) {
  let outline: Artifact<string> = {
    current_version_id: "outline-v1",
    approved_version_id: options.initialStage === "outline" ? null : "outline-v1",
    needs_update: false,
    current_content: OUTLINE,
    approved_content: options.initialStage === "outline" ? null : OUTLINE,
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
  let job: Job = options.failedStoryboardJob
    ? { status: "failed", job_id: "storyboard-job-failed", kind: "storyboard", input_version_id: "outline-v1", error: "Writer timed out" }
    : { status: "idle", job_id: null, kind: null, input_version_id: null, error: null };
  let workflow = workflowBody(stage, outline, storyboard, job);
  const events: EventRequest[] = [];
  let outlineVersion = 1;
  let storyboardVersion = 1;
  let conflictPending = Boolean(options.conflictOnOutlineSave);
  let releaseStoryboardRevision: (() => void) | null = null;

  const refresh = () => {
    workflow = workflowBody(stage, outline, storyboard, job);
    return workflow;
  };

  await page.route("**/api/session", (route) => json(route, { success: true }));
  await page.route(`**/api/project/${PROJECT_ID}`, (route) => json(route, {
    success: true,
    project: { id: PROJECT_ID, userInput: INTAKE.prompt, typeName: "Video storyboard" },
  }));
  await page.route(`**/api/project/${PROJECT_ID}/stages`, (route) => json(route, {
    success: true,
    stages: { 2: { aiVersion: "STALE SNAPSHOT MUST NOT RENDER", humanVersion: null } },
    currentStageId: 1,
  }));
  await page.route(`**/api/project/${PROJECT_ID}/pipeline-state`, (route) => json(route, workflow));
  await page.route(`**/api/project/${PROJECT_ID}/event`, async (route) => {
    const request = route.request().postDataJSON() as EventRequest;
    events.push(request);

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
      storyboardVersion += 1;
      storyboard = { ...storyboard, current_version_id: `storyboard-v${storyboardVersion}`, current_content: structuredClone(request.payload.content as typeof STORYBOARD), needs_update: false };
      await json(route, refresh());
      return;
    }

    if (request.event === "revise_storyboard") {
      expect(request.payload.expected_version_id).toBe(storyboard.current_version_id);
      job = { status: "running", job_id: `storyboard-job-${events.length}`, kind: "storyboard", input_version_id: outline.approved_version_id, error: null };
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
      storyboardVersion += 1;
      const revised = structuredClone(storyboard.current_content ?? STORYBOARD);
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
      expect(approvedContent[0].voiceover_text).toBe(storyboard.current_content?.[0].voiceover_text);
      storyboard = {
        ...storyboard,
        current_content: approvedContent,
        approved_version_id: storyboard.current_version_id,
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
    forceComplete() {
      stage = "complete";
      workflow = workflowBody(stage, outline, storyboard, job);
    },
  };
}

async function editOutlineTitle(page: Page, nextTitle: string) {
  const title = page.locator('[contenteditable="true"]').filter({ hasText: "A calm launch" }).first();
  await title.evaluate((node, value) => {
    node.textContent = value;
    node.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  }, nextTitle);
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

test("leaving an edited artifact flushes its canonical version before reopening upstream", async ({ page }) => {
  const mock = await mockWorkflow(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await editOutlineTitle(page, "Flush this outline before leaving");
  await page.getByRole("button", { name: "Smart Intake" }).click();

  await expect.poll(() => mock.events.map((item) => item.event).slice(0, 2)).toEqual([
    "save_outline",
    "edit_intake",
  ]);
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

test("generation disables duplicate submission and Complete reopens every retained artifact", async ({ page }) => {
  const mock = await mockWorkflow(page, {
    initialStage: "storyboard",
    initialStoryboard: STORYBOARD,
    storyboardNeedsUpdate: true,
    deferStoryboardRevision: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  const regenerate = page.getByRole("button", { name: "Regenerate storyboard" });
  await regenerate.click();
  await expect(regenerate).toBeDisabled();
  await regenerate.click({ force: true });
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
