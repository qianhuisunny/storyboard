# CONTENT SPINE GENERATION

## Task

The user has provided a central claim (Point of View) that this video will build and defend.
Your job is to generate the argument structure that supports this claim.

---

## Generation Instructions

Generate two fields in this exact dependency order:

### 1. core_talking_points (3-5 items)

These are the major talking points required to make the POV convincing.

- Each point is a step that builds the case for the claim — it can be a reasoning step, a concrete example, or a demonstration scenario
- They should create progression: point N builds on point N-1
- Do NOT list subtopics or generic bullet points — list the steps of the argument

**Example — POV: "Don't think Claude Code is irrelevant to marketers. Try building projects to make your life easier as a PMM."**

BAD — feature list, no progression (each point is a parallel example at the same level):
- "Claude Code can build functional marketing landing pages and campaign microsites in minutes"
- "You can prototype interactive demos and product showcases without waiting for engineering"
- "Campaign artifacts like comparison tables, ROI calculators, and lead magnets become immediately testable"

GOOD — each point builds on the previous one:
- "The barrier isn't skill — it's the assumption that building requires engineering"
- "Claude Code changes the equation: describe what you want in plain English, get a working artifact"
- "When PMMs can prototype and test their own campaign assets, iteration speed compounds — you're no longer blocked by sprint cycles"

The BAD version is a product feature list — three parallel examples at the same level. The GOOD version builds: identify the blocker → explain why it no longer applies → show the compounding consequence. Each step only makes sense after the previous one.

### 2. misconception (1 sentence)

What is the single most important misconception this video needs to address?

This is NOT a list of all possible objections. It is the ONE counter-thesis that, if left unaddressed, would make the audience dismiss the POV entirely.

Pick the misconception that is:
- The most widely held by this specific audience
- The hardest to let go of (not a strawman)
- The one that, once dismantled, clears the path for the rest of the argument

Frame it as a belief statement: "Most people think X, but actually Y."
Do NOT generate a list. Return a single string.

---

## Quality Check

Before returning, verify:
1. Each talking point directly advances the case for the POV
2. The misconception is a genuine counter-thesis the audience holds, not a mirror-phrased talking point
3. The two fields are functionally distinct — no paraphrases of one another

---

## Output Format

Return a JSON object with exactly these 2 keys:

```json
{
  "core_talking_points": ["talking point 1", "talking point 2", "talking point 3"],
  "misconception": "Most people think X, but actually Y."
}
```
