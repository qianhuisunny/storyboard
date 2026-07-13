import { expect, test, type Locator, type Page, type Route } from "@playwright/test";

type SavedIntake = {
  content: Record<string, unknown>;
  expectedVersionId: string | null;
  versionId: string;
};

type MockOptions = {
  failedUrls?: string[];
  retrySucceeds?: boolean;
  fetchDelayMs?: number;
  loseCreateBeforePersist?: boolean;
  loseFirstSaveAfterPersist?: boolean;
  conflictOnSave?: boolean;
};

async function delayedFulfill(route: Route, delayMs: number, body: object, status = 200) {
  if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function mockCreateApi(page: Page, options: MockOptions = {}) {
  const saves: SavedIntake[] = [];
  const createIds: string[] = [];
  const fetchedUrls: string[] = [];
  const uploadedFiles: string[] = [];
  const sessionRequests: Array<{ legacy_user_id?: string }> = [];
  let projectId: string | null = null;
  let createAttempts = 0;
  let failedAttempts = 0;
  let lostSave = false;

  await page.route("**/api/session", async (route) => {
    sessionRequests.push(route.request().postDataJSON() as { legacy_user_id?: string });
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
  });

  await page.route("**/api/create-project", async (route) => {
    const request = route.request().postDataJSON() as { projectId: string; userId?: string };
    expect(request.userId).toBeUndefined();
    createIds.push(request.projectId);
    createAttempts += 1;
    if (options.loseCreateBeforePersist && createAttempts === 1) {
      await route.abort("connectionreset");
      return;
    }
    projectId = request.projectId;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, projectId }),
    });
  });

  await page.route(/\/api\/project\/[^/]+$/, async (route) => {
    const requestedId = new URL(route.request().url()).pathname.split("/").at(-1);
    if (!projectId || requestedId !== projectId) {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Project not found" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, project: { id: projectId } }),
    });
  });

  await page.route("**/api/project/*/fetch-link", async (route) => {
    expect(route.request().headers()["x-user-id"]).toBeUndefined();
    const request = route.request().postDataJSON() as { url: string };
    fetchedUrls.push(request.url);
    const shouldFail = options.failedUrls?.includes(request.url)
      && (!options.retrySucceeds || failedAttempts++ < options.failedUrls.length);
    if (shouldFail) {
      await delayedFulfill(route, options.fetchDelayMs ?? 0, { detail: "Source could not be reached" }, 400);
      return;
    }
    await delayedFulfill(route, options.fetchDelayMs ?? 0, {
      success: true,
      url: request.url,
      title: new URL(request.url).hostname,
      path: "links/source.txt",
      content: `Notes from ${request.url}`,
    });
  });

  await page.route("**/api/project/*/upload", async (route) => {
    expect(route.request().headers()["x-user-id"]).toBeUndefined();
    const multipart = await route.request().postDataBuffer();
    expect(multipart).not.toBeNull();
    uploadedFiles.push("notes.txt");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, filename: "notes.txt", path: "uploads/server-id.txt", content: "Uploaded notes" }),
    });
  });

  await page.route("**/api/project/*/event", async (route) => {
    const request = route.request().postDataJSON() as {
      event: string;
      payload: { content: Record<string, unknown>; expected_version_id: string | null };
    };
    expect(request.event).toBe("save_intake");
    expect(request.payload.expected_version_id).toBe(saves.at(-1)?.versionId ?? null);
    if (options.conflictOnSave) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: { code: "version_conflict", current_version_id: "server-v9" } }),
      });
      return;
    }
    const versionId = `intake-v${saves.length + 1}`;
    saves.push({
      content: request.payload.content,
      expectedVersionId: request.payload.expected_version_id,
      versionId,
    });
    if (options.loseFirstSaveAfterPersist && !lostSave) {
      lostSave = true;
      await route.abort("connectionreset");
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(workflowBody(saves)),
    });
  });

  await page.route("**/api/project/*/pipeline-state", async (route) => {
    const body = options.conflictOnSave
      ? workflowBody([{ content: { prompt: "Someone else's edit" }, expectedVersionId: null, versionId: "server-v9" }])
      : workflowBody(saves);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  return { saves, createIds, fetchedUrls, uploadedFiles, sessionRequests };
}

function workflowBody(saves: SavedIntake[]) {
  const last = saves.at(-1);
  return {
    success: true,
    project_id: "dynamic",
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
  };
}

async function openSources(page: Page) {
  const sources = page.getByRole("button", { name: /^Sources:/i });
  await sources.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeVisible();
}

async function chooseRadioWithKeyboard(page: Page, trigger: Locator, name: string | RegExp) {
  await trigger.focus();
  await page.keyboard.press("Enter");
  const radio = page.getByRole("radio", { name });
  await expect(radio).toBeVisible();
  await radio.press("Space");
  await expect(trigger).toBeFocused();
}

async function addLink(page: Page, value: string) {
  await page.getByRole("tab", { name: "Link" }).click();
  await page.getByLabel("Source URL").fill(value);
  await page.getByRole("button", { name: "Add link" }).click();
}

async function addNote(page: Page, value: string) {
  await page.getByRole("tab", { name: "Text" }).click();
  await page.getByLabel("Source notes").fill(value);
  await page.getByRole("button", { name: "Add note" }).click();
}

test("Create uses complete RadioGroup and Tabs keyboard semantics and persists canonical values", async ({ page }) => {
  const { saves, sessionRequests } = await mockCreateApi(page);
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Something about organizing a team offsite");

  const platform = page.getByRole("button", { name: /platform/i });
  await platform.click();
  await expect(page.getByRole("radiogroup", { name: "Platform" })).toBeVisible();
  const youtube = page.getByRole("radio", { name: /YouTube/i });
  await youtube.focus();
  await expect(youtube).toBeFocused();
  await page.keyboard.press("ArrowDown");
  // The grouped arrow selection closes the menu and restores trigger focus.
  await expect(platform).toContainText("Short-form social");
  await expect(platform).toBeFocused();

  await openSources(page);
  const uploadTab = page.getByRole("tab", { name: "Upload" });
  await expect(uploadTab).toHaveAttribute("aria-controls");
  await uploadTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Link" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Link" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeHidden();
  await expect(page.getByRole("button", { name: /^Sources:/i })).toBeFocused();

  await chooseRadioWithKeyboard(page, page.getByRole("button", { name: /duration/i }), "2 mins");
  await chooseRadioWithKeyboard(page, page.getByRole("button", { name: /aspect ratio/i }), "9:16");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  expect(saves).toHaveLength(1);
  expect(sessionRequests).toHaveLength(1);
  expect(sessionRequests[0].legacy_user_id).toMatch(/^anon_[0-9a-f-]{36}$/i);
  expect(saves[0].content).toMatchObject({
    prompt: "Something about organizing a team offsite",
    duration_seconds: 120,
    platform: "short_form",
    aspect_ratio: "9:16",
    source_snapshot: "",
    source_contents: {},
    sources: [],
  });
});

test("Sources reports URL validation inline and closes on outside interaction", async ({ page }) => {
  await mockCreateApi(page);
  await page.goto("/");
  await openSources(page);
  await addLink(page, "not a valid url");
  await expect(page.getByRole("alert")).toHaveText("Enter a valid URL.");
  await page.getByRole("heading", { name: /What video storyboard/i }).click();
  await expect(page.getByRole("dialog", { name: "Sources" })).toBeHidden();
});

test("file upload relies on the session cookie and persists the server path", async ({ page }) => {
  const { saves, uploadedFiles } = await mockCreateApi(page);
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Use an uploaded source");
  await openSources(page);
  await page.locator('input[type="file"]').setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Safe notes"),
  });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  expect(uploadedFiles).toEqual(["notes.txt"]);
  expect(saves.at(-1)?.content.sources).toEqual([
    expect.objectContaining({ kind: "upload", path: "uploads/server-id.txt", status: "ready" }),
  ]);
});

