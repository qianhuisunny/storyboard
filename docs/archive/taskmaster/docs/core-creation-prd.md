# Core Creation + Growth PRD

**Product**: Plotline - Core Storyboard Creation Experience
**Version**: 1.0
**Last Updated**: January 2026
**Owner**: Core Product Team
**Domain**: Core Creation + Growth

---

## 1. Overview & Vision

### 1.1 Purpose

The Core Creation domain owns the **complete user-facing experience** from initial landing through final storyboard export. This is the heart of Plotline - the journey that transforms a user's video idea into a polished, ready-to-produce storyboard.

### 1.2 Vision Statement

> Enable anyone to create professional video storyboards in minutes, not hours, through an AI-guided 4-stage workflow that feels like having a creative partner.

### 1.3 Success Criteria

- **Completion Rate**: 60%+ of started projects reach Stage 4
- **Time-to-First-Storyboard**: Under 5 minutes for new users
- **Return Rate**: 40%+ of users create a second project within 30 days
- **Net Promoter Score**: 50+ from post-completion surveys

### 1.4 Scope

This PRD covers:
- Landing page & authentication
- Project onboarding & creation
- 4-stage storyboard generation workflow
- Project management & persistence
- User satisfaction tracking

**Out of Scope** (separate PRDs):
- AI/Prompt quality (see `ai-prompts-prd.md`)
- Analytics dashboard (see `analytics-dashboard-prd.md`)
- Enterprise context (see `enterprise-context-prd.md`)

---

## 2. User Personas

### 2.1 Marketing Manager (Primary)

**Name**: Sarah
**Role**: Marketing Manager at a mid-size B2B SaaS company
**Goals**:
- Create consistent video content for product launches
- Communicate video vision to production team/agency
- Iterate quickly on concepts before investing in production

**Pain Points**:
- Writing detailed storyboards is time-consuming
- Translating product features into compelling narratives is hard
- Video agencies often miss the mark without detailed briefs

**Usage Pattern**: Creates 2-4 storyboards per month, often under deadline pressure

### 2.2 Content Creator (Secondary)

**Name**: Alex
**Role**: Solo content creator / YouTuber
**Goals**:
- Plan educational/tutorial videos efficiently
- Ensure videos have clear structure before recording
- Visualize content flow and timing

**Pain Points**:
- Videos often run too long or lack focus
- No formal process for content planning
- Editing is painful when structure wasn't planned

**Usage Pattern**: Creates 1-2 storyboards per week, values speed over polish

### 2.3 Product Manager (Tertiary)

**Name**: Jordan
**Role**: Product Manager at a tech startup
**Goals**:
- Create product demo videos for stakeholders
- Document feature walkthroughs for training
- Explain complex workflows visually

**Pain Points**:
- Not a "creative" person - unsure how to structure videos
- Needs AI to fill knowledge gaps about video best practices
- Limited time to learn video production skills

**Usage Pattern**: Creates 1-2 storyboards per quarter, needs heavy AI guidance

---

## 3. Current Implementation State

### 3.1 Implemented Components

| Component | File Location | Status |
|-----------|--------------|--------|
| Landing Page | `frontend/src/components/LandingPage.tsx` | Implemented |
| Projects Dashboard | `frontend/src/components/ProjectsPage.tsx` | Implemented |
| Onboarding Flow | `frontend/src/components/OnboardingPage.tsx` | Implemented |
| Stage Layout | `frontend/src/components/StageLayout.tsx` | Implemented |
| Stage Navigation | `frontend/src/components/StageNavigation.tsx` | Implemented |
| Stage Content | `frontend/src/components/StageContent.tsx` | Implemented |
| Brief Builder | `frontend/src/components/BriefBuilder/*` | Implemented |
| Outline Builder | `frontend/src/components/OutlineBuilder/*` | Implemented |
| Draft Builder | `frontend/src/components/DraftBuilder/*` | Implemented |
| Review Builder | `frontend/src/components/ReviewBuilder/*` | Implemented |
| Satisfaction Modal | `frontend/src/components/SatisfactionRatingModal.tsx` | Implemented |
| Theme Toggle | `frontend/src/components/ThemeToggle.tsx` | Implemented |

### 3.2 Backend Services

| Service | File Location | Status |
|---------|--------------|--------|
| Orchestrator | `backend/app/services/orchestrator.py` | Implemented |
| State Manager | `backend/app/services/state.py` | Implemented |
| Analytics | `backend/app/services/analytics.py` | Implemented |
| Edit Tracker | `backend/app/services/edit_tracker.py` | Implemented |

