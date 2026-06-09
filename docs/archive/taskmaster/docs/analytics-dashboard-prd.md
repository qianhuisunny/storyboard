# Analytics Dashboard PRD

**Product**: Plotline Analytics Dashboard
**Version**: 1.0
**Last Updated**: January 2026
**Owner**: Product Team

---

## 1. Overview & Vision

### 1.1 Purpose

The Analytics Dashboard is an **internal tool** designed to give Product Managers, Prompt Engineers, and Team Leads visibility into how users interact with Plotline. It surfaces insights that directly improve the product:

- **Funnel analysis**: Where do users drop off?
- **Prompt refinement**: Which AI-generated fields do users consistently edit?
- **Performance monitoring**: Are generation times acceptable?
- **User satisfaction**: Are users happy with their outputs?

### 1.2 Positioning

This dashboard is a **separate sub-product** with its own PM scope. While the core Plotline product serves external users creating storyboards, the Analytics Dashboard serves the internal team making Plotline better.

### 1.3 Success Criteria

- PM uses the dashboard at least weekly for product decisions
- At least 2 prompt improvements identified per month from field edit patterns
- Completion rate improves 5%+ based on insights within 3 months

### 1.4 Non-Goals

- This is NOT a user-facing analytics feature
- No real-time monitoring or alerting (batch analytics only)
- No A/B testing framework (future consideration)

---

## 2. User Personas

### 2.1 Product Manager

**Name**: Sarah
**Role**: Product Manager
**Goals**:
- Monitor funnel metrics to identify where users drop off
- Track completion rates across different project types
- Understand user satisfaction trends over time
- Prioritize feature improvements based on data

**Pain Points**:
- Currently has no visibility into user behavior
- Cannot quantify the impact of product changes
- Relies on anecdotal feedback rather than data

**Key Dashboard Uses**:
- Daily: Check completion rate and new project counts
- Weekly: Review funnel drop-offs and satisfaction ratings
- Monthly: Analyze trends and prepare product reports

### 2.2 Prompt Engineer

**Name**: Alex
**Role**: AI/Prompt Engineer
**Goals**:
- Identify which AI-generated fields users edit most frequently
- See before/after samples to understand user expectations
- Prioritize prompt improvements based on edit patterns
- Measure the impact of prompt changes over time

**Pain Points**:
- No systematic way to see which outputs miss user expectations
- Manual review of individual projects is time-consuming
- Hard to quantify prompt quality

**Key Dashboard Uses**:
- Weekly: Review top edited fields and sample edits
- Per sprint: Target specific fields for prompt improvement
- After changes: Compare edit rates before/after prompt updates

### 2.3 Team Lead

**Name**: Jordan
**Role**: Engineering/Product Lead
**Goals**:
- Track overall product health metrics
- Monitor user growth and acquisition
- Ensure performance stays within acceptable bounds
- Review user satisfaction as a team KPI

**Pain Points**:
- No executive summary view of product health
- Performance issues discovered reactively
- Growth metrics scattered across tools

**Key Dashboard Uses**:
- Weekly: Team standup metrics review
- Monthly: Leadership reporting on product health
- Ongoing: Performance regression detection

---

## 3. Core Features

### 3.1 Overview Dashboard

The landing page provides a high-level snapshot of product health.

**Key Metrics Cards**:
- **Total Projects**: Count of projects created in the selected time range
- **Completion Rate**: Percentage of projects reaching Stage 4
- **Average Rating**: Mean satisfaction rating (1-5 stars)
- **New Users**: User registrations in the time range

**Visualizations**:
- Completion funnel (Stage 1 → 2 → 3 → 4)
- Top 5 edited fields (quick insight for prompt team)
- Recent feedback snippets

**Time Range Selector**: 7 days | 30 days | 90 days | All time

### 3.2 Performance Monitoring

Track AI generation performance to ensure acceptable user experience.

**Metrics per Stage**:
- Average time-to-first-token (TTFT)
- Average total generation time
- P95 latency (worst-case experience)
- Sample count (statistical confidence)

**Visualizations**:
- Performance by stage table
- Generation time trend chart (over selected time range)
- Model usage breakdown (if multiple models used)

**Use Case**: Detect if generation times increase after model or prompt changes.

### 3.3 User Behavior Analytics

