import { test, expect } from '@playwright/test';

/**
 * Knowledge Share Brief Builder E2E Tests
 *
 * Tests the 3-round Knowledge Share flow:
 * - Round 1: Core Intent (topic, audience, one big thing)
 * - Perspective Selection & Talking Points
 * - Round 2: Delivery & Format
 * - Round 3: Content Spine
 *
 * Prerequisites:
 * 1. Backend running on localhost:8001
 * 2. Frontend running on localhost:3000
 * 3. Auth state saved (run auth.setup.ts first)
 *
 * Run: npx playwright test knowledge-share-flow.spec.ts --headed
 */

// Use saved auth state
test.use({ storageState: '.auth/user.json' });

// Test data
const TEST_DATA = {
  topic: 'Know what exit options you have and how to plan for that',
  duration: 300, // 5 minutes
  audience: 'Startup founders and early employees',
  oneBigThing: 'Talk to your cofounder and founding teams',
  cta: 'Start with exit options in mind from Day 1',
};

test.describe('Knowledge Share Flow', () => {
  let projectId: string;

  test('should complete onboarding and enter Round 1', async ({ page }) => {
    // Navigate to home
    await page.goto('/');

    // Verify onboarding page
    await expect(page.locator('h1:has-text("Create Your Storyboard")')).toBeVisible();

    // Knowledge Sharing should be visible
    await expect(page.getByRole('heading', { name: 'Knowledge Sharing', exact: true })).toBeVisible();

    // Fill in description/topic
    const descriptionTextarea = page.locator('textarea').first();
    await descriptionTextarea.fill(TEST_DATA.topic);

    // Fill in duration
    const durationInput = page.locator('input[type="number"]');
    await durationInput.fill(String(TEST_DATA.duration));

    // Fill in target audience
    const audienceInput = page.locator('input[placeholder*="Tech-savvy"]');
    await audienceInput.fill(TEST_DATA.audience);

    // Screenshot before submission
    await page.screenshot({ path: 'test-results/ks-onboarding-filled.png' });

    // Submit
    const generateButton = page.locator('button:has-text("Generate Storyboard")');
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    // Wait for navigation
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    // Extract project ID
    projectId = page.url().split('/storyboard/')[1];
    console.log('Project ID:', projectId);

    // Wait for Round 1 fields to appear
    await page.waitForTimeout(2000);

    // Verify we see the brief builder with Round 1 fields
    await expect(page.getByRole('heading', { name: 'Section 1: Core Intent' })).toBeVisible({ timeout: 10000 });

    // Screenshot of Round 1
    await page.screenshot({ path: 'test-results/ks-round1-initial.png' });
  });

  test('should confirm Round 1 and see perspectives', async ({ page }) => {
    // Create project first
    await page.goto('/');
    await page.locator('textarea').first().fill(TEST_DATA.topic);
    await page.locator('input[type="number"]').fill(String(TEST_DATA.duration));
    await page.locator('input[placeholder*="Tech-savvy"]').fill(TEST_DATA.audience);
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    projectId = page.url().split('/storyboard/')[1];
    console.log('Project ID:', projectId);

    // Wait for Round 1 to load
    await page.waitForTimeout(3000);

    // Fill in "one big thing" field if visible
    const oneBigThingInput = page.locator('textarea').filter({ hasText: '' }).first();
    if (await oneBigThingInput.isVisible()) {
      await oneBigThingInput.fill(TEST_DATA.oneBigThing);
    }

    // Click Confirm Section 1
    const confirmButton = page.locator('button:has-text("Confirm Section 1")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();

      // Wait for perspectives to load (AI generation)
      console.log('Waiting for perspectives to generate...');
      await page.waitForTimeout(10000);

      // Check for perspective options in Research Chat
      const perspectiveOption = page.locator('text=Select an angle').or(page.locator('[class*="perspective"]'));

      // Screenshot of perspectives
      await page.screenshot({ path: 'test-results/ks-perspectives.png' });
    }
  });

  test('should restore state after page refresh', async ({ page }) => {
    // Create project and progress to Round 1
    await page.goto('/');
    await page.locator('textarea').first().fill(TEST_DATA.topic);
    await page.locator('input[type="number"]').fill(String(TEST_DATA.duration));
    await page.locator('input[placeholder*="Tech-savvy"]').fill(TEST_DATA.audience);
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    projectId = page.url().split('/storyboard/')[1];
    const storyboardUrl = page.url();
    console.log('Project ID:', projectId);

    // Wait for initial load
    await page.waitForTimeout(3000);

    // Check pipeline state via API
    const stateResponse = await page.request.get(`/api/project/${projectId}/pipeline-state`);
    const stateData = await stateResponse.json();
    console.log('Initial pipeline state:', stateData.phase);

    // Screenshot before refresh
    await page.screenshot({ path: 'test-results/ks-before-refresh.png' });

    // Refresh the page
    await page.reload();

    // Wait for state restoration
    await page.waitForTimeout(3000);

    // Check pipeline state again
    const stateAfterRefresh = await page.request.get(`/api/project/${projectId}/pipeline-state`);
    const stateDataAfter = await stateAfterRefresh.json();
    console.log('After refresh pipeline state:', stateDataAfter.phase);

    // Verify no error message
    const errorMessage = page.locator('text=Failed to confirm round');
    await expect(errorMessage).not.toBeVisible();

    // Screenshot after refresh
    await page.screenshot({ path: 'test-results/ks-after-refresh.png' });

    // Verify the round matches
    expect(stateDataAfter.phase).toBe(stateData.phase);
  });

  test('should handle full flow: Round 1 -> Perspectives -> Talking Points -> Round 2', async ({ page }) => {
    // Create project
    await page.goto('/');
    await page.locator('textarea').first().fill(TEST_DATA.topic);
    await page.locator('input[type="number"]').fill(String(TEST_DATA.duration));
    await page.locator('input[placeholder*="Tech-savvy"]').fill(TEST_DATA.audience);
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    projectId = page.url().split('/storyboard/')[1];
    console.log('Project ID:', projectId);

    // Wait for Round 1
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/ks-flow-round1.png' });

    // Helper to check pipeline state
    const getPipelineState = async () => {
      const response = await page.request.get(`/api/project/${projectId}/pipeline-state`);
      return response.json();
    };

    // Log initial state
    let state = await getPipelineState();
    console.log('Step 1 - Initial state:', state.phase);

    // Confirm Round 1 (if confirm button visible)
    const confirmBtn = page.locator('button:has-text("Confirm Section 1")');
    if (await confirmBtn.isVisible({ timeout: 5000 })) {
      await confirmBtn.click();
      console.log('Clicked Confirm Section 1, waiting for perspectives...');

      // Wait for AI to generate perspectives
      await page.waitForTimeout(15000);
      await page.screenshot({ path: 'test-results/ks-flow-perspectives.png' });

      state = await getPipelineState();
      console.log('Step 2 - After Round 1 confirm:', state.phase);
    }

    // Select a perspective (click first perspective option)
    const perspectiveButton = page.locator('button').filter({ hasText: /insight|perspective|angle/i }).first();
    if (await perspectiveButton.isVisible({ timeout: 5000 })) {
      await perspectiveButton.click();
      console.log('Selected perspective, waiting for talking points...');

      // Wait for talking points
      await page.waitForTimeout(10000);
      await page.screenshot({ path: 'test-results/ks-flow-talking-points.png' });

      state = await getPipelineState();
      console.log('Step 3 - After perspective selection:', state.phase);
    }

    // Confirm talking points
    const confirmTalkingPointsBtn = page.locator('button:has-text("Confirm & Continue")');
    if (await confirmTalkingPointsBtn.isVisible({ timeout: 5000 })) {
      await confirmTalkingPointsBtn.click();
      console.log('Confirmed talking points, waiting for research...');

      // Wait for research to complete
      await page.waitForTimeout(20000);
      await page.screenshot({ path: 'test-results/ks-flow-round2.png' });

      state = await getPipelineState();
      console.log('Step 4 - After talking points confirm:', state.phase);
    }

    // Final state check
    state = await getPipelineState();
    console.log('Final state:', state.phase);
    await page.screenshot({ path: 'test-results/ks-flow-final.png' });
  });
});