### 3.3 Authentication

- **Provider**: Clerk
- **Status**: Integrated
- **Features**: Sign up, Sign in, User management

---

## 4. User Journey

### 4.1 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLOTLINE USER JOURNEY                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────┐     ┌────────────┐     ┌────────────────────────────────┐   │
│  │  Landing   │────▶│   Auth     │────▶│      Projects Dashboard        │   │
│  │   Page     │     │  (Clerk)   │     │                                │   │
│  └────────────┘     └────────────┘     │  [New Project] [Past Projects] │   │
│                                        └───────────────┬────────────────┘   │
│                                                        │                    │
│                                        ┌───────────────▼────────────────┐   │
│                                        │        Onboarding Page          │   │
│                                        │                                 │   │
│                                        │  • Select video type            │   │
│                                        │  • Describe your video          │   │
│                                        │  • Upload reference materials   │   │
│                                        └───────────────┬────────────────┘   │
│                                                        │                    │
│                               ┌────────────────────────▼──────────────────┐ │
│                               │           4-STAGE WORKFLOW                 │ │
│                               │                                            │ │
│  ┌────────────────────────────┴────────────────────────────────────────┐  │ │
│  │                                                                      │  │ │
│  │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  │   │  Stage 1     │───▶│  Stage 2     │───▶│  Stage 3     │───▶│  Stage 4   │
│  │   │  Video       │    │  Video       │    │  Storyboard  │    │  Review &  │
│  │   │  Briefing    │    │  Outline     │    │  Draft       │    │  Share     │
│  │   │              │    │              │    │              │    │            │
│  │   │  - Goals     │    │  - Screens   │    │  - Panels    │    │  - Polish  │
│  │   │  - Audience  │    │  - Flow      │    │  - Scripts   │    │  - Export  │
│  │   │  - Tone      │    │  - Types     │    │  - Visuals   │    │  - Share   │
│  │   └──────────────┘    └──────────────┘    └──────────────┘    └────────────┘
│  │         │                    │                   │                  │     │ │
│  │         │    [Approve]       │    [Approve]      │    [Approve]     │     │ │
│  │         │    [Regenerate]    │    [Regenerate]   │    [Regenerate]  │     │ │
│  │         │    [Edit]          │    [Edit]         │    [Edit]        │     │ │
│  │                                                                      │  │ │
│  └──────────────────────────────────────────────────────────────────────┘  │ │
│                                                        │                    │ │
│                               └────────────────────────▼──────────────────┘ │
│                                        ┌───────────────────────────────┐    │
│                                        │     Satisfaction Rating       │    │
│                                        │                               │    │
│                                        │  ⭐⭐⭐⭐⭐  +  Feedback       │    │
│                                        └───────────────────────────────┘    │
│                                                        │                    │
│                                        ┌───────────────▼────────────────┐   │
│                                        │      Back to Dashboard         │   │
│                                        └────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Stage Details

#### Stage 1: Video Briefing

**Purpose**: Capture the user's vision and requirements for the video

**Inputs**:
- Video type (Product Release, How-to, Knowledge Share)
- User's description of the video
- Optional: Reference materials (links, files, text)

**AI Output** (Story Brief):
```json
{
  "video_goal": "string",
  "target_audience": "string",
  "company_or_brand_name": "string",
  "tone_and_style": "string",
  "format_or_platform": "string",
  "desired_length": "string",
  "show_face": "boolean",
  "cta": "string",
  "video_type": "string",
  "key_points": ["string"],
  "constraints": ["string"],
  "problem": "string",
  "core_interaction_steps": ["string"]
}
```

**User Actions**:
- Review AI-generated brief
- Edit any fields
- Approve to continue or regenerate with feedback

**UI Components**:
- `BriefBuilder/UserView/RequiredFieldsForm.tsx`
- `BriefBuilder/UserView/OptionalQuestionsForm.tsx`
- `BriefBuilder/ProcessingView/ProcessingView.tsx`
- `BriefBuilder/OutputView/OutputView.tsx`

---

#### Stage 2: Video Outline

**Purpose**: Define the structure and flow of screens/scenes

**Inputs**:
- Approved Story Brief from Stage 1

