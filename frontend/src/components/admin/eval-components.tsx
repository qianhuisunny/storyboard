import { Badge } from "@/components/ui/badge";

// ============================================================================
// Types
// ============================================================================

export interface GoldScreen {
  screen_number: number;
  section_number: number;
  screen_type: string;
  voiceover_text: string;
  visual_direction: string[];
  action_notes: string;
}

export interface AIScreen extends GoldScreen {
  duration?: number;
  on_screen_visual?: string;
}

export interface GoldSection {
  section_number: number;
  section_title: string;
  purpose: string;
  entry_assumption: string;
  exit_state: string;
  duration_sec: number;
  talking_points: string[];
  evidence_used: string[] | null;
  visual_intent: string[];
}

export interface WriterAnalysis {
  screen_count: { gold: number; ai: number };
  total_words: { gold: number; ai: number };
  avg_words_per_screen: { gold: number; ai: number };
  screen_types: { gold: Record<string, number>; ai: Record<string, number> };
  filler_phrases: string[];
  ai_total_duration_sec: number;
}

export interface Analysis {
  director: {
    section_count: { gold: number; ai: number };
    ai_sections: {
      section_number: number;
      title: string;
      purpose: string;
      entry_assumption: string;
      exit_state: string;
      duration_str: string;
      talking_points: string[];
      evidence_needed: string[];
      visual_intent: string[];
    }[];
    ai_duration_estimate: string;
    gold_duration_sec: number;
  };
  writer_path_b: WriterAnalysis;
  writer_path_a: WriterAnalysis;
  summary: string[];
}

export interface EvalData {
  gold_set_name: string;
  timestamp?: string;
  prompt_versions?: { director: string; writer: string };
  model_used?: string;
  gold: {
    brief: Record<string, unknown>;
    outline: GoldSection[];
    storyboard: GoldScreen[];
  };
  director_output?: string;
  writer_output_path_b?: AIScreen[];
  writer_output_path_a?: AIScreen[];
  analysis?: Analysis;
  judge?: {
    outline_quality?: Record<string, { tags: string[]; notes: string }>;
    storyboard_quality?: Record<string, { tags: string[]; notes: string }>;
  };
}

// ============================================================================
// Subcomponents
// ============================================================================

export function MetricCard({ label, gold, ai, unit = "" }: { label: string; gold: number | string; ai: number | string; unit?: string }) {
  const goldNum = typeof gold === "number" ? gold : parseFloat(String(gold));
  const aiNum = typeof ai === "number" ? ai : parseFloat(String(ai));
  const diff = !isNaN(goldNum) && !isNaN(aiNum) ? aiNum - goldNum : null;
  const pct = diff !== null && goldNum !== 0 ? Math.round((diff / goldNum) * 100) : null;

  return (
    <div className="border rounded-lg p-3 bg-muted/30">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className="flex items-baseline gap-3">
        <span className="text-base">
          <span className="text-muted-foreground">Gold:</span>{" "}
          <span className="font-mono font-medium">{gold}{unit}</span>
        </span>
        <span className="text-base">
          <span className="text-muted-foreground">AI:</span>{" "}
          <span className="font-mono font-medium">{ai}{unit}</span>
        </span>
        {pct !== null && (
          <Badge variant={Math.abs(pct) > 30 ? "destructive" : "secondary"} className="text-xs">
            {pct > 0 ? "+" : ""}{pct}%
          </Badge>
        )}
      </div>
    </div>
  );
}

export function ScreenCard({ screen, label }: { screen: GoldScreen | AIScreen; label: "GOLD" | "AI" }) {
  const words = screen.voiceover_text?.split(/\s+/).length || 0;
  const duration = "duration" in screen ? (screen as AIScreen).duration : null;

  return (
    <div className={`border rounded-lg p-3 ${label === "GOLD" ? "border-emerald-500/30 bg-emerald-500/5" : "border-blue-500/30 bg-blue-500/5"}`}>
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="outline" className="text-xs">{label}</Badge>
        <Badge variant="secondary" className="text-xs">{screen.screen_type}</Badge>
        <span className="text-xs text-muted-foreground">{words} words</span>
        {duration && <span className="text-xs text-muted-foreground">{duration}s</span>}
      </div>
      <p className="text-base mb-2 leading-relaxed">{screen.voiceover_text}</p>
      {screen.visual_direction?.length > 0 && (
        <div className="text-base text-muted-foreground mt-1">
          <span className="font-medium">Visual:</span>
          <ul className="list-disc list-inside mt-0.5">
            {screen.visual_direction.map((v: string, i: number) => <li key={i}>{v}</li>)}
          </ul>
        </div>
      )}
      {screen.action_notes && (
        <div className="text-base text-muted-foreground mt-1">
          <span className="font-medium">Notes:</span> {screen.action_notes}
        </div>
      )}
    </div>
  );
}

