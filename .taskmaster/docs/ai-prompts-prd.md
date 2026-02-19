# AI/Prompts Quality PRD

**Product**: Plotline AI Agent System
**Version**: 1.0
**Last Updated**: January 2026
**Owner**: AI/Prompt Engineering Team
**Domain**: AI/Prompts Quality

---

## 1. Overview & Vision

### 1.1 Purpose

The AI/Prompts domain owns **output quality** - ensuring the AI agents produce content that users find valuable with minimal editing. This is the "brains" of Plotline that directly impacts user satisfaction and completion rates.

### 1.2 Vision Statement

> Every AI-generated field should be good enough to use as-is 80% of the time, while remaining easy to improve when needed.

### 1.3 Success Criteria

- **Edit Rate Reduction**: Reduce average field edit rate to <20% (from current baseline)
- **Regeneration Reduction**: <0.5 regeneration requests per stage on average
- **Generation Quality Score**: 4.0+ average rating on AI output quality
- **Generation Time**: <10 seconds for brief, <15 seconds for outline, <20 seconds for draft

### 1.4 Scope

This PRD covers:
- Research agents and context gathering
- Content generation agents (Brief, Outline, Draft)
- Prompt engineering and optimization
- Quality measurement and feedback loops

**Out of Scope** (separate PRDs):
- User interface (see `core-creation-prd.md`)
- Analytics dashboard (see `analytics-dashboard-prd.md`)
- Enterprise context (see `enterprise-context-prd.md`)

---

## 2. Persona: AI/Prompt Engineer

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

**Key Responsibilities**:
- Monitor field edit patterns in Analytics Dashboard
- Review edit samples to identify prompt weaknesses
- Iterate on prompts to improve first-draft quality
- Track prompt version performance over time

---

## 3. Current Agent Architecture

### 3.1 Implemented Agents

| Agent | File Location | Purpose |
|-------|--------------|---------|
| **Topic Researcher** | `backend/app/services/agents/topic_researcher.py` | Web search for context |
| **Brief Builder** | `backend/app/services/agents/brief_builder.py` | Generates video brief |
| **Storyboard Director** | `backend/app/services/agents/storyboard_director.py` | Plans screen structure |
| **Storyboard Writer** | `backend/app/services/agents/storyboard_writer.py` | Generates full content |
| **Image Researcher** | `backend/app/services/agents/image_researcher.py` | Fetches relevant images |
| **Duration Calculator** | `backend/app/services/agents/duration_calculator.py` | Calculates timing |
| **Base Agent** | `backend/app/services/agents/base.py` | Foundation class |

### 3.2 Agent Pipeline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AGENT EXECUTION PIPELINE                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  User Input                                                                  │
│      │                                                                       │
│      ▼                                                                       │
│  ┌────────────────────┐                                                      │
│  │  Topic Researcher  │──────────────────────────┐                           │
│  │                    │                          │                           │
│  │  • Web search      │                          │                           │
│  │  • Fact extraction │                          │                           │
│  │  • Source tracking │                          │                           │
│  └────────────────────┘                          │                           │
│           │                                      │                           │
│           │ Context Pack                         │                           │
│           ▼                                      │                           │
│  ┌────────────────────┐                          │                           │
│  │   Brief Builder    │                          │                           │
│  │                    │                          │                           │
│  │  • video_goal      │                          │                           │
│  │  • target_audience │                          │                           │
│  │  • key_points      │                          │                           │
│  │  • tone_and_style  │                          │                           │
│  └────────────────────┘                          │                           │
│           │                                      │                           │
│           │ Story Brief                          │ Sources + Context         │
│           ▼                                      │                           │
│  ┌────────────────────┐                          │                           │
│  │ Storyboard Director│◀─────────────────────────┘                           │
│  │                    │                                                      │
│  │  • Screen sequence │                                                      │
│  │  • Screen types    │                                                      │
│  │  • Visual direction│                                                      │
│  │  • Voiceover text  │                                                      │
│  └────────────────────┘                                                      │
│           │                                                                  │
│           │ Screen Outline                                                   │
│           ▼                                                                  │
│  ┌────────────────────┐    ┌────────────────────┐                            │
│  │ Storyboard Writer  │───▶│  Image Researcher  │                            │
│  │                    │    │                    │                            │
│  │  • Full scripts    │    │  • Search queries  │                            │
│  │  • On-screen text  │    │  • Image selection │                            │
│  │  • Visual prompts  │    │  • URL fetching    │                            │
│  └────────────────────┘    └────────────────────┘                            │
│           │                         │                                        │
│           │                         │                                        │
│           ▼                         ▼                                        │
│  ┌────────────────────────────────────────────────┐                          │
│  │            Duration Calculator                  │                          │
│  │                                                 │                          │
│  │  • Word count analysis                          │                          │
│  │  • Reading speed estimation                     │                          │
│  │  • Target duration per panel                    │                          │
│  └────────────────────────────────────────────────┘                          │
│           │                                                                  │
│           │ Final Storyboard                                                 │
│           ▼                                                                  │
│      [To User]                                                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Base Agent Features