test("Aspect Ratio options stay within a narrow mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await mockCreateApi(page);
  await page.goto("/");
  await page.getByRole("button", { name: /aspect ratio/i }).click();
  const panel = page.getByRole("dialog", { name: "Aspect ratio options" });
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
});

test("a lost create response retries the same allocated UUID and recovers", async ({ page }) => {
  const { createIds } = await mockCreateApi(page, { loseCreateBeforePersist: true });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Recover this project");
  await page.getByRole("button", { name: "Create storyboard" }).click();

  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);
  expect(createIds).toHaveLength(2);
  expect(createIds[0]).toBe(createIds[1]);
});

test("a lost save response reconciles persisted content and version before navigating", async ({ page }) => {
  const { saves } = await mockCreateApi(page, { loseFirstSaveAfterPersist: true });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Recover this save");
  await openSources(page);
  await addLink(page, "https://recovery.example/source");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();

  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);
  expect(saves).toHaveLength(2);
  expect(saves[1].expectedVersionId).toBe(saves[0].versionId);
});

test("a conflicting save is surfaced and never navigates", async ({ page }) => {
  await mockCreateApi(page, { conflictOnSave: true });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("My conflicting edit");
  await page.getByRole("button", { name: "Create storyboard" }).click();

  await expect(page.getByRole("alert")).toContainText("changed");
  await expect(page).toHaveURL("/");
});

