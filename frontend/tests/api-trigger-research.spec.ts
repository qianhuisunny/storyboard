import { test, expect } from '@playwright/test';

/**
 * API-based tests for triggering research
 *
 * These tests bypass the UI and call the backend API directly.
 * Useful for testing the research pipeline without UI dependencies.
 *
 * Run: npx playwright test api-trigger-research.spec.ts
 */

const BACKEND_URL = 'http://localhost:8001';

test.describe('Research API Tests', () => {
  test('should create project and trigger research via API', async ({ request }) => {
    const projectId = Date.now().toString();

    // Step 1: Create project
    console.log('Creating project:', projectId);
    const createResponse = await request.post(`${BACKEND_URL}/api/create-project`, {
      data: {
        projectId,
        typeId: 3, // Knowledge Sharing
        typeName: 'Knowledge Sharing',
        userInput: 'How to build a REST API with Python Flask for beginners',
        userId: 'test-user-playwright',
      },
    });

    expect(createResponse.ok()).toBeTruthy();
    const createData = await createResponse.json();
    console.log('Project created:', createData);

    // Step 2: Check pipeline state
    const stateResponse = await request.get(
      `${BACKEND_URL}/api/project/${projectId}/pipeline-state`
    );
    console.log('Pipeline state:', await stateResponse.json());

    // Step 3: Save stages data (simulating what the frontend does)
    const stagesResponse = await request.post(
      `${BACKEND_URL}/api/project/${projectId}/stages`,
      {
        data: {
          stages: {
            1: {
              completed: false,
              data: {
                description: 'How to build a REST API with Python Flask for beginners',
                duration: 60,
                audience: 'Beginner developers',
              },
            },
          },
        },
      }
    );

    if (stagesResponse.ok()) {
      console.log('Stages saved');
    }

    // Step 4: Trigger research angle generation
    console.log('Triggering research angle...');
    const angleResponse = await request.post(
      `${BACKEND_URL}/api/project/${projectId}/research/angle`,
      {
        data: {
          audience: 'Beginner developers',
          description: 'How to build a REST API with Python Flask',
          duration: 5,
        },
        timeout: 60000,
      }
    );

    if (angleResponse.ok()) {
      const angleData = await angleResponse.json();
      console.log('Research angle:', JSON.stringify(angleData, null, 2));

      // Step 5: Run full research
      console.log('Running full research...');
      const researchResponse = await request.post(
        `${BACKEND_URL}/api/project/${projectId}/research/run`,
        {
          data: {
            onboarding_data: {
              description: 'How to build a REST API with Python Flask',
              duration: 60,
              audience: 'Beginner developers',
              projectId,
            },
            video_type: 'Knowledge Sharing',
            angle: angleData.angle || angleData,
            research_questions: angleData.research_questions || angleData.angle?.questions || [],
          },
          timeout: 120000,
        }
      );

      if (researchResponse.ok()) {
        const researchData = await researchResponse.json();
        console.log('Research completed:', JSON.stringify(researchData, null, 2).slice(0, 500));
      } else {
        console.log('Research failed:', await researchResponse.text());
      }
    } else {
      console.log('Angle generation failed:', await angleResponse.text());
    }
  });

  test('should check backend health', async ({ request }) => {
    const response = await request.get(`${BACKEND_URL}/health`);
    expect(response.ok()).toBeTruthy();
    console.log('Backend health:', await response.json());
  });
});
