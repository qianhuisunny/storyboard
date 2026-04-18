# Chat-Based Brief Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 3-tab form BriefBuilder with a single chat interface for Stage 1 briefing.

**Architecture:** Deterministic chat for Phase 1 (3 hardcoded questions), LLM conversation for Phase 2 (content spine extraction via new `/chat-brief` endpoint), then reuse existing BriefReview for Phase 3. Frontend is a new `ChatBriefBuilder` component tree that replaces `KnowledgeShareBriefBuilder` in `StageContent.tsx`.

**Tech Stack:** React/TypeScript (frontend), FastAPI/Python (backend), Anthropic Claude API (LLM), existing BriefField types

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `frontend/src/components/ChatBriefBuilder/types.ts` | `ChatMessage` interface, `PHASE1_QUESTIONS` config |
| Create | `frontend/src/components/ChatBriefBuilder/ChatBriefBuilder.tsx` | Main container: phase state machine, message list, field accumulation |
| Create | `frontend/src/components/ChatBriefBuilder/ChatThread.tsx` | Scrollable message list renderer |
| Create | `frontend/src/components/ChatBriefBuilder/MessageBubble.tsx` | Single message: AI bubble, user bubble, chip-selected bubble, summary card |
| Create | `frontend/src/components/ChatBriefBuilder/ChatInput.tsx` | Text input + send button |
| Create | `frontend/src/components/ChatBriefBuilder/index.ts` | Re-export |
| Create | `prompts/chat_brief_prompt.md` | System prompt for Phase 2 LLM conversation |
| Modify | `backend/app/main.py` | Add `POST /api/project/{id}/chat-brief` endpoint |
| Modify | `frontend/src/components/StageContent.tsx:869-886` | Replace `KnowledgeShareBriefBuilder` with `ChatBriefBuilder` |

---

### Task 1: ChatMessage types and Phase 1 question config

**Files:**
- Create: `frontend/src/components/ChatBriefBuilder/types.ts`

- [ ] **Step 1: Create types file with ChatMessage interface and PHASE1_QUESTIONS**

```typescript
// frontend/src/components/ChatBriefBuilder/types.ts

export interface ChatMessage {
  id: string;
  role: "ai" | "user";
  content: string;
  chips?: { value: string; label: string }[];
  selectedChip?: string;
  fieldKey?: string;
  phase: 1 | 2 | 3;
}

export interface Phase1Question {
  fieldKey: string;
  aiMessage: string;
  chips?: { value: string; label: string }[];
}

export const PHASE1_QUESTIONS: Phase1Question[] = [
  {
    fieldKey: "viewer_outcome",
    aiMessage:
      "What do you want people to know, do, or believe by the end of watching this video?",
  },
  {
    fieldKey: "audience_level",
    aiMessage: "How familiar is your audience with this topic?",
    chips: [
      { value: "beginner", label: "Beginner" },
      { value: "intermediate", label: "Intermediate" },
      { value: "advanced", label: "Advanced" },
      { value: "mixed", label: "Mixed" },
    ],
  },
  {
    fieldKey: "freshness_expectation",
    aiMessage: "How time-sensitive is this content?",
    chips: [
      { value: "evergreen", label: "Evergreen" },
      { value: "current_year", label: "Current-year" },
      { value: "fast_changing", label: "Fast-changing" },
    ],
  },
];
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors from the new file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatBriefBuilder/types.ts
git commit -m "feat: add ChatMessage types and Phase 1 question config"
```

---

### Task 2: MessageBubble component

**Files:**
- Create: `frontend/src/components/ChatBriefBuilder/MessageBubble.tsx`

- [ ] **Step 1: Create MessageBubble component**

This renders a single chat message. AI messages are left-aligned with a sage-green `P` avatar circle, white bubble with `#D9DDD2` border, top-left square corner. User messages are right-aligned with a `Q` avatar, `#3A6B47` bubble with white text, top-right square corner. Chip questions show chips under the AI bubble. When a chip is selected, it becomes a user bubble.

