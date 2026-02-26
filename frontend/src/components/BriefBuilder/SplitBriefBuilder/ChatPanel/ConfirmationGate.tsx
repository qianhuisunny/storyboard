/**
 * ConfirmationGate component - Shows Confirm/Correct buttons for each turn
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Check, Edit3, X } from "lucide-react";
import type { ConfirmationGateProps } from "../types";

export function ConfirmationGate({
  turn,
  status,
  onConfirm,
  onCorrect,
  disabled = false,
}: ConfirmationGateProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [corrections, setCorrections] = useState("");

  const handleCorrectClick = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setCorrections("");
  };

  const handleSubmitCorrections = () => {
    if (corrections.trim()) {
      onCorrect(corrections.trim());
      setIsEditing(false);
      setCorrections("");
    }
  };

  // Show confirmed state
  if (status === "confirmed") {
    return (
      <div className="flex items-center gap-2 text-green-600 text-sm mt-4">
        <Check className="w-4 h-4" />
        <span>Confirmed</span>
      </div>
    );
  }

  // Show correction input
  if (isEditing) {
    return (
      <div className="mt-4 space-y-3">
        <Textarea
          value={corrections}
          onChange={(e) => setCorrections(e.target.value)}
          placeholder="What would you like to correct or clarify?"
          className="min-h-[100px] resize-none"
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            onClick={handleSubmitCorrections}
            disabled={!corrections.trim()}
            size="sm"
          >
            Submit Corrections
          </Button>
          <Button onClick={handleCancelEdit} variant="ghost" size="sm">
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Show awaiting state with buttons
  if (status === "awaiting" || status === "presenting") {
    return (
      <div className="flex gap-2 mt-4">
        <Button
          onClick={onConfirm}
          disabled={disabled}
          className="bg-green-600 hover:bg-green-700"
        >
          <Check className="w-4 h-4 mr-2" />
          {turn === 1 ? "Looks Good" : turn === 2 ? "Confirm Research" : "Confirm"}
        </Button>
        <Button
          onClick={handleCorrectClick}
          variant="outline"
          disabled={disabled}
        >
          <Edit3 className="w-4 h-4 mr-2" />
          Make Corrections
        </Button>
      </div>
    );
  }

  // Correcting state
  if (status === "correcting") {
    return (
      <div className="flex items-center gap-2 text-amber-600 text-sm mt-4">
        <Edit3 className="w-4 h-4" />
        <span>Processing corrections...</span>
      </div>
    );
  }

  return null;
}

export default ConfirmationGate;