Understand how users interact with each stage of the storyboard creation flow.

**Metrics per Stage**:
- Average time spent
- Average regeneration count
- Average manual edits
- Characters added/removed

**Session-Level Metrics**:
- Total go-back count (navigation between stages)
- Session status breakdown (completed, in-progress, abandoned)
- Abandonment rate by stage

**Visualizations**:
- Stage behavior comparison table
- Session status pie/bar chart
- Go-back pattern analysis

### 3.4 Field Edit Patterns (Prompt Refinement)

The most actionable section for improving AI output quality.

**Field-Level Metrics**:
- Edit rate: % of projects where field was edited
- Total edit count
- Projects affected

**Sample Edits**:
- Before (AI-generated) vs After (user-edited) pairs
- Up to 10 samples per field for pattern analysis

**Edit Type Breakdown**:
- Modified: AI output was changed
- Added: User added content where AI left blank
- Deleted: User removed AI content

**Actionable Insights**:
- Fields with >30% edit rate flagged for prompt review
- Common edit patterns highlighted
- Suggested prompt improvements based on patterns

### 3.5 Satisfaction Tracking

Monitor user happiness and correlate with product changes.

**Metrics**:
- Average rating (1-5 stars)
- Rating distribution (histogram)
- Rating trend over time

**Feedback Analysis**:
- Recent feedback with full text
- Correlation: rating vs completion stage
- Low rating alert (ratings ≤2)

**Visualizations**:
- Rating distribution bar chart
- Average rating trend line
- Recent feedback list with timestamps

### 3.6 User Growth

Track user acquisition and engagement trends.

**Metrics**:
- New registrations in time range
- All-time total users
- Daily/weekly registration trends

**Visualizations**:
- Registration trend chart
- Active users vs total users (if tracking available)
- Acquisition source breakdown (future)

---

## 4. Data Sources

All data is sourced from the existing `analytics.py` service (`/backend/app/services/analytics.py`).

| Dashboard Section | Primary Method | Data Model |
|------------------|----------------|------------|
| Overview | `get_dashboard_data()` | Aggregated |
| Funnel | `_calculate_funnel()` | `SessionMetrics` |
| Performance | `_aggregate_performance()` | `PerformanceMetrics` |
| Behavior | `_aggregate_behavior()` | `UserBehaviorMetrics` |
| Field Edits | `_aggregate_field_edits()` | `FieldEdit` |
| Satisfaction | `get_dashboard_data()` → `rating_distribution` | `SatisfactionRating` |
| Recent Feedback | `_get_recent_feedback()` | `SatisfactionRating` |
| User Growth | `get_registrations()` | `UserRegistration`, `GlobalMetrics` |
| Project Details | `get_project_analytics()` | `ProjectAnalytics` |

### 4.1 Data Storage

- **Per-project analytics**: `data/project_{id}/analytics.json`
- **Global metrics**: `data/_analytics/global.json`

### 4.2 Existing Data Models

```python
# From analytics.py
PerformanceMetrics:
    - stage_id, stage_name
    - request_started_at, first_token_at, response_completed_at
    - time_to_first_token_ms, total_generation_time_ms
    - model_used

FieldEdit:
    - field_name
    - ai_value, human_value
    - edit_type: "modified" | "added" | "deleted"
    - timestamp

UserBehaviorMetrics:
    - stage_id, stage_name
    - time_spent_seconds
    - regeneration_count, manual_edit_count
    - field_edits: List[FieldEdit]

SessionMetrics:
    - project_id, user_id
    - completion_status: "in_progress" | "completed" | "abandoned"
    - current_stage, highest_stage_reached
    - go_back_count

SatisfactionRating:
    - rating: 1-5
    - feedback_text
    - submitted_at

UserRegistration:
    - user_id, email
    - created_at
```

---

## 5. API Endpoints Required

### 5.1 Dashboard Aggregation

```
GET /api/admin/analytics/dashboard?time_range=30d
```

**Response**:
```json
{
  "time_range": "30d",
  "total_projects": 142,
  "completed_projects": 97,
  "completion_rate": 0.68,
  "new_registrations": 23,
  "avg_rating": 4.2,
  "rating_distribution": { "1": 2, "2": 5, "3": 18, "4": 35, "5": 37 },
  "performance_by_stage": { ... },
  "behavior_summary": { ... },
  "field_edit_patterns": { ... },
  "funnel": { ... },
  "recent_feedback": [ ... ]
}
```

