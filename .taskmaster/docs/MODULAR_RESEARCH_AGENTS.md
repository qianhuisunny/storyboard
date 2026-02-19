# Context Research Architecture

## Goal
**Brief → 理解需要什么 context → 研究 → 输出 whatever helps the storyboard writer**

不是填表，不是 pick from menu。是让 storyboard writer 能写出 non-vanilla 的脚本。

---

## Design: Hybrid Architecture

结合两种方法的优点：

| Approach | What It Provides | Limitation |
|----------|-----------------|------------|
| **24 Fixed Questions** | Thinking directors, structured coverage | Too rigid, forces irrelevant questions |
| **Pure Dynamic Generation** | Maximum flexibility | No guidance, might miss important areas |
| **Hybrid (Our Approach)** | Categories as scaffolding + dynamic questions per brief | Best of both |

---

## Part 1: Thinking Directors (6 Categories)

These are **not a menu to pick from**. They're mental scaffolding to ensure the researcher considers all relevant angles.

### Category A: Entity Context (Who/What)
*When relevant: Product videos, company-specific content*

**Thinking prompts:**
- What is this product/company/person?
- What makes them credible or unique?
- What's their origin story (if relevant to the video)?

### Category B: Market Context
*When relevant: Product launches, competitive positioning*

**Thinking prompts:**
- Who else is in this space?
- What's the competitive landscape?
- What industry trends matter for this message?

### Category C: Problem/Value Context
*When relevant: Almost always*

**Thinking prompts:**
- What pain does the audience have (before state)?
- What transformation does this offer (after state)?
- What's the evidence it works (metrics, stories)?

### Category D: Knowledge Context
*When relevant: Explainers, educational content, knowledge shares*

**Thinking prompts:**
- What concept needs to be defined?
- What framework explains this?
- What do people commonly get wrong?
- What evidence supports the claims?

### Category E: Procedural Context
*When relevant: How-to videos*

**Thinking prompts:**
- What are the steps?
- What can go wrong at each step?
- How do you know you succeeded?
- What prerequisites are needed?

### Category F: Meta Context
*When relevant: Beginner audiences, technical topics*

**Thinking prompts:**
- What terms need defining?
- What concrete example would make this click?
- What analogies would resonate with this audience?

---

## Part 2: Dynamic Question Generation

Instead of picking from 24 fixed questions, the researcher **generates questions based on the brief**.

### Generation Process

```
1. Read the video brief
2. Identify: video type, topic, audience, what user already provided
3. Consider which categories (A-F) are most relevant
4. Generate 5-10 specific research questions for THIS video
5. Research each question
6. Output whatever helps the storyboard writer
```

### Generation Principles

**Principle 1: Question specificity comes from the brief**
- Generic: "What problems does the audience face?"
- Specific: "What pain did Notion users have before Forms that made them request this feature?"

**Principle 2: Skip what user already provided**
- If user said "we're a B2B SaaS company founded in 2018", don't research company background
- Focus questions on gaps

**Principle 3: Video type shapes question focus**

| Video Type | Primary Categories | Example Questions |
|------------|-------------------|-------------------|
| Product Release | A, B, C | "What was painful about the old way?", "How are users reacting to the announcement?", "What's the key differentiator?" |
| Product Explainer | C, D, F | "What is this concept in simple terms?", "What misconceptions should we address?", "What example makes this concrete?" |
| Knowledge Share | C, D, F | "What's the core thesis?", "What evidence supports it?", "What's counterintuitive about this?" |
| How-To (Product) | E, F | "What are the exact steps?", "What mistakes do people make at step 3?", "What does success look like?" |
| How-To (Concept) | C, D, E | "Why does the old way fail?", "What's the framework?", "What pitfalls should beginners avoid?" |

**Principle 4: Audience expertise shapes question depth**
- Beginner audience → "What terms need defining?", "What's a simple analogy?"
- Expert audience → "What's the nuanced differentiation?", "What edge cases matter?"

**Principle 5: Real examples are almost always valuable**
Every video benefits from specific, concrete examples. Always include at least one question about real examples/case studies.

---

## Part 3: Research Execution

### For each generated question:

1. **Determine if research is needed**
   - Can Claude answer from training data? → Answer directly
   - Needs current/specific info? → Web search

2. **Search strategically**
   - Start broad, narrow if needed
   - Prioritize: official sources > trusted publications > community discussions
   - Note source quality

