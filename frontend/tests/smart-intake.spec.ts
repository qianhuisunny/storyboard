import { expect, test, type Page, type Route } from "@playwright/test";

type IntakeContent = {
  prompt: string;
  duration_seconds?: number;
  platform?: string;
  aspect_ratio?: string;
  source_snapshot?: string;
  source_contents?: Record<string, string>;
  sources: Array<Record<string, unknown>>;
  viewer_outcome?: string;
  target_audience?: string;
  audience_level?: string;
  delivery_tone?: string;
  production_formats?: string[];
};

type WorkflowEvent = {
  event: string;
  payload: Partial<{
    content: IntakeContent;
    expected_version_id: string | null;
  }>;
};

type WorkflowJob = {
  status: "idle" | "running" | "failed";
  job_id: string | null;
  kind: "outline" | "storyboard" | null;
  input_version_id: string | null;
  error: string | null;
};

type MockSmartIntakeOptions = {
  conflictOnSave?: boolean;
  deferApproval?: boolean;
  failFirstApproval?: boolean;
  initialContent?: IntakeContent;
  initialOutline?: string | null;
  initialStage?: "intake" | "outline";
  initialVersionId?: string | null;
  stageSnapshots?: Record<string, unknown>;
  staleFailedReadAfterEdit?: boolean;
  transientPipelineFailure?: boolean;
};

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OUTLINE = `Section 1 — A clearer launch

Purpose
Open with the team's current release friction.

Entry assumption
The viewer knows the old process.

Exit state
The viewer understands the new launch workflow.

Duration
1:00

Talking points
- Name the problem
- Show the new workflow`;

function artifact<T>(currentVersionId: string | null, currentContent: T | null) {
  return {
    current_version_id: currentVersionId,
    approved_version_id: null,
    needs_update: false,
    current_content: currentContent,
    approved_content: null,
  };
}