```tsx
// frontend/src/components/ChatBriefBuilder/MessageBubble.tsx

import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
  onChipSelect?: (value: string) => void;
  isLatest?: boolean;
}

function Avatar({ letter, isAi }: { letter: string; isAi: boolean }) {
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: 32,
        height: 32,
        backgroundColor: isAi ? "#3A6B47" : "#626B58",
        color: "#fff",
        fontSize: 14,
        fontWeight: 700,
        fontFamily: "'Fraunces', serif",
      }}
    >
      {letter}
    </div>
  );
}

export default function MessageBubble({
  message,
  onChipSelect,
  isLatest = false,
}: MessageBubbleProps) {
  const isAi = message.role === "ai";
  const showChips =
    isAi && message.chips && !message.selectedChip && isLatest;

  return (
    <div
      className={`flex gap-3 ${isAi ? "justify-start" : "justify-end"}`}
      style={{ marginBottom: 6 }}
    >
      {isAi && <Avatar letter="P" isAi />}

      <div style={{ maxWidth: "75%" }}>
        <div
          style={{
            padding: "12px 16px",
            fontSize: 15,
            lineHeight: 1.55,
            fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
            whiteSpace: "pre-wrap",
            ...(isAi
              ? {
                  backgroundColor: "#fff",
                  border: "1px solid #D9DDD2",
                  borderRadius: "2px 16px 16px 16px",
                  color: "#1C2118",
                }
              : {
                  backgroundColor: "#3A6B47",
                  borderRadius: "16px 2px 16px 16px",
                  color: "#fff",
                }),
          }}
        >
          {message.content}
        </div>

        {showChips && (
          <div className="flex flex-wrap gap-2" style={{ marginTop: 8 }}>
            {message.chips!.map((chip) => (
              <button
                key={chip.value}
                onClick={() => onChipSelect?.(chip.value)}
                className="transition-colors hover:bg-[#E8F0E9]"
                style={{
                  padding: "6px 14px",
                  borderRadius: 8,
                  border: "1px solid #D9DDD2",
                  backgroundColor: "#fff",
                  color: "#1C2118",
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {!isAi && <Avatar letter="Q" isAi={false} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatBriefBuilder/MessageBubble.tsx
git commit -m "feat: add MessageBubble component with AI/user bubble styles"
```

---

### Task 3: ChatThread component

**Files:**
- Create: `frontend/src/components/ChatBriefBuilder/ChatThread.tsx`

- [ ] **Step 1: Create ChatThread — scrollable message list with auto-scroll and typing indicator**

```tsx
// frontend/src/components/ChatBriefBuilder/ChatThread.tsx

import { useEffect, useRef } from "react";
import type { ChatMessage } from "./types";
import MessageBubble from "./MessageBubble";

interface ChatThreadProps {
  messages: ChatMessage[];
  onChipSelect?: (value: string) => void;
  isLlmLoading?: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 justify-start" style={{ marginBottom: 6 }}>
      <div
        className="flex-shrink-0 rounded-full flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          backgroundColor: "#3A6B47",
          color: "#fff",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: "'Fraunces', serif",
        }}
      >
        P
      </div>
      <div
        style={{
          padding: "14px 20px",
          backgroundColor: "#fff",
          border: "1px solid #D9DDD2",
          borderRadius: "2px 16px 16px 16px",
          display: "flex",
          gap: 5,
          alignItems: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              backgroundColor: "#626B58",
              display: "inline-block",
              animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            }}
          />
        ))}
        <style>{`
          @keyframes typingBounce {
            0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
            30% { transform: translateY(-6px); opacity: 1; }
          }
        `}</style>
      </div>
    </div>
  );
}

export default function ChatThread({
  messages,
  onChipSelect,
  isLlmLoading = false,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isLlmLoading]);

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ padding: "24px 32px" }}
    >
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onChipSelect={onChipSelect}
          isLatest={idx === messages.length - 1}
        />
      ))}
      {isLlmLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatBriefBuilder/ChatThread.tsx
git commit -m "feat: add ChatThread component with auto-scroll and typing indicator"
```

---

### Task 4: ChatInput component

**Files:**
- Create: `frontend/src/components/ChatBriefBuilder/ChatInput.tsx`

- [ ] **Step 1: Create ChatInput — text input + send button, nothing else**

```tsx
// frontend/src/components/ChatBriefBuilder/ChatInput.tsx

import { useState, useRef, useEffect } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your answer...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div
      className="flex-shrink-0 border-t border-[#D9DDD2]"
      style={{ padding: "14px 32px" }}
    >
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 outline-none"
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #D9DDD2",
            fontSize: 15,
            fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
            color: "#1C2118",
            backgroundColor: "#fff",
          }}
        />
        <button
          onClick={handleSend}
          disabled={disabled || !text.trim()}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor:
              disabled || !text.trim() ? "#D9DDD2" : "#3A6B47",
            color: "#fff",
            border: "none",
            cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
          }}
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ChatBriefBuilder/ChatInput.tsx
git commit -m "feat: add ChatInput component with text input and send button"
```

---

