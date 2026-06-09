# PM Domain Ownership Matrix

**Product**: Plotline
**Last Updated**: January 2026
**Purpose**: Define PM ownership boundaries across product domains

---

## Domain Overview

Plotline is divided into **4 PM ownership domains**:

| # | Domain | PRD Location | Priority | Status |
|---|--------|--------------|----------|--------|
| 1 | Core Creation + Growth | `core-creation-prd.md` | HIGH - MVP | Active |
| 2 | AI/Prompts Quality | `ai-prompts-prd.md` | HIGH | Active |
| 3 | Analytics & Insights | `analytics-dashboard-prd.md` | MEDIUM | Complete |
| 4 | Enterprise Context | `enterprise-context-prd.md` | LOW (future) | Planned |

---

## Domain Ownership Matrix

```
┌────────────────────────────────────────────────────────────────────────────┐
│                         PM OWNERSHIP MATRIX                                 │
├─────────────────────────┬───────────────┬───────────────┬─────────────────┤
│   Domain                │ User Facing?  │  Priority     │  PRD Status     │
├─────────────────────────┼───────────────┼───────────────┼─────────────────┤
│ Core Creation + Growth  │  Yes          │  HIGH - MVP   │  ✅ Complete    │
│ AI/Prompts              │  Indirect     │  HIGH         │  ✅ Complete    │
│ Analytics               │  Internal     │  MEDIUM       │  ✅ Complete    │
│ Enterprise Context      │  Yes (B2B)    │  LOW (future) │  ✅ Complete    │
└─────────────────────────┴───────────────┴───────────────┴─────────────────┘
```

---

## Domain Responsibilities

### 1. Core Creation + Growth
**Owner**: Core Product Team
**Scope**: Full user-facing experience from landing to export

**Components**:
- Landing page & authentication
- Onboarding & project creation
- Projects dashboard
- 4-stage workflow (Brief → Outline → Draft → Review)
- Stage navigation & layout
- Satisfaction rating

**Key Metrics**:
- Completion rate
- Time-to-first-storyboard
- Return user rate
- Drop-off by stage

---

### 2. AI/Prompts Quality
**Owner**: AI/Prompt Engineering Team
**Scope**: Research agents, prompt quality, generation accuracy

**Components**:
- Topic Researcher agent
- Brief Builder agent
- Storyboard Director agent
- Storyboard Writer agent
- Image Researcher agent
- Duration Calculator agent
- Prompt files (`/prompts/*.md`)
- Edit tracking integration

**Key Metrics**:
- Field edit rates
- Regeneration frequency
- Generation time (TTFT, total)
- Quality score (from ratings)

---

### 3. Analytics & Insights
**Owner**: Product Analytics Team
**Scope**: Admin dashboard for monitoring and prompt improvement

**Components**:
- Analytics service (`analytics.py`)
- Admin Dashboard UI (`AdminDashboard.tsx`)
- Performance metrics
- Field edit patterns
- Satisfaction tracking
- User growth tracking

**Key Metrics**:
- Dashboard usage (weekly active admins)
- Insights → action rate
- Dashboard load time

---

### 4. Enterprise Context Layer
**Owner**: Enterprise Product Team
**Scope**: Persistent company/campaign context for enterprise customers

**Components** (Future):
- Company Context data model
- Campaign Context data model
- Document upload & extraction
- Guided interview onboarding
- Team/organization management
- SSO integration

**Key Metrics**:
- Context setup rate
- Research skip rate
- Voice consistency score

---

## Interaction Diagram

```
    ┌──────────────────────────────────┐
    │   Core Creation + Growth          │
    │   (User-facing journey)           │
    └────────────────┬─────────────────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
         ▼           ▼           ▼
   ┌───────────┐ ┌─────────┐ ┌────────────────┐
   │ AI/Prompts│ │Analytics│ │ Enterprise     │
   │ (Quality) │ │(Insights)│ │ Context (B2B) │
   └─────┬─────┘ └────┬────┘ └────────────────┘
         │            │
         └─────┬──────┘
               │
          ┌────▼────┐
          │ Feedback│
          │  Loop   │
          └─────────┘
```