3. **Extract what's useful**
   - Not everything found is relevant
   - Pull specific quotes, stats, examples
   - Note confidence level

---

## Part 4: Output (Flexible, Not Schema)

### Output is NOT:
```json
{
  "company": { "name": "...", "founded": "..." },
  "product": { "capabilities": "..." },
  "audience": { "segments": "..." }
}
```

### Output IS:
Whatever helps the storyboard writer create a non-vanilla script.

### Output Format

```markdown
# Context Research: [Video Title]

## Research Questions & Findings

### Q1: [Specific question generated from brief]
**Finding:** [What was discovered]
**Source:** [URL or "Claude knowledge"]
**Confidence:** High/Medium/Low
**How this helps the script:** [Why storyboard writer should care]

### Q2: [Next question]
...

## Key Facts for the Script
- [Bullet points of most important facts]
- [Stats that should be mentioned]
- [Quotes that could be used]

## Examples/Case Studies Found
- [Real example 1 with details]
- [Real example 2 with details]

## Terminology to Define (if relevant)
- [Term]: [Definition in audience-appropriate language]

## Common Misconceptions to Address (if relevant)
- [Misconception]: [Why it's wrong] [How to frame the correction]

## Gaps / Questions for User
- [What couldn't be found that the user needs to provide]

## Sources Used
- [List of URLs with brief descriptions]
```

### Why This Format Works

1. **Traceable** — Each finding links to a question and source
2. **Flexible** — Sections can be added/removed based on video type
3. **Actionable** — "How this helps the script" connects research to writing
4. **Honest** — Confidence levels and gaps are explicit

---

## Example: Applying to Test Case 1 (Notion Forms Launch)

### Input Brief
> "Create a 3-minute product launch video announcing Notion Forms, Layouts, and Automations. Target: existing Notion users. Tone: exciting but professional."

### Step 1: Identify
- Video type: Product Release
- Topic: Notion Forms, Layouts, Automations
- Audience: Existing Notion users (intermediate familiarity)
- User provided: Video length, target, tone

### Step 2: Relevant Categories
- **C (Problem/Value)** — What pain did users have? What value does this add?
- **A (Entity)** — Not company background, but feature specifics
- **B (Market)** — How does this compare to alternatives?
- **Social proof** — How are users reacting?

### Step 3: Generate Questions
1. What specific problems did Notion users face before Forms? (Community feedback, feature requests)
2. How does Notion Forms compare to Typeform/Google Forms — what's unique?
3. What are real user reactions to the Make with Notion 2024 announcements?
4. What's the most compelling use case example for Forms? (RSVPs, feedback, recipes mentioned in blog)
5. Did Ivan Zhao or Notion team say anything quotable about why they built this?
6. What's the "93 tools" stat about and why does it matter?

### Step 4: Research & Output

```markdown
# Context Research: Notion Forms Launch Video

## Research Questions & Findings

### Q1: What problems did Notion users face before Forms?
**Finding:** Users had to use external tools (Typeform, Google Forms, Tally) and manually import data into Notion databases. This created friction and broke the "all-in-one" promise.
**Source:** Reddit r/Notion, Twitter discussions, Notion feature request forums
**Confidence:** High
**How this helps the script:** Opens video with relatable pain — "You've been asking for this for years..."

### Q2: How does Notion Forms compare to alternatives?
**Finding:** Key differentiator: responses go directly into Notion databases, allowing immediate visualization, filtering, and connection to other Notion content. No export/import needed.
**Source:** Notion blog post, comparison articles
**Confidence:** High
**How this helps the script:** Core value prop — "Your data, where it belongs, ready to use"

### Q3: Real user reactions?
**Finding:** Overwhelming positive response. Thomas Frank called it "one of my favorite features." Twitter threads showing excitement. Some users noting they can finally cancel other subscriptions.
**Source:** Twitter, YouTube creator reactions
**Confidence:** High
**How this helps the script:** Social proof montage opportunity, specific creator quotes

### Q4: Best use case examples?
**Finding:** Notion blog mentions: RSVPs for parties, product feedback, recipe collections. Thomas Frank uses for audience surveys.
**Source:** Notion blog, creator content
**Confidence:** High
**How this helps the script:** Demo scenarios — show real use cases, not abstract

### Q5: Quotable leadership statements?
**Finding:** Ivan Zhao keynote: "We want to bring everything you need to get work done into one powerful, flexible, and beautiful tool."
**Source:** Make with Notion 2024 keynote transcript
**Confidence:** High
**How this helps the script:** Voice of founder for authenticity

### Q6: What's the "93 tools" stat?
**Finding:** "93 is the average number of tools that companies use in 2024" — framing for tool consolidation narrative.
**Source:** Notion blog, likely from industry research
**Confidence:** Medium (stat cited but original source not verified)
**How this helps the script:** Opening hook — "93 tools. That's the average..."

## Key Facts for the Script
- Forms responses go directly into Notion databases
- Unlimited forms for free
- Layouts let you customize how database pages look
- Automations can chain together triggers, conditions, actions
- Part of "Make with Notion" — largest bundle of launches in Notion history

## Examples/Case Studies Found
- RSVP collection for events
- Product feedback collection
- Recipe database with custom layouts
- Thomas Frank's audience surveys

## Gaps / Questions for User
- Should the video focus on all 3 features or just Forms?
- Any specific demo scenario preference?
- Access to Notion demo account for screen recordings?

## Sources Used
- https://www.notion.com/blog/conference-product-releases
- Thomas Frank YouTube
- Reddit r/Notion
- Make with Notion 2024 keynote
```