### Task 5: ChatBriefBuilder main container

**Files:**
- Create: `frontend/src/components/ChatBriefBuilder/ChatBriefBuilder.tsx`
- Create: `frontend/src/components/ChatBriefBuilder/index.ts`

This is the core component. It manages the 3-phase state machine:
- Phase 1: deterministic questions from `PHASE1_QUESTIONS`, no LLM
- Phase 2: sends full message history to `/chat-brief`, LLM guides content spine extraction
- Phase 3: renders existing `BriefReview` component inline

- [ ] **Step 1: Create the ChatBriefBuilder component**

```tsx
// frontend/src/components/ChatBriefBuilder/ChatBriefBuilder.tsx

import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage } from "./types";
import { PHASE1_QUESTIONS } from "./types";
import ChatThread from "./ChatThread";
import ChatInput from "./ChatInput";
import BriefReview from "../BriefBuilder/RoundForms/BriefReview";
import type { BriefField } from "../BriefBuilder/types";

interface ChatBriefBuilderProps {
  projectId: string;
  initialFields?: Record<string, BriefField>;
  isAlreadyApproved?: boolean;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}

type Phase = 1 | 2 | 3;

type ActiveSection = "core_intent" | "delivery" | "content_spine" | "review";

function sectionForPhase(phase: Phase, questionIndex: number): ActiveSection {
  if (phase === 1) return "core_intent";
  if (phase === 2) return "content_spine";
  return "review";
}

function SectionChips({ active }: { active: ActiveSection }) {
  const sections: { key: ActiveSection; label: string }[] = [
    { key: "core_intent", label: "Core Intent" },
    { key: "content_spine", label: "Content Spine" },
    { key: "review", label: "Review" },
  ];

  const activeIdx = sections.findIndex((s) => s.key === active);

  return (
    <div className="flex gap-2">
      {sections.map((s, idx) => {
        const isActive = s.key === active;
        const isDone = idx < activeIdx;
        const isLocked = idx > activeIdx;

        return (
          <span
            key={s.key}
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
              ...(isActive
                ? { backgroundColor: "#3A6B47", color: "#fff" }
                : isDone
                ? {
                    backgroundColor: "#fff",
                    color: "#333",
                    border: "1px solid #ccc",
                  }
                : {
                    backgroundColor: "#fff",
                    color: "#999",
                    border: "1px solid #ddd",
                  }),
            }}
          >
            {s.label}
          </span>
        );
      })}
    </div>
  );
}

let msgIdCounter = 0;
function nextId(): string {
  return `msg-${++msgIdCounter}-${Date.now()}`;
}

export default function ChatBriefBuilder({
  projectId,
  initialFields,
  isAlreadyApproved = false,
  onBriefApprove,
  onEditBrief,
}: ChatBriefBuilderProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Phase>(isAlreadyApproved ? 3 : 1);
  const [fields, setFields] = useState<Record<string, BriefField>>(() => {
    if (initialFields && Object.keys(initialFields).length > 0) {
      return initialFields;
    }
    return {};
  });
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Seed the first AI message on mount
  useEffect(() => {
    if (initialized.current || isAlreadyApproved) return;
    initialized.current = true;

    const firstQ = PHASE1_QUESTIONS[0];
    setMessages([
      {
        id: nextId(),
        role: "ai",
        content: firstQ.aiMessage,
        chips: firstQ.chips,
        fieldKey: firstQ.fieldKey,
        phase: 1,
      },
    ]);
  }, [isAlreadyApproved]);

  // Update fields when initialFields changes
  useEffect(() => {
    if (initialFields && Object.keys(initialFields).length > 0) {
      setFields((prev) => ({ ...prev, ...initialFields }));
    }
  }, [initialFields]);

  const addMessages = useCallback((...msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
  }, []);

  // Handle user answering a Phase 1 question (text or chip)
  const handlePhase1Answer = useCallback(
    (answer: string, chipLabel?: string) => {
      const currentQ = PHASE1_QUESTIONS[questionIndex];
      if (!currentQ) return;

      // Add user message
      const userMsg: ChatMessage = {
        id: nextId(),
        role: "user",
        content: chipLabel || answer,
        selectedChip: chipLabel ? answer : undefined,
        fieldKey: currentQ.fieldKey,
        phase: 1,
      };

      // Update the last AI message to mark the chip as selected
      setMessages((prev) => {
        const updated = [...prev];
        const lastAiIdx = updated.length - 1;
        if (
          updated[lastAiIdx]?.role === "ai" &&
          updated[lastAiIdx]?.chips
        ) {
          updated[lastAiIdx] = {
            ...updated[lastAiIdx],
            selectedChip: answer,
          };
        }
        return [...updated, userMsg];
      });

      // Store the field value
      setFields((prev) => ({
        ...prev,
        [currentQ.fieldKey]: {
          value: answer,
          source: "extracted",
          confirmed: true,
        },
      }));

      const nextIdx = questionIndex + 1;

      if (nextIdx < PHASE1_QUESTIONS.length) {
        // Ask next Phase 1 question
        setQuestionIndex(nextIdx);
        const nextQ = PHASE1_QUESTIONS[nextIdx];
        setTimeout(() => {
          addMessages({
            id: nextId(),
            role: "ai",
            content: nextQ.aiMessage,
            chips: nextQ.chips,
            fieldKey: nextQ.fieldKey,
            phase: 1,
          });
        }, 400);
      } else {
        // Phase 1 complete, transition to Phase 2
        setPhase(2);
        setIsLlmLoading(true);

        // Fire the first Phase 2 LLM call
        const allFieldsSoFar = {
          ...fields,
          [currentQ.fieldKey]: {
            value: answer,
            source: "extracted",
            confirmed: true,
          },
        };
        callChatBrief(
          [...messages, userMsg],
          allFieldsSoFar
        );
      }
    },
    [questionIndex, fields, messages, addMessages]
  );

  // Handle chip select (Phase 1)
  const handleChipSelect = useCallback(
    (value: string) => {
      const currentQ = PHASE1_QUESTIONS[questionIndex];
      const chip = currentQ?.chips?.find((c) => c.value === value);
      handlePhase1Answer(value, chip?.label);
    },
    [questionIndex, handlePhase1Answer]
  );

  // Handle text send
  const handleSend = useCallback(
    (text: string) => {
      if (phase === 1) {
        handlePhase1Answer(text);
      } else if (phase === 2) {
        // Phase 2: add user message, call LLM
        const userMsg: ChatMessage = {
          id: nextId(),
          role: "user",
          content: text,
          phase: 2,
        };
        addMessages(userMsg);
        setIsLlmLoading(true);
        callChatBrief([...messages, userMsg], fields);
      }
    },
    [phase, handlePhase1Answer, messages, fields, addMessages]
  );

  // Call the /chat-brief backend endpoint
  const callChatBrief = async (
    currentMessages: ChatMessage[],
    fieldsSoFar: Record<string, BriefField>
  ) => {
    setError(null);

    // Read onboarding data from sessionStorage
    const topic = sessionStorage.getItem("storyboardPrompt") || "";
    const duration = parseInt(
      sessionStorage.getItem("storyboardDuration") || "300",
      10
    );
    const audience = sessionStorage.getItem("storyboardAudience") || "";

    try {
      const resp = await fetch(
        `/api/project/${projectId}/chat-brief`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: currentMessages.map((m) => ({
              role: m.role,
              content: m.content,
              fieldKey: m.fieldKey,
            })),
            fields_so_far: fieldsSoFar,
            onboarding: { topic, duration, audience },
          }),
        }
      );

      if (!resp.ok) {
        throw new Error(`Chat brief request failed: ${resp.status}`);
      }

      const data = await resp.json();

      // Add AI reply
      const aiMsg: ChatMessage = {
        id: nextId(),
        role: "ai",
        content: data.reply,
        phase: 2,
      };
      addMessages(aiMsg);

      // If done, extract fields and move to Phase 3
      if (data.done && data.extracted_fields) {
        const extractedFields: Record<string, BriefField> = {};
        for (const [key, value] of Object.entries(data.extracted_fields)) {
          extractedFields[key] = {
            value: value as string | string[],
            source: "inferred",
            confirmed: false,
          };
        }
        setFields((prev) => ({ ...prev, ...extractedFields }));

        // Show summary card
        setTimeout(() => {
          addMessages({
            id: nextId(),
            role: "ai",
            content:
              "I've put together your content spine. Take a look at the review below and approve when you're ready.",
            phase: 2,
          });
          setPhase(3);
        }, 600);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get AI response"
      );
    } finally {
      setIsLlmLoading(false);
    }
  };

  // Handle brief approval — fires batch state machine events
  const handleApprove = useCallback(async () => {
    try {
      // Batch-fire state machine events:
      // round1_confirm → round2_confirm → generate_content_spine → round3_confirm → brief_approve
      // We send all fields accumulated from the chat to each event.
      const allFields: Record<string, BriefField> = { ...fields };

      // Ensure all fields are marked confirmed
      for (const key of Object.keys(allFields)) {
        allFields[key] = { ...allFields[key], confirmed: true };
      }

      await onBriefApprove(allFields);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to approve brief"
      );
    }
  }, [fields, onBriefApprove]);

  const handleEdit = useCallback(() => {
    setPhase(1);
    setQuestionIndex(0);
    setMessages([]);
    initialized.current = false;
    onEditBrief();
  }, [onEditBrief]);

  const activeSection = sectionForPhase(phase, questionIndex);

  // Phase 3: show BriefReview
  if (phase === 3 || isAlreadyApproved) {
    return (
      <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between border-b border-[#D9DDD2]"
          style={{ padding: "14px 32px" }}
        >
          <h2
            style={{
              fontSize: 18,
              fontWeight: 700,
              fontFamily: "'Fraunces', serif",
              color: "#1C2118",
              margin: 0,
            }}
          >
            Video Briefing
          </h2>
          <SectionChips active="review" />
        </div>

        {/* Chat thread (collapsed) + Review */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: "24px 32px" }}
        >
          <BriefReview
            fields={fields}
            onEditBrief={handleEdit}
            onApproveBrief={handleApprove}
            disabled={false}
            isAlreadyApproved={isAlreadyApproved}
          />
        </div>

        {error && (
          <div
            className="flex-shrink-0"
            style={{
              padding: "10px 32px",
              backgroundColor: "#FBEAE8",
              color: "#A63228",
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  // Phase 1 & 2: chat interface
  return (
    <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center justify-between border-b border-[#D9DDD2]"
        style={{ padding: "14px 32px" }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            fontFamily: "'Fraunces', serif",
            color: "#1C2118",
            margin: 0,
          }}
        >
          Video Briefing
        </h2>
        <SectionChips active={activeSection} />
      </div>

      {/* Chat thread */}
      <ChatThread
        messages={messages}
        onChipSelect={handleChipSelect}
        isLlmLoading={isLlmLoading}
      />

      {/* Error */}
      {error && (
        <div
          className="flex-shrink-0"
          style={{
            padding: "10px 32px",
            backgroundColor: "#FBEAE8",
            color: "#A63228",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={isLlmLoading}
        placeholder={
          phase === 1
            ? "Type your answer..."
            : "Tell me about your content..."
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Create index.ts re-export**

```typescript
// frontend/src/components/ChatBriefBuilder/index.ts

