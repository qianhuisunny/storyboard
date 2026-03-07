# Playwright Tests for Plotline

Automated E2E tests for the Plotline storyboard application.

## Quick Start

```bash
cd frontend

# First time: authenticate (opens browser for manual sign-in)
npm run test:auth

# Run all tests headlessly
npm test

# Run tests with browser visible
npm run test:headed

# Run with Playwright UI
npm run test:ui

# Debug a specific test
npm run test:debug
```

## Test Files

| File | Purpose |
|------|---------|
| `auth.setup.ts` | One-time authentication setup (saves Clerk session) |
| `storyboard-flow.spec.ts` | Full UI flow: onboarding → research trigger |
| `api-trigger-research.spec.ts` | API-only tests (bypass UI, useful for backend testing) |

## Authentication

Clerk authentication is handled via session state:

1. Run `npm run test:auth` once to sign in manually
2. Session is saved to `.auth/user.json`
3. All subsequent tests reuse this session

To re-authenticate:
```bash
rm -rf .auth/
npm run test:auth
```

## Running Specific Tests

```bash
# Run only API tests (no auth needed)
npx playwright test api-trigger-research

# Run only storyboard flow tests
npx playwright test storyboard-flow

# Run a specific test by name
npx playwright test -g "should fill onboarding form"
```

## Prerequisites

Both servers must be running:

```bash
# Terminal 1: Backend
cd backend && source venv/bin/activate
uvicorn app.main:app --reload --port 8001

# Terminal 2: Frontend
cd frontend && npm run dev
```

Or let Playwright start them automatically (configured in `playwright.config.ts`).

## Test Results

- Screenshots: `test-results/*.png`
- HTML Report: `playwright-report/index.html` (run `npx playwright show-report`)
- Traces: Available on test failure

## Tips

- Use `--headed` to watch tests run in a browser
- Use `--debug` to step through tests with Playwright Inspector
- Use `--ui` for the interactive test runner
- Tests have a 2-minute timeout for AI generation delays