---

## Implementation: Single-Call Prompt

```markdown
# Context Researcher

## Your Task
You are researching context for a video storyboard. Your goal: help the storyboard writer create a non-vanilla script by finding specific, useful context.

## User's Video Brief
{{video_brief}}

---

## Step 1: Understand the Brief

Identify:
- Video type (Product Release / Product Explainer / Knowledge Share / How-To)
- Topic specifics
- Target audience and their expertise level
- What context the user already provided (don't re-research this)

## Step 2: Consider Which Areas Need Research

Use these categories as thinking scaffolding (not a checklist):

**A. Entity Context** — Who/what is this about? (when relevant)
**B. Market Context** — Competitive landscape, trends (when relevant)
**C. Problem/Value Context** — Pain points, transformation, evidence (almost always relevant)
**D. Knowledge Context** — Definitions, frameworks, misconceptions (for educational content)
**E. Procedural Context** — Steps, pitfalls, success criteria (for how-to)
**F. Meta Context** — Terminology, examples, analogies (for complex or beginner-targeted)

## Step 3: Generate Research Questions

Based on your understanding, generate 5-10 specific research questions for THIS video.

Good questions are:
- Specific to this video (not generic)
- Focused on gaps (not what user already told you)
- Designed to help the storyboard writer (not just interesting trivia)

## Step 4: Research

For each question:
- Search if needed (current/specific info requires search)
- Find the most useful answer
- Note the source and your confidence level
- Explain how this helps the script

## Step 5: Output

Format your findings to be maximally useful for the storyboard writer:

1. **Research Questions & Findings** — Each question with finding, source, confidence, relevance
2. **Key Facts for the Script** — Most important points, stats, quotes
3. **Examples/Case Studies** — Concrete, real-world examples found
4. **Terminology** (if needed) — Terms to define for audience
5. **Misconceptions** (if relevant) — What to proactively address
6. **Gaps** — What you couldn't find that user needs to provide
7. **Sources** — List of URLs used

Remember: Output whatever helps. If a section isn't relevant, skip it. If something else is needed, add it.
```

---

## Validation Against Test Cases

| Test Case | Old Approach (24 fixed) | New Approach (Hybrid) |
|-----------|------------------------|----------------------|
| Notion Forms Launch | Would ask irrelevant "founder story" | Generates "What pain did users have before Forms?" |
| Ali Abdaal Productivity | Would force "product overview" fields | Generates "What's the scientific backing?" |
| Figma Design System Tutorial | Would ask "market size" | Generates "What mistakes do people make at each step?" |
| HubSpot Buyer Personas | Would have wrong output schema | Generates "What questions should you ask in persona interviews?" |

✅ Test cases confirm: Hybrid approach generates more relevant questions and more useful output.

---

## Files in This Design

```
/docs/
├── MODULAR_RESEARCH_AGENTS.md     # This file - architecture overview
├── CONTEXT_RESEARCH_TEST_CASES.md # 10 test cases validating the approach
├── CONVERSATIONAL_BRIEF_BUILDER.md # How user provides the brief
└── FUTURE_PERSISTENT_CONTEXT.md   # Future: cross-video context reuse
```

---

## Next Steps

1. [ ] Implement this prompt in backend
2. [ ] Test with real video briefs from users
3. [ ] Iterate based on storyboard writer feedback
4. [ ] Consider: should user see research questions before execution?