**Implementation**: Wraps existing `analytics_tracker.get_dashboard_data(time_range)`.

### 5.2 Project List

```
GET /api/admin/analytics/projects?time_range=30d&status=completed
```

**Response**:
```json
{
  "projects": [
    {
      "project_id": "1768592994563",
      "created_at": "2026-01-15T10:30:00Z",
      "completion_status": "completed",
      "highest_stage": 4,
      "rating": 5,
      "total_edits": 8
    }
  ],
  "total": 97
}
```

### 5.3 Single Project Detail

```
GET /api/admin/analytics/project/{project_id}
```

**Response**: Full `ProjectAnalytics` object with all performance, behavior, and satisfaction data.

### 5.4 Field Edits Detail

```
GET /api/admin/analytics/field-edits?field=tone_and_style&limit=50
```

**Response**:
```json
{
  "field": "tone_and_style",
  "edit_rate": 45.2,
  "total_edits": 64,
  "samples": [
    {
      "project_id": "1768592994563",
      "ai_value": "professional and informative",
      "human_value": "friendly but authoritative",
      "timestamp": "2026-01-15T10:35:00Z"
    }
  ]
}
```

### 5.5 Export Endpoint

```
GET /api/admin/analytics/export?format=csv&type=field_edits
```

**Formats**: CSV, JSON
**Types**: `dashboard`, `projects`, `field_edits`, `feedback`

---

## 6. UI/UX Requirements

### 6.1 Route & Access

- **Route**: `/admin/analytics`
- **Access**: Admin-only (Clerk metadata check)
- **No public access** under any circumstances

### 6.2 Navigation Structure

Tab-based navigation with the following sections:

1. **Overview** (default landing)
2. **Performance**
3. **Behavior**
4. **Field Edits**
5. **Satisfaction**
6. **Users**

### 6.3 Common UI Components

**Time Range Selector**:
- Buttons: 7d | 30d | 90d | All
- Applied globally across all tabs
- Default: 30d

**Metric Cards**:
- Large number display
- Trend indicator (up/down arrow with percentage)
- Color coding (green for positive, red for negative)

**Data Tables**:
- Sortable columns
- Pagination for large datasets
- Row click for detail view

**Charts**:
- Line charts for trends
- Bar charts for comparisons
- Funnel visualization for stage progression

**Export Button**:
- Available on each tab
- CSV download

### 6.4 Responsive Design

- Desktop-first design (admin tool)
- Minimum supported width: 1024px
- Tables collapse to card view below 768px

### 6.5 Loading States

- Skeleton loaders for initial data fetch
- Refresh indicator for manual refresh
- Error states with retry option

---

## 7. Access Control

### 7.1 Authentication

- Users must be authenticated via Clerk
- Admin check via Clerk user metadata: `user.publicMetadata.role === 'admin'`

### 7.2 Authorization

```typescript
// Frontend route guard
const AdminRoute = ({ children }) => {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'admin';

  if (!isAdmin) {
    return <Navigate to="/" />;
  }

  return children;
};
```

### 7.3 Backend Protection

```python
# FastAPI dependency
async def require_admin(user: ClerkUser = Depends(get_current_user)):
    if user.public_metadata.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
```

---

## 8. Wireframes

