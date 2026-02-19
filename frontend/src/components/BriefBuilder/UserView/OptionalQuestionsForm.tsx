import { useState } from "react";
import { ChevronDown, ChevronRight, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";
import FormField from "./FormField";
import type { OptionalQuestionsFormProps, StoryBrief, UnresolvedQuestion } from "../types";
import { getFieldStatus } from "../types";

/**
 * OptionalQuestionsForm - Stage 2 form for optional and unresolved questions.
 * Displays unresolved questions from AI and optional enhancement fields.
 */
export default function OptionalQuestionsForm({
  brief,
  onBriefChange,
}: OptionalQuestionsFormProps) {
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(
    brief.unresolved_questions[0]?.id || null
  );

  // Helper to update a single field
  const updateField = <K extends keyof StoryBrief>(
    field: K,
    value: StoryBrief[K]
  ) => {
    onBriefChange({
      ...brief,
      [field]: value,
    });
  };

  // Helper to update an unresolved question answer
  const updateQuestionAnswer = (questionId: string, value: unknown) => {
    const updatedQuestions = brief.unresolved_questions.map((q) =>
      q.id === questionId ? { ...q, value, skipped: false } : q
    );
    onBriefChange({
      ...brief,
      unresolved_questions: updatedQuestions,
    });
  };

  // Helper to skip a question
  const skipQuestion = (questionId: string) => {
    const updatedQuestions = brief.unresolved_questions.map((q) =>
      q.id === questionId ? { ...q, skipped: true, value: undefined } : q
    );
    onBriefChange({
      ...brief,
      unresolved_questions: updatedQuestions,
    });
  };

  const renderQuestionInput = (question: UnresolvedQuestion) => {
    const inputType = question.answer_type || "text";

    switch (inputType) {
      case "textarea":
        return (
          <textarea
            value={(question.value as string) || ""}
            onChange={(e) => updateQuestionAnswer(question.id, e.target.value)}
            placeholder="Enter your answer..."
            rows={3}
            className={cn(
              "w-full px-3 py-2 border border-border rounded-md text-sm",
              "bg-background text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
          />
        );

      case "select":
        return (
          <select
            value={(question.value as string) || ""}
            onChange={(e) => updateQuestionAnswer(question.id, e.target.value)}
            className={cn(
              "w-full px-3 py-2 border border-border rounded-md text-sm",
              "bg-background text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
          >
            <option value="">Select an option</option>
            {question.options?.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );

      case "boolean":
        return (
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => updateQuestionAnswer(question.id, true)}
              className={cn(
                "px-4 py-2 rounded-md text-sm border transition-colors",
                question.value === true
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => updateQuestionAnswer(question.id, false)}
              className={cn(
                "px-4 py-2 rounded-md text-sm border transition-colors",
                question.value === false
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              )}
            >
              No
            </button>
          </div>
        );

      case "number":
        return (
          <input
            type="number"
            value={(question.value as number) || ""}
            onChange={(e) =>
              updateQuestionAnswer(question.id, parseInt(e.target.value) || 0)
            }
            placeholder="Enter a number..."
            className={cn(
              "w-full px-3 py-2 border border-border rounded-md text-sm",
              "bg-background text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
          />
        );

      case "text":
      default:
        return (
          <input
            type="text"
            value={(question.value as string) || ""}
            onChange={(e) => updateQuestionAnswer(question.id, e.target.value)}
            placeholder="Enter your answer..."
            className={cn(
              "w-full px-3 py-2 border border-border rounded-md text-sm",
              "bg-background text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary"
            )}
          />
        );
    }
  };

  return (
    <div className="optional-questions-form space-y-6">
      {/* Unresolved Questions Section */}
      {brief.unresolved_questions.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
            Additional Questions
          </h3>
          <p className="text-sm text-muted-foreground">
            I have a few more questions that could help improve your brief.
            Feel free to skip any you're unsure about.
          </p>

          <div className="space-y-3">
            {brief.unresolved_questions.map((question) => {
              const isExpanded = expandedQuestion === question.id;
              const isAnswered =
                question.value !== undefined && question.value !== "";
              const isSkipped = question.skipped;

              return (
                <div
                  key={question.id}
                  className={cn(
                    "border rounded-lg overflow-hidden transition-colors",
                    isSkipped
                      ? "border-muted bg-muted/20"
                      : isAnswered
                      ? "border-green-200 bg-green-50/50"
                      : "border-border"
                  )}
                >
                  {/* Question Header */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedQuestion(isExpanded ? null : question.id)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-left">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span
                        className={cn(
                          "text-sm",
                          isSkipped
                            ? "text-muted-foreground line-through"
                            : "text-foreground"
                        )}
                      >
                        {question.note}
                      </span>
                    </div>
                    {isSkipped && (
                      <span className="text-xs text-muted-foreground">
                        Skipped
                      </span>
                    )}
                    {isAnswered && !isSkipped && (
                      <span className="text-xs text-green-600">Answered</span>
                    )}
                  </button>

                  {/* Question Content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border space-y-3">
                      {question.context && (
                        <p className="text-xs text-muted-foreground">
                          {question.context}
                        </p>
                      )}
                      {renderQuestionInput(question)}
                      <button
                        type="button"
                        onClick={() => skipQuestion(question.id)}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <SkipForward className="w-3 h-3" />
                        Skip this question
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Optional Enhancement Fields */}
      <div className="space-y-4 pt-4 border-t border-border">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wide">
          Optional Enhancements
        </h3>

        {/* Constraints */}
        <FormField
          label="Constraints or Restrictions"
          name="constraints"
          value={brief.constraints}
          onChange={(value) => updateField("constraints", value as string[])}
          type="list"
          status={getFieldStatus("constraints", brief)}
          placeholder="Add a constraint..."
          helperText="Any limitations (budget, locations, props, etc.)"
        />

        {/* Core Interaction Steps */}
        <FormField
          label="Core Interaction Steps"
          name="core_interaction_steps"
          value={brief.core_interaction_steps}
          onChange={(value) =>
            updateField("core_interaction_steps", value as string[])
          }
          type="list"
          ordered
          status={getFieldStatus("core_interaction_steps", brief)}
          placeholder="Add a step..."
          helperText="For how-to videos: ordered steps the viewer should follow"
        />

        {/* Common Pitfalls - Only for how-to videos */}
        {brief.video_type === "How-to Video" && (
          <FormField
            label="Common Pitfalls to Avoid"
            name="common_pitfalls"
            value={brief.common_pitfalls || []}
            onChange={(value) =>
              updateField("common_pitfalls", value as string[])
            }
            type="list"
            status={getFieldStatus("common_pitfalls", brief)}
            placeholder="Add a pitfall..."
            helperText="Common mistakes viewers should avoid"
          />
        )}
      </div>

      {/* No questions message */}
      {brief.unresolved_questions.length === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No additional questions. You can add optional enhancements above or
            proceed to finish your brief.
          </p>
        </div>
      )}
    </div>
  );
}