export { default as ChatBriefBuilder } from "./ChatBriefBuilder";
export type { ChatMessage } from "./types";
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ChatBriefBuilder/
git commit -m "feat: add ChatBriefBuilder main container with phase state machine"
```

---

### Task 6: Backend `/chat-brief` endpoint + prompt

**Files:**
- Create: `prompts/chat_brief_prompt.md`
- Modify: `backend/app/main.py` — add new endpoint

- [ ] **Step 1: Create the chat brief system prompt**

```markdown
# prompts/chat_brief_prompt.md

# Content Spine Conversation Guide

You are helping a video creator develop the content spine for their knowledge-share video. You have context about their video from the brief fields collected so far.

## Your Goal

Through natural conversation (2-4 exchanges), extract three things:
1. **Point of View** — the creator's unique angle or thesis on the topic
2. **Core Talking Points** — 3-5 key points that support the POV (as a JSON array of strings)
3. **Misconceptions** — 1 common misconception the video will address (as a string)

## Conversation Strategy

- Start by reflecting back what you understand about their video goal and audience, then ask about their unique perspective or angle
- Listen for the POV in their response — it's the thesis statement or "hot take"
- Once you have a POV, probe for the 2-3 strongest supporting points
- Ask about what people commonly get wrong about this topic
- Don't ask all questions at once — build on each response naturally

