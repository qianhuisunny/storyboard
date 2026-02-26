/**
 * ChatPanel component - Main chat panel with 4-turn flow
 */

import { useRef, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatPanelProps, ChatTurn } from "../types";
import { TurnContent } from "./TurnContent";
import { ConfirmationGate } from "./ConfirmationGate";
import { FinalBriefDisplay } from "./FinalBriefDisplay";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export function ChatPanel({
  state,
  onboardingData,
  onConfirm,
  onCorrect,
  onGapAnswerChange,
  onSendToStoryboard,
  onEditBrief,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when turn changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.currentTurn]);

  const renderTurn = (turn: ChatTurn) => {
    const turnState = state.turns[turn];

    // Don't render pending turns
    if (turnState.status === "pending") {
      return null;
    }

    const isCurrentTurn = state.currentTurn === turn;
    const showGate = turn < 4 && (turnState.status === "presenting" || turnState.status === "awaiting" || turnState.status === "confirmed");

    return (
      <div
        key={turn}
        className={cn(
          "py-4 px-4 border-b last:border-b-0",
          isCurrentTurn && "bg-muted/30"
        )}
      >
        {/* Turn label */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Step {turn} of 4
          </span>
          {turnState.status === "confirmed" && (
            <span className="text-xs text-green-600">Confirmed</span>
          )}
        </div>

        {/* Turn content */}
        <TurnContent
          turn={turn}
          state={state}
          onboardingData={onboardingData}
          onGapAnswerChange={turn === 3 ? onGapAnswerChange : undefined}
        />

        {/* Confirmation gate for turns 1-3 */}
        {showGate && (
          <ConfirmationGate
            turn={turn}
            status={turnState.status}
            onConfirm={() => onConfirm(turn)}
            onCorrect={(corrections) => onCorrect(turn, corrections)}
            disabled={
              turn === 2 && state.researchStatus !== "complete"
            }
          />
        )}
      </div>
    );
  };

  // Research loading indicator between turn 1 and 2
  const renderResearchIndicator = () => {
    if (
      state.turns[1].status === "confirmed" &&
      state.researchStatus === "running"
    ) {
      return (
        <div className="py-4 px-4 border-b flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Researching your topic... Check the right panel for progress.</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b bg-background">
        <h2 className="text-lg font-semibold">Create Your Story Brief</h2>
        <p className="text-sm text-muted-foreground">
          Review and confirm each step to build your video brief
        </p>
      </div>

      {/* Scrollable content */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="min-h-full">
          {/* Turn 1 */}
          {renderTurn(1)}

          {/* Research loading indicator */}
          {renderResearchIndicator()}

          {/* Turn 2 */}
          {renderTurn(2)}

          {/* Turn 3 */}
          {renderTurn(3)}

          {/* Turn 4: Final brief */}
          {state.currentTurn === 4 && state.finalBrief && (
            <div className="py-4 px-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Step 4 of 4
                </span>
              </div>
              <TurnContent
                turn={4}
                state={state}
                onboardingData={onboardingData}
              />
              <div className="mt-4">
                <FinalBriefDisplay
                  brief={state.finalBrief}
                  onSendToStoryboard={onSendToStoryboard}
                  onEditBrief={onEditBrief}
                />
              </div>
            </div>
          )}

          {/* Error display */}
          {state.error && (
            <div className="py-4 px-4 bg-red-50 border-t border-red-200">
              <p className="text-sm text-red-600">{state.error}</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default ChatPanel;
