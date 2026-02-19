import { useState } from "react";
import { Copy, Check, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OutputViewProps } from "../types";

/**
 * OutputView - JSON preview of the storyboard draft.
 * Shows formatted JSON with copy and download options.
 */
export default function OutputView({ screens }: OutputViewProps) {
  const [copied, setCopied] = useState(false);

  const jsonOutput = JSON.stringify(screens, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonOutput], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "storyboard-draft.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="output-view h-full flex flex-col">
      <header className="px-6 py-4 border-b border-border bg-background flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            JSON Output
          </h2>
          <p className="text-sm text-muted-foreground">
            Raw storyboard data in JSON format.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 text-sm rounded-md transition-colors",
              copied
                ? "bg-green-100 text-green-700"
                : "bg-muted hover:bg-muted/80 text-foreground"
            )}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 text-foreground rounded-md transition-colors"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <pre className="bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto text-sm font-mono text-foreground">
            {jsonOutput}
          </pre>
        </div>
      </div>
    </div>
  );
}