**AI Output** (Screen Outline):
```json
[
  {
    "screen_number": 1,
    "screen_name": "string",
    "screen_type": "Hook | Setup | Demo | etc",
    "voiceover_text": "string",
    "visual_direction": "string",
    "estimated_duration_seconds": 10
  }
]
```

**User Actions**:
- Review screen structure
- Reorder, add, or remove screens
- Edit individual screen content
- Approve to continue or regenerate

**UI Components**:
- `OutlineBuilder/UserView/ScreenCard.tsx`
- `OutlineBuilder/ProcessingView/ProcessingView.tsx`
- `OutlineBuilder/OutputView/OutputView.tsx`

---

#### Stage 3: Storyboard Draft

**Purpose**: Generate full storyboard panels with scripts, visuals, and timing

**Inputs**:
- Approved Story Brief
- Approved Screen Outline

**AI Output** (Full Storyboard):
```json
[
  {
    "panel_number": 1,
    "screen_name": "string",
    "voiceover_script": "string",
    "on_screen_text": "string",
    "visual_description": "string",
    "image_prompt": "string",
    "image_url": "string (auto-fetched)",
    "target_duration_sec": 10,
    "notes": "string"
  }
]
```

**User Actions**:
- Review each panel in detail
- Edit scripts, visuals, timing
- Replace auto-fetched images
- Approve to continue or regenerate

**UI Components**:
- `DraftBuilder/UserView/PanelCard.tsx`
- `DraftBuilder/ProcessingView/ProcessingView.tsx`
- `DraftBuilder/OutputView/OutputView.tsx`

---

#### Stage 4: Review and Share

**Purpose**: Final review, polish, and export

**Inputs**:
- Complete storyboard from Stage 3

**User Actions**:
- Final polish and adjustments
- Export as PDF (future)
- Share with team (future)
- Mark as complete

**UI Components**:
- `ReviewBuilder/ReviewCard.tsx`
- `ReviewBuilder/UserView.tsx`
- `ReviewBuilder/OutputView/OutputView.tsx`

---

## 5. Feature Inventory

### 5.1 Implemented Features

| Feature | Status | Notes |
|---------|--------|-------|
| Landing page with value proposition | ✅ Implemented | `LandingPage.tsx` |
| Clerk authentication | ✅ Implemented | Sign up/in flow |
| Projects dashboard | ✅ Implemented | List, create, load projects |
| 3 video type selection | ✅ Implemented | Product, How-to, Knowledge |
| Natural language project description | ✅ Implemented | Freeform text input |
| Reference material upload | ✅ Implemented | Files, links, text |
| 4-stage progressive workflow | ✅ Implemented | With state persistence |
| AI generation per stage | ✅ Implemented | Via orchestrator |
| Human review & approval | ✅ Implemented | Gating between stages |
| Inline editing of AI content | ✅ Implemented | All fields editable |
| Regeneration with feedback | ✅ Implemented | Pass feedback to AI |
| Auto-image fetching | ✅ Implemented | Google Custom Search |
| Stage progress persistence | ✅ Implemented | Auto-save with debounce |
| Go-back to previous stages | ✅ Implemented | State unlocking |
| Satisfaction rating modal | ✅ Implemented | 1-5 stars + text |
| Dark/light theme toggle | ✅ Implemented | System preference detection |
| Mobile-responsive layout | ✅ Implemented | Collapsible sidebar |

### 5.2 Planned Features

| Feature | Priority | Notes |
|---------|----------|-------|
| PDF export | HIGH | Export final storyboard as PDF |
| Team sharing | HIGH | Invite team members to view/edit |
| Version history | MEDIUM | Track revisions over time |
| Template library | MEDIUM | Start from proven structures |
| Duplicate project | LOW | Clone existing project |
| Project folders | LOW | Organize projects into folders |
| Comments & annotations | LOW | Add notes for collaborators |

---

## 6. Data Models

### 6.1 Project

```typescript
interface Project {
  id: string;                    // Unique project ID (timestamp-based)
  userId: string;                // Clerk user ID
  typeName: string;              // "Product Release" | "How-to Video" | "Knowledge Sharing"
  userInput: string;             // Original user description
  sourceContext?: string;        // Reference materials (combined)
  createdAt: Date;
  updatedAt: Date;
}
```

### 6.2 Stage Data

