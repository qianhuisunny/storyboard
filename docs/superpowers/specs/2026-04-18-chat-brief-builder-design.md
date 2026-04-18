# Chat-Based Brief Builder

Replaces the 3-tab form BriefBuilder (Sections 1/2/3 + Review) with a single chat interface on Stage 1. OnboardingPage stays unchanged.

## Scope

- **Replace:** KnowledgeShareBriefBuilder, RoundOneForm, RoundTwoForm, RoundThreeForm, FieldCard, top step bar
- **Keep:** OnboardingPage, BriefReview (reused for Phase 3), types.ts field/option definitions, backend state machine, orchestrator
- **New:** ChatBriefBuilder component, `/chat-brief` backend endpoint, `chat_brief_prompt.md`

## User Flow

### Phase 1 — Deterministic Questions (Sections 1 + 2)

No LLM calls. AI messages are hardcoded. User answers via text input or quick-reply chips.

| # | AI Question | fieldKey | Input |
|---|-------------|----------|-------|
| 1 | "What do you want people to know, do, or believe by the end of watching this video?" | `viewer_outcome` | text |
| 2 | "How familiar is your audience with this topic?" | `audience_level` | chips: Beginner / Intermediate / Advanced / Mixed |
| 3 | "How time-sensitive is this content?" | `freshness_expectation` | chips: Evergreen / Current-year / Fast-changing |

Fields from OnboardingPage (`topic`, `duration`, `audience`) are NOT re-asked. `video_type` is hardcoded to `knowledge_share`. `delivery_tone`, `on_camera_presence`, `broll_type` are removed.

### Phase 2 — LLM Conversation (Section 3: Content Spine)

Full message history (Phase 1 + Phase 2) is sent to a new backend endpoint. LLM guides 2-4 exchanges to extract:
- `point_of_view`
- `core_talking_points`
- `misconceptions`

When LLM determines it has enough, it returns `done: true` with `extracted_fields`. A content spine summary card appears in the chat.

Typing indicator (bouncing dots animation) shown while waiting for LLM response.

### Phase 3 — Brief Review

Renders existing `BriefReview` component inline. User approves or edits. On approve, frontend batch-fires state machine events: `round1_confirm` → `round2_confirm` → `generate_content_spine` → `round3_confirm` → `brief_approve` → gate1 → Director generates outline.

## UI Layout

```
+--sidebar--+--chat-area---------------------------------------+
|            | [header: "Video Briefing"  [Core Intent|Delivery|Content Spine|Review]]
| 1 Briefing |                                                  |
| 2 Outline  | [chat messages scroll area]                      |
| 3 Draft    |   AI bubble → user bubble → AI bubble → ...     |
| 4 Review   |                                                  |
|            | [input bar: [text input] [send] [chip] [chip]...]|
+------------+--------------------------------------------------+
```

### Header Section Chips
- Right side of header, inline with "Video Briefing" title
- Style: 8px border-radius, 12px font, 600 weight
- Active: `#3A6B47` background, white text
- Done: white background, `#333` text, `#ccc` border
- Locked: white background, `#999` text, `#ddd` border
- Sections unlock progressively as previous section completes

### Chat Input Bar
- Text input on the left, send button next to it
- Quick-reply chips on the right side of the same row (when current question has chip options)
- Chips disappear when question is answered or during Phase 2 freeform input

### Message Bubbles
- AI: left-aligned, `P` avatar (sage green circle), white bubble with `#D9DDD2` border, top-left square corner
- User: right-aligned, `Q` avatar, `#3A6B47` bubble with white text, top-right square corner
- Chip selection appears as user bubble with selected chip rendered inline

### Typography
- Body: `'Nunito', system-ui, -apple-system, sans-serif` (15px, line-height 1.55)
- Headings: `'Fraunces', serif`
- Colors: sage scale from index.css (`#1C2118` foreground, `#626B58` muted, `#3A6B47` accent, `#D9DDD2` borders)

## Data Architecture

### ChatMessage

```typescript
interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  chips?: { value: string; label: string }[];
  selectedChip?: string;
  fieldKey?: string;
  phase: 1 | 2 | 3;
}
```

### Data Flow

```
OnboardingPage → sessionStorage (topic, duration, audience)
  → /storyboard/{id}
    → ChatBriefBuilder reads sessionStorage + pipeline-state
      → Phase 1: each answer writes to fields dict (no LLM)
      → Phase 2: POST /chat-brief with full messages[] + fields_so_far
      → Phase 3: BriefReview → approve → batch state machine events → gate1
```

All `ChatMessage[]` auto-saved to `/api/project/{id}/stages` alongside brief fields. Page refresh restores conversation position.

## Backend: `/chat-brief` Endpoint

```
POST /api/project/{project_id}/chat-brief
Body: {
  "messages": [...],           // full conversation history
  "fields_so_far": {...},      // collected brief fields
  "onboarding": {              // from OnboardingPage
    "topic": "...",
    "duration": 600,
    "audience": "..."
  }
}

Response: {
  "reply": "...",
  "extracted_fields": {...} | null,
  "done": false
}
```

No new agent class. Direct OpenAI call with system prompt from `prompts/chat_brief_prompt.md`.

System prompt instructs LLM to:
- Help user articulate POV, talking points, misconceptions
- See all collected fields + full conversation history
- Guide in 2-4 turns (don't ask everything at once)
- Output JSON `extracted_fields` when `done: true`

## Frontend Components

```
StageContent (stage 1)
  └─ ChatBriefBuilder          ← new, replaces KnowledgeShareBriefBuilder
       ├─ ChatThread            ← message list
       │    └─ MessageBubble    ← single message (text / chip-selected / summary card)
       ├─ ChatInput             ← input + send + inline chips
       └─ BriefReview           ← existing, rendered in Phase 3
```

### State

```typescript
const [messages, setMessages] = useState<ChatMessage[]>([]);
const [phase, setPhase] = useState<1 | 2 | 3>(1);
const [fields, setFields] = useState<Record<string, BriefField>>({});
const [isLlmLoading, setIsLlmLoading] = useState(false);
const [questionIndex, setQuestionIndex] = useState(0);
```

### Phase Transitions
- Phase 1 → Phase 2: when `questionIndex` reaches end of `PHASE1_QUESTIONS`
- Phase 2 → Phase 3: when `/chat-brief` returns `done: true`

## Files to Delete/Deprecate

- `KnowledgeShareBriefBuilder.tsx`
- `RoundOneForm.tsx`
- `RoundTwoForm.tsx`
- `RoundThreeForm.tsx`
- `FieldCard.tsx`
- `CollapsibleSection.tsx`

## Preview

Static HTML mockup: `frontend/preview-chat-brief.html` (serve via `python3 -m http.server 8765`)
