# Video Briefing: Field Model & UI Labels (Knowledge Share)

This doc defines **(1) a unified data schema** for Briefing fields and **(2) the Knowledge Share UI spec** (labels, inputs, defaults, color rules, and update logic).

---

## A. Unified data schema (single schema across video types)

### Field object

Each field is a **single object** with minimal state.

```json
{
  "key": "one_big_thing",
  "value": "",
  "source": "extracted | inferred | empty",
  "confirmed": false
}
```

### Color coding (UI)

Color is derived from `value`, `source`, and `confirmed`.

- 🟢 **Confirmed**: `confirmed = true`
- 🔵 **Provided (unconfirmed)**: `confirmed = false` AND `source = extracted`
- 🟡 **AI suggested**: `confirmed = false` AND `source = inferred`
- 🔴 **Needs input**: `value is empty` AND field is **required in this step**

> “Not shown” is a **render rule** (video-type-based). Fields that don’t apply are simply not rendered.

### Source definitions (kept intentionally simple)

- `extracted`: directly from user-provided inputs (form submission or explicit answers)
- `inferred`: suggested by the system (can include research-assisted suggestions; still just “suggested”)
- `empty`: not set

---

## B. Briefing stage order (Knowledge Share)

### Round 1 (research running)

1. **Section 1 — Core Intent**
2. **Section 2 — Delivery & Format**

### Round 2 (after research)

3. **Section 3 — Content Spine**

---

## C. Knowledge Share: Field catalog (UI spec)

Each field below includes:

- **Schema key** (stable)
- **UI label** (user-facing)
- **UI input** (control + allowed values)
- **Example value** (sample)
- **Default value** (how we prefill)
- **Required in step** (Round 1 / Round 2)
- **Value change logic** (what happens to `source` + `confirmed` when edited/accepted)

---

# Section 1 — Core Intent (Round 1)

## 1) video\_type

- **Schema key:** `video_type`
- **UI label:** Video type
- **UI input:** Read-only (selected card)
- **Example value:** `Knowledge Sharing`
- **Default value:** From user selection → `value="knowledge_sharing"`, `source=extracted`, `confirmed=true`
- **Traffic-light behavior (combines requirement):**
  - **🟢 Always Green in Round 1**: this field is a gating context selector; it’s treated as confirmed when selected.

## 2) primary\_goal

- **Schema key:** `primary_goal`
- **UI label:** What is the main goal of this video?
- **UI input:** Short textarea (1–3 sentences)
- **Example value:** `Help viewers understand startup exit options in 2026 and make better planning decisions.`
- **Default value:** AI prefill from user description → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - If user edits: set `source=extracted`, `confirmed=false`
  - If user clicks “Confirm”: set `confirmed=true`

## 3) target\_audience

- **Schema key:** `target_audience`
- **UI label:** Who is this video for?
- **UI input:** Text + optional chips (role, context)
- **Example value:** `Startup founders / entrepreneurs`
- **Default value:** From initial form → `source=extracted`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - If user edits: keep `source=extracted`, set `confirmed=false`
  - If user clicks “Confirm”: set `confirmed=true`

## 4) audience\_level

- **Schema key:** `audience_level`
- **UI label:** How familiar is your audience with this topic?
- **UI input:** Single select: `Beginner | Intermediate | Advanced | Mixed`
- **Example value:** `Beginner`
- **Default value:** Optional AI guess → `source=inferred`, `confirmed=false`; otherwise empty
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 5) platform

- **Schema key:** `platform`
- **UI label:** Where will this video be published?
- **UI input:** Single select: `YouTube | Internal LMS`
- **Example value:** `YouTube`
- **Default value:** AI guess from context → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 6) duration

- **Schema key:** `duration`
- **UI label:** How long should this video be?
- **UI input:** Single select: `60–90s | 2–5 min | 5–10 min | 10+ min`
- **Example value:** `5–10 min`
- **Default value:** From initial form → `source=extracted`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection/edit: keep `source=extracted`, set `confirmed=false`
  - On confirm: set `confirmed=true`

## 7) one\_big\_thing

- **Schema key:** `one_big_thing`
- **UI label:** If viewers remember only one thing after watching this video, what should it be?
- **UI input:** Short textarea (1 sentence)
- **Example value:** `In 2026, exit strategy is about optionality, not prediction.`
- **Default value:** Empty (preferred) or AI suggestion → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - If user types: set `source=extracted`, `confirmed=false`
  - If user confirms: set `confirmed=true`

## 8) viewer\_next\_action

- **Schema key:** `viewer_next_action`
- **UI label:** What is the next thing you want people to do after watching this video?
- **UI input:** Short textarea (one concrete action)
- **Example value:** `Use a simple checklist to assess your startup’s exit readiness.`
- **Default value:** AI suggestion → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅ (recommended)
- **Value change logic:**
  - If user edits: set `source=extracted`, `confirmed=false`
  - If user confirms: set `confirmed=true`

---

# Section 2 — Delivery & Format (Round 1)

## 9) on\_camera\_presence

- **Schema key:** `on_camera_presence`
- **UI label:** Do you want your face on screen?
- **UI input:** Single select: `No | Yes — throughout | Yes — intro/outro/transition`
- **Example value:** `Yes — intro/outro/transition`
- **Default value:** AI default per type (Knowledge Share) → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 10) broll\_type