export function SectionDiff({ gold, aiSections }: { gold: GoldSection[]; aiSections: Analysis["director"]["ai_sections"] }) {
  const maxLen = Math.max(gold.length, aiSections.length);
  return (
    <div className="space-y-4">
      {Array.from({ length: maxLen }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          {/* Gold */}
          <div className={`border rounded-lg p-3 ${i < gold.length ? "border-emerald-500/30 bg-emerald-500/5" : "border-dashed border-muted"}`}>
            {i < gold.length ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">GOLD</Badge>
                  <span className="font-medium text-xl">Section {gold[i].section_number} — {gold[i].section_title}</span>
                </div>
                <p className="text-base text-muted-foreground mb-1"><b>Purpose:</b> {gold[i].purpose}</p>
                <p className="text-base text-muted-foreground mb-1"><b>Duration:</b> {gold[i].duration_sec}s</p>
                <p className="text-base text-muted-foreground mb-1"><b>Entry:</b> {gold[i].entry_assumption}</p>
                <p className="text-base text-muted-foreground mb-1"><b>Exit:</b> {gold[i].exit_state}</p>
                <div className="text-base text-muted-foreground">
                  <b>Talking points:</b>
                  <ul className="list-disc list-inside">
                    {gold[i].talking_points.map((tp: string, j: number) => <li key={j}>{tp}</li>)}
                  </ul>
                </div>
                {gold[i].evidence_used && (
                  <div className="text-base text-muted-foreground mt-1">
                    <b>Evidence:</b>
                    <ul className="list-disc list-inside">
                      {gold[i].evidence_used!.map((ev: string, j: number) => <li key={j}>{ev}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">No gold section</span>
            )}
          </div>
          {/* AI */}
          <div className={`border rounded-lg p-3 ${i < aiSections.length ? "border-blue-500/30 bg-blue-500/5" : "border-dashed border-muted"}`}>
            {i < aiSections.length ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">AI</Badge>
                  <span className="font-medium text-xl">Section {aiSections[i].section_number} — {aiSections[i].title}</span>
                </div>
                {aiSections[i].purpose && <p className="text-base text-muted-foreground mb-1"><b>Purpose:</b> {aiSections[i].purpose}</p>}
                <p className="text-base text-muted-foreground mb-1"><b>Duration:</b> {aiSections[i].duration_str}</p>
                {aiSections[i].entry_assumption && <p className="text-base text-muted-foreground mb-1"><b>Entry:</b> {aiSections[i].entry_assumption}</p>}
                {aiSections[i].exit_state && <p className="text-base text-muted-foreground mb-1"><b>Exit:</b> {aiSections[i].exit_state}</p>}
                {aiSections[i].talking_points.length > 0 && (
                  <div className="text-base text-muted-foreground">
                    <b>Talking points:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].talking_points.map((tp: string, j: number) => <li key={j}>{tp}</li>)}
                    </ul>
                  </div>
                )}
                {aiSections[i].evidence_needed.length > 0 && (
                  <div className="text-base text-muted-foreground mt-1">
                    <b>Evidence needed:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].evidence_needed.map((ev: string, j: number) => <li key={j}>{ev}</li>)}
                    </ul>
                  </div>
                )}
                {aiSections[i].visual_intent.length > 0 && (
                  <div className="text-base text-muted-foreground mt-1">
                    <b>Visual intent:</b>
                    <ul className="list-disc list-inside">
                      {aiSections[i].visual_intent.map((vi: string, j: number) => <li key={j}>{vi}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground italic">No AI section</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function StoryboardDiff({ gold, ai, pathLabel }: { gold: GoldScreen[]; ai: AIScreen[]; pathLabel: string }) {
  const maxLen = Math.max(gold.length, ai.length);
  return (
    <div className="space-y-3">
      <h4 className="text-base font-medium text-muted-foreground">{pathLabel}</h4>
      {Array.from({ length: maxLen }, (_, i) => (
        <div key={i} className="grid grid-cols-2 gap-3">
          <div>
            {i < gold.length ? (
              <ScreenCard screen={gold[i]} label="GOLD" />
            ) : (
              <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground italic">No gold screen</div>
            )}
          </div>
          <div>
            {i < ai.length ? (
              <ScreenCard screen={ai[i]} label="AI" />
            ) : (
              <div className="border border-dashed rounded-lg p-3 text-xs text-muted-foreground italic">No AI screen</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
