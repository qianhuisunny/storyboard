// frontend/src/components/ChatBriefBuilder/ChatBriefBuilder.tsx

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { ChatMessage } from "./types";
import { getPhase1Questions, type Phase1Question } from "./types";
import ChatThread from "./ChatThread";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";
import BriefReview from "../BriefBuilder/RoundForms/BriefReview";
import OutlineLoadingView from "../OutlineLoadingView";
import type { BriefField } from "../BriefBuilder/types";
import { requestChatBrief } from "./chatBriefRequest";

interface ChatBriefBuilderProps {
  projectId: string;
  userId: string;
  initialFields?: Record<string, BriefField>;
  isAlreadyApproved?: boolean;
  onBriefApprove: (allFields: Record<string, BriefField>) => Promise<void>;
  onEditBrief: () => void;
}

type Phase = 1 | 2 | 3;

type ActiveSection = "core_intent" | "content_spine" | "review";

function sectionForPhase(phase: Phase): ActiveSection {
  if (phase === 1) return "core_intent";
  if (phase === 2) return "content_spine";
  return "review";
}

function SectionChips({ active, onNavigate }: { active: ActiveSection; onNavigate?: (section: ActiveSection) => void }) {
  const sections: { key: ActiveSection; label: string }[] = [
    { key: "core_intent", label: "1. Core Intent" },
    { key: "content_spine", label: "2. Key Narrative" },
    { key: "review", label: "3. Review Your Briefing" },
  ];

  const activeIdx = sections.findIndex((s) => s.key === active);

  return (
    <div className="flex gap-2">
      {sections.map((s, idx) => {
        const isActive = s.key === active;
        const isDone = idx < activeIdx;
        const canClick = isDone && onNavigate;

        return (
          <span
            key={s.key}
            onClick={canClick ? () => onNavigate(s.key) : undefined}
            style={{
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
              cursor: canClick ? "pointer" : "default",
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

const STORAGE_KEY = (id: string) => `chat-brief-${id}`;

function saveSession(projectId: string, data: { messages: ChatMessage[]; phase: Phase; questionIndex: number; fields: Record<string, BriefField> }) {
  try {
    sessionStorage.setItem(STORAGE_KEY(projectId), JSON.stringify(data));
  } catch { /* quota exceeded — ignore */ }
}

function loadSession(projectId: string): { messages: ChatMessage[]; phase: Phase; questionIndex: number; fields: Record<string, BriefField> } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY(projectId));
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted — ignore */ }
  return null;
}

function derivePhaseFromMessages(messages: ChatMessage[], fallback: Phase): Phase {
  const maxPhase = messages.reduce<Phase>((current, message) => {
    const next = message.phase as Phase;
    return next > current ? next : current;
  }, 1);
  return maxPhase || fallback;
}

function deriveQuestionIndexFromMessages(messages: ChatMessage[], questions: Phase1Question[]): number {
  const phase1Answers = messages.filter((message) => message.role === "user" && message.phase === 1).length;
  return Math.min(phase1Answers, questions.length - 1);
}

function messageFingerprint(message: ChatMessage): string {
  return JSON.stringify({
    role: message.role,
    content: message.content,
    phase: message.phase,
    fieldKey: message.fieldKey || null,
    selectedChip: message.selectedChip || null,
  });
}

export default function ChatBriefBuilder({
  projectId,
  userId,
  initialFields,
  isAlreadyApproved = false,
  onBriefApprove,
  onEditBrief,
}: ChatBriefBuilderProps) {
  const cached = loadSession(projectId);

  const [messages, setMessages] = useState<ChatMessage[]>(cached?.messages ?? []);
  const [phase, setPhase] = useState<Phase>(isAlreadyApproved ? 3 : cached?.phase ?? 1);
  const [fields, setFields] = useState<Record<string, BriefField>>(() => {
    if (isAlreadyApproved && initialFields && Object.keys(initialFields).length > 0) return initialFields;
    if (cached?.fields && Object.keys(cached.fields).length > 0) return cached.fields;
    if (initialFields && Object.keys(initialFields).length > 0) return initialFields;
    return {};
  });
  const intentRoute = useMemo(() => {
    const raw =
      fields.intent_route?.value ||
      fields.video_type?.value ||
      sessionStorage.getItem("storyboardIntentRoute");
    if (Array.isArray(raw)) return raw[0] || null;
    return raw ? String(raw) : null;
  }, [fields.intent_route?.value, fields.video_type?.value]);
  const phase1Questions = useMemo(() => getPhase1Questions(intentRoute), [intentRoute]);
  const [isLlmLoading, setIsLlmLoading] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(cached?.questionIndex ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditingReview, setIsEditingReview] = useState(false);
  const [hasHydratedHistory, setHasHydratedHistory] = useState(false);
  const [animatedMessageIds, setAnimatedMessageIds] = useState<Set<string>>(() => new Set());
  const initialized = useRef(cached !== null);
  const coreIntentRef = useRef<HTMLDivElement>(null);
  const contentSpineRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const syncedMessageFingerprintsRef = useRef<Record<string, string>>({});

  const handleSectionNavigate = useCallback((section: ActiveSection) => {
    if (phase === 3 || isAlreadyApproved) {
      const targetRef =
        section === "core_intent"
          ? coreIntentRef
          : section === "content_spine"
          ? contentSpineRef
          : reviewRef;
      targetRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const phaseMap: Record<ActiveSection, Phase> = {
      core_intent: 1,
      content_spine: 2,
      review: 3,
    };
    const targetPhase = phaseMap[section];
    if (targetPhase < phase) {
      setPhase(targetPhase);
    }
  }, [isAlreadyApproved, phase]);

  useEffect(() => {
    if (!isAlreadyApproved) return;
    setPhase(3);
    initialized.current = true;
  }, [isAlreadyApproved]);

  // Persist chat state to sessionStorage on every change
  useEffect(() => {
    saveSession(projectId, { messages, phase, questionIndex, fields });
  }, [messages, phase, questionIndex, fields, projectId]);

  // Hydrate persisted server-side chat history on mount.
  useEffect(() => {
    let cancelled = false;

    const loadPersistedHistory = async () => {
      try {
        const resp = await fetch(`/api/project/${projectId}/chat-messages`);
        if (!resp.ok) {
          setHasHydratedHistory(true);
          return;
        }

        const data = await resp.json();
        const persistedMessages = Array.isArray(data.messages) ? data.messages as ChatMessage[] : [];

        if (cancelled) return;

        if (persistedMessages.length > 0) {
          syncedMessageFingerprintsRef.current = Object.fromEntries(
            persistedMessages.map((message) => [message.id, messageFingerprint(message)])
          );
          setMessages(persistedMessages);
          setPhase((current) => (isAlreadyApproved ? 3 : derivePhaseFromMessages(persistedMessages, current)));
          setQuestionIndex(deriveQuestionIndexFromMessages(persistedMessages, phase1Questions));
          initialized.current = true;
        }
      } catch (err) {
        console.error("[ChatBriefBuilder] Failed to hydrate persisted chat history:", err);
      } finally {
        if (!cancelled) {
          setHasHydratedHistory(true);
        }
      }
    };

    loadPersistedHistory();

    return () => {
      cancelled = true;
    };
  }, [projectId, isAlreadyApproved, phase1Questions]);

  // Persist full chat history to the backend after hydration completes.
  useEffect(() => {
    if (!hasHydratedHistory) return;

    const changedMessages = messages.filter((message) => {
      const fingerprint = messageFingerprint(message);
      return syncedMessageFingerprintsRef.current[message.id] !== fingerprint;
    });

    if (changedMessages.length === 0) return;

    if (syncTimeoutRef.current !== null) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(async () => {
      try {
        const resp = await fetch(`/api/project/${projectId}/chat-messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: changedMessages }),
        });
        if (!resp.ok) {
          throw new Error(`Failed to persist chat messages: ${resp.status}`);
        }
        changedMessages.forEach((message) => {
          syncedMessageFingerprintsRef.current[message.id] = messageFingerprint(message);
        });
      } catch (err) {
        console.error("[ChatBriefBuilder] Failed to persist chat history:", err);
      }
    }, 400);

    return () => {
      if (syncTimeoutRef.current !== null) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [messages, projectId, hasHydratedHistory]);

  // Seed the first AI message on mount (only if no cached session)
  useEffect(() => {
    if (!hasHydratedHistory || initialized.current || isAlreadyApproved) return;
    initialized.current = true;

    const firstQ = phase1Questions[0];
    const firstMessageId = nextId();
    setMessages([
      {
        id: firstMessageId,
        role: "ai",
        content: firstQ.aiMessage,
        chips: firstQ.chips,
        fieldKey: firstQ.fieldKey,
        phase: 1,
      },
    ]);
    setAnimatedMessageIds(new Set([firstMessageId]));
  }, [isAlreadyApproved, hasHydratedHistory, phase1Questions]);

  // Merge initialFields on change, but never overwrite user-provided values with empty ones
  useEffect(() => {
    if (initialFields && Object.keys(initialFields).length > 0) {
      if (isAlreadyApproved) {
        setFields(initialFields);
        return;
      }

      setFields((prev) => {
        const merged = { ...prev };
        for (const [key, field] of Object.entries(initialFields)) {
          const existing = merged[key];
          const hasExisting = existing && existing.value && (
            Array.isArray(existing.value) ? existing.value.length > 0 : String(existing.value).trim() !== ""
          );
          if (!hasExisting) {
            merged[key] = field;
          }
        }
        return merged;
      });
    }
  }, [initialFields, isAlreadyApproved]);

  const addMessages = useCallback((...msgs: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...msgs]);
    const aiMessageIds = msgs.filter((msg) => msg.role === "ai").map((msg) => msg.id);
    if (aiMessageIds.length > 0) {
      setAnimatedMessageIds((prev) => {
        const next = new Set(prev);
        aiMessageIds.forEach((id) => next.add(id));
        return next;
      });
    }
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
      const sourceContext = sessionStorage.getItem("storyboardContext") || "";

      try {
        const resp = await requestChatBrief(projectId, userId, {
          messages: currentMessages.map((m) => ({
            role: m.role,
            content: m.content,
            fieldKey: m.fieldKey,
          })),
          fields_so_far: fieldsSoFar,
          onboarding: {
            topic,
            duration,
            audience,
            intent_route: intentRoute,
            content_mode: sessionStorage.getItem("storyboardContentMode") || "",
            source_context: sourceContext,
          },
        });

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
          // Merge without overwriting Phase 1 fields that already have values
          setFields((prev) => {
            const merged = { ...prev };
            for (const [key, field] of Object.entries(extractedFields)) {
              const existing = merged[key];
              const hasExisting = existing && existing.value && (
                Array.isArray(existing.value) ? existing.value.length > 0 : String(existing.value).trim() !== ""
              );
              const hasNew = field.value && (
                Array.isArray(field.value) ? field.value.length > 0 : String(field.value).trim() !== ""
              );
              if (!hasExisting || hasNew) {
                merged[key] = field;
              }
            }
            return merged;
          });

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
    [projectId, userId, addMessages, intentRoute]
  );

  // Handle user answering a Phase 1 question (text or chip)
  const handlePhase1Answer = useCallback(
    (answer: string, chipLabel?: string) => {
      const currentQ = phase1Questions[questionIndex];
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
      const fieldValue = currentQ.fieldKey === "broll_type" ? [answer] : answer;

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
          value: fieldValue,
          source: "extracted",
          confirmed: true,
        },
      }));

      const nextIdx = questionIndex + 1;

      if (nextIdx < phase1Questions.length) {
        // Ask next Phase 1 question
        setQuestionIndex(nextIdx);
        const nextQ = phase1Questions[nextIdx];
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
            value: fieldValue,
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
    [questionIndex, fields, messages, addMessages, callChatBrief, phase1Questions]
  );

  // Handle chip select (Phase 1)
  const handleChipSelect = useCallback(
    (value: string) => {
      const currentQ = phase1Questions[questionIndex];
      const chip = currentQ?.chips?.find((c) => c.value === value);
      handlePhase1Answer(value, chip?.label);
    },
    [questionIndex, handlePhase1Answer, phase1Questions]
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
      setIsGenerating(true);
      const allFields: Record<string, BriefField> = { ...fields };

      for (const key of Object.keys(allFields)) {
        allFields[key] = { ...allFields[key], confirmed: true };
      }

      await onBriefApprove(allFields);
    } catch (err) {
      setIsGenerating(false);
      setError(
        err instanceof Error ? err.message : "Failed to approve brief"
      );
    }
  }, [fields, onBriefApprove]);

  const handleEdit = useCallback(() => {
    setIsEditingReview(true);
    onEditBrief();
  }, [onEditBrief]);

  const handleSaveEditedBrief = useCallback((nextFields: Record<string, BriefField>) => {
    setFields(nextFields);
    setIsEditingReview(false);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setIsEditingReview(false);
  }, []);

  const activeSection = sectionForPhase(phase);
  const coreIntentMessages = messages.filter((msg) => msg.phase === 1);
  const contentSpineMessages = messages.filter((msg) => msg.phase === 2);

  // Phase 3: show BriefReview
  if (phase === 3 || isAlreadyApproved) {
    return (
      <div className="h-full flex flex-col" style={{ minHeight: 0 }}>
        {/* Header */}
        <div
          className="flex-shrink-0 flex items-center justify-between border-b border-[#D9DDD2]"
          style={{ padding: "14px 32px" }}
        >
          <div>
            <h2
              style={{
                fontSize: 18,
                fontWeight: 700,
                fontFamily: "'Fraunces', serif",
                color: "#1C2118",
                margin: 0,
              }}
            >
              {isGenerating ? "Video Outline" : "Video Briefing"}
            </h2>
            <p style={{ fontSize: 13, color: "#626B58", margin: 0 }}>
              {isGenerating
                ? "Generating your outline..."
                : "Chat to refine your requirements to get to a video briefing"}
            </p>
          </div>
          {!isGenerating && <SectionChips active="review" onNavigate={handleSectionNavigate} />}
        </div>

        {/* Chat thread (collapsed) + Review or Loading */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ padding: "24px 32px" }}
        >
          {isGenerating ? (
            <OutlineLoadingView />
          ) : (
            <div className="space-y-8">
              <section ref={coreIntentRef} className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#626B58]">
                    1. Core Intent
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Your briefing conversation about audience, outcome, and framing.
                  </p>
                </div>
                {coreIntentMessages.length > 0 ? (
                  <div className="space-y-1">
                    {coreIntentMessages.map((msg, idx) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        onChipSelect={handleChipSelect}
                        isLatest={idx === coreIntentMessages.length - 1}
                        animate={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#D9DDD2] bg-[#FAFBF8] px-4 py-3 text-sm text-muted-foreground">
                    No saved Core Intent conversation is available for this project yet.
                  </div>
                )}
              </section>

              <section ref={contentSpineRef} className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#626B58]">
                    2. Key Narrative
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    The follow-up conversation that shaped the content spine.
                  </p>
                </div>
                {contentSpineMessages.length > 0 ? (
                  <div className="space-y-1">
                    {contentSpineMessages.map((msg, idx) => (
                      <MessageBubble
                        key={msg.id}
                        message={msg}
                        isLatest={idx === contentSpineMessages.length - 1}
                        animate={false}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-[#D9DDD2] bg-[#FAFBF8] px-4 py-3 text-sm text-muted-foreground">
                    No saved Key Narrative conversation is available for this project yet.
                  </div>
                )}
              </section>

              <section ref={reviewRef}>
                <BriefReview
                  fields={fields}
                  onEditBrief={handleEdit}
                  onApproveBrief={handleApprove}
                  disabled={false}
                  isAlreadyApproved={isAlreadyApproved}
                  editable={isEditingReview}
                  onSaveEditedBrief={handleSaveEditedBrief}
                  onCancelEdit={handleCancelEdit}
                />
              </section>
            </div>
          )}
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
        <div>
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
          <p style={{ fontSize: 13, color: "#626B58", margin: 0 }}>
            Chat to refine your requirements to get to a video briefing
          </p>
        </div>
        <SectionChips active={activeSection} onNavigate={handleSectionNavigate} />
      </div>

      {/* Chat thread */}
      <ChatThread
        messages={messages}
        onChipSelect={handleChipSelect}
        isLlmLoading={isLlmLoading}
        animatedMessageIds={animatedMessageIds}
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
