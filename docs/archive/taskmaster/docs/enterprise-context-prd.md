# Enterprise Context Layer PRD

**Product**: Plotline Enterprise - Persistent Context Layer
**Version**: 1.0
**Last Updated**: January 2026
**Owner**: Enterprise Product Team
**Domain**: Enterprise Context Layer
**Priority**: LOW (Future - post-PMF)

---

## 1. Overview & Vision

### 1.1 Purpose

The Enterprise Context Layer enables **persistent company and campaign context** that carries across multiple video projects. This eliminates redundant research, ensures brand consistency, and unlocks enterprise-scale video production.

### 1.2 Vision Statement

> Companies create their context once, then generate unlimited on-brand videos with minimal setup - every video knows who they are, how they sound, and what they sell.

### 1.3 Why This Matters

**Current State (Single-User Mode)**:
- Fresh research for every video
- User re-enters company info each time
- Tone/voice can drift between videos
- No multi-user support

**Future State (Enterprise Mode)**:
- Company context entered once, used forever
- Research only fills gaps, not full context
- Brand voice enforced automatically
- Teams collaborate on shared context

### 1.4 When to Build This

Build this feature when:
- Signing enterprise customers who need multi-video consistency
- Expanding to other modalities (learning paths, content strategy)
- User feedback indicates repetitive context entry is painful
- Product-market fit achieved for core creation flow

---

## 2. User Personas

### 2.1 Enterprise Marketing Director

**Name**: Victoria
**Role**: Marketing Director at a 500-person B2B SaaS company
**Goals**:
- Maintain consistent brand voice across all video content
- Enable team to create videos without brand training
- Scale video production 10x without proportional headcount

**Pain Points**:
- Every video feels slightly different in tone
- New team members struggle with brand guidelines
- Agencies often miss brand nuances

**Usage Pattern**: Sets up company context once, reviews 5-10 videos/week created by team

### 2.2 Video Production Coordinator

**Name**: Marcus
**Role**: Video Production Coordinator (reports to Victoria)
**Goals**:
- Create on-brand videos quickly
- Access pre-approved talking points and product info
- Focus on creativity, not research

**Pain Points**:
- Constantly looking up product details
- Unsure if tone matches brand guidelines
- Re-entering same info for every video

**Usage Pattern**: Creates 3-5 videos/week using team's shared context

### 2.3 IT Administrator

**Name**: Taylor
**Role**: IT Admin / SaaS Administrator
**Goals**:
- Manage team access and permissions
- Integrate with SSO/identity systems
- Ensure data security and compliance

**Pain Points**:
- Another SaaS to manage
- User provisioning/deprovisioning
- Data export for compliance

**Usage Pattern**: Manages users monthly, exports data quarterly

---

## 3. Context Hierarchy

### 3.1 Three-Layer Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CONTEXT HIERARCHY                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 1: Company Context (Persistent, Organization-Wide)               │ │
│  │                                                                         │ │
│  │  • Brand voice & guidelines                                             │ │
│  │  • Company background & positioning                                     │ │
│  │  • Target audience personas                                             │ │
│  │  • Product catalog & details                                            │ │
│  │  • Visual style guidelines                                              │ │
│  │                                                                         │ │
│  │  Owner: Marketing Director / Brand Manager                              │ │
│  │  Updated: Quarterly or less                                             │ │
│  └───────────────────────────────────┬─────────────────────────────────────┘ │
│                                      │                                       │
│                                      │ Inherits                              │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 2: Campaign Context (Per-Campaign, Team-Scoped)                  │ │
│  │                                                                         │ │
│  │  • Campaign goals & messaging pillars                                   │ │
│  │  • Specific product focus                                               │ │
│  │  • Target segment for this campaign                                     │ │
│  │  • Campaign-specific constraints                                        │ │
│  │  • Seasonal/promotional messaging                                       │ │
│  │                                                                         │ │
│  │  Owner: Campaign Manager / Product Marketing                            │ │
│  │  Updated: Per campaign (monthly)                                        │ │
│  └───────────────────────────────────┬─────────────────────────────────────┘ │
│                                      │                                       │
│                                      │ Inherits + Overrides                  │
│                                      ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  LAYER 3: Per-Video Research (Generated, Project-Scoped)                │ │
│  │                                                                         │ │
│  │  • Topic-specific facts & terminology                                   │ │
│  │  • Supporting evidence & sources                                        │ │
│  │  • Gap-filling for brief fields                                         │ │
│  │  • Current state (what exists today)                                    │ │
│  │                                                                         │ │
│  │  Owner: Individual Creator / AI Agents                                  │ │
│  │  Updated: Per video (always fresh)                                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Context Resolution Logic