### 8.1 Overview Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   [Overview]  Performance  Behavior  Field Edits  Satisfaction  Users           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   Projects     │  │  Completion    │  │  Avg Rating    │  │   New Users    │ │
│  │                │  │                │  │                │  │                │ │
│  │     142        │  │     68%        │  │    4.2         │  │     +23        │ │
│  │    ↑ 12%       │  │    ↓ 3%        │  │   ↑ 0.3        │  │    ↑ 15%       │ │
│  └────────────────┘  └────────────────┘  └────────────────┘  └────────────────┘ │
│                                                                                  │
│  ┌───────────────────────────────────┐  ┌─────────────────────────────────────┐ │
│  │      Completion Funnel            │  │      Top Edited Fields              │ │
│  │                                   │  │                                     │ │
│  │  Stage 1: ████████████████ 100%   │  │  1. tone_and_style      45.2%      │ │
│  │  Stage 2: █████████████░░░  85%   │  │  2. key_points          38.1%      │ │
│  │  Stage 3: ██████████░░░░░░  72%   │  │  3. cta                 29.0%      │ │
│  │  Stage 4: ████████░░░░░░░░  68%   │  │  4. target_audience     22.4%      │ │
│  │                                   │  │  5. video_goal          15.6%      │ │
│  │  ↓ 15% drop Stage 1→2             │  │                                     │ │
│  │  ↓ 13% drop Stage 2→3             │  │                    [View All →]     │ │
│  │  ↓  4% drop Stage 3→4             │  │                                     │ │
│  └───────────────────────────────────┘  └─────────────────────────────────────┘ │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                           Recent Feedback                                  │  │
│  │                                                                           │  │
│  │  ⭐⭐⭐⭐⭐  "Great tool! Saved me hours of work."              2 hours ago │  │
│  │  ⭐⭐⭐⭐   "Tone was a bit off but overall helpful"            5 hours ago │  │
│  │  ⭐⭐⭐⭐⭐  "Exactly what I needed for my pitch"                  1 day ago │  │
│  │  ⭐⭐⭐     "Good start but needed lots of edits"                 2 days ago │  │
│  │                                                                           │  │
│  │                                                        [View All →]       │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Field Edit Patterns Tab

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Overview  Performance  Behavior  [Field Edits]  Satisfaction  Users           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  Field Edit Patterns                                          [Export CSV ↓]    │
│  ────────────────────                                                           │
│  Sort by: [Edit Rate ▼]  [Edit Count]  [Projects]                               │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Field              │ Edit Rate │ Total Edits │ Projects │  Action     │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │  tone_and_style     │   45.2%   │     64      │    64    │ [Samples]   │    │
│  │  key_points         │   38.1%   │     54      │    54    │ [Samples]   │    │
│  │  cta                │   29.0%   │     41      │    41    │ [Samples]   │    │
│  │  target_audience    │   22.4%   │     32      │    32    │ [Samples]   │    │
│  │  video_goal         │   15.6%   │     22      │    22    │ [Samples]   │    │
│  │  key_message        │   12.3%   │     17      │    17    │ [Samples]   │    │
│  │  duration           │    8.5%   │     12      │    12    │ [Samples]   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  tone_and_style Samples                          (showing 5 of 64)       │    │
│  │  ─────────────────────────────────────────────────────────────────────  │    │
│  │                                                                         │    │
│  │  Sample 1:                                                              │    │
│  │    AI Generated:  "professional and informative"                        │    │
│  │    User Changed:  "friendly but authoritative"                          │    │
│  │                                                                         │    │
│  │  Sample 2:                                                              │    │
│  │    AI Generated:  "casual and fun"                                      │    │
│  │    User Changed:  "witty but not too silly"                             │    │
│  │                                                                         │    │
│  │  Sample 3:                                                              │    │
│  │    AI Generated:  "corporate and formal"                                │    │
│  │    User Changed:  "approachable yet professional"                       │    │
│  │                                                                         │    │
│  │  ─────────────────────────────────────────────────────────────────────  │    │
│  │                                                                         │    │
│  │  💡 INSIGHT: Users frequently request more nuanced tone descriptors     │    │
│  │     than the AI provides. Consider adding modifier options like         │    │
│  │     "balanced", "approachable", or compound descriptors.                │    │
│  │                                                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Performance Tab

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Overview  [Performance]  Behavior  Field Edits  Satisfaction  Users           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  Performance Metrics                                          [Export CSV ↓]    │
│  ───────────────────                                                            │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Stage           │ Avg TTFT  │ Avg Gen Time │ P95 TTFT  │ Samples     │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │  Brief Builder   │   1.2s    │    4.8s      │   2.1s    │   142       │    │
│  │  Outline         │   0.9s    │    3.2s      │   1.5s    │   121       │    │
│  │  Panels          │   1.4s    │    6.1s      │   2.8s    │   102       │    │
│  │  Draft           │   1.1s    │    5.4s      │   2.2s    │    96       │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Generation Time Trend                                                          │
│  ─────────────────────                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                         │    │
│  │  8s │                                                                   │    │
│  │     │                                                                   │    │
│  │  6s │                              ·    ·                               │    │
│  │     │      ·        ·    ·    ·  ·   ·    ·   ·                         │    │
│  │  4s │  · ·   · · ·    ·    ·  ·          ·  ·   · ·                     │    │
│  │     │                                                                   │    │
│  │  2s │                                                                   │    │
│  │     │                                                                   │    │
│  │  0s └───────────────────────────────────────────────────────────────    │    │
│  │       Jan 1   Jan 5   Jan 9   Jan 13   Jan 17   Jan 21   Jan 25        │    │
│  │                                                                         │    │
│  │       ── Brief Builder  ── Outline  ── Panels  ── Draft                 │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Model Usage                                                                    │
│  ───────────                                                                    │
│  ┌────────────────────────────────────┐                                         │
│  │  claude-3-5-sonnet  ████████  89%  │                                         │
│  │  gpt-4o             ██░░░░░░  11%  │                                         │
│  └────────────────────────────────────┘                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 User Behavior Tab

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Overview  Performance  [Behavior]  Field Edits  Satisfaction  Users           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  User Behavior                                                [Export CSV ↓]    │
│  ─────────────                                                                  │
│                                                                                  │
│  Stage Metrics                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Stage           │ Avg Time  │ Avg Regens │ Avg Edits │ Drop-off      │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │  Brief Builder   │   3m 24s  │    0.8     │    2.4    │    0%         │    │
│  │  Outline         │   2m 12s  │    0.3     │    1.1    │   15%         │    │
│  │  Panels          │   4m 45s  │    1.2     │    3.8    │   13%         │    │
│  │  Draft           │   5m 18s  │    0.9     │    2.1    │    4%         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Navigation Patterns                                                            │
│  ───────────────────                                                            │
│  Total Go-backs: 47  (avg 0.33 per project)                                     │
│                                                                                  │
│  Most common go-back: Stage 3 → Stage 2 (23 occurrences)                        │
│  💡 Users often revisit Outline after seeing Panel previews                     │
│                                                                                  │
│  Session Status                                                                 │
│  ──────────────                                                                 │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                         │    │
│  │   Completed    ███████████████████████████░░░░░░░░░░░   68% (97)       │    │
│  │   In Progress  ███████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   18% (26)       │    │
│  │   Abandoned    █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   14% (19)       │    │
│  │                                                                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Abandonment Analysis                                                           │
│  ────────────────────                                                           │
│  Most abandonments occur at:                                                    │
│    Stage 1 (Brief Builder): 47%  ← Primary drop-off point                       │
│    Stage 3 (Panels): 32%                                                        │
│    Stage 2 (Outline): 21%                                                       │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.5 Satisfaction Tab

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Overview  Performance  Behavior  Field Edits  [Satisfaction]  Users           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  User Satisfaction                                            [Export CSV ↓]    │
│  ─────────────────                                                              │
│                                                                                  │
│  ┌────────────────────────────┐   Rating Distribution                           │
│  │                            │   ─────────────────────                         │
│  │   Average Rating           │   ┌────────────────────────────────────────┐    │
│  │                            │   │                                        │    │
│  │      ⭐ 4.2                │   │  5 ⭐  ████████████████████████░  37    │    │
│  │                            │   │  4 ⭐  █████████████████████░░░░  35    │    │
│  │   ↑ 0.3 from last period   │   │  3 ⭐  █████████░░░░░░░░░░░░░░░░  18    │    │
│  │                            │   │  2 ⭐  ██░░░░░░░░░░░░░░░░░░░░░░░   5    │    │
│  │   Based on 97 ratings      │   │  1 ⭐  █░░░░░░░░░░░░░░░░░░░░░░░░   2    │    │
│  └────────────────────────────┘   │                                        │    │
│                                   └────────────────────────────────────────┘    │
│                                                                                  │
│  Rating Trend                                                                   │
│  ────────────                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  5.0 │                                                                  │    │
│  │      │         ·       ·   ·       ·   ·                               │    │
│  │  4.0 │  · · ·    · · ·   ·   · · ·   ·   · · ·                         │    │
│  │      │                                                                  │    │
│  │  3.0 │                                                                  │    │
│  │      └───────────────────────────────────────────────────────────────   │    │
│  │        Jan 1   Jan 7   Jan 14   Jan 21   Jan 28                         │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Recent Feedback                                                                │
│  ───────────────                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  ⭐⭐⭐⭐⭐  "Great tool! Saved me hours of work."                        │    │
│  │            Project: 1768592994563  •  2 hours ago                       │    │
│  │                                                                         │    │
│  │  ⭐⭐⭐⭐   "Tone was a bit off but overall helpful"                      │    │
│  │            Project: 1768591234567  •  5 hours ago                       │    │
│  │                                                                         │    │
│  │  ⭐⭐      "Needed too many edits, AI missed the point"                  │    │
│  │            Project: 1768588765432  •  1 day ago          ⚠️ LOW RATING  │    │
│  │                                                                         │    │
│  │                                                   Page 1 of 10  [→]     │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.6 Users Tab

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Plotline Analytics                                     [7d] [30d] [90d] [All]  │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   Overview  Performance  Behavior  Field Edits  Satisfaction  [Users]           │
│  ─────────────────────────────────────────────────────────────                  │
│                                                                                  │
│  User Growth                                                  [Export CSV ↓]    │
│  ───────────                                                                    │
│                                                                                  │
│  ┌────────────────────────────┐  ┌────────────────────────────┐                 │
│  │   New Users (30d)          │  │   All-Time Users           │                 │
│  │                            │  │                            │                 │
│  │        23                  │  │       487                  │                 │
│  │                            │  │                            │                 │
│  │    ↑ 15% from last period  │  │                            │                 │
│  └────────────────────────────┘  └────────────────────────────┘                 │
│                                                                                  │
│  Registration Trend                                                             │
│  ──────────────────                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │                                                                         │    │
│  │   5 │                     ·                                             │    │
│  │     │                 ·       ·                                         │    │
│  │   3 │  ·   ·     ·       ·       ·   ·                                  │    │
│  │     │    ·   · ·   · ·               ·   ·                              │    │
│  │   1 │                                      ·                            │    │
│  │     └───────────────────────────────────────────────────────────────    │    │
│  │       Jan 1   Jan 5   Jan 9   Jan 13   Jan 17   Jan 21   Jan 25        │    │
│  │                                                                         │    │
│  │       Daily Registrations                                               │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
│  Daily Breakdown                                                                │
│  ───────────────                                                                │
│  ┌─────────────────────────────────────────────────────────────────────────┐    │
│  │  Date        │  New Users  │  Cumulative                               │    │
│  ├─────────────────────────────────────────────────────────────────────────┤    │
│  │  2026-01-17  │      2      │     487                                   │    │
│  │  2026-01-16  │      3      │     485                                   │    │
│  │  2026-01-15  │      1      │     482                                   │    │
│  │  2026-01-14  │      4      │     481                                   │    │
│  │  2026-01-13  │      2      │     477                                   │    │
│  │  ...         │     ...     │     ...                                   │    │
│  └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Phase Breakdown