```typescript
interface StageData {
  aiVersion: string | null;      // AI-generated content (JSON string)
  humanVersion: string | null;   // User-edited content (JSON string)
  contextPack?: Record<string, unknown>;  // Research context
}

interface StageState {
  stages: Record<number, StageData>;  // 1-4
  currentStageId: number;
  stageStatuses: Array<{
    id: number;
    status: "not_started" | "in_progress" | "needs_review" | "approved";
  }>;
}
```

### 6.3 Storage Structure

```
data/
└── project_{id}/
    ├── project.json          # Project metadata
    ├── stages.json           # Stage data and states
    ├── analytics.json        # Per-project analytics
    └── chat_history.json     # AI assistant chat (if used)
```

---

## 7. API Endpoints

### 7.1 Project Management

```
POST /api/create-project
  Body: { user_input, type_name, user_id }
  Returns: { success, project_id }

GET /api/project/{project_id}
  Returns: { success, project: {...} }

GET /api/projects?user_id={user_id}
  Returns: { success, projects: [...] }
```

### 7.2 Stage Operations

```
POST /api/project/{project_id}/stage/{stage}/run
  Body: { user_input, previous_stages, feedback?, user_id, video_type }
  Returns: { ai_content, sources, context_pack }

POST /api/project/{project_id}/stage/{stage}/approve
  Body: { stage, content, user_id }
  Returns: { success }

POST /api/project/{project_id}/stage/{stage}/edit
  Body: { stage, content }
  Returns: { success }

GET /api/project/{project_id}/stages
  Returns: { stages, currentStageId, stageStatuses }

POST /api/project/{project_id}/stages
  Body: { stages, currentStageId, stageStatuses }
  Returns: { success }
```

---

## 8. Key Metrics

### 8.1 Funnel Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Landing → Sign Up** | % of visitors who create account | 15% |
| **Sign Up → First Project** | % of new users who start a project | 80% |
| **Stage 1 → Stage 2** | % who complete video briefing | 85% |
| **Stage 2 → Stage 3** | % who complete video outline | 80% |
| **Stage 3 → Stage 4** | % who complete storyboard draft | 90% |
| **Stage 4 → Complete** | % who finish review | 95% |
| **Overall Completion Rate** | % of started projects reaching done | 60% |

### 8.2 Engagement Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Time to First Storyboard** | Time from signup to first completed project | < 5 min |
| **Edits per Stage** | Average number of field edits per stage | < 3 |
| **Regenerations per Stage** | Average regeneration requests per stage | < 1 |
| **Return User Rate** | % creating 2+ projects within 30 days | 40% |
| **Session Duration** | Average time per session | 10-15 min |

### 8.3 Satisfaction Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Average Rating** | Mean satisfaction rating (1-5) | 4.2+ |
| **NPS** | Net Promoter Score | 50+ |
| **Completion Satisfaction** | Rating from users who complete | 4.5+ |

---

## 9. UX Requirements

### 9.1 Design Principles

1. **Progressive Disclosure**: Only show what's needed at each stage
2. **AI as Partner**: Frame AI as helpful collaborator, not replacement
3. **Easy Editing**: Every AI output must be editable with minimal friction
4. **Clear Progress**: Always show where user is in the journey
5. **Quick Recovery**: Allow going back without losing work

### 9.2 Key Interactions

**Stage Transitions**:
- Approving a stage triggers next stage generation automatically
- Visual feedback during AI generation (loading state, progress)
- Clear success/error messaging

**Editing**:
- Inline editing for all text fields
- Drag-and-drop reordering for lists
- One-click regeneration with optional feedback

**Navigation**:
- Left sidebar shows all 4 stages with status
- Click any previous stage to review (read-only until unlock)
- "Go Back" action unlocks previous stage for re-editing

### 9.3 Responsive Design

- **Desktop**: Full sidebar + main content layout
- **Tablet**: Collapsible sidebar
- **Mobile**: Hamburger menu with slide-in navigation

---

## 10. Dependencies on Other Domains

### 10.1 AI/Prompts Domain

- **Brief Builder Agent**: Generates Story Brief from user input
- **Storyboard Director Agent**: Creates Screen Outline from Brief
- **Storyboard Writer Agent**: Produces full storyboard from Outline
- **Topic Researcher Agent**: Provides context for all stages
- **Image Researcher Agent**: Fetches relevant images

**Handoff**: Core Creation calls agents via Orchestrator; AI/Prompts owns quality

### 10.2 Analytics Domain

- **Data Collection**: Core Creation sends events to Analytics
- **Metrics Display**: Analytics Dashboard surfaces insights back