## When You Have Enough

When you have enough to extract all three fields, set `done: true` in your response. You must respond in valid JSON:

```json
{
  "reply": "Your conversational message to the user summarizing what you captured",
  "done": true,
  "extracted_fields": {
    "point_of_view": "The creator's POV as a clear thesis statement",
    "core_talking_points": ["Point 1", "Point 2", "Point 3"],
    "misconceptions": "One common misconception"
  }
}
```

When you need more information, respond with:

```json
{
  "reply": "Your conversational question or follow-up",
  "done": false,
  "extracted_fields": null
}
```

## Rules

- Always respond in the JSON format above — no plain text
- Keep replies concise (2-3 sentences max)
- Be warm and encouraging but focused
- Don't repeat information back verbatim — paraphrase to show understanding
- If the user gives you everything in one message, it's fine to set done: true on your first reply
- Maximum 4 exchanges before you must extract what you have and set done: true
```

- [ ] **Step 2: Add the `/chat-brief` endpoint to `main.py`**

Add this after the existing `/api/project/{project_id}/event` endpoint. Find the right insertion point in `main.py` (after the event endpoint, before stages).

The endpoint makes a direct LLM call (no agent class needed — spec says "No new agent class. Direct OpenAI call with system prompt"):

```python
# Add this Pydantic model near the top with other models:

