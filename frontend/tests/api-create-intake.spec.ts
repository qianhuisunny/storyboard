import { expect, test } from "@playwright/test";

const BACKEND_URL = "http://localhost:8001";

test("real backend persists versioned Create intake and project metadata", async ({ request }) => {
  const projectId = crypto.randomUUID();
  const prompt = "Real API Create intake persistence";

  try {
    const session = await request.post(`${BACKEND_URL}/api/session`, {
      data: { legacy_user_id: `anon_${crypto.randomUUID()}` },
    });
    expect(session.ok()).toBeTruthy();
    const created = await request.post(`${BACKEND_URL}/api/create-project`, {
      data: {
        projectId,
        typeId: 1,
        typeName: "Video storyboard",
        userInput: "Initial title",
      },
    });
    expect(created.ok()).toBeTruthy();

    const saved = await request.post(`${BACKEND_URL}/api/project/${projectId}/event`, {
      data: {
        event: "save_intake",
        payload: {
          content: {
            prompt,
            duration_seconds: 120,
            platform: "youtube",
            aspect_ratio: "16:9",
            source_snapshot: "",
            sources: [],
          },
          expected_version_id: null,
        },
      },
    });
    expect(saved.ok()).toBeTruthy();
    const versionId = (await saved.json()).artifacts.intake.current_version_id;
    expect(versionId).toBeTruthy();

    const reloaded = await request.get(`${BACKEND_URL}/api/project/${projectId}/pipeline-state`);
    expect(reloaded.ok()).toBeTruthy();
    const state = await reloaded.json();
    expect(state.artifacts.intake.current_version_id).toBe(versionId);
    expect(state.artifacts.intake.current_content.prompt).toBe(prompt);

    const project = await request.get(`${BACKEND_URL}/api/project/${projectId}`);
    const projectBody = (await project.json()).project;
    expect(projectBody.userInput).toBe(prompt);
    expect(projectBody.userId).toBeUndefined();
  } finally {
    await request.delete(`${BACKEND_URL}/api/project/${projectId}`);
  }
});