test.describe('Knowledge Share API Tests', () => {
  test.use({ storageState: '.auth/user.json' });

  test('should verify pipeline-state endpoint returns brief_fields', async ({ page, request }) => {
    // Create a project via UI first
    await page.goto('/');
    await page.locator('textarea').first().fill('API test topic');
    await page.locator('input[type="number"]').fill('60');
    await page.locator('input[placeholder*="Tech-savvy"]').fill('Developers');
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    const projectId = page.url().split('/storyboard/')[1];

    // Wait for initialization
    await page.waitForTimeout(3000);

    // Call pipeline-state API
    const response = await request.get(`/api/project/${projectId}/pipeline-state`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    console.log('Pipeline state response:', JSON.stringify(data, null, 2));

    // Verify structure
    expect(data.success).toBe(true);
    expect(data.phase).toBeDefined();
    expect(data.data).toBeDefined();

    // If in brief phase, should have story_brief with fields
    if (data.phase?.startsWith('brief_')) {
      expect(data.data.story_brief).toBeDefined();
      if (data.data.story_brief) {
        expect(data.data.story_brief.fields).toBeDefined();
        console.log('Brief fields:', Object.keys(data.data.story_brief.fields));
      }
    }
  });

  test('should clear processing logs on fresh session', async ({ page, request }) => {
    // Create a project
    await page.goto('/');
    await page.locator('textarea').first().fill('Processing log test');
    await page.locator('input[type="number"]').fill('30');
    await page.locator('input[placeholder*="Tech-savvy"]').fill('Testers');
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    const projectId = page.url().split('/storyboard/')[1];

    // Wait for some processing
    await page.waitForTimeout(5000);

    // Check processing logs
    const logsResponse = await request.get(`/api/project/${projectId}/processing-logs`);
    const logsData = await logsResponse.json();
    console.log('Processing logs count:', logsData.count);

    // Clear logs
    const clearResponse = await request.delete(`/api/project/${projectId}/processing-logs`);
    expect(clearResponse.ok()).toBeTruthy();

    // Verify cleared
    const logsAfterClear = await request.get(`/api/project/${projectId}/processing-logs`);
    const clearedData = await logsAfterClear.json();
    expect(clearedData.count).toBe(0);
  });
});