### Phase 1: Core Dashboard (MVP)

**Scope**:
- Overview dashboard with key metric cards
- Completion funnel visualization
- Field Edit Patterns tab (highest value for prompt refinement)
- Time range selector
- Basic admin route protection

**Deliverables**:
- `GET /api/admin/analytics/dashboard` endpoint
- `/admin/analytics` route with Overview and Field Edits tabs
- Admin access control via Clerk

**Priority**: HIGH - Enables immediate prompt improvements

### Phase 2: Monitoring Depth

**Scope**:
- Performance tab with latency metrics
- Behavior tab with session analysis
- Individual project detail view
- Projects list with filtering

**Deliverables**:
- `GET /api/admin/analytics/projects` endpoint
- `GET /api/admin/analytics/project/{id}` endpoint
- Performance and Behavior tabs in UI

**Priority**: MEDIUM - Enables operational monitoring

### Phase 3: Satisfaction & Growth

**Scope**:
- Satisfaction tab with rating analysis
- Users tab with registration trends
- CSV export functionality
- Trend visualizations

**Deliverables**:
- `GET /api/admin/analytics/export` endpoint
- Satisfaction and Users tabs in UI
- Export buttons on all tabs

**Priority**: MEDIUM - Completes analytics picture

---

## 10. Success Metrics

