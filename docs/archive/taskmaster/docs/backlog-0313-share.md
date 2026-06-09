# Backlog — Share to Community

## Task: Add Share Button for Community Access

Add a "Share" button so users can publish their finished storyboard to a public community gallery. Other users can browse and view shared storyboards.

### Requirements
- Share button on the Review stage (Stage 5) or project page
- Clicking "Share" makes the storyboard publicly accessible via a unique URL
- Community gallery page where anyone can browse shared storyboards
- Shared view is read-only — visitors can see the full storyboard but not edit
- Author can unshare / revoke access
- No authentication required to view shared storyboards (public links)
- Consider: share metadata (title, description, thumbnail, author name)

### Backend needs
- New field on project: `is_shared: boolean`, `share_slug: string` (unique URL-safe identifier)
- API endpoint: `POST /api/project/{id}/share` → generates share link
- API endpoint: `DELETE /api/project/{id}/share` → revokes share
- API endpoint: `GET /api/community` → list all shared storyboards (paginated)
- API endpoint: `GET /api/shared/{slug}` → public read-only storyboard data

### Frontend needs
- Share button component on Stage 5 / project header
- Community gallery page (`/community`) — grid of shared storyboard cards
- Public storyboard viewer (`/shared/{slug}`) — read-only storyboard display
- Copy-link-to-clipboard after sharing
