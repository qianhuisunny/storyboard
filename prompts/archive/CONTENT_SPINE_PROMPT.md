# CONTENT SPINE GENERATION

## Task

The user has provided a central claim (Point of View) that this video will build and defend.
Your job is to generate the **complete narrative spine** — the full sequence of talking points from hook to closing that will become the sections of the video outline.

Each talking point you generate will become a major section in the final video. Think of them as **cognitive chapters**, not bullet points — each one must do real work in the viewer's mind.

The downstream Video Outline Director will expand each talking point into a detailed section with entry/exit states, sub-points, and duration allocation. Your job is to define WHAT the video says and in what order — the Director defines HOW each section is structured.

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

- **No throat-clearing.** Every point must deliver value, not just introduce a topic. "Why X matters" is not a talking point. "The hidden cost of X that nobody talks about" is.
- **Show, don't explain.** Points built around demonstrations, contrasts (good vs bad), or concrete scenarios are stronger than abstract reasoning. "Watch what happens when a PMM builds a landing page in 30 minutes" is better than "Claude Code enables faster asset creation."
- **Dramatic weight is uneven.** Not every point deserves equal time. The 1–2 points with the most surprise value or counter-intuitive insight should carry the narrative. The rest can be supporting structure.

### Full narrative arc

You are generating the COMPLETE arc — hook through closing. Every video needs:

1. **Opening hook** — The first talking point must create tension, curiosity, or a relatable frustration. Not "Today we'll explore…" — the viewer should feel pulled in within seconds. A bold claim, a surprising fact, or a problem the audience recognizes instantly.

2. **Body** — The middle points build the case. These can be reasoning steps, concrete demonstrations, contrasts, or scenarios. They must create progression: each one builds on what came before.

3. **Closing** — The last talking point is a call to action or a reframe. What should the viewer DO next? Or: how should they see the topic differently now? Never summarize — the viewer just watched the video.

### Scale to duration

Shorter videos need fewer, tighter points. Don't pad. These counts include hook and closing:

- ~5 min video: 3–5 total talking points
- ~10 min video: 5–7 total talking points

If the POV only needs 4 points to land, generate 4. A tight 4-point video is better than a flabby 6-point one.

---

## Generation Instructions

Generate two fields in this exact dependency order:

### 1. core_talking_points

The complete narrative spine — from hook to closing. Each entry becomes a section in the video outline.

- The FIRST point is always the hook — it creates tension or curiosity, not context
- The LAST point is always the closing — a call to action, challenge, or reframe
- Middle points build the case — reasoning steps, demonstrations, pivots, or evidence
- They must create progression: point N builds on point N-1
- Do NOT list subtopics or parallel examples — list the steps of the narrative

**Example — POV: "Don't think Claude Code is irrelevant to marketers. Try building projects to make your life easier as a PMM."**
**Duration: 5 min, Audience: Product marketing managers**

BAD — feature list with generic bookends:
- "Introduction to how Claude Code can help marketers"
- "Claude Code can build functional marketing landing pages and campaign microsites in minutes"
- "You can prototype interactive demos and product showcases without waiting for engineering"
- "Campaign artifacts like comparison tables, ROI calculators, and lead magnets become immediately testable"
- "Summary and next steps for getting started"

GOOD — complete narrative arc with progression:
- "Modern marketing demands rapid iteration on landing pages, campaign assets, and demo materials — but most PMMs are stuck waiting weeks for engineering bandwidth"
- "Claude Code isn't just for engineers. Describe what you want in plain English, get a working artifact — no coding background required"
- "Demo: Build a product landing page for an upcoming campaign launch, from blank screen to live preview, in under 10 minutes"
- "Demo: Generate an interactive ROI calculator that prospects can use during sales conversations"
- "Try it today: pick one asset you've been waiting on, describe it to Claude Code, and ship it this week instead of next quarter"

Why the GOOD version works: The hook names a pain the audience feels daily (waiting on engineering). Point 2 dismantles the assumption that this tool isn't for them. Points 3–4 are concrete demos, not abstract capabilities — the viewer watches it happen. The closing gives a specific, doable action.

The BAD version is a feature list with generic "introduction" and "summary" bookends. Each middle point is a parallel capability description at the same abstraction level. No progression, no demonstrations, no reason to keep watching.

**Example — POV: "Most coding tutorials teach syntax. The best ones teach you to think like a debugger."**
**Duration: 5 min, Audience: Self-taught developers**

GOOD — 4 points are enough:
- "You've memorized for-loops and if-statements, but the moment your code breaks, you're frozen — Googling the error message and praying for a Stack Overflow answer"
- "Syntax tutorials produce this: people who can type code but can't read it when it fails — because they never learned to treat error messages as clues, not verdicts"
- "Debugger-thinking is a teachable loop: reproduce, isolate, hypothesize, verify — and the best tutorials structure every exercise around this loop instead of 'type this, get that'"
- "Next time your code breaks, don't Google the error. Read it. Ask: what is the computer telling me it expected? That single habit change is where debugging starts"

Note: 4 points for a 5-min video. The hook is a recognizable moment (frozen when code breaks). The closing is a specific behavior change, not "go learn more."

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
1. The first talking point is a hook — tension, curiosity, or relatable frustration, not context-setting
2. The last talking point is a closing — action, challenge, or reframe, not a summary
3. Each middle point changes what the viewer knows, believes, or can do — no throat-clearing
4. Points create progression, not parallel structure — each depends on the previous
5. Point count fits the video duration (including hook and closing) — don't pad short videos
6. Points are built around demonstrations, contrasts, or scenarios where possible — not abstract explanations
7. The misconception is a genuine counter-thesis the audience holds, not a mirror-phrased talking point
8. The two fields are functionally distinct — no paraphrases of one another

---

## Output Format

Return a JSON object with exactly these 2 keys:

```json
{
  "core_talking_points": ["hook point", "body point 1", "body point 2", "closing point"],
  "misconception": "Most people think X, but actually Y."
}
```