### 10.1 Product Metrics (measured by the dashboard itself)

| Metric | Baseline | Target (3 months) |
|--------|----------|-------------------|
| Completion Rate | TBD | +5% improvement |
| Average Rating | TBD | 4.5+ stars |
| Top Field Edit Rate | TBD | -10% reduction |

### 10.2 Dashboard Usage Metrics

| Metric | Target |
|--------|--------|
| Weekly active admin users | 3+ team members |
| Prompt improvements from insights | 2+ per month |
| Dashboard load time | <2 seconds |

### 10.3 Qualitative Success

- PM uses dashboard for sprint planning
- Prompt engineer cites specific field edit samples when improving prompts
- Team references dashboard data in weekly syncs

---

## 11. Technical Considerations

### 11.1 Performance

- Dashboard data is pre-aggregated in `get_dashboard_data()`
- File-based storage works for current scale (<1000 projects)
- Future: Consider moving to database if >10,000 projects

### 11.2 Data Freshness

- Dashboard shows data as of last update (no real-time streaming)
- Refresh button available for manual updates
- Consider 5-minute cache to prevent repeated expensive reads

### 11.3 Security

- All admin endpoints require Clerk authentication
- No PII exposed in analytics (user IDs only)
- Audit log for admin access (future)

---

## 12. Open Questions