test("source and configuration controls are locked during delayed ingestion", async ({ page }) => {
  await mockCreateApi(page, { fetchDelayMs: 300 });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Lock changing inputs");
  await openSources(page);
  await addLink(page, "https://slow.example/brief");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();

  await expect(page.getByLabel("Describe your video")).toBeDisabled();
  await expect(page.getByRole("button", { name: /platform/i })).toBeDisabled();
  await expect(page.getByRole("button", { name: /sources/i })).toBeDisabled();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);
});

test("retry processes failed and newly pending sources before navigating", async ({ page }) => {
  const failedUrl = "https://retry.example/notes";
  const pendingUrl = "https://new.example/brief";
  const { saves, fetchedUrls } = await mockCreateApi(page, { failedUrls: [failedUrl], retrySucceeds: true });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Explain our launch plan");
  await openSources(page);
  await addLink(page, failedUrl);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByText("1 source needs attention")).toBeVisible();

  await openSources(page);
  await addLink(page, pendingUrl);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Retry failed source" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  expect(fetchedUrls).toEqual([failedUrl, failedUrl, pendingUrl]);
  expect(saves.at(-1)?.content.sources).toEqual(expect.arrayContaining([
    expect.objectContaining({ url: failedUrl, status: "ready" }),
    expect.objectContaining({ url: pendingUrl, status: "ready" }),
  ]));
});

test("Continue saves latest prompt and removals, excludes failures, then navigates", async ({ page }) => {
  const failedOne = "https://one.example/missing";
  const failedTwo = "https://two.example/missing";
  const { saves } = await mockCreateApi(page, { failedUrls: [failedOne, failedTwo] });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Original prompt");
  await openSources(page);
  await addLink(page, failedOne);
  await addLink(page, failedTwo);
  await addNote(page, "Keep this note");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByText("2 sources need attention")).toBeVisible();

  await page.getByLabel("Describe your video").fill("Edited before continue");
  await openSources(page);
  await page.getByRole("button", { name: "Remove one.example" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Continue without failed source" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  expect(saves.at(-1)?.content.prompt).toBe("Edited before continue");
  expect(saves.at(-1)?.content.sources).toEqual([
    expect.objectContaining({ kind: "text", status: "ready" }),
  ]);
  const retainedSourceContents = saves.at(-1)?.content.source_contents as Record<string, string>;
  expect(Object.values(retainedSourceContents)).toEqual([
    "Keep this note",
  ]);
});

test("Continue cannot race an active retry", async ({ page }) => {
  const failedUrl = "https://retry.example/slow";
  await mockCreateApi(page, { failedUrls: [failedUrl], retrySucceeds: true, fetchDelayMs: 250 });
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("No racing transitions");
  await openSources(page);
  await addLink(page, failedUrl);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByText("1 source needs attention")).toBeVisible();
  await page.getByRole("button", { name: "Retry failed source" }).click();

  await expect(page.getByRole("button", { name: /Continue without failed/ })).toBeHidden();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);
});