- **Schema key:** `broll_type`
- **UI label:** What should viewers mostly see while you explain?
- **UI input:** Multi-select (multiple select)
  - Screen recording (product/demo/document)
  - Slides / key points
  - Diagrams / frameworks
  - Whiteboard drawing
  - Code editor / notebook
  - Stock footage
  - Real-world footage / camera shots
- **Example value:** `["Slides / key points", "Diagrams / frameworks"]`
- **Default value:** AI default per type → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 11) delivery\_tone

- **Schema key:** `delivery_tone`
- **UI label:** How should this feel to the viewer?
- **UI input:** Single select: `Clear & practical | Analytical & informative | Mentor & Peer | Executive briefing`
- **Example value:** `Analytical & informative`
- **Default value:** AI suggestion → `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 12) freshness\_expectation

- **Schema key:** `freshness_expectation`
- **UI label:** How time-sensitive is this video?
- **UI helper:** Choose based on how often the information changes. If it depends on current news, recent stats, or this year’s market conditions, pick a more time-sensitive option.
- **UI input:** Single select:
  - Evergreen (should stay useful for a long time)
  - Current-year (should reflect this year’s context)
  - Recent / fast-changing (needs the latest info)
- **Example value:** `Current-year`
- **Default value:** If topic contains a year → prefill `Current-year` as `source=inferred`, `confirmed=false`
- **Required in step:** Round 1 ✅
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

---

# Section 3 — Content Spine (Round 2, after research)

##

## 13) must\_avoid

- **Schema key:** `must_avoid`
- **UI label:** Anything we should absolutely avoid?
- **UI input:** Bullet list
- **Example value:** ["Say bad things about competitors"]
- **Default value:** Optional AI suggestion → `source=inferred`, `confirmed=false`
- **Required in step:** Round 2 ❌
- **Value change logic:**
  - On edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 14) source\_assets

- **Schema key:** `source_assets`
- **UI label:** Sources / assets provided
- **UI input:** Read-only list (attachments + links)
- **Example value:** `[{"type":"link","title":"…"},{"type":"file","title":"notes.pdf"}]`
- **Default value:** From user uploads → `source=extracted`, `confirmed=true`
- **Required in step:** Round 2 ❌
- **Value change logic:**
  - If user adds/removes assets: update list; keep `confirmed=true`

## 15) core\_talking\_points

- **Schema key:** `core`\_`talking`\_point
- **UI label:** Proposed framework/method (AI draft)
- **UI input:** Editable text + “Keep/Replace” buttons
- **Example value:** 
  - 1\) Optionality-first exit planning (IPO/M&A/secondary paths); 2) Timing tradeoffs and market windows; 3) Payout reality by ownership %, dilution, and liquidation preferences&#x20;
  - Note that each example value is taking a separate line that is editable, removable 
- **Default value:** Generated after research → `source=inferred`, `confirmed=false`
- **Required in step:** Round 2 ✅
- **Value change logic:**
  - If user edits: set `source=extracted`, `confirmed=false`
  - If user accepts: set `confirmed=true`

## 16) misconceptions

- **Schema key:** `misconceptions`
- **UI label:** Common misconceptions to address (AI draft)
- **UI input:** Checklist (keep/remove) + reorder
- **Example value:**&#x20;

  (1)`"IPO is the only real exit", `

  (2)`"Headline valuation equals founder payout"`

  Note that each example value is taking a separate line that is editable, removable 
- **Default value:** Generated after research → `source=inferred`, `confirmed=false`
- **Required in step:** Round 2 ✅ (choose 1–3)
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

## 17) practical\_takeaway

- **Schema key:** `practical_takeaway`
- **UI label:** Practical takeaway (AI draft)
- **UI input:** Single select + editable: `Checklist | Decision tree | Scorecard | 3-step action plan`
- **Example value:** `Checklist: evaluate exit readiness this quarter.`
- **Default value:** Generated after research → `source=inferred`, `confirmed=false`
- **Required in step:** Round 2 ✅
- **Value change logic:**
  - On selection/edit: set `source=extracted`, `confirmed=false`
  - On confirm: set `confirmed=true`

---

## D. Briefing UI wireframe (Round 1)

```text
Knowledge Sharing Brief (Draft)
Research is running… Confirm the basics while we prepare the content spine.

Legend: 🟢 Confirmed  🔵 Provided  🟡 AI Suggested  🔴 Needs input

Section 1 · Core Intent
🟢 Video type            Knowledge Sharing
🟡 Main goal             [Edit]  [Confirm]
🔵 Audience              [Edit]  [Confirm]
🔴 Audience level        [Select] [Confirm]
🟡 Platform              [Select] [Confirm]
🔵 Duration              [Select] [Confirm]
🔴 One big thing         [Type]  [Confirm]
🟡 Next action           [Edit]  [Confirm]

Section 2 · Delivery & Format
🟡 Face on screen?       [Select] [Confirm]
🟡 Mostly show           [Pick up to 2] [Confirm]
🟡 Tone                  [Select] [Confirm]
🟡 Time-sensitivity      [Select] [Confirm]

Section 3 · Content Spine (preparing…)
We’re using your input + sources + research to draft: framework, misconceptions, examples, takeaway.
(Optional now) Must include? (up to 3)
(Optional now) Must avoid?
```

