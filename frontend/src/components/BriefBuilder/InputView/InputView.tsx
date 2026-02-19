import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Link, MessageSquare, Copy, Check } from "lucide-react";
import type { InputViewProps } from "../types";

/**
 * InputView - Displays user inputs and context pack for Stage 1 (Brief).
 * Shows what the user provided as input to generate the brief.
 */
export default function InputView({ brief, contextPack }: InputViewProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    userInputs: true,
    contextPack: false,
  });
  const [copied, setCopied] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  // Extract user_inputs from context pack (if available from backend)
  const userInputs = (contextPack?.user_inputs as Record<string, unknown>) || {};
  const parsedMaterials = (userInputs.parsed_materials as Array<{
    type: string;
    name: string;
    content: string;
  }>) || [];

  const hasContextPack = contextPack && Object.keys(contextPack).length > 0;

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Input Data
        </h2>
        <p className="text-sm text-muted-foreground">
          Original user inputs and research context used to generate this brief.
        </p>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Section 1: User Inputs */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => toggleSection("userInputs")}
              className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                {expandedSections.userInputs ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span className="font-medium">User Inputs</span>
              </div>
              <span className="text-xs text-muted-foreground">
                Original prompt & uploads
              </span>
            </button>

            {expandedSections.userInputs && (
              <div className="p-4 space-y-4">
                {/* Original Prompt */}
                {brief.user_inputs && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      Original Prompt
                    </div>
                    <div className="p-3 bg-muted/20 rounded-md text-sm whitespace-pre-wrap">
                      {brief.user_inputs}
                    </div>
                  </div>
                )}

                {/* Video Type & Other Metadata */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {brief.video_type && (
                    <div className="p-2 bg-muted/20 rounded-md">
                      <div className="text-xs text-muted-foreground">Video Type</div>
                      <div className="text-sm font-medium">{brief.video_type}</div>
                    </div>
                  )}
                  {brief.video_goal && (
                    <div className="p-2 bg-muted/20 rounded-md col-span-2">
                      <div className="text-xs text-muted-foreground">Goal</div>
                      <div className="text-sm font-medium truncate">{brief.video_goal}</div>
                    </div>
                  )}
                  {brief.target_audience && (
                    <div className="p-2 bg-muted/20 rounded-md">
                      <div className="text-xs text-muted-foreground">Audience</div>
                      <div className="text-sm font-medium truncate">{brief.target_audience}</div>
                    </div>
                  )}
                </div>

                {/* Parsed Materials (PDFs, URLs) */}
                {parsedMaterials.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
                      Uploaded Materials
                    </div>
                    <div className="space-y-3">
                      {parsedMaterials.map((material, index) => (
                        <div
                          key={index}
                          className="p-3 bg-muted/20 rounded-md border border-border/50"
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {material.type === "pdf" ? (
                              <FileText className="w-4 h-4 text-red-500" />
                            ) : material.type === "url" ? (
                              <Link className="w-4 h-4 text-blue-500" />
                            ) : (
                              <FileText className="w-4 h-4 text-gray-500" />
                            )}
                            <span className="text-sm font-medium">{material.name}</span>
                            <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded">
                              {material.type.toUpperCase()}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                            {material.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* No inputs message */}
                {!brief.user_inputs && parsedMaterials.length === 0 && (
                  <div className="text-sm text-muted-foreground italic">
                    No user inputs recorded.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Context Pack (Research Data) */}
          {hasContextPack && (
            <div className="bg-background rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => toggleSection("contextPack")}
                className="w-full px-4 py-3 flex items-center justify-between bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expandedSections.contextPack ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )}
                  <span className="font-medium">Research Context</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  AI-gathered research data
                </span>
              </button>

              {expandedSections.contextPack && (
                <div className="p-4 space-y-4">
                  {/* Key Value Propositions */}
                  {contextPack.key_value_propositions && Array.isArray(contextPack.key_value_propositions) && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Key Value Propositions
                      </div>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {(contextPack.key_value_propositions as string[]).map((item, i) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Topic Summary */}
                  {contextPack.topic_summary && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Topic Summary
                      </div>
                      <div className="text-sm p-3 bg-muted/20 rounded-md">
                        {String(contextPack.topic_summary)}
                      </div>
                    </div>
                  )}

                  {/* Company/Product/Industry Context */}
                  {contextPack.company_context && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Company Context
                      </div>
                      <div className="text-sm p-3 bg-muted/20 rounded-md">
                        {String(contextPack.company_context)}
                      </div>
                    </div>
                  )}

                  {contextPack.product_context && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                        Product Context
                      </div>
                      <div className="text-sm p-3 bg-muted/20 rounded-md">
                        {String(contextPack.product_context)}
                      </div>
                    </div>
                  )}

                  {/* Full Context Pack JSON */}
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Full Context Pack JSON</span>
                      <button
                        onClick={() => copyToClipboard(JSON.stringify(contextPack, null, 2), "context")}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        {copied === "context" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied === "context" ? "Copied" : "Copy"}
                      </button>
                    </div>
                    <pre className="p-3 bg-muted/30 rounded-md overflow-auto text-xs font-mono max-h-60">
                      {JSON.stringify(contextPack, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No Data State */}
          {!brief.user_inputs && !hasContextPack && (
            <div className="flex items-center justify-center h-40 text-muted-foreground">
              <p>No input data available.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