```python
class BaseAgent:
    """Foundation class for all agents"""

    # Prompt loading from /prompts/*.md files
    prompt_file: str

    # LLM call methods
    def call_llm(user_prompt, model, temperature, max_tokens) -> str
    def call_llm_with_timing(user_prompt, project_id, stage_id, ...) -> (str, metrics)

    # Response parsing
    def _extract_json(text) -> dict | list | None
    def _validate_required_fields(data, required_fields) -> list[missing]

    # Analytics integration
    # - Captures time-to-first-token (TTFT)
    # - Captures total generation time
    # - Records model used
```

---

## 4. Future Architecture: Modular Research Agents

### 4.1 Design Overview

Replace monolithic Topic Researcher with **24 modular micro-agents** that can be composed dynamically based on video type and topic.

### 4.2 Agent Registry

#### Category A: Entity Research (Who/What)

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| A1 | `company_background` | What is this company? History, mission, size? |
| A2 | `founder_story` | Who founded it? Their background and motivation? |
| A3 | `product_overview` | What does the product do? Core capabilities? |
| A4 | `competitive_landscape` | Who are competitors? How does this compare? |
| A5 | `customer_profile` | Who uses this? What segments? |
| A6 | `pricing_model` | How is it priced? What tier is relevant? |

#### Category B: Market & Industry Research

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| B1 | `industry_trends` | What's happening in this industry? |
| B2 | `market_size` | How big is the market? TAM/SAM/SOM? |
| B3 | `regulatory_context` | Any compliance/regulatory considerations? |
| B4 | `technology_landscape` | What tech trends are relevant? |

#### Category C: Problem & Value Research

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| C1 | `pain_points` | What problems does the audience face? |
| C2 | `value_propositions` | What value does this deliver? Metrics? |
| C3 | `use_cases` | What are common use cases? |
| C4 | `before_after` | What's the transformation story? |

#### Category D: Knowledge & Concept Research

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| D1 | `concept_definition` | What is this concept? Core definition? |
| D2 | `concept_framework` | What mental model explains this? |
| D3 | `supporting_evidence` | What research/data backs this up? |
| D4 | `common_misconceptions` | What do people get wrong? |
| D5 | `practical_applications` | How do you apply this knowledge? |
| D6 | `related_concepts` | What adjacent topics should be understood? |

#### Category E: Procedural Research

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| E1 | `step_sequence` | What are the steps to do this? |
| E2 | `prerequisites` | What do you need before starting? |
| E3 | `common_pitfalls` | What mistakes do people make? |
| E4 | `success_criteria` | How do you know you did it right? |

#### Category F: Meta Research

| ID | Agent Name | Question It Answers |
|----|------------|---------------------|
| F1 | `terminology_glossary` | What terms need defining? |
| F2 | `worked_example` | Can you show a concrete example? |

### 4.3 Router Agent

Principle-based agent selection based on:

