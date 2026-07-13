# Plotline Playwright tests

The active suite is intentionally split into two projects:

| Project | Specs | Purpose |
|---|---|---|
| `api` | `api-*.spec.ts` | Small API/client contract checks, including the real SQLite-backed Create intake smoke test |
| `chromium` | `create-project.spec.ts`, `smart-intake.spec.ts`, `plotline-workflow.spec.ts` | Canonical Create → Smart Intake → Outline → Storyboard → Complete UI behavior |

Plotline's current local workflow uses a server-issued HttpOnly anonymous session,
so Playwright no longer requires a manually captured Clerk/Google auth state.

## Run

```bash
cd frontend

# List every classified test without starting a run
npm test -- --list

# Run the complete active suite
npm test

# Run one canonical surface
npm test -- tests/plotline-workflow.spec.ts --project=chromium

# Run API contract checks only
npm test -- --project=api
```

Playwright starts the Vite frontend and FastAPI backend defined in
`playwright.config.ts`. Test artifacts are written under `test-results/` and
`playwright-report/`.

## Retired legacy suites

The former research-trigger, multi-round Knowledge Share, old onboarding, and
manual-auth specs were removed when the corresponding product paths were
superseded. Their live responsibilities are covered by the canonical specs
above and by backend workflow API tests; they must not be reintroduced as
hidden or unclassified tests.
