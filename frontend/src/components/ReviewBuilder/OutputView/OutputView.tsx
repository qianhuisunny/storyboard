import { useState } from "react";
import { Copy, Check, Code, Download } from "lucide-react";
import type { OutputViewProps } from "../types";

/**
 * OutputView - Displays the raw JSON output for Stage 4 (Review).
 * Shows the final production screens data in exportable format.
 */
export default function OutputView({ screens }: OutputViewProps) {
  const [copied, setCopied] = useState(false);

  const outputJson = JSON.stringify(screens, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(outputJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([outputJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "storyboard-final.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
              <Code className="w-5 h-5 text-blue-500" />
              Final Output (JSON)
            </h2>
            <p className="text-sm text-muted-foreground">
              The completed storyboard data ready for export.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Stats */}
          <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
            <span>{screens.length} screens</span>
            <span>•</span>
            <span>{outputJson.length.toLocaleString()} characters</span>
            <span>•</span>
            <span>{outputJson.split("\n").length} lines</span>
          </div>

          {/* JSON Output */}
          <div className="bg-background rounded-lg border border-border overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                storyboard-final.json
              </span>
              <span className="text-xs text-muted-foreground">
                Final production screens
              </span>
            </div>
            <pre className="p-4 overflow-auto text-sm font-mono max-h-[calc(100vh-300px)] bg-muted/5">
              <code>{outputJson}</code>
            </pre>
          </div>

          {/* Schema Info */}
          <div className="mt-6 p-4 bg-muted/20 rounded-lg border border-border">
            <h3 className="text-sm font-medium mb-2">Output Schema</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Each screen in the array contains the following fields:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">screen_number</span>
                <span className="text-muted-foreground ml-2">number</span>
              </div>
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">screen_type</span>
                <span className="text-muted-foreground ml-2">string</span>
              </div>
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">target_duration_sec</span>
                <span className="text-muted-foreground ml-2">number</span>
              </div>
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">voiceover_text</span>
                <span className="text-muted-foreground ml-2">string</span>
              </div>
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">visual_direction</span>
                <span className="text-muted-foreground ml-2">string | string[]</span>
              </div>
              <div className="p-2 bg-background rounded">
                <span className="font-mono text-blue-600">text_overlay</span>
                <span className="text-muted-foreground ml-2">string?</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
