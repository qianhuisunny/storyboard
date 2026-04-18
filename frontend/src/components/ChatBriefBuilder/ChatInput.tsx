import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

const SpeechRecognition =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    : null;

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your answer...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Clean up recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
  };

  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setText((prev) => (prev ? prev + " " + transcript : transcript));
      inputRef.current?.focus();
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

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
          placeholder={isListening ? "Listening..." : placeholder}
          className="flex-1 outline-none"
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            border: `1px solid ${isListening ? "#3A6B47" : "#D9DDD2"}`,
            fontSize: 15,
            fontFamily: "'Nunito', system-ui, -apple-system, sans-serif",
            color: "#1C2118",
            backgroundColor: "#fff",
          }}
        />
        {SpeechRecognition && (
          <button
            onClick={toggleListening}
            disabled={disabled}
            className="flex items-center justify-center transition-colors"
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: isListening ? "#3A6B47" : "transparent",
              color: isListening ? "#fff" : "#626B58",
              border: isListening ? "none" : "1px solid #D9DDD2",
              cursor: disabled ? "not-allowed" : "pointer",
              animation: isListening ? "micPulse 1.5s ease-in-out infinite" : "none",
            }}
          >
            <Mic className="w-4 h-4" />
          </button>
        )}
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
      {isListening && (
        <style>{`
          @keyframes micPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(58, 107, 71, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(58, 107, 71, 0); }
          }
        `}</style>
      )}
    </div>
  );
}
