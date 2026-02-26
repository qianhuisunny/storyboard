/**
 * TurnContent component - Renders content for each of the 4 turns
 */

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import type {
  TurnContentProps,
  GapAnswers,
  ResearchFinding,
} from "../types";
import { User, FileText, Lightbulb, ClipboardCheck } from "lucide-react";

// Helper to format duration for display
function formatDuration(seconds: number): string {
  if (seconds >= 300) return "5+ minutes";
  if (seconds >= 120) return `${Math.floor(seconds / 60)} minutes`;
  return `${seconds} seconds`;
}

// Turn 1: Mirror onboarding inputs
function Turn1Content({
  onboardingData,
}: {
  onboardingData: TurnContentProps["onboardingData"];
}) {
  const fields = [
    { label: "Video Type", value: onboardingData.videoType || "Not specified" },
    { label: "Target Audience", value: onboardingData.audience || "Not specified" },
    { label: "Duration", value: onboardingData.duration ? formatDuration(onboardingData.duration) : "Not specified" },
    { label: "Tone", value: onboardingData.tone || "Professional" },
    { label: "Company/Brand", value: onboardingData.companyName || "Not specified" },
    { label: "Show Face", value: onboardingData.showFace ? "Yes" : "No" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-blue-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-3">
            Here's what I understood from your inputs. Please confirm or make corrections:
          </p>
          <Card>
            <CardContent className="pt-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {fields.map(({ label, value }) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="text-sm font-medium">{value}</dd>
                  </div>
                ))}
              </dl>
              {onboardingData.description && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-xs text-muted-foreground mb-1">Description</dt>
                  <dd className="text-sm">{onboardingData.description}</dd>
                </div>
              )}
              {onboardingData.links && onboardingData.links.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-xs text-muted-foreground mb-1">Reference Links</dt>
                  <dd className="text-sm space-y-1">
                    {onboardingData.links.map((link, i) => (
                      <a
                        key={i}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-blue-600 hover:underline truncate"
                      >
                        {link}
                      </a>
                    ))}
                  </dd>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Turn 2: Research summary
function Turn2Content({
  findings,
}: {
  findings: TurnContentProps["state"]["researchFindings"];
}) {
  if (!findings) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground">
            Research is still in progress. Please wait...
          </p>
        </div>
      </div>
    );
  }

  const renderFindings = (items: ResearchFinding[] | undefined, title: string) => {
    if (!items || items.length === 0) return null;
    return (
      <div className="mb-4">
        <h4 className="text-sm font-medium text-muted-foreground mb-2">{title}</h4>
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium">{item.title}:</span> {item.content}
              {item.sources.length > 0 && (
                <span className="text-xs text-muted-foreground ml-1">
                  ({item.sources.length} source{item.sources.length > 1 ? "s" : ""})
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-3">
            Here's what I found through research. Please review and confirm:
          </p>
          <Card>
            <CardContent className="pt-4">
              {renderFindings(findings.company, "Company Background")}
              {renderFindings(findings.product, "Product Information")}
              {renderFindings(findings.industry, "Industry Context")}
              {renderFindings(findings.workflows, "Typical Workflows")}
              {renderFindings(findings.terminology, "Key Terms")}
              {findings.uncertainties && findings.uncertainties.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium text-amber-600 mb-2">
                    Uncertainties (will not be included in brief)
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {findings.uncertainties.map((u, i) => (
                      <li key={i}>• {u}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Turn 3: Gap questions
function Turn3Content({
  gapQuestions,
  gapAnswers,
  onGapAnswerChange,
}: {
  gapQuestions: TurnContentProps["state"]["gapQuestions"];
  gapAnswers: TurnContentProps["state"]["gapAnswers"];
  onGapAnswerChange?: (answers: GapAnswers) => void;
}) {
  const handleChange = (field: string, value: string | boolean) => {
    if (onGapAnswerChange) {
      onGapAnswerChange({ ...gapAnswers, [field]: value });
    }
  };

  // Default questions if none provided
  const questions = gapQuestions.length > 0 ? gapQuestions : [
    {
      id: "cta",
      field: "cta",
      question: "What call-to-action should appear at the end of the video?",
      type: "text" as const,
      required: false,
    },
    {
      id: "examples",
      field: "additionalNotes",
      question: "Any specific examples, statistics, or talking points to include?",
      type: "textarea" as const,
      required: false,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lightbulb className="w-4 h-4 text-amber-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-muted-foreground mb-3">
            Just a few more details to complete your brief:
          </p>
          <Card>
            <CardContent className="pt-4 space-y-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <Label htmlFor={q.id} className="text-sm">
                    {q.question}
                    {!q.required && (
                      <span className="text-muted-foreground ml-1">(optional)</span>
                    )}
                  </Label>
                  {q.type === "textarea" ? (
                    <Textarea
                      id={q.id}
                      value={(gapAnswers[q.field] as string) || ""}
                      onChange={(e) => handleChange(q.field, e.target.value)}
                      placeholder="Enter your answer..."
                      className="mt-1"
                    />
                  ) : (
                    <Input
                      id={q.id}
                      value={(gapAnswers[q.field] as string) || ""}
                      onChange={(e) => handleChange(q.field, e.target.value)}
                      placeholder="Enter your answer..."
                      className="mt-1"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// Turn 4: Final brief display (handled by FinalBriefDisplay component)
function Turn4Content() {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
        <ClipboardCheck className="w-4 h-4 text-green-600" />
      </div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">
          Your Story Brief is ready! Review it below and proceed to storyboarding.
        </p>
      </div>
    </div>
  );
}

export function TurnContent({
  turn,
  state,
  onboardingData,
  onGapAnswerChange,
}: TurnContentProps) {
  switch (turn) {
    case 1:
      return <Turn1Content onboardingData={onboardingData} />;
    case 2:
      return <Turn2Content findings={state.researchFindings} />;
    case 3:
      return (
        <Turn3Content
          gapQuestions={state.gapQuestions}
          gapAnswers={state.gapAnswers}
          onGapAnswerChange={onGapAnswerChange}
        />
      );
    case 4:
      return <Turn4Content />;
    default:
      return null;
  }
}

export default TurnContent;