test("retired onboarding session keys are cleared before canonical navigation", async ({ page }) => {
  const retiredKeys = [
    "storyboardPrompt", "storyboardType", "storyboardTypeName", "storyboardIntentRoute",
    "storyboardContentMode", "storyboardContext", "storyboardDuration", "storyboardPlatform",
    "storyboardAspectRatio", "storyboardAudience",
  ];
  await page.addInitScript((keys) => {
    keys.forEach((key) => sessionStorage.setItem(key, "STALE Planner Lifestyle"));
  }, retiredKeys);
  await mockCreateApi(page);
  await page.goto("/");
  await page.getByLabel("Describe your video").fill("Fresh canonical prompt");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  const storage = await page.evaluate(() => Object.fromEntries(Object.entries(sessionStorage)));
  retiredKeys.forEach((key) => expect(storage).not.toHaveProperty(key));
  expect(storage.projectId).toMatch(/^[0-9a-f-]{36}$/);
  expect(JSON.stringify(storage)).not.toMatch(/Planner|Lifestyle/);
});

test("frontend bounds prompt, notes, source count, and canonical snapshot", async ({ page }) => {
  const { saves } = await mockCreateApi(page);
  await page.goto("/");
  const longPrompt = "p".repeat(6_100);
  await page.getByLabel("Describe your video").fill(longPrompt);
  await expect(page.getByLabel("Describe your video")).toHaveValue("p".repeat(6_000));

  await openSources(page);
  await page.getByRole("tab", { name: "Text" }).click();
  await page.getByLabel("Source notes").fill("n".repeat(20_100));
  await expect(page.getByLabel("Source notes")).toHaveValue("n".repeat(20_000));
  await page.getByRole("button", { name: "Add note" }).click();
  for (let index = 0; index < 4; index += 1) {
    await page.getByLabel("Source notes").fill(`${index}${"n".repeat(19_999)}`);
    await page.getByRole("button", { name: "Add note" }).click();
  }
  await page.getByRole("tab", { name: "Upload" }).click();
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 16 }, (_, index) => ({
      name: `source-${index}.txt`,
      mimeType: "text/plain",
      buffer: Buffer.from(`Source ${index}`),
    })),
  );
  await expect(page.getByRole("alert")).toHaveText("Only the first 15 files were added.");
  await expect(page.getByRole("button", { name: /^Sources:/i })).toHaveAccessibleName("Sources: 20 attached");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page).toHaveURL(/\/storyboard\/[0-9a-f-]{36}$/);

  const snapshot = saves.at(-1)?.content.source_snapshot as string;
  const sourceContents = saves.at(-1)?.content.source_contents as Record<string, string>;
  expect(snapshot.length).toBeLessThanOrEqual(100_000);
  expect(snapshot).toContain("[source snapshot truncated]");
  expect(Object.keys(sourceContents)).toHaveLength(5);
  expect(Object.values(sourceContents).every((value) => value.length <= 50_000)).toBe(true);
  expect(Object.values(sourceContents).reduce((total, value) => total + value.length, 0)).toBeLessThanOrEqual(100_000);
  expect(JSON.stringify(saves.at(-1)?.content).length).toBeLessThanOrEqual(250_000);
});