When generating a Context Pack:

```
1. Check if Company Context exists
   → If yes: Use as base layer
   → If no: Full research mode (current behavior)

2. Check if Campaign Context exists for this project
   → If yes: Layer on top of Company Context
   → If no: Use Company Context alone

3. Run research agents ONLY for gaps not covered by persistent context
   → Skip agents for known information
   → Focus research on topic-specific details

4. Merge all layers into final Context Pack
   → Company < Campaign < Research (later overrides earlier)
   → Flag conflicts for user review
```

---

## 4. Data Models

### 4.1 Company Context

```typescript
interface CompanyContext {
  id: string;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string;  // User ID

  // Core Identity
  company_name: string;
  tagline?: string;
  mission_statement?: string;
  founding_year?: number;
  headquarters?: string;
  company_size?: "startup" | "smb" | "enterprise";

  // Brand Voice
  brand_voice: {
    tone: string[];           // ["professional", "friendly", "authoritative"]
    vocabulary: string[];     // ["innovative", "customer-first", "scalable"]
    avoid: string[];          // ["disruptive", "synergy", "leverage"]
    writing_style: string;    // "Concise sentences. Active voice. No jargon."
  };

  // Visual Guidelines
  visual_style?: {
    primary_colors: string[];
    secondary_colors: string[];
    font_preferences: string[];
    imagery_style: string;    // "Diverse people in modern workspaces"
    logo_url?: string;
  };

  // Products & Services
  products: ProductContext[];

  // Audiences
  audiences: AudiencePersona[];

  // Competitive Positioning
  positioning?: {
    competitors: string[];
    differentiators: string[];
    avoid_comparisons: string[];
  };
}

interface ProductContext {
  id: string;
  name: string;
  category: string;
  description: string;
  key_features: string[];
  target_segments: string[];
  pricing_model?: string;
  launch_date?: Date;
}

interface AudiencePersona {
  id: string;
  name: string;                    // "Enterprise IT Director"
  description: string;
  demographics?: {
    job_titles: string[];
    industries: string[];
    company_sizes: string[];
  };
  pain_points: string[];
  goals: string[];
  objections?: string[];
  preferred_content_style?: string;
}
```

### 4.2 Campaign Context

```typescript
interface CampaignContext {
  id: string;
  company_id: string;
  organization_id: string;
  created_at: Date;
  updated_at: Date;
  created_by: string;

  // Campaign Identity
  name: string;
  status: "draft" | "active" | "paused" | "completed";
  start_date?: Date;
  end_date?: Date;

  // Messaging
  goals: string[];                  // ["Increase demo requests by 20%"]
  messaging_pillars: string[];      // ["Speed", "Simplicity", "Security"]
  key_messages: string[];           // Approved talking points
  cta_options: string[];            // Pre-approved CTAs

  // Focus
  product_focus?: string;           // Product ID to emphasize
  target_segment?: string;          // Persona ID to target

  // Constraints
  constraints?: string[];           // ["Don't mention competitor X"]
  compliance_notes?: string[];      // ["Include disclaimer for claims"]

  // Assets
  approved_assets?: {
    images: string[];
    videos: string[];
    documents: string[];
  };
}
```

