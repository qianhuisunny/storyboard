import { test, expect } from '@playwright/test';

/**
 * Full Pipeline Test
 *
 * Fills onboarding form with dummy data and triggers the complete
 * research pipeline via backend API.
 */

const BACKEND_URL = 'http://localhost:8001';

// Dummy test data
const TEST_SCENARIOS = [
  {
    name: 'Python Flask Tutorial',
    description: 'Create an educational video teaching beginners how to build a REST API using Python Flask. Cover setting up the environment, creating routes, handling JSON data, and connecting to a database.',
    duration: 90,
    audience: 'Junior developers and computer science students learning backend development',
  },
  {
    name: 'Product Launch - AI Writing Tool',
    description: 'Announce the launch of WriteAI, a new AI-powered writing assistant that helps content creators write blog posts, emails, and social media content 10x faster. Highlight the key features: tone adjustment, SEO optimization, and plagiarism checking.',
    duration: 60,
    audience: 'Content marketers, bloggers, and small business owners who create written content regularly',
  },
  {
    name: 'Kubernetes Explained',
    description: 'Explain Kubernetes container orchestration to developers who are familiar with Docker but new to K8s. Cover pods, deployments, services, and basic kubectl commands with real examples.',
    duration: 120,
    audience: 'DevOps engineers and backend developers with Docker experience',
  },
];

// Use saved auth for UI tests
test.use({ storageState: '.auth/user.json' });