function workflowBody(
  content: IntakeContent,
  versionId: string | null,
  options: {
    stage?: "intake" | "outline";
    outline?: string | null;
    job?: WorkflowJob;
  } = {},
) {
  const stage = options.stage ?? "intake";
  const outline = options.outline ?? null;
  return {
    success: true,
    project_id: PROJECT_ID,
    workflow_stage: stage,
    phase: stage,
    allowed_events: stage === "intake"
      ? ["save_intake", "approve_intake"]
      : ["save_outline", "revise_outline", "approve_outline", "edit_intake"],
    job: options.job ?? { status: "idle", job_id: null, kind: null, input_version_id: null, error: null },
    artifacts: {
      intake: {
        ...artifact(versionId, content),
        approved_version_id: stage === "outline" ? versionId : null,
        approved_content: stage === "outline" ? content : null,
      },
      outline: artifact(outline ? "outline-v1" : null, outline),
      storyboard: artifact<unknown[]>(null, null),
    },
    state: {
      has_story_brief: true,
      has_screen_outline: Boolean(outline),
      has_storyboard: false,
    },
    data: { story_brief: content, screen_outline: outline, storyboard: null },
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockSmartIntake(page: Page, options: MockSmartIntakeOptions = {}) {
  let content: IntakeContent = structuredClone(options.initialContent ?? {
    prompt: "Explain our product launch process",
    duration_seconds: 300,
    platform: "youtube",
    aspect_ratio: "16:9",
    source_snapshot: "Launch notes",
    sources: [{ id: "source-1", kind: "upload", name: "launch-notes.pdf", status: "ready" }],
    target_audience: "",
  });
  let versionId = options.initialVersionId === undefined ? "intake-v1" : options.initialVersionId;
  let workflow = workflowBody(content, versionId, {
    stage: options.initialStage,
    outline: options.initialOutline,
  });
  const events: WorkflowEvent[] = [];
  let releaseApproval: (() => void) | null = null;
  let approvalAttempts = 0;
  const deletedSourceRequests: string[] = [];
  const legacyStartRequests: string[] = [];
  let pipelineAttempts = 0;
  let staleFailedWorkflow: ReturnType<typeof workflowBody> | null = null;
  let serveStaleFailedRead = false;

  page.on("request", (request) => {
    if (request.method() === "DELETE" && request.url().includes(`/api/project/${PROJECT_ID}`)) {
      deletedSourceRequests.push(request.url());
    }
    if (request.method() === "POST" && request.url().endsWith(`/api/project/${PROJECT_ID}/start`)) {
      legacyStartRequests.push(request.url());
    }
  });

  await page.route("**/api/session", (route) => fulfillJson(route, { success: true }));
  await page.route(`**/api/project/${PROJECT_ID}`, (route) => fulfillJson(route, {
    success: true,
    project: {
      id: PROJECT_ID,
      userInput: content.prompt,
      typeName: "Video storyboard",
    },
  }));
  await page.route(`**/api/project/${PROJECT_ID}/stages`, (route) => {
    if (route.request().method() === "GET") {
      return fulfillJson(route, { success: true, stages: options.stageSnapshots ?? {} });
    }
    return fulfillJson(route, { success: true });
  });
  await page.route(`**/api/project/${PROJECT_ID}/pipeline-state`, (route) => {
    pipelineAttempts += 1;
    if (options.transientPipelineFailure && pipelineAttempts === 1) {
      return fulfillJson(route, { detail: "Pipeline temporarily unavailable" }, 503);
    }
    if (serveStaleFailedRead && staleFailedWorkflow) {
      serveStaleFailedRead = false;
      return fulfillJson(route, staleFailedWorkflow);
    }
    return fulfillJson(route, workflow);
  });
  await page.route(`**/api/project/${PROJECT_ID}/event`, async (route) => {
    const request = route.request().postDataJSON() as WorkflowEvent;
    events.push(request);
    if (request.event === "submit_guided_brief") {
      await fulfillJson(route, { detail: "Legacy guided flow must not run" }, 500);
      return;
    }
    if (request.event === "edit_intake") {
      workflow = workflowBody(content, versionId, { stage: "intake", outline: workflow.artifacts.outline.current_content });
      serveStaleFailedRead = Boolean(options.staleFailedReadAfterEdit);
      await fulfillJson(route, workflow);
      return;
    }
    if (options.conflictOnSave && request.event === "save_intake") {
      await fulfillJson(route, {
        detail: { code: "version_conflict", current_version_id: "intake-v9" },
      }, 409);
      return;
    }
    if (!request.payload.content) throw new Error(`${request.event} requires content in this mock`);
    content = structuredClone(request.payload.content);
    versionId = `intake-v${events.length + 1}`;

    if (request.event === "approve_intake") {
      approvalAttempts += 1;
      const priorOutline = workflow.artifacts.outline.current_content;
      workflow = workflowBody(content, versionId, {
        stage: "outline",
        outline: priorOutline,
        job: {
          status: "running",
          job_id: `outline-job-${approvalAttempts}`,
          kind: "outline",
          input_version_id: versionId,
          error: null,
        },
      });
      if (options.deferApproval) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 12_000);
          releaseApproval = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
      }
      if (options.failFirstApproval && approvalAttempts === 1) {
        workflow = workflowBody(content, versionId, {
          stage: "outline",
          outline: priorOutline,
          job: {
            status: "failed",
            job_id: "outline-job-1",
            kind: "outline",
            input_version_id: versionId,
            error: "Quality provider timed out",
          },
        });
        staleFailedWorkflow = structuredClone(workflow);
        await fulfillJson(route, {
          detail: {
            code: "workflow_generation_failed",
            message: "Quality provider timed out",
            job: workflow.job,
          },
        }, 502);
        return;
      }
      if (options.failFirstApproval && approvalAttempts > 1) {
        // Model a real generator boundary so the UI can observe the committed
        // running job before the event request returns its final artifact.
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
      workflow = workflowBody(content, versionId, { stage: "outline", outline: OUTLINE });
      await fulfillJson(route, workflow);
      return;
    }

    workflow = workflowBody(content, versionId);
    await fulfillJson(route, workflow);
  });

  return {
    events,
    deletedSourceRequests,
    legacyStartRequests,
    releaseApproval: () => {
      if (!releaseApproval) throw new Error("Approval request has not started");
      releaseApproval();
    },
  };
}

test("Smart Intake keeps known Create values editable and asks only unanswered production questions", async ({ page }) => {
  await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await expect(page.getByLabel("Video brief")).toHaveValue("Explain our product launch process");
  await expect(page.getByLabel("Duration")).toHaveValue("300");
  await expect(page.getByLabel("Platform")).toHaveValue("youtube");
  await expect(page.getByLabel("Aspect ratio")).toHaveValue("16:9");
  await expect(page.getByLabel("Source name launch-notes.pdf")).toHaveValue("launch-notes.pdf");

  await expect(page.getByText("What should viewers be able to do or understand?")).toBeVisible();
  await expect(page.getByText("Who is this for?")).toBeVisible();
  await expect(page.getByText("How familiar is your audience?")).toBeVisible();
  await expect(page.getByText("How should it sound?")).toBeVisible();
  await expect(page.getByText("Which production formats should we plan for?")).toBeVisible();
  await expect(page.getByLabel("Target audience")).toHaveValue("");
  await expect(page.getByText("General audience", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Video brief")).toHaveCount(1);
});

test("Save persists edited canonical intake without moving stages and refresh reuses its version", async ({ page }) => {
  const mock = await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("Explain the launch process to new product managers");
  await page.getByLabel("Viewer outcome").fill("Run a launch without missing a handoff");
  await page.getByLabel("Target audience").fill("New product managers");
  await page.getByRole("button", { name: "Intermediate" }).click();
  await page.getByRole("button", { name: "Warm" }).click();
  await page.getByRole("button", { name: "Slides" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  expect(mock.events).toHaveLength(1);
  expect(mock.events[0]).toMatchObject({
    event: "save_intake",
    payload: {
      expected_version_id: "intake-v1",
      content: {
        prompt: "Explain the launch process to new product managers",
        viewer_outcome: "Run a launch without missing a handoff",
        target_audience: "New product managers",
        audience_level: "intermediate",
        delivery_tone: "warm",
        production_formats: ["slides"],
      },
    },
  });

  await page.reload();
  await expect(page.getByLabel("Video brief")).toHaveValue("Explain the launch process to new product managers");
  await expect(page.getByLabel("Target audience")).toHaveValue("New product managers");
  await page.getByLabel("Viewer outcome").fill("Ship the launch using every handoff");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[1].payload.expected_version_id).toBe("intake-v2");
  expect(mock.events[1].payload.content.viewer_outcome).toBe("Ship the launch using every handoff");
});

test("Save and Generate Outline sends current edits, shows the job overlay, and lands on editable Outline", async ({ page }) => {
  const mock = await mockSmartIntake(page, { deferApproval: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Viewer outcome").fill("Confidently run the launch workflow");
  await page.getByLabel("Target audience").fill("Product operations leads");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Professional" }).click();
  await page.getByRole("button", { name: "Talking head" }).click();
  await page.getByRole("button", { name: "Real-world" }).click();
  await page.getByRole("button", { name: "Save & Generate Outline" }).click();

  await expect(page.getByRole("status", { name: "Outline generation status" })).toContainText("Generating your outline");
  await expect(page.getByRole("button", { name: /Outline Generating/ })).toBeVisible();
  expect(mock.events[0]).toMatchObject({
    event: "approve_intake",
    payload: {
      expected_version_id: "intake-v1",
      content: {
        viewer_outcome: "Confidently run the launch workflow",
        target_audience: "Product operations leads",
        audience_level: "advanced",
        delivery_tone: "professional",
        production_formats: ["talking_head", "real_world"],
      },
    },
  });

  mock.releaseApproval();
  await expect(page.getByRole("heading", { name: "Video Outline", level: 2 })).toBeVisible();
  await expect(page.locator('[contenteditable="true"]').filter({ hasText: "A clearer launch" }).first()).toBeVisible();
});

test("a 409 save conflict is parsed centrally and never advances Smart Intake", async ({ page }) => {
  await mockSmartIntake(page, { conflictOnSave: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("A conflicting local edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "This project changed in another tab. Reload the latest version before saving.",
  );
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await expect(page.getByLabel("Video brief")).toHaveValue("A conflicting local edit");
});

test("canonical intake requires a persisted artifact pointer before replacing the legacy brief flow", async ({ page }) => {
  await mockSmartIntake(page, { initialVersionId: null });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("heading", { name: "Smart Intake" })).toHaveCount(0);
  await expect(page.getByText("Loading project... Generation will start automatically.")).toBeVisible();
});

test("clearing optional Create controls omits them from the next canonical version", async ({ page }) => {
  const mock = await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Duration").selectOption("");
  await page.getByLabel("Platform").selectOption("");
  await page.getByLabel("Aspect ratio").selectOption("");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const savedContent = mock.events[0].payload.content;
  expect(savedContent).toBeDefined();
  expect(savedContent).not.toHaveProperty("duration_seconds");
  expect(savedContent).not.toHaveProperty("platform");
  expect(savedContent).not.toHaveProperty("aspect_ratio");
});

test("sources can be renamed or removed from intake without deleting stored files", async ({ page }) => {
  const mock = await mockSmartIntake(page, {
    initialContent: {
      prompt: "Source-aware launch",
      sources: [
        {
          id: "source-1",
          kind: "link",
          name: "launch-notes.pdf",
          url: "https://example.com/launch",
          path: "links/launch.txt",
          status: "ready",
        },
        {
          id: "source-2",
          kind: "upload",
          name: "private-appendix.pdf",
          path: "uploads/private.pdf",
          status: "ready",
        },
      ],
      source_snapshot: "[Link: launch-notes.pdf]\nKeep this launch guidance.\n\n---\n\n[File: private-appendix.pdf]\nREMOVED SECRET CONTEXT",
    },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByLabel("Source URL launch-notes.pdf")).toHaveAttribute("readonly", "");
  await page.getByLabel("Source name launch-notes.pdf").fill("Launch playbook.pdf");
  await page.getByRole("button", { name: "Remove private-appendix.pdf" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[0].payload.content?.sources).toMatchObject([
    { id: "source-1", name: "Launch playbook.pdf" },
  ]);
  expect(mock.events[0].payload.content?.source_contents).toEqual({
    "source-1": "Keep this launch guidance.",
  });
  expect(mock.events[0].payload.content?.source_snapshot).toBe(
    "[Link: Launch playbook.pdf]\nKeep this launch guidance.",
  );
  expect(mock.events[0].payload.content?.source_snapshot).not.toContain("REMOVED SECRET CONTEXT");

  await page.getByRole("button", { name: "Remove Launch playbook.pdf" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[1].payload.content?.sources).toEqual([]);
  expect(mock.events[1].payload.content).not.toHaveProperty("source_contents");
  expect(mock.events[1].payload.content).not.toHaveProperty("source_snapshot");
  expect(mock.deletedSourceRequests).toEqual([]);
});

test("legacy source migration matches exact headers and never moves removed content to an empty source", async ({ page }) => {
  const mock = await mockSmartIntake(page, {
    initialContent: {
      prompt: "Safely migrate legacy sources",
      sources: [
        {
          id: "empty-source",
          kind: "text",
          name: "Empty ] source",
          status: "ready",
        },
        {
          id: "populated-source",
          kind: "text",
          name: "Populated ] source",
          status: "ready",
        },
      ],
      source_snapshot: "[Note: Populated ] source]\nONLY POPULATED SOURCE CONTEXT",
    },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("Confirm exact legacy header migration");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[0].payload.content?.source_contents).toEqual({
    "populated-source": "ONLY POPULATED SOURCE CONTEXT",
  });

  await page.getByRole("button", { name: "Remove Populated ] source" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  expect(mock.events[1].payload.content?.sources).toMatchObject([
    { id: "empty-source", name: "Empty ] source" },
  ]);
  expect(mock.events[1].payload.content).not.toHaveProperty("source_contents");
  expect(mock.events[1].payload.content).not.toHaveProperty("source_snapshot");
});

test("incomplete legacy migration preserves unrelated saves and fails closed after source edits", async ({ page }) => {
  const legacySnapshot = "Arbitrary combined research that cannot be assigned safely.";
  const mock = await mockSmartIntake(page, {
    initialContent: {
      prompt: "Preserve unparseable research",
      sources: [
        { id: "source-a", kind: "text", name: "Source A", status: "ready" },
        { id: "source-b", kind: "text", name: "Source B", status: "ready" },
      ],
      source_snapshot: legacySnapshot,
    },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("An unrelated prompt edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[0].payload.content?.source_snapshot).toBe(legacySnapshot);
  expect(mock.events[0].payload.content).not.toHaveProperty("source_contents");

  await page.getByRole("button", { name: "Remove Source B" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  expect(mock.events[1].payload.content?.sources).toMatchObject([
    { id: "source-a", name: "Source A" },
  ]);
  expect(mock.events[1].payload.content).not.toHaveProperty("source_contents");
  expect(mock.events[1].payload.content).not.toHaveProperty("source_snapshot");
});

test("Saved becomes dirty on the next edit and refresh discards the unsaved copy", async ({ page }) => {
  await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("Saved canonical copy");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByLabel("Video brief").fill("Unsaved local copy");
  await expect(page.getByText("Saved", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Video brief")).toHaveValue("Saved canonical copy");
});

test("generation failure reloads the persisted job, preserves the last outline, and retries through edit_intake", async ({ page }) => {
  const previousOutline = OUTLINE.replace("A clearer launch", "Last valid outline");
  const mock = await mockSmartIntake(page, {
    failFirstApproval: true,
    initialOutline: previousOutline,
    staleFailedReadAfterEdit: true,
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await page.getByRole("button", { name: "Save & Generate Outline" }).click();

  await expect(page.getByRole("alert")).toContainText("Quality provider timed out");
  await expect(page.locator('[contenteditable="true"]').filter({ hasText: "Last valid outline" }).first()).toBeVisible();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Quality provider timed out");
  await expect(page.locator('[contenteditable="true"]').filter({ hasText: "Last valid outline" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Retry outline" }).click();
  await expect(page.getByRole("status", { name: "Outline generation status" })).toContainText("Generating your outline");
  await expect(page.locator('[contenteditable="true"]').filter({ hasText: "A clearer launch" }).first()).toBeVisible();
  expect(mock.events.map((event) => event.event)).toEqual([
    "approve_intake",
    "edit_intake",
    "approve_intake",
  ]);
});

test("pipeline hydration fails closed and retries without starting a legacy flow", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("storyboardPrompt", "Stale legacy prompt");
    sessionStorage.setItem("storyboardType", "1");
    sessionStorage.setItem("storyboardTypeName", "Product Release");
  });
  const mock = await mockSmartIntake(page, { transientPipelineFailure: true });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("alert")).toContainText("Could not load workflow state");
  await expect(page.getByRole("button", { name: "Retry workflow" })).toBeVisible();
  await page.waitForTimeout(250);
  expect(mock.legacyStartRequests).toEqual([]);
  expect(mock.events).toEqual([]);

  await page.getByRole("button", { name: "Retry workflow" }).click();
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  expect(mock.legacyStartRequests).toEqual([]);
});

test("canonical hydration ignores old snapshots when no outline artifact exists", async ({ page }) => {
  const oldSnapshot = OUTLINE.replace("A clearer launch", "Snapshot must not win");
  await mockSmartIntake(page, {
    initialStage: "outline",
    initialOutline: null,
    stageSnapshots: {
      2: { aiVersion: oldSnapshot, humanVersion: null },
    },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByText("Snapshot must not win")).toHaveCount(0);
});

test("canonical projects suppress legacy guided initialization even with stale onboarding keys", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("storyboardPrompt", "Stale prompt");
    sessionStorage.setItem("storyboardTypeName", "YouTube Explainer");
    sessionStorage.setItem("storyboardIntentRoute", "knowledge_share");
  });
  const mock = await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await page.waitForTimeout(300);

  expect(mock.events.filter((event) => event.event === "submit_guided_brief")).toEqual([]);
});

test("sidebar back navigation reopens Intake before allowing a canonical save", async ({ page }) => {
  const mock = await mockSmartIntake(page, { initialStage: "outline", initialOutline: OUTLINE });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByRole("button", { name: /Smart Intake Approved/ }).click();
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await page.getByLabel("Video brief").fill("Edited after outline");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  expect(mock.events.map((event) => event.event)).toEqual(["edit_intake", "save_intake"]);
  expect(mock.events[1].payload.content?.prompt).toBe("Edited after outline");
});

test("persisted custom audience level and tone remain visible and editable", async ({ page }) => {
  await mockSmartIntake(page, {
    initialContent: {
      prompt: "Expert launch brief",
      duration_seconds: 300,
      platform: "youtube",
      aspect_ratio: "16:9",
      sources: [],
      audience_level: "subject_matter_experts",
      delivery_tone: "measured and technical",
    },
  });
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByLabel("Custom audience level")).toHaveValue("subject_matter_experts");
  await expect(page.getByLabel("Custom delivery tone")).toHaveValue("measured and technical");
  await page.getByLabel("Custom audience level").fill("senior operators");
  await page.getByLabel("Custom delivery tone").fill("direct and calm");
  await page.getByRole("button", { name: "Save", exact: true }).click();
});

test("Smart Intake controls stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockSmartIntake(page);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Generate Outline" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("late workflow hydration from project A cannot overwrite project B", async ({ page }) => {
  const projectA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const projectB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  let releaseA: (() => void) | null = null;
  let markAStarted: (() => void) | null = null;
  const aStarted = new Promise<void>((resolve) => { markAStarted = resolve; });

  await page.route("**/api/session", (route) => fulfillJson(route, { success: true }));
  await page.route(/\/api\/project\/[a-f0-9-]+$/, (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return fulfillJson(route, { success: true, project: { id, userInput: id === projectA ? "Project A" : "Project B", typeName: "Video storyboard" } });
  });
  await page.route(/\/api\/project\/[a-f0-9-]+\/stages$/, (route) => fulfillJson(route, { success: true, stages: {} }));
  await page.route(/\/api\/project\/[a-f0-9-]+\/pipeline-state$/, async (route) => {
    const id = new URL(route.request().url()).pathname.split("/").at(-2);
    if (id === projectA) {
      markAStarted?.();
      await new Promise<void>((resolve) => { releaseA = resolve; });
    }
    const prompt = id === projectA ? "Project A late response" : "Project B current response";
    await fulfillJson(route, workflowBody({ prompt, sources: [] }, `${id}-v1`));
  });

  await page.goto(`/storyboard/${projectA}`);
  await aStarted;
  await page.evaluate((path) => {
    history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, `/storyboard/${projectB}`);
  await expect(page.getByLabel("Video brief")).toHaveValue("Project B current response");
  releaseA?.();
  await page.waitForTimeout(300);
  await expect(page.getByLabel("Video brief")).toHaveValue("Project B current response");
});
