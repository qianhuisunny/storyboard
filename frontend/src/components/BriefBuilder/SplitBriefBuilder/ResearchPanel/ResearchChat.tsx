/**
 * ResearchChat component - Interactive chat interface for perspective-first research
 *
 * Flow:
 * 1. User confirms Round 1 -> System shows "researching..."
 * 2. Perspectives generated -> Show 3 options for selection
 * 3. User selects perspective -> Show talking points
 * 4. User confirms talking points -> Research runs -> Complete
 */

import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MessageCircle,
  Lightbulb,
  Check,
  Edit3,
  Loader2,
  Send,
  Plus,
  Trash2,
} from "lucide-react";
import type {
  ResearchChatProps,
  ChatMessage,
  PerspectiveOption,
} from "../types";

// Chat bubble component
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.type === "user";

  return (
    <div
      className={cn(
        "flex w-full mb-4",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[85%] rounded-lg p-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted/50 border border-border"
        )}
      >
        {!isUser && (
          <div className="flex items-center gap-2 mb-1">
            <MessageCircle className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground font-medium">
              Research Assistant
            </span>
          </div>
        )}
        <p className="text-sm">{message.content}</p>
        <span className="text-[10px] text-muted-foreground mt-1 block">
          {message.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// Perspective selector component
function PerspectiveSelector({
  perspectives,
  onSelect,
  disabled,
}: {
  perspectives: PerspectiveOption[];
  onSelect: (perspective: PerspectiveOption | string) => void;
  disabled?: boolean;
}) {
  const [customText, setCustomText] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      onSelect(customText.trim());
      setCustomText("");
      setShowCustom(false);
    }
  };

  return (
    <div className="space-y-3 my-4">
      <p className="text-sm font-medium text-foreground">
        Select an angle for your video:
      </p>

      {perspectives.map((perspective) => (
        <button
          key={perspective.id}
          onClick={() => onSelect(perspective)}
          disabled={disabled}
          className={cn(
            "w-full text-left p-4 rounded-lg border-2 transition-all",
            "hover:border-primary hover:bg-primary/5",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "border-border bg-background"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Lightbulb className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {perspective.statement}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {perspective.hook}
              </p>
            </div>
          </div>
        </button>
      ))}

      {/* Custom perspective option */}
      {!showCustom ? (
        <button
          onClick={() => setShowCustom(true)}
          disabled={disabled}
          className={cn(
            "w-full text-left p-3 rounded-lg border border-dashed transition-all",
            "hover:border-primary hover:bg-primary/5",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "border-muted-foreground/30 bg-transparent"
          )}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Edit3 className="w-4 h-4" />
            <span className="text-sm">Or describe your own angle...</span>
          </div>
        </button>
      ) : (
        <div className="space-y-2">
          <Textarea
            placeholder="Describe your preferred angle for this video..."
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            disabled={disabled}
            className="min-h-[80px]"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCustomSubmit}
              disabled={disabled || !customText.trim()}
            >
              <Send className="w-3.5 h-3.5 mr-1" />
              Use This Angle
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowCustom(false);
                setCustomText("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Talking points display with inline editing
function TalkingPointsDisplay({
  talkingPoints,
  onConfirm,
  disabled,
}: {
  talkingPoints: string[];
  onConfirm: (feedback?: string, editedPoints?: string[]) => void;
  disabled?: boolean;
}) {
  const [editedPoints, setEditedPoints] = useState<string[]>(talkingPoints);
  const [feedback, setFeedback] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);

  // Update local state when talkingPoints prop changes
  useState(() => {
    setEditedPoints(talkingPoints);
  });

  const handlePointChange = (index: number, value: string) => {
    const updated = [...editedPoints];
    updated[index] = value;
    setEditedPoints(updated);
  };

  const handleAddPoint = () => {
    setEditedPoints([...editedPoints, ""]);
  };

  const handleRemovePoint = (index: number) => {
    if (editedPoints.length > 1) {
      const updated = editedPoints.filter((_, i) => i !== index);
      setEditedPoints(updated);
    }
  };

  const handleConfirm = () => {
    // Filter out empty points and always send the edited points
    const finalPoints = editedPoints.filter((p) => p.trim() !== "");
    onConfirm(
      showFeedback && feedback.trim() ? feedback : undefined,
      finalPoints
    );
  };

  return (
    <div className="space-y-3 my-4">
      <p className="text-sm font-medium text-foreground">
        Key talking points for your video:
      </p>

      <div className="space-y-2">
        {editedPoints.map((point, index) => (
          <div
            key={index}
            className="flex items-start gap-2 p-3 rounded-lg bg-muted/30 border border-border group"
          >
            <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-xs font-medium text-primary mt-1">
              {index + 1}
            </span>
            <Textarea
              value={point}
              onChange={(e) => handlePointChange(index, e.target.value)}
              disabled={disabled}
              className="flex-1 min-h-[60px] text-sm bg-background border-0 focus-visible:ring-1 resize-none"
              placeholder={`Talking point ${index + 1}...`}
            />
            {editedPoints.length > 1 && (
              <button
                onClick={() => handleRemovePoint(index)}
                disabled={disabled}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive"
                title="Remove point"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add point button */}
      <button
        onClick={handleAddPoint}
        disabled={disabled}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="w-4 h-4" />
        Add talking point
      </button>

      {/* Additional feedback input */}
      {showFeedback && (
        <div className="space-y-2">
          <Textarea
            placeholder="Any additional suggestions or context..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={disabled}
            className="min-h-[80px]"
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 pt-2">
        <Button
          onClick={handleConfirm}
          disabled={disabled}
          className="flex-1"
        >
          <Check className="w-4 h-4 mr-2" />
          Confirm & Continue
        </Button>
        <Button
          variant="outline"
          onClick={() => setShowFeedback(!showFeedback)}
          disabled={disabled}
        >
          <Edit3 className="w-4 h-4 mr-1" />
          {showFeedback ? "Hide" : "Add Note"}
        </Button>
      </div>
    </div>
  );
}

// Loading indicator
function LoadingIndicator({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/30 border border-border my-4">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
      <span className="text-sm text-muted-foreground">
        {message || "Processing..."}
      </span>
    </div>
  );
}

/**
 * Main ResearchChat component
 */
export function ResearchChat({
  state,
  onSelectPerspective,
  onConfirmTalkingPoints,
  isLoading,
}: ResearchChatProps) {
  const showPerspectiveSelector =
    state.status === "awaiting_perspective" &&
    state.perspectives.length > 0 &&
    !isLoading;

  const showTalkingPoints =
    state.status === "awaiting_talking_points_confirm" &&
    state.talkingPoints.length > 0 &&
    !isLoading;

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <h2 className="text-lg font-semibold">Research Chat</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Interactive research for your video content
        </p>
      </div>

      {/* Chat messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-2">
          {state.messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}

          {/* Perspective selector */}
          {showPerspectiveSelector && (
            <PerspectiveSelector
              perspectives={state.perspectives}
              onSelect={onSelectPerspective}
              disabled={isLoading}
            />
          )}

          {/* Talking points display */}
          {showTalkingPoints && (
            <TalkingPointsDisplay
              talkingPoints={state.talkingPoints}
              onConfirm={onConfirmTalkingPoints}
              disabled={isLoading}
            />
          )}

          {/* Loading indicator */}
          {isLoading && (
            <LoadingIndicator
              message={
                state.status === "awaiting_perspective"
                  ? "Generating perspectives..."
                  : state.status === "awaiting_talking_points_confirm"
                  ? "Generating talking points..."
                  : state.status === "researching"
                  ? "Researching evidence..."
                  : "Processing..."
              }
            />
          )}

          {/* Error display */}
          {state.error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800">
              <p className="text-sm text-red-700 dark:text-red-400">
                {state.error}
              </p>
            </div>
          )}

          {/* Idle state */}
          {state.status === "idle" && state.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <MessageCircle className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">
                Complete Section 1 to start the research process
              </p>
            </div>
          )}

          {/* Complete state */}
          {state.status === "complete" && (
            <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200 dark:bg-green-900/20 dark:border-green-800 my-4">
              <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
              <span className="text-sm text-green-700 dark:text-green-400">
                Research complete! Your Round 3 fields have been populated.
              </span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Status footer */}
      <div className="p-3 border-t bg-background text-xs text-muted-foreground">
        {state.status === "idle" && "Waiting for Section 1 confirmation"}
        {state.status === "awaiting_perspective" && "Select your video angle"}
        {state.status === "awaiting_talking_points_confirm" &&
          "Review and confirm talking points"}
        {state.status === "researching" && "Gathering evidence and examples..."}
        {state.status === "complete" && "Research complete"}
      </div>
    </div>
  );
}

export default ResearchChat;
