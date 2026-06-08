# Ali Abdaal x HeyGen Pattern Grammar Mapping Report

Source channel: `https://www.youtube.com/@aliabdaal`

Inputs:
- Ali Abdaal video entries: `data/research/ali-abdaal-video-entries.json`
- Baseline grammar: `docs/future/heygen-pattern-grammar-library.md`
- Full mapping CSV: `data/research/ali-abdaal-pattern-mapping.csv`
- Full mapping JSON: `data/research/ali-abdaal-pattern-mapping.json`

Important caveat: this is title-level mapping. It does not use transcripts, descriptions, retention, thumbnail language, or performance data. Treat the output as a pattern discovery pass, not a final editorial taxonomy.

## 1. Executive Summary

Ali Abdaal mostly does not fit the HeyGen grammar directly. HeyGen titles are product/SaaS education grammar: tutorial, feature launch, product 101, capability demo, use-case playbook. Ali titles are creator-persona and self-improvement grammar: life strategy, study/exam, wealth/career, books, personal systems, Q&A, vlogs, and reflective essays.

The existing HeyGen grammar still helps as a baseline because many Ali titles share surface mechanics such as `how to`, `guide`, `case study`, `review`, `workflow`, and `beginner`. But the viewer job is often different. HeyGen asks: how do I use this product? Ali often asks: how should I live, learn, work, earn, or think?

## 2. Fit Against Existing HeyGen Grammar

| Fit status | Count | Meaning |
| --- | ---: | --- |
| Strong HeyGen fit | 3 | Title-level pattern can use HeyGen grammar with little adjustment. |
| Partial HeyGen fit | 521 | HeyGen captures a surface move, but misses the real viewer job. |
| No HeyGen fit | 153 | Title lacks product/tutorial/update/use-case signals from the HeyGen library. |

HeyGen primary pattern hits:

| HeyGen pattern | Count |
| --- | ---: |
| Quick Win Tutorial | 226 |
| No HeyGen pattern | 140 |
| Use-Case Solution Playbook | 135 |
| Capability Demo | 87 |
| Behind-The-Build / Roadmap Narrative | 47 |
| Academy Micro-Lesson | 19 |
| Feature Launch Story | 13 |
| Customer Proof Story | 7 |
| Full Stack Trend Tutorial | 2 |
| Product 101 Orientation | 1 |

Interpretation:

- `Quick Win Tutorial` maps many Ali `how to` titles, but often only superficially. A video like `How to Find Your Life’s Purpose` is not the same grammar as `Create How-To Videos in Minutes with HeyGen`.
- `Use-Case Solution Playbook` can partially map Ali study/career/money videos, but Ali usually centers personal transformation rather than product application.
- `Capability Demo` catches apps, gear, setups, and reviews, but Ali needs a taste/recommendation grammar rather than pure product capability demo.
- `Feature Launch Story`, `Academy Micro-Lesson`, and `Product 101 Orientation` are comparatively weak for Ali except AI/tool/tutorial edge cases.
- `Full Stack Trend Tutorial` barely applies after removing false positives from ampersands and life-update titles.

## 3. Existing Patterns That Can Be Reused

### Quick Win Tutorial

Use for Ali titles that promise a concrete method or result: how to read more, learn AI, start a channel, type faster, build a website. Needs a more personal/self-improvement variant.

- The Only Investing Video You’ll Ever Need (Start With $0)
- The Ultimate Beginner's Guide to Claude Code
- How to Read More Books
- How I'd Create Content in 2026 (If I Had To Start Over)

### Use-Case Solution Playbook

Use for creator/business/study applications where the video teaches how to apply a method to a specific life/work context.

- if you’re applying for jobs, watch this
- If You Want to Make Money From YouTube, Do This (Case Study)
- The psychology of making money
- If I Started YouTube from Scratch in 2026, I’d do THIS

### Capability Demo

Use for app/tool/desk setup/review content, but shift from product capability to creator taste and recommendation.

- My Home Office Setup (2026)
- Stop Wasting Time - 11 Tools to Double Your Focus
- My Most Productive Desk Setup Ever
- I Tried 137 Productivity Tools. These Are The Best.

### Customer Proof Story

Use for case studies, income examples, personal experiments, or proof-based creator business videos.

- The Simplest Way to Make $10k/month - Case Study
- I Read 2,216 Resumes. Here’s How You Stand Out 🚀
- Why I Spent $28,402 on Apple Products This Year
- I Tried Making a Viral Video - Day in the Life VLOG

### Full Stack Trend Tutorial

Use only for AI/tool-stack/creator-workflow titles, not for ordinary titles with `&` or `+`.

- I Tried AI as a Life Coach for 365 Days - Here’s What I Learned
- If I Started a YouTube Channel in 2026, I'd Do This

## 4. New Pattern Families To Add

These should be added to Plotline as Ali-style pattern grammar. Some are first-class content patterns; others are modifiers or archive formats.