**Handoff**: Core Creation tracks events; Analytics aggregates and displays

### 10.3 Enterprise Context Domain (Future)

- **Context Injection**: When available, persistent context feeds into Brief Builder
- **Priority**: Lower priority until enterprise customers onboard

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AI generation too slow | High drop-off | Streaming, progress indicators, latency optimization |
| Users don't understand stages | Confusion | Clearer stage descriptions, tooltips, tutorial |
| Too much editing needed | Frustration | Improve prompts, track edit patterns, A/B test |
| Mobile experience poor | Lost users | Prioritize mobile testing, responsive components |
| Data loss on refresh | Trust erosion | Auto-save, conflict resolution, offline support |

---

## 12. Phase Breakdown

### Phase 1: Core Flow (Complete)
- 4-stage workflow ✅
- AI generation & editing ✅
- Project persistence ✅
- Satisfaction tracking ✅

### Phase 2: Polish & Growth (Current)
- PDF export (in progress)
- Team sharing (planned)
- Onboarding improvements (planned)
- Mobile optimization (planned)

### Phase 3: Retention & Scale
- Version history
- Template library
- Project organization
- Collaboration features

---

## 13. Success Verification

After implementing changes:

- [ ] New user can complete a storyboard in < 5 minutes
- [ ] Completion rate is tracked and visible in Analytics
- [ ] All 4 stages function with proper state management
- [ ] Going back and forth between stages works without data loss
- [ ] Satisfaction rating is collected at completion
- [ ] Mobile users can complete the full flow

---

## Appendix A: Component Architecture

```
frontend/src/
├── components/
│   ├── LandingPage.tsx           # Entry point
│   ├── ProjectsPage.tsx          # Dashboard
│   ├── OnboardingPage.tsx        # Project creation
│   ├── StageLayout.tsx           # Main workflow container
│   ├── StageNavigation.tsx       # Left sidebar
│   ├── StageContent.tsx          # Stage router
│   ├── BriefBuilder/             # Stage 1
│   │   ├── BriefBuilder.tsx
│   │   ├── TabToggle.tsx
│   │   ├── InputView/
│   │   ├── UserView/
│   │   ├── ProcessingView/
│   │   └── OutputView/
│   ├── OutlineBuilder/           # Stage 2
│   │   ├── OutlineBuilder.tsx
│   │   ├── TabToggle.tsx
│   │   ├── InputView/
│   │   ├── UserView/
│   │   ├── ProcessingView/
│   │   └── OutputView/
│   ├── DraftBuilder/             # Stage 3
│   │   ├── DraftBuilder.tsx
│   │   ├── TabToggle.tsx
│   │   ├── InputView/
│   │   ├── UserView/
│   │   ├── ProcessingView/
│   │   └── OutputView/
│   ├── ReviewBuilder/            # Stage 4
│   │   ├── ReviewBuilder.tsx
│   │   ├── TabToggle.tsx
│   │   ├── UserView.tsx
│   │   ├── InputView/
│   │   ├── ProcessingView/
│   │   └── OutputView/
│   └── SatisfactionRatingModal.tsx
├── hooks/
│   └── useAnalytics.ts           # Analytics hook
└── App.tsx                       # Router setup
```

---

## Appendix B: State Machine

```
┌─────────────────────────────────────────────────────────────────┐
│                      STAGE STATE MACHINE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   not_started ───[generate]───▶ in_progress                     │
│        │                             │                          │
│        │                             │                          │
│        │                      [generation complete]              │
│        │                             │                          │
│        │                             ▼                          │
│        │                       needs_review                     │
│        │                        │        │                      │
│        │               [approve]│        │[regenerate]          │
│        │                        │        │                      │
│        │                        ▼        ▼                      │
│        │                    approved  in_progress               │
│        │                        │        │                      │
│        │                        │        └──────────────┐       │
│        │                        │                       │       │
│        │                   [trigger next]          [complete]   │
│        │                        │                       │       │
│        │                        ▼                       │       │
│        └──────────────▶   (next stage)                  │       │
│                                                         │       │
│                               ...                       │       │
│                                                         │       │
│                         [all stages approved]           │       │
│                                │                        │       │
│                                ▼                        │       │
│                            complete                     │       │
│                                │                        │       │
│                         [show rating modal]             │       │
│                                │                        │       │
│                                ▼                        │       │
│                            dashboard                    │       │
│                                                         │       │
└─────────────────────────────────────────────────────────────────┘
```
