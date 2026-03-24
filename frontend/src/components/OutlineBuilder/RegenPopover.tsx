import { useState } from "react";
import { X, Pencil } from "lucide-react";

interface RegenPopoverProps {
  title: string;
  onRegenerate: (instruction: string) => void;
  onClose: () => void;
  isRegenerating?: boolean;
}

export function RegenPopover({ title, onRegenerate, onClose, isRegenerating }: RegenPopoverProps) {
  const [feedback, setFeedback] = useState("");

  const handleDirectRegen = () => {
    onRegenerate("Regenerate with a fresh approach");
  };

  const handleFeedbackRegen = () => {
    if (feedback.trim()) {
      onRegenerate(feedback.trim());
    }
  };

  return (
    <div className="mt-3 border border-border rounded-xl bg-background shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <span className="text-sm font-medium">{title}</span>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-2">
        <button
          onClick={handleDirectRegen}
          disabled={isRegenerating}
          className="flex items-center gap-3 w-full px-3 py-3 rounded-lg hover:bg-muted/40 transition-colors disabled:opacity-50"
        >
          <span className="w-7 h-7 flex items-center justify-center bg-muted/50 rounded-lg text-xs font-medium text-muted-foreground">1</span>
          <span className="text-sm">Regenerate directly</span>
        </button>
      </div>

      <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-border/50 mx-2">
        <div className="w-7 h-7 flex items-center justify-center bg-muted/50 rounded-lg shrink-0">
          <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <input
          type="text"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && feedback.trim()) handleFeedbackRegen();
            if (e.key === "Escape") onClose();
          }}
          placeholder="Regenerate with my feedback"
          className="flex-1 border-none outline-none text-sm bg-transparent placeholder:text-muted-foreground/35"
          disabled={isRegenerating}
        />
        <button
          onClick={handleFeedbackRegen}
          disabled={!feedback.trim() || isRegenerating}
          className="px-3.5 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-muted/30 disabled:opacity-40"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
