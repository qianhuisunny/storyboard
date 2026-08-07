import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Mic } from "lucide-react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0?: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  abort(): void;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

const SpeechRecognition =
  typeof window !== "undefined"
    ? (window as SpeechRecognitionWindow).SpeechRecognition ||
      (window as SpeechRecognitionWindow).webkitSpeechRecognition
    : null;

const FILLER_WORDS = new Set([
  "uh",
  "um",
  "erm",
  "hmm",
  "mm",
]);

function collapseRepeatedNgrams(tokens: string[]): string[] {
  let collapsed = [...tokens];

  for (let size = 5; size >= 1; size -= 1) {
    const next: string[] = [];

    for (let i = 0; i < collapsed.length;) {
      let skipped = false;

      if (i + size * 2 <= collapsed.length) {
        const left = collapsed.slice(i, i + size).join(" ").toLowerCase();
        const right = collapsed.slice(i + size, i + size * 2).join(" ").toLowerCase();

        if (left === right) {
          next.push(...collapsed.slice(i, i + size));
          i += size * 2;
          skipped = true;
        }
      }

      if (!skipped) {
        next.push(collapsed[i]);
        i += 1;
      }
    }

    collapsed = next;
  }

  return collapsed;
}

function cleanSpeechTranscript(rawTranscript: string): string {
  const normalized = rawTranscript.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const tokens = normalized
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => {
      const lettersOnly = token.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, "");
      return !lettersOnly || !FILLER_WORDS.has(lettersOnly);
    });

  const deduped = collapseRepeatedNgrams(tokens)
    .filter((token, index, arr) => {
      if (index === 0) return true;
      return token.toLowerCase() !== arr[index - 1].toLowerCase();
    });

  const cleaned = deduped.join(" ").replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your answer...",
}: ChatInputProps) {
  const [text, setText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const prefixTextRef = useRef("");
  const finalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
  const shouldSubmitSpeechRef = useRef(false);

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
    if (!trimmed || disabled || isListening) return;
    onSend(trimmed);
    setText("");
  };

  const finalizeSpeechInput = useCallback(() => {
    const cleanedSpeech = cleanSpeechTranscript(
      finalTranscriptRef.current || liveTranscriptRef.current
    );
    const prefix = prefixTextRef.current.trim();
    const finalMessage = [prefix, cleanedSpeech].filter(Boolean).join(" ").trim();

    recognitionRef.current = null;
    finalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    prefixTextRef.current = "";

    if (!shouldSubmitSpeechRef.current) {
      shouldSubmitSpeechRef.current = false;
      return;
    }

    shouldSubmitSpeechRef.current = false;

    if (!finalMessage || disabled) {
      setText(prefix);
      return;
    }

    setText("");
    onSend(finalMessage);
  }, [disabled, onSend]);

  const toggleListening = useCallback(() => {
    if (!SpeechRecognition) return;

    if (isListening) {
      shouldSubmitSpeechRef.current = true;
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    prefixTextRef.current = text.trim();
    finalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    shouldSubmitSpeechRef.current = true;

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const finalParts: string[] = [];
      const interimParts: string[] = [];

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (!result?.[0]?.transcript) continue;
        if (result.isFinal) {
          finalParts.push(result[0].transcript);
        } else {
          interimParts.push(result[0].transcript);
        }
      }

      finalTranscriptRef.current = finalParts.join(" ").trim();
      liveTranscriptRef.current = [...finalParts, ...interimParts].join(" ").trim();

      const preview = [prefixTextRef.current.trim(), liveTranscriptRef.current]
        .filter(Boolean)
        .join(" ")
        .trim();

      setText(preview);
      inputRef.current?.focus();
    };

    recognition.onend = () => {
      setIsListening(false);
      finalizeSpeechInput();
    };
    recognition.onerror = () => {
      setIsListening(false);
      finalizeSpeechInput();
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [finalizeSpeechInput, isListening, text]);

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
          disabled={disabled || isListening}
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
          disabled={disabled || isListening || !text.trim()}
          className="flex items-center justify-center transition-colors"
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor:
              disabled || isListening || !text.trim() ? "#D9DDD2" : "#3A6B47",
            color: "#fff",
            border: "none",
            cursor: disabled || isListening || !text.trim() ? "not-allowed" : "pointer",
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