1. **Research only what's unknown** - Skip agents for user-provided info
2. **Video type shapes focus** - Product vs Knowledge vs How-to needs different research
3. **Audience expertise determines depth** - Beginner vs Expert content
4. **Prefer fewer, higher-value agents** - Aim for 5-10 agents per request
5. **When uncertain, include with note** - Assembler can discard later
6. **Distinguish how-to types** - Product how-to vs Concept how-to

### 4.4 Assembler Agent

Principle-based synthesis:

1. **Synthesize, don't concatenate** - Weave into coherent context
2. **Surface conflicts honestly** - Note contradictory information
3. **Assess confidence holistically** - High/Medium/Low per field
4. **Identify genuine gaps** - Only flag essential missing info
5. **Preserve source attribution** - Every claim traces to source

---

## 5. Conversational Brief Builder Design

### 5.1 5-Turn Flow

Replace form-based briefing with conversational flow:

```
Turn 1: Initial Intake
  "What video are you creating?"
  → Parse for video_type, topic, company, audience hints
  → Fire research agents in parallel

Turn 2: Mirror & Confirm
  "Here's what I'm hearing..."
  → Validate understanding
  → Continue agent execution in background

Turn 3: Surface Research Findings
  "Here's what I found that might be useful..."
  → Show high-confidence findings
  → Identify gaps for Turn 4

Turn 4: Fill the Gaps
  "A few things I couldn't figure out..."
  → Present only real gaps
  → Accept freeform input

Turn 5: Confirm & Proceed
  "Here's your complete video brief..."
  → Final checkpoint
  → User confirms → Pass to Director
```

### 5.2 State Management

```typescript
interface BriefBuilderState {
  current_turn: number;
  conversation_history: Message[];

  extracted: {
    video_type?: VideoType;
    topic?: string;
    company_name?: string;
    audience?: string;
    tone?: string;
    length?: number;
    cta?: string;
  };

  research: {
    agents_called: string[];
    agents_completed: string[];
    agents_failed: string[];
    context_pack: ContextPack;
  };

  gaps: Array<{
    field: string;
    reason: string;
    asked: boolean;
    answered: boolean;
  }>;

  confidence: {
    [field: string]: {
      level: "high" | "medium" | "low";
      source: "user" | "research" | "inferred";
    };
  };

  final_brief?: StoryBrief;
  user_confirmed: boolean;
}
```

---

## 6. Quality Metrics

### 6.1 Field Edit Patterns

Track which fields users edit most frequently:

| Field | Current Edit Rate | Target | Status |
|-------|------------------|--------|--------|
| `tone_and_style` | ~45% | <20% | Needs work |
| `key_points` | ~38% | <20% | Needs work |
| `cta` | ~29% | <15% | Moderate |
| `target_audience` | ~22% | <15% | Moderate |
| `video_goal` | ~16% | <10% | Good |

**Action**: High-edit-rate fields indicate prompt weaknesses

### 6.2 Edit Type Breakdown

- **Modified**: AI output was changed (indicates quality issue)
- **Added**: User added content where AI left blank (indicates coverage gap)
- **Deleted**: User removed AI content (indicates over-generation)

### 6.3 Regeneration Metrics

| Stage | Target Regen Rate | Meaning |
|-------|------------------|---------|
| Brief | <0.5 | Most briefs accepted with edits only |
| Outline | <0.3 | Structure usually right |
| Draft | <0.2 | Content flows from approved outline |

### 6.4 Timing Metrics

| Metric | Target | Purpose |
|--------|--------|---------|
| Time-to-First-Token (TTFT) | <2s | User sees activity quickly |
| Total Generation Time | <20s | Acceptable wait time |
| P95 Latency | <30s | Worst-case experience |

---

## 7. Prompt Versioning Strategy

### 7.1 File Structure

```
/prompts/
├── BRIEF_BUILDER_SYSTEM_PROMPT.md        # Current production
├── STORYBOARD_DIRECTOR_SYSTEM_PROMPT.md
├── STORYBOARD_WRITER_SYSTEM_PROMPT.md
├── TOPIC_RESEARCHER_SYSTEM_PROMPT.md
└── research_agents/                      # Future modular agents
    ├── ROUTER_PROMPT.md
    ├── ASSEMBLER_PROMPT.md
    └── agents/
        ├── A1_company_background.md
        ├── A2_founder_story.md
        └── ...
```