### 4.3 Context Pack (Enhanced)

```typescript
interface ContextPack {
  // Source tracking
  context_source: "researched" | "user_provided" | "hybrid";
  company_context_id?: string;
  campaign_context_id?: string;

  // Merged context (same structure as today)
  company: {...};
  product: {...};
  audience: {...};
  market: {...};

  // Layer attribution
  layer_sources: {
    [field: string]: {
      layer: "company" | "campaign" | "research";
      confidence: "high" | "medium" | "low";
    };
  };

  // Research-only additions
  research_additions: {
    [field: string]: any;
  };

  sources: Source[];
}
```

---

## 5. Onboarding Flows

### 5.1 Option A: Upload Brand Documents

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BRAND DOCUMENT UPLOAD FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Step 1: Upload                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │   "Upload your brand guidelines, style guide, or any documents          │ │
│  │    that describe your company and how you communicate."                 │ │
│  │                                                                         │ │
│  │   ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │   │                                                                 │   │ │
│  │   │    📄 Drag files here or click to upload                       │   │ │
│  │   │                                                                 │   │ │
│  │   │    Supported: PDF, Word, PowerPoint, Google Docs               │   │ │
│  │   │                                                                 │   │ │
│  │   └─────────────────────────────────────────────────────────────────┘   │ │
│  │                                                                         │ │
│  │   [Upload] or [Skip to guided setup]                                   │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│  Step 2: AI Extraction                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │   "I found the following in your documents. Please review:"             │ │
│  │                                                                         │ │
│  │   Company Name: [Acme Corp] ✅                                          │ │
│  │   Tagline: [We make widgets better] ⚠️ Edit                            │ │
│  │   Mission: [Extracted mission statement...] ✅                          │ │
│  │   Brand Voice: [Professional, innovative] ❌ Add more                   │ │
│  │   Products: [Widget Pro, Widget Enterprise] ✅                          │ │
│  │                                                                         │ │
│  │   [Confirm & Continue] [Edit All]                                      │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                      │                                       │
│                                      ▼                                       │
│  Step 3: Fill Gaps                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │   "A few things I couldn't find in your documents:"                     │ │
│  │                                                                         │ │
│  │   🔍 Words to avoid in your content:                                    │ │
│  │   [Text input field]                                                    │ │
│  │                                                                         │ │
│  │   🔍 Your main competitors (so we don't accidentally mention them):     │ │
│  │   [Text input field]                                                    │ │
│  │                                                                         │ │
│  │   [Complete Setup]                                                      │ │
│  │                                                                         │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Option B: Guided Interview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GUIDED INTERVIEW FLOW                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Conversational flow (5-7 turns):                                           │
│                                                                              │
│  Turn 1: Company Basics                                                     │
│  "Let's set up your company profile. First, tell me about your company.    │
│   What does Acme Corp do, and who do you serve?"                           │
│                                                                              │
│  Turn 2: Products/Services                                                  │
│  "Got it! Now, what products or services do you want to feature in your    │
│   videos? Tell me about your key offerings."                               │
│                                                                              │
│  Turn 3: Audience                                                           │
│  "Who's watching your videos? Describe your ideal viewer - their role,     │
│   challenges, and what they care about."                                   │
│                                                                              │
│  Turn 4: Brand Voice                                                        │
│  "How do you want to sound? Give me 3-5 words that describe your brand     │
│   voice. (e.g., professional, friendly, bold, technical)"                  │
│                                                                              │
│  Turn 5: Constraints                                                        │
│  "Any competitors or terms we should never mention? Any compliance          │
│   requirements I should know about?"                                       │
│                                                                              │
│  Turn 6: Review & Confirm                                                   │
│  "Here's your company profile. Everything look right?"                     │
│  [Show structured summary for review]                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Option C: Skip for Now

```
User chooses to skip → Full research mode (current behavior)

Show reminder after 3rd video:
"You've created 3 videos! Save time by setting up your company profile.
 [Set Up Now] [Remind Me Later] [Don't Show Again]"
```

---

## 6. Team & Access Control

### 6.1 Roles

| Role | Company Context | Campaign Context | Videos |
|------|-----------------|------------------|--------|
| **Admin** | Create, Edit, Delete | Create, Edit, Delete | Create, Edit, Delete |
| **Manager** | View | Create, Edit, Delete | Create, Edit, Delete |
| **Creator** | View | View | Create, Edit |
| **Viewer** | View | View | View |

### 6.2 Organization Model

```typescript
interface Organization {
  id: string;
  name: string;
  created_at: Date;
  plan: "free" | "team" | "enterprise";

  // SSO (Enterprise only)
  sso_enabled: boolean;
  sso_provider?: "okta" | "azure_ad" | "google";
  sso_config?: SSOConfig;

  // Limits
  max_users: number;
  max_campaigns: number;
  max_videos_per_month: number;
}

interface OrganizationMember {
  user_id: string;
  organization_id: string;
  role: "admin" | "manager" | "creator" | "viewer";
  invited_by: string;
  joined_at: Date;
}
```

---

## 7. Migration Path

### 7.1 Data Compatibility

Current Context Pack output already includes:
```json
{
  "context_source": "researched"
}
```

Future states:
- `"context_source": "user_provided"` - From persistent context
- `"context_source": "hybrid"` - Mix of persistent + researched

**Key Principle**: Downstream agents (Brief Builder, Storyboard Director) consume Context Pack regardless of source - no changes needed.

### 7.2 User Migration

```
Existing Users (Single-User Mode):
├── Continue working as today
├── See prompt: "Set up company profile to save time"
├── If they set up: Future videos use persistent context
└── If they skip: Research mode continues

New Users (After Feature Launch):
├── Onboarding offers: Upload docs / Guided interview / Skip
├── Team users: Invited to existing organization
└── Enterprise: SSO provisioning
```

### 7.3 API Compatibility

```
# Current API (continues to work)
POST /api/project/{id}/stage/brief/run
  → Uses research-only Context Pack

# New API (added)
GET /api/organization/{org_id}/context
POST /api/organization/{org_id}/context
PUT /api/organization/{org_id}/context

GET /api/campaign/{campaign_id}
POST /api/campaign
PUT /api/campaign/{campaign_id}

# Enhanced stage API (optional parameter)
POST /api/project/{id}/stage/brief/run
  Body: { ..., campaign_id?: string }
  → Uses Company + Campaign + Research Context Pack
```

---

## 8. Key Metrics

### 8.1 Adoption Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Context Setup Rate** | % of users who set up company context | 30% of active users |
| **Campaign Usage Rate** | % of videos using a campaign context | 50% of enterprise videos |
| **Context Reuse Rate** | Avg videos per company context | 10+ videos/context |

### 8.2 Efficiency Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Research Skip Rate** | % of research agents skipped due to context | 60%+ for enterprise |
| **Brief Time Reduction** | Time saved in brief generation | 40% faster |
| **Edit Rate Reduction** | Fewer edits when using context | 30% fewer edits |

### 8.3 Consistency Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **Voice Consistency Score** | AI-measured tone consistency across videos | 90%+ similarity |
| **Brand Compliance Rate** | % of videos passing brand check | 95%+ |

---

## 9. Dependencies

### 9.1 Prerequisites

- [ ] Database schema for Company/Campaign contexts
- [ ] File upload + extraction pipeline (for brand docs)
- [ ] Onboarding UI flow
- [ ] Context resolution logic in Brief Builder
- [ ] Admin UI for users to edit persistent context

### 9.2 From Other Domains

**From Core Creation**:
- Campaign selection during project creation
- Context display in Brief Builder

**From AI/Prompts**:
- Router modification to skip redundant agents
- Assembler modification to merge context layers

**From Analytics**:
- Context usage tracking
- Voice consistency measurement

---

## 10. Implementation Phases

### Phase 1: Foundation (2-3 weeks)

- [ ] Database schema for Company Context
- [ ] Basic CRUD API for Company Context
- [ ] Context resolution logic (Company → Research merge)
- [ ] Admin UI: View/Edit Company Context

### Phase 2: Onboarding (2-3 weeks)

- [ ] Document upload + AI extraction
- [ ] Guided interview flow
- [ ] Skip + reminder logic
- [ ] Context preview in Brief Builder

### Phase 3: Campaigns (2-3 weeks)

- [ ] Database schema for Campaign Context
- [ ] Campaign CRUD API
- [ ] Campaign selection in project creation
- [ ] Three-layer context resolution

### Phase 4: Teams (3-4 weeks)

- [ ] Organization model
- [ ] Role-based access control
- [ ] User invitation flow
- [ ] Organization settings UI

### Phase 5: Enterprise (4-6 weeks)

- [ ] SSO integration (Okta, Azure AD)
- [ ] SCIM provisioning
- [ ] Audit logging
- [ ] Data export/compliance

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context gets stale | Outdated videos | Prompt periodic review, show "last updated" |
| Complex onboarding | Low adoption | Offer skip option, async document processing |
| Permission confusion | Wrong access | Clear role UI, audit logs, manager approvals |
| SSO integration delays | Enterprise sales blocked | Start SSO early, use proven libraries |
| Context conflicts | Confusing output | Clear layer attribution, highlight overrides |

---

## 12. Success Verification

After implementing:

- [ ] User can set up company context via upload or interview
- [ ] Videos created use persistent context (reduced research)
- [ ] Campaign context layers on top of company context
- [ ] Team members can access shared context
- [ ] Admin can manage roles and permissions
- [ ] Voice consistency improves across videos

---

## Appendix A: Context UI Wireframes

### Company Context Editor

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Company Context                                                [Save]      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Basics                                                                      │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Company Name:     [Acme Corp                          ]                    │
│  Tagline:          [We make widgets better             ]                    │
│  Industry:         [B2B SaaS ▼]                                             │
│                                                                              │
│  Brand Voice                                                                │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Tone:             [Professional] [Friendly] [+ Add]                        │
│  Words to Avoid:   [Synergy] [Disruptive] [+ Add]                          │
│  Writing Style:    [Concise. Active voice. No jargon.  ]                   │
│                                                                              │
│  Products                                                         [+ Add]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Widget Pro                                                    [Edit] [×]│ │
│  │ Our flagship widget management platform for enterprises                 │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Widget Lite                                                   [Edit] [×]│ │
│  │ Free widget organizer for individuals and small teams                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Audiences                                                        [+ Add]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │ Enterprise IT Director                                        [Edit] [×]│ │
│  │ CTO/IT leads at Fortune 1000 companies                                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Campaign Selector (Project Creation)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Create New Video                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Campaign (optional)                                                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Select a campaign to apply its messaging and constraints:                  │
│                                                                              │
│  ○ No campaign - Use company context only                                   │
│                                                                              │
│  ● Q1 Product Launch                                                        │
│    Focus: Widget Pro 2.0 | Audience: Enterprise IT                          │
│                                                                              │
│  ○ Security Awareness Series                                                │
│    Focus: Compliance features | Audience: Security teams                    │
│                                                                              │
│  ○ Customer Success Stories                                                 │
│    Focus: Case studies | Audience: Prospects                                │
│                                                                              │
│  [+ Create New Campaign]                                                    │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Describe your video:                                                       │
│  [Product demo showing the new dashboard feature...                 ]      │
│                                                                              │
│  [Create Video →]                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix B: Reference Documents

- `FUTURE_PERSISTENT_CONTEXT.md` - Original future spec (now superseded)
- `company-and-team-level.md` - Strategy notes
- GrowthX three-pillar framework (Company Context, Writing Guidelines, Audience Personas)