test.describe('Full Pipeline with Dummy Data', () => {

  test('should create project and start pipeline', async ({ request }) => {
    const scenario = TEST_SCENARIOS[0]; // Python Flask Tutorial
    const projectId = `test_${Date.now()}`;

    console.log('\n========================================');
    console.log(`TEST: ${scenario.name}`);
    console.log('========================================\n');

    // Step 1: Create project
    console.log('1. Creating project...');
    const createResponse = await request.post(`${BACKEND_URL}/api/create-project`, {
      data: {
        projectId,
        typeId: 3,
        typeName: 'Knowledge Sharing',
        userInput: scenario.description,
        userId: 'playwright-test-user',
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    console.log(`   Project created: ${projectId}`);

    // Step 2: Start the pipeline (this is what the UI does)
    console.log('2. Starting pipeline...');
    const startResponse = await request.post(`${BACKEND_URL}/api/project/${projectId}/start`, {
      data: {
        intake_form: {
          video_type: 'Knowledge Share',
          description: scenario.description,
          duration: scenario.duration,
          target_audience: scenario.audience,
          links: [],
        },
      },
      timeout: 60000,
    });

    if (startResponse.ok()) {
      const startData = await startResponse.json();
      console.log('   Pipeline started successfully!');
      console.log(`   Phase: ${startData.phase}`);
      console.log(`   Has intake form: ${startData.state?.has_intake_form}`);
      console.log(`   Has story brief: ${startData.state?.has_story_brief}`);

      // Show story brief fields if available
      if (startData.data?.story_brief?.fields) {
        console.log('\n   Story Brief Fields:');
        const fields = startData.data.story_brief.fields;
        for (const [key, val] of Object.entries(fields)) {
          const v = val as { value?: string; source?: string };
          if (v.value) {
            console.log(`     - ${key}: "${v.value}" (${v.source})`);
          }
        }
      }
    } else {
      console.log('   Start failed:', await startResponse.text());
    }

    // Step 3: Check final pipeline state
    console.log('\n3. Final pipeline state...');
    const stateResponse = await request.get(`${BACKEND_URL}/api/project/${projectId}/pipeline-state`);
    const stateData = await stateResponse.json();
    console.log(`   Phase: ${stateData.phase}`);
    console.log(`   Available events: ${stateData.available_events?.join(', ') || 'none'}`);

    // Show intake form data
    if (stateData.data?.intake_form) {
      console.log('\n   Intake Form:');
      const intake = stateData.data.intake_form;
      console.log(`     - Video Type: ${intake.video_type}`);
      console.log(`     - Duration: ${intake.duration}s`);
      console.log(`     - Audience: ${intake.target_audience}`);
      console.log(`     - Description: ${intake.description?.substring(0, 80)}...`);
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log(`Project ID: ${projectId}`);
    console.log('========================================\n');
  });

  test('should fill UI form and submit', async ({ page }) => {
    const scenario = TEST_SCENARIOS[1]; // Product Launch

    console.log('\n========================================');
    console.log(`UI TEST: ${scenario.name}`);
    console.log('========================================\n');

    // Navigate to onboarding
    await page.goto('/');
    await expect(page.locator('h1:has-text("Create Your Storyboard")')).toBeVisible();

    // Fill the form
    console.log('Filling form...');
    await page.locator('textarea').first().fill(scenario.description);
    await page.locator('input[type="number"]').fill(scenario.duration.toString());
    await page.locator('input[placeholder*="Tech-savvy"]').fill(scenario.audience);

    // Screenshot before submit
    await page.screenshot({ path: 'test-results/form-filled.png' });
    console.log('Screenshot saved: test-results/form-filled.png');

    // Submit
    console.log('Submitting...');
    await page.locator('button:has-text("Generate Storyboard")').click();

    // Wait for navigation
    await page.waitForURL(/\/storyboard\/\d+/, { timeout: 30000 });
    const projectId = page.url().split('/storyboard/')[1];
    console.log(`Navigated to project: ${projectId}`);

    // Wait for initial load
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/storyboard-page.png' });

    // Check pipeline state via API
    const stateResponse = await page.request.get(`/api/project/${projectId}/pipeline-state`);
    const stateData = await stateResponse.json();

    console.log('\nPipeline State:');
    console.log(`  Phase: ${stateData.phase}`);
    console.log(`  Has intake: ${stateData.state?.has_intake_form}`);
    console.log(`  Has brief: ${stateData.state?.has_story_brief}`);

    if (stateData.data?.story_brief) {
      console.log('\nStory Brief Fields:');
      const fields = stateData.data.story_brief.fields || {};
      for (const [key, value] of Object.entries(fields)) {
        const v = value as { value?: string; source?: string };
        if (v.value) {
          console.log(`  ${key}: ${v.value} (${v.source})`);
        }
      }
    }

    console.log('\n========================================');
    console.log('UI TEST COMPLETE');
    console.log('========================================\n');
  });
});

// Standalone API test - no auth needed
test.describe('API Pipeline Test', () => {
  test('run all scenarios and show results', async ({ request }) => {
    console.log('\n========================================');
    console.log('RUNNING ALL TEST SCENARIOS');
    console.log('========================================\n');

    for (const scenario of TEST_SCENARIOS) {
      const projectId = `api_${Date.now()}`;

      console.log(`\n--- ${scenario.name} ---`);
      console.log(`Description: ${scenario.description.substring(0, 60)}...`);
      console.log(`Duration: ${scenario.duration}s | Audience: ${scenario.audience.substring(0, 40)}...`);

      // Create project
      const createResp = await request.post(`${BACKEND_URL}/api/create-project`, {
        data: {
          projectId,
          typeId: 3,
          typeName: 'Knowledge Sharing',
          userInput: scenario.description,
          userId: 'api-test',
        },
      });

      if (!createResp.ok()) {
        console.log('  ERROR: Failed to create project');
        continue;
      }

      // Start pipeline
      const startResponse = await request.post(`${BACKEND_URL}/api/project/${projectId}/start`, {
        data: {
          intake_form: {
            video_type: 'Knowledge Share',
            description: scenario.description,
            duration: scenario.duration,
            target_audience: scenario.audience,
            links: [],
          },
        },
        timeout: 60000,
      });

      if (startResponse.ok()) {
        const data = await startResponse.json();
        console.log(`\n  RESULT:`);
        console.log(`  - Project ID: ${projectId}`);
        console.log(`  - Phase: ${data.phase}`);
        console.log(`  - Intake saved: ${data.state?.has_intake_form ? 'YES' : 'NO'}`);
        console.log(`  - Brief generated: ${data.state?.has_story_brief ? 'YES' : 'NO'}`);

        // Show extracted fields
        const fields = data.data?.story_brief?.fields || {};
        const extractedFields = Object.entries(fields)
          .filter(([_, v]) => (v as any).value)
          .map(([k, v]) => `${k}="${(v as any).value}"`)
          .slice(0, 3);

        if (extractedFields.length > 0) {
          console.log(`  - Extracted: ${extractedFields.join(', ')}...`);
        }
      } else {
        console.log(`  ERROR: ${(await startResponse.text()).substring(0, 100)}`);
      }

      // Small delay between tests
      await new Promise(r => setTimeout(r, 300));
    }

    console.log('\n========================================');
    console.log('ALL SCENARIOS COMPLETE');
    console.log('========================================\n');
  });
});
