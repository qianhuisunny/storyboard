import { useState } from "react";
import type { UserViewProps, ValidationErrors } from "../types";
import { validateRequiredFields } from "../types";
import RequiredFieldsForm from "./RequiredFieldsForm";
import OptionalQuestionsForm from "./OptionalQuestionsForm";

/**
 * UserView - Container for the user-facing form with Stage 1/2 flow.
 * Stage 1: Required fields review
 * Stage 2: Optional/unresolved questions
 */
export default function UserView({
  brief,
  onBriefChange,
  stage,
  onStageChange,
  onConfirm,
}: UserViewProps) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const handleValidatedNext = () => {
    const validationErrors = validateRequiredFields(brief);
    if (Object.keys(validationErrors).length === 0) {
      onStageChange(2);
    } else {
      setErrors(validationErrors);
    }
  };

  const handleBack = () => {
    onStageChange(1);
  };

  const handleFinish = () => {
    onConfirm();
  };

  return (
    <section className="user-view h-full flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        {stage === 1 ? (
          <>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Review Your Brief
            </h2>
            <p className="text-sm text-muted-foreground">
              Here's what I need to create your video brief. I've pre-filled
              what I could from your inputs—please review and adjust anything
              that doesn't look right.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-foreground mb-1">
              Almost Done!
            </h2>
            <p className="text-sm text-muted-foreground">
              A few optional questions that could improve your brief:
            </p>
          </>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {stage === 1 ? (
          <div className="max-w-5xl mx-auto">
            <RequiredFieldsForm
              brief={brief}
              onBriefChange={onBriefChange}
              onValidatedNext={handleValidatedNext}
              errors={errors}
              setErrors={setErrors}
            />
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <OptionalQuestionsForm
              brief={brief}
              onBriefChange={onBriefChange}
              onFinish={handleFinish}
              onBack={handleBack}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <footer className="px-6 py-4 border-t border-border bg-muted/20 flex justify-end gap-3">
        {stage === 1 ? (
          <button
            onClick={handleValidatedNext}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Confirm & Continue
          </button>
        ) : (
          <>
            <button
              onClick={handleBack}
              className="px-4 py-2 border border-border rounded-md hover:bg-muted transition-colors"
            >
              Back to Edit
            </button>
            <button
              onClick={handleFinish}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Finish Brief
            </button>
          </>
        )}
      </footer>
    </section>
  );
}