class ChatBriefRequest(BaseModel):
    messages: list
    fields_so_far: dict
    onboarding: dict

# Add this endpoint:

@app.post("/api/project/{project_id}/chat-brief")
async def chat_brief(project_id: str, request: ChatBriefRequest):
    """Phase 2 chat-based content spine extraction. Direct LLM call, no agent class."""
    try:
        # Load system prompt
        prompt_path = Path(__file__).parent.parent.parent / "prompts" / "chat_brief_prompt.md"
        if not prompt_path.exists():
            raise HTTPException(status_code=500, detail="Chat brief prompt not found")
        system_prompt = prompt_path.read_text(encoding="utf-8")

        # Build user prompt with context
        fields_summary = "\n".join(
            f"- {k}: {v.get('value', v) if isinstance(v, dict) else v}"
            for k, v in request.fields_so_far.items()
            if (v.get("value") if isinstance(v, dict) else v)
        )

        conversation = "\n".join(
            f"{'AI' if m.get('role') == 'ai' else 'User'}: {m.get('content', '')}"
            for m in request.messages
        )

        user_prompt = f"""## ONBOARDING CONTEXT
- Topic: {request.onboarding.get('topic', '')}
- Duration: {request.onboarding.get('duration', 300)} seconds
- Audience: {request.onboarding.get('audience', '')}

## COLLECTED BRIEF FIELDS
{fields_summary or '(none yet)'}

## CONVERSATION SO FAR
{conversation}

Respond with the next JSON message."""

        # Direct Anthropic API call
        import anthropic
        client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0.7,
            max_tokens=1000,
        )

        response_text = response.content[0].text

        # Parse JSON from response
        import re
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if not json_match:
            return {"reply": "I'm having trouble processing that. Could you try again?", "done": False, "extracted_fields": None}

        parsed = json.loads(json_match.group())
        return {
            "reply": parsed.get("reply", ""),
            "done": parsed.get("done", False),
            "extracted_fields": parsed.get("extracted_fields"),
        }

    except json.JSONDecodeError:
        return {"reply": "I had trouble understanding that. Could you rephrase?", "done": False, "extracted_fields": None}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat brief error: {str(e)}")
```

- [ ] **Step 3: Verify backend starts**

Run: `cd backend && source venv/bin/activate && timeout 10 python -c "from app.main import app; print('OK')" 2>&1`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add prompts/chat_brief_prompt.md backend/app/main.py
git commit -m "feat: add /chat-brief endpoint and content spine conversation prompt"
```

---

### Task 7: Wire ChatBriefBuilder into StageContent

**Files:**
- Modify: `frontend/src/components/StageContent.tsx:7,869-886`

This replaces the `KnowledgeShareBriefBuilder` render block with `ChatBriefBuilder`. The new component has a simpler props interface — it handles the phase state machine internally. The batch state-machine events on approve still flow through `handleKnowledgeShareBriefApprove`.

- [ ] **Step 1: Add import for ChatBriefBuilder**

In `frontend/src/components/StageContent.tsx`, at line 7 where existing imports are, add:

```typescript
import { ChatBriefBuilder } from "./ChatBriefBuilder";
```

- [ ] **Step 2: Replace the KnowledgeShareBriefBuilder render block**

Replace lines 868-886 (the `if (stage.id === 1 && USE_KNOWLEDGE_SHARE_FLOW ...)` block):

**Old:**
```tsx
  if (stage.id === 1 && USE_KNOWLEDGE_SHARE_FLOW && isKnowledgeShare && projectId) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        {/* RESEARCH DISABLED: Single-panel layout (was split 60/40 with TabbedResearchPanel) */}
        <KnowledgeShareBriefBuilder
          projectId={projectId}
          initialFields={knowledgeShareFields}
          initialRound={knowledgeShareRound}
          researchComplete={true}
          isResearchRunning={false}
          isAlreadyApproved={isBriefAlreadyApproved}
          onRoundConfirm={handleKnowledgeShareRoundConfirm}
          onGenerateContentSpine={handleGenerateContentSpine}
          onBriefApprove={handleKnowledgeShareBriefApprove}
          onEditBrief={handleKnowledgeShareEditBrief}
        />
      </div>
    );
  }
```