1. **Alerting**: Should we add Slack/email alerts for low ratings or performance regressions?
2. **Comparison**: Should we support comparing two time periods (e.g., this week vs last week)?
3. **Drill-down**: How deep should project detail view go?
4. **Retention**: How long to keep analytics data? (Currently: indefinite)

---

## Appendix A: API Response Examples

### Dashboard Response

```json
{
  "time_range": "30d",
  "total_projects": 142,
  "completed_projects": 97,
  "completion_rate": 0.68,
  "new_registrations": 23,
  "avg_rating": 4.2,
  "rating_distribution": {
    "1": 2,
    "2": 5,
    "3": 18,
    "4": 35,
    "5": 37
  },
  "performance_by_stage": {
    "Brief Builder": {
      "avg_ttft_ms": 1200,
      "avg_gen_time_ms": 4800,
      "p95_ttft_ms": 2100,
      "sample_count": 142
    }
  },
  "behavior_summary": {
    "Brief Builder": {
      "avg_time_seconds": 204,
      "avg_regenerations": 0.8,
      "avg_edits": 2.4
    },
    "total_go_backs": 47
  },
  "field_edit_patterns": {
    "tone_and_style": {
      "edit_count": 64,
      "projects_affected": 64,
      "edit_rate": 45.2,
      "samples": [
        {
          "ai_value": "professional and informative",
          "human_value": "friendly but authoritative"
        }
      ]
    }
  },
  "funnel": {
    "stage_1": 142,
    "stage_2": 121,
    "stage_3": 102,
    "stage_4": 97,
    "dropoff_rates": {
      "stage_1": 0,
      "stage_2": 14.8,
      "stage_3": 28.2,
      "stage_4": 31.7
    }
  },
  "recent_feedback": [
    {
      "project_id": "1768592994563",
      "rating": 5,
      "feedback": "Great tool! Saved me hours.",
      "submitted_at": "2026-01-17T08:30:00Z"
    }
  ]
}
```

---

## Appendix B: Component Hierarchy

```
/admin/analytics
├── AnalyticsDashboard (main container)
│   ├── TimeRangeSelector
│   ├── TabNavigation
│   └── TabContent
│       ├── OverviewTab
│       │   ├── MetricCards (4)
│       │   ├── FunnelChart
│       │   ├── TopEditedFields
│       │   └── RecentFeedback
│       ├── PerformanceTab
│       │   ├── StageMetricsTable
│       │   ├── TrendChart
│       │   └── ModelUsage
│       ├── BehaviorTab
│       │   ├── StageMetricsTable
│       │   ├── SessionStatusChart
│       │   └── AbandonmentAnalysis
│       ├── FieldEditsTab
│       │   ├── FieldsTable (sortable)
│       │   ├── SamplesPanel
│       │   └── InsightCard
│       ├── SatisfactionTab
│       │   ├── RatingOverview
│       │   ├── DistributionChart
│       │   ├── TrendChart
│       │   └── FeedbackList
│       └── UsersTab
│           ├── GrowthMetrics
│           ├── TrendChart
│           └── DailyBreakdownTable
```
