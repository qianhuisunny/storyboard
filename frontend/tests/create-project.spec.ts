import { expect, test, type Locator, type Page } from "@playwright/test";

type SavedIntake = {
  content: Record<string, unknown>;
  versionId: string;
};

async function mockCreateApi(page: Page, options?: { failedUrl?: string; retrySucceeds?: boolean }) {
  const saves: SavedIntake[] = [];
  let failedAttempts = 0;

  await page.route("**/api/create-project", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, projectId: "create-123" }) });
  });

  await page.route("**/api/project/create-123/fetch-link", async (route) => {
    const request = route.request().postDataJSON() as { url: string };
    if (request.url === options?.failedUrl && (!options.retrySucceeds || failedAttempts++ === 0)) {
      await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ detail: "Source could not be reached" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, url: request.url, title: new URL(request.url).hostname, path: "links/source.txt", content: `Notes from ${request.url}` }),
    });
  });

  await page.route("**/api/project/create-123/event", async (route) => {
    const request = route.request().postDataJSON() as { event: string; payload: { content: Record<string, unknown> } };
    expect(request.event).toBe("save_intake");
    const versionId = `intake-v${saves.length + 1}`;
    saves.push({ content: request.payload.content, versionId });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        project_id: "create-123",
        workflow_stage: "intake",
        phase: "intake",
        allowed_events: ["save_intake", "approve_intake"],
        job: { status: "idle", job_id: null, kind: null, input_version_id: null },
        artifacts: {
          intake: { current_version_id: versionId, approved_version_id: null, needs_update: false, current_content: request.payload.content },
          outline: { current_version_id: null, approved_version_id: null, needs_update: false, current_content: null },
          storyboard: { current_version_id: null, approved_version_id: null, needs_update: false, current_content: null },
        },
      }),
    });
  });

  await page.route("**/api/project/create-123/pipeline-state", async (route) => {
    const last = saves.at(-1);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        project_id: "create-123",
        workflow_stage: "intake",
        phase: "intake",
        allowed_events: ["save_intake", "approve_intake"],
        job: { status: "idle", job_id: null, kind: null, input_version_id: null },
        artifacts: {
          intake: { current_version_id: last?.versionId ?? null, approved_version_id: null, needs_update: false, current_content: last?.content ?? null },
          outline: { current_version_id: null, approved_version_id: null, needs_update: false, current_content: null },
          storyboard: { current_version_id: null, approved_version_id: null, needs_update: false, current_content: null },
        },
        data: { story_brief: last?.content ?? null, screen_outline: null, storyboard: null },
      }),
    });
  });

  return saves;
}

async function openSources(page: Page) {
  const sources = page.getByRole("button", { name: /sources/i });
  await sources.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
}

async function chooseWithKeyboard(page: Page, trigger: Locator, optionName: string | RegExp) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  const option = page.getByRole("option", { name: optionName });
  await expect(option).toBeVisible();
  await option.press("Enter");
  // Radix intentionally restores focus to the trigger after a selection. Wait
  // for that close lifecycle before focusing the next popover trigger.
  await expect(trigger).toBeFocused();
}

async function addLink(page: Page, value: string) {
  await page.getByRole("tab", { name: "Link" }).click();
  await page.getByLabel("Source URL").fill(value);
  await page.getByRole("button", { name: "Add link" }).click();
}

test("Create controls are keyboard accessible and persist exact canonical intake values", async ({ page }) => {
  const saves = await mockCreateApi(page);
  await page.goto("/");

  const prompt = page.getByLabel("Describe your video");
  await prompt.fill("Something about organizing a team offsite");

  const platform = page.getByRole("button", { name: /platform/i });
  await chooseWithKeyboard(page, platform, /Internal LMS/i);
  await expect(platform).toContainText("Internal LMS");

  await openSources(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeHidden();
  await expect(page.getByRole("button", { name: /sources/i })).toBeFocused();

  const duration = page.getByRole("button", { name: /duration/i });
  await chooseWithKeyboard(page, duration, "2 mins");
  await expect(duration).toContainText("2 mins");

  const ratio = page.getByRole("button", { name: /aspect ratio/i });
  await chooseWithKeyboard(page, ratio, "9:16");
  await expect(ratio).toContainText("9:16");

  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(/\/storyboard\/create-123$/);

  expect(saves).toHaveLength(1);
  expect(saves[0].content).toMatchObject({
    prompt: "Something about organizing a team offsite",
    duration_seconds: 120,
    platform: "internal_lms",
    aspect_ratio: "9:16",
    source_snapshot: "",
    sources: [],
  });
  expect(saves[0].content).not.toHaveProperty("target_audience");
  for (const forbidden of ["intent_route", "content_mode", "primary_pattern", "secondary_patterns", "point_of_view"]) {
    expect(saves[0].content).not.toHaveProperty(forbidden);
  }
  expect(JSON.stringify(saves[0].content)).not.toMatch(/Planner|Lifestyle/i);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).not.toEqual(expect.arrayContaining([
    "storyboardIntentRoute",
    "storyboardContentMode",
    "storyboardTypeName",
  ]));
});

test("Sources reports URL validation inline", async ({ page }) => {
  await mockCreateApi(page);
  await page.goto("/");
  await openSources(page);
  await addLink(page, "not a valid url");

  await expect(page.getByRole("alert")).toHaveText("Enter a valid URL.");
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
});

test("Aspect Ratio options stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockCreateApi(page);
  await page.goto("/");

  const ratio = page.getByRole("button", { name: /aspect ratio/i });
  await ratio.click();
  const panel = page.getByRole("dialog", { name: "Aspect ratio options" });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test("a failed source remains visible and can be retried into the same project", async ({ page }) => {
  const failedUrl = "https://retry.example/notes";
  const saves = await mockCreateApi(page, { failedUrl, retrySucceeds: true });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Explain our launch plan");
  await openSources(page);
  await addLink(page, "https://ready.example/brief");
  await addLink(page, failedUrl);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByText("1 source needs attention")).toBeVisible();
  await expect(page.getByText("retry.example")).toBeVisible();
  await expect(page).toHaveURL("/");

  await page.getByRole("button", { name: "Retry failed source" }).click();
  await expect(page).toHaveURL(/\/storyboard\/create-123$/);

  expect(saves.length).toBeGreaterThanOrEqual(3);
  const finalSources = saves.at(-1)?.content.sources as Array<Record<string, unknown>>;
  expect(finalSources).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "link", url: failedUrl, status: "ready", path: "links/source.txt" }),
  ]));
});

test("a user can explicitly continue with failed source metadata preserved", async ({ page }) => {
  const failedUrl = "https://unavailable.example/source";
  const saves = await mockCreateApi(page, { failedUrl });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Summarize a research topic");
  await openSources(page);
  await addLink(page, failedUrl);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Create storyboard" }).click();
  await page.getByRole("button", { name: "Continue without failed source" }).click();
  await expect(page).toHaveURL(/\/storyboard\/create-123$/);

  const finalSources = saves.at(-1)?.content.sources as Array<Record<string, unknown>>;
  expect(finalSources).toEqual([
    expect.objectContaining({ kind: "link", url: failedUrl, status: "failed", error: "Source could not be reached" }),
  ]);
});
