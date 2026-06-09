# Conversational Brief Builder: Interaction Design

## Overview

Replace form-based briefing with a **conversational flow** that progressively discloses information while running research agents in the background.

**Core Principle**: User sees a friendly chat. System orchestrates 20+ agents behind the scenes.

---

## User Experience Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S VIEW                              │
│                  (Chat Interface)                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Turn 1: "What video are you creating?"                     │
│      ↓                                                       │
│  Turn 2: "Here's what I understood..." (mirror back)        │
│      ↓                                                       │
│  Turn 3: "I found some useful context..." (show research)   │
│      ↓                                                       │
│  Turn 4: "A few things I need from you..." (fill gaps)      │
│      ↓                                                       │
│  Turn 5: "Here's your complete brief" (confirm & proceed)   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ (behind the scenes)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SYSTEM'S VIEW                              │
│            (Agent Orchestration)                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Turn 1 → Extract: video_type, topic, company (if any)      │
│        → Route: Select agents based on signals              │
│        → Execute: Fire off parallel agent calls             │
│                                                              │
│  Turn 2 → Confirm extracted fields with user                │
│        → Continue agent execution in background             │
│                                                              │
│  Turn 3 → Agents complete → Assemble initial Context Pack   │
│        → Surface high-confidence findings                   │
│        → Identify gaps for Turn 4                           │
│                                                              │
│  Turn 4 → Present gaps as natural questions                 │
│        → User answers fill remaining fields                 │
│        → Optionally spawn additional agents if new info     │
│                                                              │
│  Turn 5 → Merge all: user inputs + research + gap fills     │
│        → Generate final Brief (structured, behind scenes)   │
│        → Show human-readable summary                        │
│        → User confirms → Pass to Storyboard Director        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Detailed Turn Design

### Turn 1: Initial Intake

**Goal**: Get minimum viable info to start routing + research

**System says**:
```
Hey! Let's create your video brief.

Tell me about the video you're making:
- What's the topic or subject?
- What type of video? (product launch, explainer, how-to, knowledge share)
- Who's the audience?

Feel free to share as much or as little as you want — I'll ask follow-ups if needed.
```

**System does (parallel)**:
1. Parse user response for signals
2. Extract: `video_type`, `topic`, `company_name`, `audience_hints`
3. Determine How-To subtype if applicable
4. Select agents via Router
5. Fire all agents in parallel

**Latency hiding**: Show typing indicator ("Researching...") but don't block — move to Turn 2 while agents run.

---

### Turn 2: Mirror & Confirm

**Goal**: Validate understanding, catch errors early, buy time for agents

**System says**:
```
Got it! Here's what I'm hearing:

📌 **Video Type**: Knowledge Share
📌 **Topic**: Predictive analytics for hospital supply chain
📌 **Audience**: Hospital ops managers — familiar with procurement, new to AI
📌 **Tone**: Professional but accessible

Does this capture it? Anything I got wrong?

(Meanwhile, I'm doing some research to help fill in the details...)
```

**System does**:
1. Wait for user confirmation or corrections
2. If corrections → update internal state, possibly re-route agents
3. Continue monitoring agent completions

**If user says "looks good"** → proceed to Turn 3
**If user corrects something** → acknowledge, update, re-confirm if major change

---

### Turn 3: Surface Research Findings

**Goal**: Show value from research, build trust, validate direction

**System says**:
```
Great! Here's what I found that might be useful:

🔍 **Industry Context**
Healthcare supply chain analytics market growing ~15% YoY. Key drivers: post-COVID inventory challenges, labor shortages, margin pressure.

🔍 **Key Concepts to Cover**
- Demand forecasting vs. reactive ordering
- Par level optimization
- Exception-based management (let AI flag issues, humans decide)

🔍 **Common Misconception**
Many assume AI replaces human judgment — actually it augments decision-making. This might be worth addressing directly in the video.

🔍 **Supporting Evidence**
- Gartner report: 67% of health systems investing in supply chain AI by 2026
- Case study: Regional hospital reduced waste 23% with predictive ordering

Does this align with what you want to teach? Anything feel off or missing?
```

**System does**:
1. Assemble agent outputs (Assembler prompt)
2. Filter for high-confidence, relevant findings
3. Format as digestible bullets (not raw JSON)
4. Identify gaps for Turn 4

**Key UX principle**: Don't dump everything. Curate the most useful 3-5 findings. User can ask "tell me more about X" if interested.

---

### Turn 4: Fill the Gaps

**Goal**: Get user input on things research couldn't determine

**System says**:
```
A few things I couldn't figure out from research:

❓ **Call to Action**
What should viewers DO after watching?
(e.g., "Try our forecasting tool" vs. "Rethink your ordering process" vs. "Talk to your IT team about AI pilots")

❓ **Specific Examples**
Any real scenarios you want included? A "before/after" comparison, a specific hospital story, a typical day-in-the-life?

❓ **Anything else on your mind?**
Any points you definitely want to hit, or things to avoid?

Feel free to answer any/all of these, or tell me whatever else would help.
```

**System does**:
1. Present only REAL gaps (fields that are required but unfilled/low-confidence)
2. Don't ask about things research already answered
3. Accept freeform input — don't force structured answers
4. Parse responses and map to appropriate fields

**Dynamic follow-up**: If user mentions something new (e.g., "Oh, we also have a case study from Mayo Clinic"), system can spawn additional agents to research that specific item.

---

### Turn 5: Confirm & Proceed

**Goal**: Final checkpoint before passing to Storyboard Director