**Key Flows**:
1. **Core → Analytics**: User behavior data flows automatically
2. **Analytics → AI/Prompts**: Edit patterns inform prompt improvements
3. **AI/Prompts → Core**: Better prompts = fewer edits = higher completion
4. **Core → Enterprise**: Context persistence for multi-video consistency

---

## Handoff Points

| From | To | Trigger | Data Passed |
|------|-----|---------|-------------|
| Core | AI/Prompts | Stage generation | User input, previous stages, feedback |
| AI/Prompts | Core | Generation complete | AI content, timing metrics, sources |
| Core | Analytics | Stage events | Edits, regenerations, approvals, ratings |
| Analytics | AI/Prompts | Weekly review | Edit patterns, sample pairs |
| Enterprise | AI/Prompts | Context available | Company/Campaign context |

---

## Scaling Scenarios

### 1-PM Stage (Now → Product-Market Fit)
Single PM owns everything, with focus on:
- **Primary**: Core Creation + Growth (user-facing)
- **Secondary**: AI/Prompts (quality)
- **Tool**: Analytics (not separate ownership)

### 2-PM Stage (Post-PMF)
Split into:
- **PM A**: Core Creation + Growth (user journey, conversion)
- **PM B**: AI/Prompts + Analytics (quality, insights, internal tools)

### 3-PM Stage (Enterprise)
Add:
- **PM C**: Enterprise Context + Platform (B2B, teams, context management)

---

## Feature Ownership Verification

### Core Creation + Growth Features
| Feature | Implemented | Documented |
|---------|-------------|------------|
| Landing page | ✅ | ✅ |
| Authentication (Clerk) | ✅ | ✅ |
| Projects dashboard | ✅ | ✅ |
| Onboarding flow | ✅ | ✅ |
| 4-stage workflow | ✅ | ✅ |
| Stage navigation | ✅ | ✅ |
| AI generation per stage | ✅ | ✅ |
| Inline editing | ✅ | ✅ |
| Regeneration with feedback | ✅ | ✅ |
| Auto-save | ✅ | ✅ |
| Satisfaction rating | ✅ | ✅ |

### AI/Prompts Features
| Feature | Implemented | Documented |
|---------|-------------|------------|
| Topic Researcher | ✅ | ✅ |
| Brief Builder | ✅ | ✅ |
| Storyboard Director | ✅ | ✅ |
| Storyboard Writer | ✅ | ✅ |
| Image Researcher | ✅ | ✅ |
| Duration Calculator | ✅ | ✅ |
| Base Agent class | ✅ | ✅ |
| Prompt loading | ✅ | ✅ |
| Timing metrics | ✅ | ✅ |
| Modular Research Agents | ❌ Planned | ✅ |
| Conversational Brief | ❌ Planned | ✅ |

### Analytics Features
| Feature | Implemented | Documented |
|---------|-------------|------------|
| Performance metrics | ✅ | ✅ |
| Field edit tracking | ✅ | ✅ |
| User behavior metrics | ✅ | ✅ |
| Session metrics | ✅ | ✅ |
| Satisfaction ratings | ✅ | ✅ |
| Dashboard aggregation | ✅ | ✅ |
| Admin Dashboard UI | ✅ | ✅ |

### Enterprise Context Features
| Feature | Implemented | Documented |
|---------|-------------|------------|
| Company Context model | ❌ Planned | ✅ |
| Campaign Context model | ❌ Planned | ✅ |
| Document upload | ❌ Planned | ✅ |
| Guided interview | ❌ Planned | ✅ |
| Context resolution | ❌ Planned | ✅ |
| Team management | ❌ Planned | ✅ |
| SSO integration | ❌ Planned | ✅ |

---

## PRD Links

1. **Core Creation + Growth**: [core-creation-prd.md](./core-creation-prd.md)
2. **AI/Prompts Quality**: [ai-prompts-prd.md](./ai-prompts-prd.md)
3. **Analytics Dashboard**: [analytics-dashboard-prd.md](./analytics-dashboard-prd.md)
4. **Enterprise Context**: [enterprise-context-prd.md](./enterprise-context-prd.md)

---

## Verification Checklist

- [x] Each PRD reflects actual codebase state
- [x] Each PRD has clear metrics section (3-5 KPIs)
- [x] Dependencies between domains documented
- [x] No orphaned features (everything belongs to a domain)
- [x] Handoff points defined between domains
- [x] Scaling scenarios documented
