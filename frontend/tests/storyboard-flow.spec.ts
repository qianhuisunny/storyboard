import { test, expect } from '@playwright/test';

/**
 * Plotline Storyboard E2E Tests
 *
 * These tests automate the form-filling flow to trigger research generation.
 *
 * Prerequisites:
 * 1. Backend running on localhost:8001
 * 2. Frontend running on localhost:3000
 * 3. Auth state saved (run auth.setup.ts first)
 *
 * Run: npx playwright test storyboard-flow.spec.ts --headed
 */

// Use saved auth state
test.use({ storageState: '.auth/user.json' });

test.describe('Storyboard Creation Flow', () => {
  test('should fill onboarding form and trigger research', async ({ page }) => {
    // Navigate to home (should show onboarding for signed-in users)
    await page.goto('/');

    // Verify we're on the onboarding page
    await expect(page.locator('h1:has-text("Create Your Storyboard")')).toBeVisible();

    // Knowledge Sharing should be pre-selected (only visible type)
    await expect(page.getByRole('heading', { name: 'Knowledge Sharing', exact: true })).toBeVisible();

    // Fill in the description
    const descriptionTextarea = page.locator('textarea').first();
    await descriptionTextarea.fill(
      'Create an educational video about the basics of machine learning for beginners. ' +
      'Cover supervised vs unsupervised learning, neural networks basics, and practical applications.'
    );

    // Fill in the duration (seconds)
    const durationInput = page.locator('input[type="number"]');
    await durationInput.fill('90');

    // Fill in the target audience
    const audienceInput = page.locator('input[placeholder*="Tech-savvy"]');
    await audienceInput.fill('College students and early career professionals interested in AI');

    // Take screenshot before submission
    await page.screenshot({ path: 'test-results/onboarding-filled.png' });

    // Click Generate Storyboard button
    const generateButton = page.locator('button:has-text("Generate Storyboard")');
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    // Wait for navigation to storyboard page
    await page.waitForURL(/\/storyboard\/\d+/);

    // Get the project ID from URL
    const projectId = page.url().split('/storyboard/')[1];
    console.log('Project created with ID:', projectId);

    // Verify we're on the storyboard page
    await expect(page).toHaveURL(/\/storyboard\/\d+/);

    // Take screenshot of storyboard page
    await page.screenshot({ path: 'test-results/storyboard-initial.png' });

    // Store project ID for later tests
    test.info().annotations.push({ type: 'projectId', description: projectId });
  });

  test('should complete brief builder and trigger research', async ({ page }) => {
    // Navigate to home and create a new project
    await page.goto('/');

    // Fill onboarding form quickly
    await page.locator('textarea').first().fill(
      'How to build a REST API with Python Flask'
    );
    await page.locator('input[type="number"]').fill('60');
    await page.locator('input[placeholder*="Tech-savvy"]').fill('Backend developers');

    // Submit and navigate
    await page.locator('button:has-text("Generate Storyboard")').click();
    await page.waitForURL(/\/storyboard\/\d+/);

    const projectId = page.url().split('/storyboard/')[1];
    console.log('Project ID:', projectId);

    // Wait for the BriefBuilder stage to load
    // Look for stage content or processing indicators
    await page.waitForTimeout(2000); // Allow initial load

    // Take screenshot of current state
    await page.screenshot({ path: 'test-results/briefbuilder-loaded.png' });

    // Check if research is already running (Knowledge Share auto-triggers)
    // The page should show processing state or research content
    const processingView = page.locator('text=Processing').or(page.locator('text=Research'));

    // Log the page state
    console.log('Page URL:', page.url());
    console.log('Waiting for processing to complete...');

    // Monitor the pipeline state via API
    const checkPipelineState = async () => {
      const response = await page.request.get(`/api/project/${projectId}/pipeline-state`);
      if (response.ok()) {
        const data = await response.json();
        console.log('Pipeline state:', JSON.stringify(data, null, 2));
        return data;
      }
      return null;
    };

    // Initial check
    await checkPipelineState();

    // Wait and check again
    await page.waitForTimeout(5000);
    await checkPipelineState();

    // Take final screenshot
    await page.screenshot({ path: 'test-results/briefbuilder-processing.png' });
  });
});

test.describe('Quick Form Fill', () => {
  test.use({ storageState: '.auth/user.json' });

  test('minimal form submission', async ({ page }) => {
    await page.goto('/');

    // Fill minimum required fields
    await page.locator('textarea').first().fill('Quick test topic');
    await page.locator('input[type="number"]').fill('30');
    await page.locator('input[placeholder*="Tech-savvy"]').fill('General audience');

    // Verify form is valid
    const generateButton = page.locator('button:has-text("Generate Storyboard")');
    await expect(generateButton).toBeEnabled();

    // Submit
    await generateButton.click();

    // Should navigate to storyboard
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });

    console.log('Successfully created project at:', page.url());
  });
});
