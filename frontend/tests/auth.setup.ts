import { test as setup, expect, chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '../.auth/user.json');

/**
 * Authentication setup for Playwright tests
 *
 * Google OAuth blocks automated browsers. This setup uses a workaround:
 * 1. First run: Opens browser for manual sign-in, saves auth state
 * 2. Subsequent runs: Reuses saved auth state
 *
 * If Google still blocks, use the manual export method:
 * 1. Sign in at http://localhost:3000 in your normal browser
 * 2. Run: npm run test:export-auth
 */
setup('authenticate', async ({ }, testInfo) => {
  // Check if auth file already exists
  if (fs.existsSync(authFile)) {
    // Verify the auth file is valid (has cookies/localStorage)
    try {
      const authData = JSON.parse(fs.readFileSync(authFile, 'utf-8'));
      if (authData.cookies?.length > 0 || Object.keys(authData.origins?.[0]?.localStorage || {}).length > 0) {
        console.log('Valid auth file exists, skipping sign-in');
        return;
      }
    } catch {
      // Invalid file, continue with auth
    }
  }

  console.log('\n==============================================');
  console.log('AUTHENTICATION REQUIRED');
  console.log('==============================================');
  console.log('Google OAuth blocks automated browsers.');
  console.log('');
  console.log('WORKAROUND - Export auth from your browser:');
  console.log('1. Sign in at http://localhost:3000 in Chrome/Safari');
  console.log('2. Open DevTools > Application > Storage');
  console.log('3. Or run: npm run test:export-auth');
  console.log('==============================================\n');

  // Try with a persistent context using a temp profile
  const userDataDir = path.join(__dirname, '../.auth/chrome-profile');

  // Ensure directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    channel: 'chrome',
    args: ['--disable-blink-features=AutomationControlled'],
    viewport: { width: 1280, height: 720 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('http://localhost:3000/');

  console.log('Browser opened. Please sign in...');
  console.log('(Using persistent profile to help with Google OAuth)');

  // Wait for successful sign-in
  try {
    await expect(page.locator('h1:has-text("Create Your Storyboard")')).toBeVisible({
      timeout: 180_000, // 3 minutes
    });

    console.log('Sign-in successful! Saving auth state...');

    // Ensure .auth directory exists
    const authDir = path.dirname(authFile);
    if (!fs.existsSync(authDir)) {
      fs.mkdirSync(authDir, { recursive: true });
    }

    // Save auth state
    await browser.storageState({ path: authFile });
    console.log('Auth state saved to', authFile);
  } finally {
    await browser.close();
  }
});
