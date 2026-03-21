# Backlog — Analytics Dashboard Cleanup

## Task: Remove Unused Analytics Dashboard Sections

Clean up the Analytics dashboard by removing sections that are not useful or not backed by real data.

### Requirements
- Delete the following sections/cards from the Analytics dashboard:
  - "Avg TTFT" (Average Time to First Token) metric card
  - "Performance by Stage" section
  - "Field Edit Patterns" section
  - "User Behavior" section
  - "Go back" button/link
- Keep remaining analytics sections intact
- Ensure no dead code left behind (remove corresponding types, API calls, state if any)

### Key files
- `frontend/src/components/admin/AdminDashboard.tsx` — main analytics dashboard component
- `frontend/src/components/admin/` — related admin components
