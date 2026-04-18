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

type ActiveSection = "core_intent" | "content_spine" | "review";

function sectionForPhase(phase: Phase, _questionIndex: number): ActiveSection {
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

  // Call the /chat-brief backend endpoint
  const callChatBrief = useCallback(
    async (
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
    },
    [projectId, addMessages]
  );

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
            source: "extracted" as const,
            confirmed: true,
          },
        };
        callChatBrief(
          [...messages, userMsg],
          allFieldsSoFar
        );
      }
    },
    [questionIndex, fields, messages, addMessages, callChatBrief]
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
    [phase, handlePhase1Answer, messages, fields, addMessages, callChatBrief]
  );

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