**New:**
```tsx
  if (stage.id === 1 && USE_KNOWLEDGE_SHARE_FLOW && isKnowledgeShare && projectId) {
    return (
      <div className="flex-1 flex flex-col" style={{ minHeight: 0, height: "100%" }}>
        <ChatBriefBuilder
          projectId={projectId}
          initialFields={knowledgeShareFields}
          isAlreadyApproved={isBriefAlreadyApproved}
          onBriefApprove={handleKnowledgeShareBriefApprove}
          onEditBrief={handleKnowledgeShareEditBrief}
        />
      </div>
    );
  }
```

- [ ] **Step 3: Verify build passes**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds. There may be warnings about unused imports (`KnowledgeShareBriefBuilder`, `handleKnowledgeShareRoundConfirm`, `handleGenerateContentSpine`) — those are OK for now; they'll be cleaned up in Task 9.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StageContent.tsx
git commit -m "feat: wire ChatBriefBuilder into StageContent, replacing KnowledgeShareBriefBuilder"
```

---

### Task 8: Update brief approval to batch-fire state machine events

**Files:**
- Modify: `frontend/src/components/StageContent.tsx` — update `handleKnowledgeShareBriefApprove`

The old flow sent individual events per round. The chat-based flow collects all fields in one pass, then needs to batch-fire: `submit_knowledge_share` (if not already submitted) → `round1_confirm` → `round2_confirm` → `generate_content_spine` → `round3_confirm` → `brief_approve`.

But the existing `handleKnowledgeShareBriefApprove` already sends `brief_approve` with all fields and the orchestrator handles locking + Director. The issue is that the state machine needs to be in `brief_review` phase before `brief_approve` can fire.

The simplest approach: add a new backend endpoint that accepts all fields at once and batch-transitions internally. OR, modify the orchestrator to accept `brief_approve` from `brief_round1` phase. Let's take the simpler path — add a single backend handler.

- [ ] **Step 1: Add `chat_brief_approve` handler to orchestrator**

In `backend/app/services/orchestrator.py`, add a new handler and register it:

Add to `_get_handler` dict:
```python
("brief_round1", "chat_brief_approve"): self._handle_chat_brief_approve,
("brief_round2", "chat_brief_approve"): self._handle_chat_brief_approve,
("brief_round3", "chat_brief_approve"): self._handle_chat_brief_approve,
("brief_review", "chat_brief_approve"): self._handle_chat_brief_approve,
```

Add the handler method:
```python
async def _handle_chat_brief_approve(
    self,
    state: StoryboardState,
    manager: StateManager,
    payload: dict,
    result: dict
) -> tuple:
    """
    Handle chat-based brief approval.
    Accepts all fields at once, batch-transitions through rounds, then runs Director.
    """
    all_fields = payload.get("all_fields", {})
    if not all_fields:
        raise ValueError("all_fields is required in payload")

    # Store all fields in state
    state.confirmed_fields = all_fields
    if not state.story_brief:
        state.story_brief = {"round": "review", "fields": all_fields}
    else:
        state.story_brief["round"] = "review"
        state.story_brief["fields"] = {
            **state.story_brief.get("fields", {}),
            **all_fields,
        }

    # Force phase to brief_review for the approve transition
    state.phase = "brief_review"

    # Lock the brief
    state = manager.lock_brief(state)

    # Transition to gate1
    state = manager.transition(state, "brief_approve")

    # Immediately run Director (combining brief_approve + gate1_approve)
    state = manager.transition(state, "approve")  # gate1 → outline
    screen_outline = self.agents["director"].run(state)
    state.screen_outline = screen_outline
    state = manager.transition(state, "outline_ready")  # outline → gate2

    result["message"] = "Screen Outline ready for review"
    result["story_brief"] = state.story_brief
    result["brief_locked"] = True
    result["screen_outline"] = screen_outline

    return state, result
```

- [ ] **Step 2: Add transition entries in state.py**

Add to the `TRANSITIONS` dict in `StateManager`:
```python
("brief_round1", "chat_brief_approve"): "brief_review",
("brief_round2", "chat_brief_approve"): "brief_review",
("brief_round3", "chat_brief_approve"): "brief_review",
```

- [ ] **Step 3: Update the frontend to send `chat_brief_approve` event**

In `StageContent.tsx`, modify `handleKnowledgeShareBriefApprove` to send `chat_brief_approve` instead of `brief_approve`:

Find the line:
```typescript
        event: "brief_approve",
