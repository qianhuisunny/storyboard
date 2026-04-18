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
