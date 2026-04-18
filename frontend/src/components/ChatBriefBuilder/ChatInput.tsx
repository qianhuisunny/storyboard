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