| Proposed pattern | Count | Add as | Why |
| --- | ---: | --- | --- |
| Evidence-Based Self-Improvement Essay | 155 | first-class pattern | Ali core: psychology, habits, productivity, health, behavior change. |
| Study / Exam Success Playbook | 130 | first-class pattern | Large legacy cluster around medicine, Cambridge, studying, exams, revision. |
| Wealth / Career Strategy Essay | 80 | first-class pattern | Money, investing, career, business, side hustles, financial freedom. |
| Book Lessons / Reading Canon | 56 | first-class pattern | Book lists, summaries, reading recommendations, lessons distilled from books. |
| Creator Business Playbook | 43 | first-class pattern | YouTube, audience growth, content creation, writing online, creator income. |
| Personal Operating System / Productivity Framework | 43 | first-class pattern | Systems, workflows, routines, apps, second brain, time management. |
| Q&A / Community Relationship | 28 | secondary/modifier pattern | Subscriber Q&A, family/roommate conversations, comments, community maintenance. |
| Reflective Life Essay | 24 | first-class pattern | Philosophical or identity-driven titles about purpose, happiness, success, motivation. |
| Day-in-the-Life / Identity Vlog | 24 | first-class pattern | Vlogs and lived-process videos where persona and routine carry the value. |
| Tool Review / Gear Recommendation | 23 | first-class pattern | Gear/app/setup recommendations; taste and trust matter more than product features. |
| Skill Masterclass / Deep Tutorial | 18 | first-class pattern | Deep skill courses such as typing, coding, speed reading, speaking. |
| Performance / Music Archive | 14 | secondary/modifier pattern | Acoustic covers, pantomime, early archive material, non-briefing creative outputs. |
| Life Update / Personal Milestone | 13 | secondary/modifier pattern | Announcements, breakups, moving, family updates, channel/life transitions. |
| Public Health / Medical Explainer | 9 | first-class pattern | Coronavirus, medical ethics, health science; closer to public explainer than product video. |
| Unclassified / needs transcript | 5 | needs transcript | Title alone lacks enough signal; description/transcript/thumbnail needed. |
| Event Reaction / Highlights Recap | 4 | secondary/modifier pattern | WWDC/keynote/reaction content; recap and commentary format. |
| Minimalist Curiosity Hook | 3 | secondary/modifier pattern | Opaque short titles where title is a hook, not enough to infer full pattern. |
| Interview / Conversation | 3 | secondary/modifier pattern | Interviews and conversations where structure depends on guest/topic dynamics. |
| Personal Challenge / Experiment | 2 | secondary/modifier pattern | Personal test/experiment/failure/challenge narratives. |

## 5. Why Some Titles Cannot Be Mapped To HeyGen Grammar

Main reasons:

- The viewer job is existential or reflective, not operational. Example: `What's the Point?`
- The title sells a personal transformation, not a product workflow. Example: `The mindset slowly destroying your life`.
- The content is persona-led relationship maintenance: Q&A, life update, family/roommate content.
- The content is creator trust/taste: books, gear, apps, desk setups, everyday carry.
- The content is archive/performance material, such as acoustic covers or pantomime videos.
- The title is intentionally opaque, so title-only mapping is unsafe. Example: `you only need a phone`.

The important product implication: unmapped does not mean bad. It means the HeyGen grammar is too narrow. Plotline needs pattern grammar for personal-media channels, not only product/SaaS video channels.

## 6. Recommended Ali Pattern Grammar Additions

### Evidence-Based Self-Improvement Essay

Content moves:

- state the personal problem
- ground it in psychology/evidence
- show the hidden mechanism
- give practical behavior shifts
- end with a reframe or small action

High-priority slots:

- `viewer pain`
- `misconception`
- `evidence basis`
- `practical habits`
- `emotional payoff`

Media grammar:

- talking head
- minimal b-roll
- charts/quotes
- book/paper references

### Study / Exam Success Playbook

Content moves:

- define exam/study goal
- explain the failure mode
- teach the method
- show schedule/tools/examples
- close with revision plan

High-priority slots:

- `exam context`
- `audience baseline`
- `study method`
- `time horizon`
- `mistakes`

Media grammar:

- screen recording
- notes
- whiteboard
- study footage

### Wealth / Career Strategy Essay

Content moves:

- open with financial/career promise
- name the leverage point
- show principles
- walk through examples
- close with action path

High-priority slots:

- `career stage`
- `income goal`
- `risk tolerance`
- `business model`
- `proof/story`

Media grammar:

- talking head
- simple diagrams
- case study overlays

### Book Lessons / Reading Canon

Content moves:

- establish why the book/list matters
- extract 3-5 lessons
- connect to life/work outcomes
- rank or recommend next read

High-priority slots:

- `book/source list`
- `selection criteria`
- `lesson angle`
- `audience baseline`

Media grammar:

- book covers
- quotes
- highlighted notes

### Creator Business Playbook

Content moves:

- show creator outcome
- explain strategy
- break down content/business system
- show examples
- close with repeatable process

High-priority slots:

- `platform`
- `audience`
- `monetization model`
- `content cadence`
- `success metric`

Media grammar:

- analytics screenshots
- workflow diagrams
- screen recordings

### Personal Operating System / Productivity Framework

Content moves:

- open with friction
- show the system
- explain why each component exists
- show routine/workflow in use
- close with adaptation advice

High-priority slots:

- `life/work context`
- `system components`
- `tools`
- `maintenance rhythm`
- `failure mode`

Media grammar:

- desk footage
- app screenshots
- routine b-roll

## 7. Remaining Title-Only Unclassified Items

Only five remain unsafe after the proposed pattern pass. These need description/transcript/thumbnail before classification:

- `127` How to Do More in 12 Weeks than Others Do in 12 Months
- `144` How to Figure Out What You Really Want in Life
- `302` How I Work for 15 hours and Not Get Bored
- `311` How to Live more Intentionally
- `347` i wasted the last 6 months of my life...
