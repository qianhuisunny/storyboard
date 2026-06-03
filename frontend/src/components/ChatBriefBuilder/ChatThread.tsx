import { useEffect, useRef } from "react";
import type { ChatMessage } from "./types";
import MessageBubble from "./MessageBubble";

interface ChatThreadProps {
  messages: ChatMessage[];
  onChipSelect?: (value: string) => void;
  isLlmLoading?: boolean;
  animatedMessageIds?: Set<string>;
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
  animatedMessageIds = new Set<string>(),
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
          animate={animatedMessageIds.has(msg.id)}
        />
      ))}
      {isLlmLoading && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