### 7.2 Prompt Improvement Process

1. **Identify**: Analytics shows `tone_and_style` has 45% edit rate
2. **Sample**: Review 10+ before/after pairs from Analytics
3. **Hypothesize**: Users want more nuanced descriptors, not generic words
4. **Update**: Modify prompt with examples of good tone descriptors
5. **Deploy**: Update prompt file (agents reload on restart)
6. **Measure**: Track edit rate change over next 100 projects
7. **Iterate**: If improved, document; if not, revert and try again

### 7.3 Version Control

- Prompts are in git, tracked with code
- Add prompt changes to commit messages
- Consider prompt version metadata in analytics

---

## 8. Quality Improvement Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      PROMPT IMPROVEMENT FEEDBACK LOOP                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────┐                                                           │
│  │   User Edits  │──────────────────────────────────┐                        │
│  │  AI Output    │                                  │                        │
│  └───────────────┘                                  │                        │
│                                                     ▼                        │
│                                          ┌───────────────────┐               │
│                                          │  Edit Tracker     │               │
│                                          │  (edit_tracker.py)│               │
│                                          └─────────┬─────────┘               │
│                                                    │                         │
│                                                    ▼                         │
│                                          ┌───────────────────┐               │
│                                          │  Analytics Service│               │
│                                          │  (analytics.py)   │               │
│                                          └─────────┬─────────┘               │
│                                                    │                         │
│                                                    ▼                         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │                        Analytics Dashboard                             │  │
│  │                                                                        │  │
│  │   Field Edits Tab:                                                     │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │   │  tone_and_style     │   45.2%   │     64     │   [Samples]      │  │  │
│  │   │  key_points         │   38.1%   │     54     │   [Samples]      │  │  │
│  │   │  cta                │   29.0%   │     41     │   [Samples]      │  │  │
│  │   └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  │   Sample Edits:                                                        │  │
│  │   ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │   │  AI Generated:  "professional and informative"                  │  │  │
│  │   │  User Changed:  "friendly but authoritative"                    │  │  │
│  │   └─────────────────────────────────────────────────────────────────┘  │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                    │                         │
│                                                    │                         │
│                                          ┌─────────▼─────────┐               │
│                                          │  Prompt Engineer  │               │
│                                          │  Reviews Patterns │               │
│                                          └─────────┬─────────┘               │
│                                                    │                         │
│                                                    ▼                         │
│                                          ┌───────────────────┐               │
│                                          │  Prompt Update    │               │
│                                          │  /prompts/*.md    │               │
│                                          └─────────┬─────────┘               │
│                                                    │                         │
│                                                    ▼                         │
│                                          ┌───────────────────┐               │
│                                          │  Deploy & Measure │               │
│                                          └─────────┬─────────┘               │
│                                                    │                         │
│                                                    │                         │
│                                          ┌─────────▼─────────┐               │
│  ┌───────────────┐                       │  Improved AI      │               │
│  │   User Gets   │◀──────────────────────│  Output Quality   │               │
│  │  Better Output│                       └───────────────────┘               │
│  └───────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Agent Output Schemas

### 9.1 Topic Researcher Output

```json
{
  "context_pack": {
    "company": {
      "name": "string",
      "description": "string",
      "industry": "string"
    },
    "product": {
      "name": "string",
      "capabilities": ["string"],
      "differentiators": ["string"]
    },
    "audience": {
      "segments": ["string"],
      "pain_points": ["string"]
    },
    "market": {
      "trends": ["string"],
      "statistics": ["string"]
    },
    "sources": [
      {
        "url": "string",
        "title": "string",
        "type": "official | article | research"
      }
    ]
  }
}
```

### 9.2 Brief Builder Output

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
  "video_type": "Product Release | How-to Video | Knowledge Sharing",
  "key_points": ["string"],
  "constraints": ["string"],
  "problem": "string",
  "core_interaction_steps": ["string"],
  "auto_filled_fields": ["string"],
  "unresolved_questions": [
    {
      "field": "string",
      "note": "string",
      "context": "string"
    }
  ]
}
```

### 9.3 Storyboard Director Output

```json
[
  {
    "screen_number": 1,
    "screen_name": "string",
    "screen_type": "Hook | Setup | Demo | Explanation | CTA | etc",
    "voiceover_text": "string",
    "visual_direction": "string",
    "estimated_duration_seconds": 10
  }
]
```

### 9.4 Storyboard Writer Output

```json
[
  {
    "panel_number": 1,
    "screen_name": "string",
    "voiceover_script": "string",
    "on_screen_text": "string",
    "visual_description": "string",
    "image_prompt": "string",
    "image_url": "string",
    "target_duration_sec": 10,
    "notes": "string"
  }
]
```

---

## 10. Implementation Priorities

### Phase 1: Measurement (Current)

- [x] Edit tracking (`edit_tracker.py`)
- [x] Analytics aggregation (`analytics.py`)
- [x] Field edit patterns in dashboard
- [x] Timing metrics capture
- [ ] Before/after sample storage

### Phase 2: Quick Wins

- [ ] Improve top 3 edited fields based on samples
- [ ] Add field-specific examples to prompts
- [ ] A/B test prompt variations
- [ ] Track prompt version in analytics

### Phase 3: Modular Architecture

- [ ] Implement Router agent
- [ ] Implement Assembler agent
- [ ] Build first 6 research agents (A1-A6)
- [ ] Parallel execution orchestration
- [ ] Context Pack schema standardization

### Phase 4: Conversational Brief

- [ ] 5-turn conversation flow
- [ ] Background agent execution
- [ ] Gap detection and filling
- [ ] Confidence visualization
- [ ] User override handling

---

## 11. Dependencies

### 11.1 From Core Creation Domain

- User input via Orchestrator
- Stage approval/rejection events
- Regeneration feedback

### 11.2 To Core Creation Domain

- Generated content (Brief, Outline, Draft)
- Timing metrics for UX
- Confidence signals (future)

### 11.3 To Analytics Domain

- Field edit events
- Generation timing events
- Quality signals

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt changes break quality | User frustration | A/B testing, gradual rollout, rollback plan |
| Too many agents = slow | Poor UX | Parallel execution, caching, agent pruning |
| Research returns wrong info | Bad content | Source verification, confidence scoring, user override |
| LLM API instability | Outages | Retry logic, fallback models, graceful degradation |

---

## 13. Success Verification

After implementing prompt improvements:

- [ ] Field edit rates decrease for targeted fields
- [ ] Regeneration requests decrease
- [ ] User satisfaction ratings improve
- [ ] Generation times remain acceptable
- [ ] No new quality regressions introduced

---

## Appendix A: Prompt Engineering Best Practices

### A.1 Structure

1. **Role Definition**: Clear agent identity
2. **Context Injection**: Where to use research/prior stages
3. **Output Schema**: Exact JSON structure expected
4. **Examples**: Good and bad output examples
5. **Constraints**: What to avoid

### A.2 Tone Calibration

Following Anthropic's "Just Right" approach:
- Not too vague: "Make it good"
- Not too specific: 20+ conditional rules
- Just right: Clear principles with examples

### A.3 Handling Edge Cases

- Empty user input: Request clarification
- Conflicting info: Trust user over research
- Missing context: Flag gaps, don't hallucinate

---

## Appendix B: Agent Prompt Template

```markdown
# [Agent Name] System Prompt

## Your Role
You are a [role description]. Your job is to [primary goal].

## Input You'll Receive
- [Input 1]: [Description]
- [Input 2]: [Description]

## Your Task
[Step-by-step instructions]

## Output Format
Return your response as JSON:
```json
{
  "field_1": "...",
  "field_2": "..."
}
```

## Quality Guidelines
- [Guideline 1]
- [Guideline 2]

## Examples

### Good Example
[Example of ideal output]

### Bad Example (Avoid)
[Example of what not to do]

## Edge Cases
- If [condition]: [how to handle]
```
