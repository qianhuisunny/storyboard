# CONTENT SPINE GENERATION

## Task

The user has provided a central claim (Point of View) that this video will build and defend.
Your job is to generate the narrative spine — the sequence of talking points that will become the body sections of the video outline.

Each talking point you generate will become a major section in the final video. Think of them as **cognitive chapters**, not bullet points — each one must do real work in the viewer's mind.

---

## How to Think About Talking Points

### These are sections, not bullets

Each talking point becomes a 1–2 minute section of a video. A viewer will spend real time in each one. So each point must:
- **Teach one new thing.** After this section, the viewer understands something they didn't before.
- **Pull the viewer forward.** It should create enough curiosity or tension that the viewer wants to see what comes next.
- **Stand on the previous point.** Point N only makes sense because point N-1 already landed.

If a talking point doesn't change what the viewer knows, believes, or can do — it shouldn't exist.

### Video ≠ essay

You are writing for a medium where the viewer can leave at any second. This changes everything:

- **No "setting the stage" points.** Every point must deliver value, not just introduce a topic. "Why X matters" is not a talking point — it's throat-clearing.
- **Show, don't explain.** Points built around demonstrations, contrasts (good vs bad), or concrete scenarios are stronger than abstract reasoning. "Watch what happens when a PMM builds a landing page in 30 minutes" is better than "Claude Code enables faster asset creation."
- **Dramatic weight is uneven.** Not every point deserves equal time. The 1–2 points with the most surprise value or counter-intuitive insight should carry the narrative. The rest can be supporting structure.

### Scale to duration

Shorter videos need fewer, tighter points. Don't pad.

- ~5 min video: 2–3 talking points
- ~10 min video: 3–5 talking points

If the POV only needs 2 points to land, generate 2. A tight 2-point video is better than a flabby 4-point one.

---

## Generation Instructions

Generate two fields in this exact dependency order:

### 1. core_talking_points

The major talking points that build the case for the POV. Each one will become a body section of the video outline.

- Each point is a step that builds the case — it can be a reasoning step, a concrete example, or a demonstration scenario
- They must create progression: point N builds on point N-1
- Do NOT list subtopics or parallel examples — list the steps of the narrative

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

**Example — POV: "Most coding tutorials teach syntax. The best ones teach you to think like a debugger."**

GOOD — 2 points are enough for a 5-min video:
- "Syntax tutorials produce people who can type code but freeze when it breaks — because they never learned to read error messages as clues"
- "Debugger-thinking is a teachable skill: reproduce, isolate, hypothesize, verify — and the best tutorials structure every exercise around this loop"

Note: only 2 points. The POV is tight, the video is short. Don't invent a third point just to fill space.

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
1. Each talking point changes what the viewer knows, believes, or can do — no throat-clearing
2. Points create progression, not parallel structure — each depends on the previous
3. Point count fits the video duration — don't pad short videos
4. Points are built around demonstrations, contrasts, or scenarios where possible — not abstract explanations
5. The misconception is a genuine counter-thesis the audience holds, not a mirror-phrased talking point
6. The two fields are functionally distinct — no paraphrases of one another

---

## Output Format

Return a JSON object with exactly these 2 keys:

```json
{
  "core_talking_points": ["talking point 1", "talking point 2", "talking point 3"],
  "misconception": "Most people think X, but actually Y."
}
```