**System says**:
```
Perfect! Here's your complete video brief:

───────────────────────────────
**Video Brief: Predictive Analytics for Hospital Supply Chain**

**Goal**: Help hospital ops managers understand how AI-powered forecasting reduces waste and improves inventory decisions

**Audience**: Mid-level operations managers; familiar with procurement processes, new to AI/ML tools

**Key Points**:
• AI augments human judgment, doesn't replace it
• Predictive ordering reduces waste by 15-25%
• Exception-based management: AI flags, humans decide

**Evidence to Include**:
• Gartner stat (67% investing by 2026)
• Mayo Clinic case study (per your suggestion)

**Call to Action**: Schedule a demo with our supply chain team

**Tone**: Professional, accessible, avoid jargon

**Length**: ~90 seconds
───────────────────────────────

Ready to generate the storyboard? Or want to tweak anything?
```

**System does**:
1. Render human-readable summary (NOT raw JSON)
2. Behind the scenes: finalize structured Brief object
3. Include confidence markers internally (not shown to user)
4. Wait for explicit confirmation

**On "Ready"** → Pass Brief to Storyboard Director
**On "Tweak X"** → Make change, re-confirm

---

## Handling Edge Cases

### User provides everything upfront

```
User: "I need a 60-second product explainer for our new AI scheduling tool, ScheduleBot. 
Target audience is HR managers at mid-size companies. Professional tone. 
Key points: saves 5 hours/week, integrates with existing HRIS, no training needed. 
CTA is 'Start free trial'."
```

**System response**: Skip Turn 1 questions, go straight to Turn 2 (confirm) → Turn 3 (light research to enrich) → Turn 5 (confirm brief). Don't force unnecessary conversation.

---

### User is vague

```
User: "I need a video about AI"
```

**System response**: Ask clarifying questions naturally:

```
"AI is a big topic! Help me narrow it down:
- Is this about a specific AI product or tool you're promoting?
- Or more of an educational piece about AI concepts in general?
- Who's the audience — technical folks, business leaders, general public?"
```

---

### User contradicts research

```
Research says: "Product launched in 2022"
User says: "We launched in 2020"
```

**System response**: Trust user over research, note the override:

```
"Got it — I had found 2022 in my research, but I'll use 2020 since you know better. 
(I'll make sure the script reflects the correct date.)"
```

Internal: Mark field as `user_override`, note discrepancy for potential fact-check.

---

### Research returns nothing useful

```
Agents for "A1_company_background" and "A3_product_overview" return empty/failed
```

**System response**: Be honest, ask user to fill:

```
"I couldn't find much public information about [Company X]. 
Could you give me a quick overview?
- What does the company do?
- What's the main product/service?
- Any key stats or differentiators I should know?"
```

---

## State Management

### Internal State Object

```typescript
interface BriefBuilderState {
  // Conversation tracking
  current_turn: number;
  conversation_history: Message[];
  
  // Extracted fields (from user input)
  extracted: {
    video_type?: VideoType;
    topic?: string;
    company_name?: string;
    audience?: string;
    tone?: string;
    length?: number;
    cta?: string;
    // ... other fields
  };
  
  // Research results
  research: {
    agents_called: string[];
    agents_completed: string[];
    agents_failed: string[];
    context_pack: ContextPack;
  };
  
  // Gap tracking
  gaps: {
    field: string;
    reason: string;
    asked: boolean;
    answered: boolean;
  }[];
  
  // Confidence tracking
  confidence: {
    [field: string]: {
      level: "high" | "medium" | "low";
      source: "user" | "research" | "inferred";
    };
  };
  
  // Final output
  final_brief?: StoryBrief;
  user_confirmed: boolean;
}
```

---

## Passing to Next Stage

### What Storyboard Director Receives

```json
{
  "story_brief": {
    "video_type": "knowledge_share",
    "topic": "Predictive analytics for hospital supply chain",
    "goal": "Help hospital ops managers understand...",
    "audience": "Mid-level ops managers, procurement-familiar, AI-new",
    "key_points": ["...", "...", "..."],
    "evidence": ["...", "..."],
    "cta": "Schedule a demo",
    "tone": "professional, accessible",
    "length_seconds": 90,
    "constraints": ["Don't claim specific ROI numbers without citation"]
  },
  
  "context_pack": {
    "industry_trends": {...},
    "terminology": {...},
    "supporting_evidence": {...},
    // Full assembled context
  },
  
  "confidence_map": {
    "goal": {"level": "high", "source": "user"},
    "key_points": {"level": "high", "source": "research+user"},
    "evidence": {"level": "medium", "source": "research"},
    "cta": {"level": "high", "source": "user"}
  },
  
  "conversation_context": {
    "user_quotes": [
      "I want to emphasize that AI augments humans, doesn't replace them",
      "Include the Mayo Clinic case study"
    ],
    "user_overrides": [
      {"field": "launch_year", "research_said": "2022", "user_said": "2020"}
    ]
  }
}
```

This gives Storyboard Director:
1. **Structured brief** for script generation
2. **Rich context** for accurate content
3. **Confidence signals** to know what to trust
4. **User voice** to maintain tone/intent

---

## UI Components Needed

1. **Chat interface** — message bubbles, typing indicators
2. **Summary cards** — collapsible sections for research findings
3. **Inline editing** — user can click to edit confirmed fields
4. **Progress indicator** — show which stage of briefing we're in
5. **Confirmation modal** — final brief review before proceeding

---

## Implementation Order

1. [ ] Design chat UI component
2. [ ] Build state management for conversation
3. [ ] Implement Turn 1 (intake + routing + agent dispatch)
4. [ ] Implement Turn 2 (mirror + confirm)
5. [ ] Implement Turn 3 (surface research)
6. [ ] Implement Turn 4 (gap filling)
7. [ ] Implement Turn 5 (final confirmation)
8. [ ] Connect to Storyboard Director handoff
