import { expect, test, type Page, type Route } from "@playwright/test";

type IntakeContent = {
  prompt: string;
  duration_seconds: number;
  platform: string;
  aspect_ratio: string;
  source_snapshot: string;
  sources: Array<Record<string, unknown>>;
  viewer_outcome?: string;
  target_audience?: string;
  audience_level?: string;
  delivery_tone?: string;
  production_formats?: string[];
};

type WorkflowEvent = {
  event: string;
  payload: {
    content: IntakeContent;
    expected_version_id: string | null;
  };
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
  versionId: string,
  options: { stage?: "intake" | "outline"; outline?: string | null } = {},
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
      : ["save_outline", "revise_outline", "approve_outline", "reopen_intake"],
    job: { status: "idle", job_id: null, kind: null, input_version_id: null, error: null },
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

async function mockSmartIntake(page: Page, deferApproval = false, conflictOnSave = false) {
  let content: IntakeContent = {
    prompt: "Explain our product launch process",
    duration_seconds: 300,
    platform: "youtube",
    aspect_ratio: "16:9",
    source_snapshot: "Launch notes",
    sources: [{ id: "source-1", kind: "upload", name: "launch-notes.pdf", status: "ready" }],
    target_audience: "",
  };
  let versionId = "intake-v1";
  let workflow = workflowBody(content, versionId);
  const events: WorkflowEvent[] = [];
  let releaseApproval: (() => void) | null = null;

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
    if (route.request().method() === "GET") return fulfillJson(route, { success: true, stages: {} });
    return fulfillJson(route, { success: true });
  });
  await page.route(`**/api/project/${PROJECT_ID}/pipeline-state`, (route) => fulfillJson(route, workflow));
  await page.route(`**/api/project/${PROJECT_ID}/event`, async (route) => {
    const request = route.request().postDataJSON() as WorkflowEvent;
    events.push(request);
    if (conflictOnSave && request.event === "save_intake") {
      await fulfillJson(route, {
        detail: { code: "version_conflict", current_version_id: "intake-v9" },
      }, 409);
      return;
    }
    content = structuredClone(request.payload.content);
    versionId = `intake-v${events.length + 1}`;

    if (request.event === "approve_intake") {
      if (deferApproval) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 12_000);
          releaseApproval = () => {
            clearTimeout(timeout);
            resolve();
          };
        });
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
  await expect(page.getByText("launch-notes.pdf")).toBeVisible();

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
  const mock = await mockSmartIntake(page, true);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Viewer outcome").fill("Confidently run the launch workflow");
  await page.getByLabel("Target audience").fill("Product operations leads");
  await page.getByRole("button", { name: "Advanced" }).click();
  await page.getByRole("button", { name: "Professional" }).click();
  await page.getByRole("button", { name: "Talking head" }).click();
  await page.getByRole("button", { name: "Real-world" }).click();
  await page.getByRole("button", { name: "Save & Generate Outline" }).click();

  await expect(page.getByRole("status", { name: "Outline generation status" })).toContainText("Generating your outline");
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
  await mockSmartIntake(page, false, true);
  await page.goto(`/storyboard/${PROJECT_ID}`);

  await page.getByLabel("Video brief").fill("A conflicting local edit");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "This project changed in another tab. Reload the latest version before saving.",
  );
  await expect(page.getByRole("heading", { name: "Smart Intake" })).toBeVisible();
  await expect(page.getByLabel("Video brief")).toHaveValue("A conflicting local edit");
});
