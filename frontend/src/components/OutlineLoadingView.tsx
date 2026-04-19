import { useState, useEffect, useRef } from "react";
import { Loader2, Check, AlertTriangle } from "lucide-react";

interface Step {
  id: string;
  text: string;
  type: "normal" | "retry" | "success";
  note?: string;
}

const OUTLINE_STEPS: Step[] = [
  { id: "gen", text: "Generating outline...", type: "normal" },
  { id: "review", text: "Reviewing quality...", type: "normal" },
  { id: "retry", text: "Score below threshold — refining with feedback...", type: "retry", note: "(only if retry needed)" },
  { id: "review2", text: "Reviewing revised outline...", type: "normal" },
  { id: "pass", text: "Quality check passed!", type: "success" },
];

const STORYBOARD_STEPS: Step[] = [
  { id: "gen", text: "Writing storyboard panels...", type: "normal" },
  { id: "review", text: "Reviewing quality...", type: "normal" },
  { id: "retry", text: "Score below threshold — refining with feedback...", type: "retry", note: "(only if retry needed)" },
  { id: "review2", text: "Reviewing revised storyboard...", type: "normal" },
  { id: "pass", text: "Quality check passed!", type: "success" },
];

const OUTLINE_TIMINGS = [0, 8000, 16000, 28000, 36000];
const STORYBOARD_TIMINGS = [0, 12000, 22000, 36000, 46000];

type StepState = "hidden" | "active" | "done" | "retry-active" | "retry-done" | "success";

interface Props {
  stage?: "outline" | "storyboard";
}

export default function OutlineLoadingView({ stage = "outline" }: Props) {
  const steps = stage === "storyboard" ? STORYBOARD_STEPS : OUTLINE_STEPS;
  const timings = stage === "storyboard" ? STORYBOARD_TIMINGS : OUTLINE_TIMINGS;
  const genLabel = stage === "storyboard" ? "Writing storyboard panels..." : "Generating outline...";

  const [stepStates, setStepStates] = useState<Record<string, StepState>>({});
  const [statusText, setStatusText] = useState(genLabel);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => {
      setStepStates({ gen: "active" });
      setStatusText(steps[0].text);
    }, timings[0]));

    timers.push(setTimeout(() => {
      setStepStates({ gen: "done", review: "active" });
      setStatusText(steps[1].text);
    }, timings[1]));

    timers.push(setTimeout(() => {
      setStepStates({ gen: "done", review: "done", retry: "retry-active" });
      setStatusText(steps[2].text);
    }, timings[2]));

    timers.push(setTimeout(() => {
      setStepStates({ gen: "done", review: "done", retry: "retry-done", review2: "active" });
      setStatusText(steps[3].text);
    }, timings[3]));

    timers.push(setTimeout(() => {
      setStepStates({ gen: "done", review: "done", retry: "retry-done", review2: "done", pass: "success" });
      setStatusText(steps[4].text);
    }, timings[4]));

    timersRef.current = timers;
    return () => timers.forEach(clearTimeout);
  }, [steps, timings]);

  function renderIcon(state: StepState) {
    switch (state) {
      case "active":
        return <Loader2 className="w-4 h-4 text-[#3A6B47] animate-spin" />;
      case "done":
        return <Check className="w-4 h-4 text-[#3A6B47]" />;
      case "retry-active":
        return <Loader2 className="w-4 h-4 text-[#B8860B] animate-spin" />;
      case "retry-done":
        return <AlertTriangle className="w-4 h-4 text-[#B8860B]" />;
      case "success":
        return <Check className="w-4 h-4 text-[#3A6B47]" />;
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-8">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-3 border-[#D9DDD2] border-t-[#3A6B47] rounded-full animate-spin" />
        <p className="text-base font-semibold text-foreground">{statusText}</p>
      </div>

      <div className="flex flex-col gap-0 border-l-2 border-border pl-5">
        {steps.map((step) => {
          const state = stepStates[step.id] || "hidden";
          if (state === "hidden") return null;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-2.5 py-1.5 text-sm transition-all animate-in fade-in slide-in-from-bottom-1 duration-400 ${
                state === "retry-active" || state === "retry-done"
                  ? "text-[#B8860B]"
                  : state === "success"
                  ? "text-[#3A6B47] font-semibold"
                  : state === "active"
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              }`}
            >
              <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                {renderIcon(state)}
              </span>
              <span>{step.text}</span>
              {step.note && (state === "retry-active" || state === "retry-done") && (
                <span className="text-xs italic text-[#B8860B]/70">{step.note}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