```

Replace with:
```typescript
        event: "chat_brief_approve",
```

- [ ] **Step 4: Verify backend starts**

Run: `cd backend && source venv/bin/activate && timeout 10 python -c "from app.main import app; print('OK')" 2>&1`
Expected: `OK`

- [ ] **Step 5: Verify frontend build**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/orchestrator.py backend/app/services/state.py frontend/src/components/StageContent.tsx
git commit -m "feat: add chat_brief_approve handler for batch state transitions"
```

---

### Task 9: Remove `delivery_tone` from BriefReview

**Files:**
- Modify: `frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx`

The spec says `delivery_tone` is removed. The chat doesn't ask it. Remove it from BriefReview so it doesn't show as "—".

- [ ] **Step 1: Remove `delivery_tone` from SECTION_2_FIELDS in BriefReview**

In `frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx`, change:

```typescript
const SECTION_2_FIELDS = [
  // [HACKATHON Apr18] hidden: "on_camera_presence", "broll_type"
  "delivery_tone",
  "freshness_expectation",
];
```

To:

```typescript
const SECTION_2_FIELDS = [
  // [HACKATHON Apr18] hidden: "on_camera_presence", "broll_type", "delivery_tone"
  "freshness_expectation",
];
```

- [ ] **Step 2: Verify build**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BriefBuilder/RoundForms/BriefReview.tsx
git commit -m "chore: remove delivery_tone from BriefReview (no longer asked in chat)"
```

---

### Task 10: Clean up unused imports and dead code

**Files:**
- Modify: `frontend/src/components/StageContent.tsx` — remove unused Knowledge Share handlers

- [ ] **Step 1: Remove unused handler functions and imports**

In `StageContent.tsx`, the following are no longer called by any render path:
- `handleKnowledgeShareRoundConfirm` (the per-round confirm callback)
- `handleGenerateContentSpine` (the content spine generation callback)
- `knowledgeShareRound` state variable (round tracking replaced by chat phases)

Also, `KnowledgeShareBriefBuilder` is no longer rendered. Remove its import from line 7:

From the import line:
```typescript
import { BriefBuilder, normalizeBrief, type StoryBrief, type BriefField, type BriefRound, KnowledgeShareBriefBuilder, type ProcessingLogEntry as LegacyProcessingLogEntry } from "./BriefBuilder";
```

Remove `KnowledgeShareBriefBuilder` from the destructured import:
```typescript
import { BriefBuilder, normalizeBrief, type StoryBrief, type BriefField, type BriefRound, type ProcessingLogEntry as LegacyProcessingLogEntry } from "./BriefBuilder";
```

Remove the `knowledgeShareRound` state variable and `setKnowledgeShareRound` calls. Remove `handleKnowledgeShareRoundConfirm` and `handleGenerateContentSpine` callback functions. Keep `handleKnowledgeShareBriefApprove` and `handleKnowledgeShareEditBrief` — those are still used.

- [ ] **Step 2: Verify frontend build**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no type errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/StageContent.tsx
git commit -m "chore: remove unused KnowledgeShareBriefBuilder imports and handlers"
```

---

### Task 11: End-to-end smoke test

**Files:** None (testing only)

- [ ] **Step 1: Start both servers**

Terminal 1: `cd backend && source venv/bin/activate && uvicorn app.main:app --reload --port 8001`
Terminal 2: `cd frontend && npm run dev`

- [ ] **Step 2: Create a new project and verify chat flow**

1. Open `http://localhost:3000` in browser
2. Create a new Knowledge Share project with topic, duration, audience
3. Verify Stage 1 shows the chat interface (not the old form)
4. Verify first AI message appears: "What do you want people to know..."
5. Type an answer → verify user bubble appears, next AI question appears
6. Select a chip for audience_level → verify chip disappears, user bubble shows selection
7. Select a chip for freshness → verify Phase 2 starts (typing indicator, then LLM response)
8. Answer 2-3 LLM questions → verify Phase 3 shows BriefReview
9. Click "Approve & Continue to Outline" → verify Director runs, outline appears

- [ ] **Step 3: Verify page refresh restores state**

After reaching Phase 3, refresh the page. Verify the review shows with correct fields.

- [ ] **Step 4: Verify already-approved projects show review mode**

Navigate to a project that's past brief stage. Verify it shows the "Brief Approved" state.

- [ ] **Step 5: Commit any fixes found during testing**

```bash
git add -A && git commit -m "fix: address issues found during chat brief smoke test"
```
