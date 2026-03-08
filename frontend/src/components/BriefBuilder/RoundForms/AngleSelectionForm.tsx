/**
 * AngleSelectionForm - Perspective/angle selection after Section 3.
 * Shows 3 AI-generated perspective options with editable text and approve.
 */

import { useState } from "react";

interface Perspective {
  id: number;
  statement: string;
  hook: string;
}

interface AngleSelectionFormProps {
  perspectives: Perspective[];
  onApproveAngle: (selectedAngle: string) => void;
  disabled?: boolean;
}

export default function AngleSelectionForm({
  perspectives,
  onApproveAngle,
  disabled = false,
}: AngleSelectionFormProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Track editable text per perspective
  const [editedStatements, setEditedStatements] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const p of perspectives) {
      initial[p.id] = p.statement;
    }
    return initial;
  });

  const handleStatementEdit = (id: number, value: string) => {
    setEditedStatements((prev) => ({ ...prev, [id]: value }));
  };

  const handleApprove = () => {
    if (selectedId === null) return;
    const finalStatement = editedStatements[selectedId] || "";
    onApproveAngle(finalStatement);
  };

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="border-b pb-4">
        <h2 className="text-lg font-semibold text-foreground">Choose Your Angle</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select a perspective for your video. You can edit the text before approving.
        </p>
      </div>

      {/* Perspective Cards */}
      <div className="space-y-4">
        {perspectives.map((perspective) => {
          const isSelected = selectedId === perspective.id;
          return (
            <div
              key={perspective.id}
              onClick={() => setSelectedId(perspective.id)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                isSelected
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Radio indicator */}
                <div className="flex-shrink-0 mt-1">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isSelected
                        ? "border-primary"
                        : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  {/* Hook label */}
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                    {perspective.hook}
                  </div>

                  {/* Editable statement */}
                  {isSelected ? (
                    <textarea
                      value={editedStatements[perspective.id] || ""}
                      onChange={(e) =>
                        handleStatementEdit(perspective.id, e.target.value)
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="w-full text-sm text-foreground bg-transparent border border-border rounded-md p-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      rows={3}
                    />
                  ) : (
                    <p className="text-sm text-foreground leading-relaxed">
                      {editedStatements[perspective.id] || perspective.statement}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Approve Button */}
      <div className="border-t pt-4">
        <button
          onClick={handleApprove}
          disabled={selectedId === null || disabled}
          className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
            selectedId !== null && !disabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          }`}
        >
          {selectedId !== null
            ? "Approve Angle & Continue"
            : "Select an angle to continue"}
        </button>
      </div>
    </div>
  );
}
