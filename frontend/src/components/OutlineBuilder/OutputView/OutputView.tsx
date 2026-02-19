import { useState, useCallback } from "react";
import { Copy, Download, Check } from "lucide-react";
import type { OutputViewProps } from "../types";

/**
 * OutputView - JSON preview of the screen outline with copy/download.
 */
export default function OutputView({ screens }: OutputViewProps) {
  const [copied, setCopied] = useState(false);

  const jsonString = JSON.stringify(screens, null, 2);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [jsonString]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `screen-outline-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [jsonString]);

  return (
    <div className="output-view h-full flex flex-col bg-muted/10">
      {/* Header with actions */}
      <header className="px-6 py-4 border-b border-border bg-background flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">
            Outline Output
          </h2>
          <p className="text-sm text-muted-foreground">
            JSON representation of your screen outline ({screens.length} screens)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-green-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy</span>
              </>
            )}
          </button>
          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Download</span>
          </button>
        </div>
      </header>

      {/* JSON Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <pre className="p-4 bg-muted/50 rounded-lg border border-border overflow-auto text-sm font-mono leading-relaxed">
            <code>
              <JsonHighlight data={screens} />
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}

/**
 * JsonHighlight - Simple syntax highlighting for JSON.
 */
function JsonHighlight({ data }: { data: unknown }) {
  const renderValue = (value: unknown, depth: number = 0): React.ReactNode => {
    const indent = "  ".repeat(depth);
    const nextIndent = "  ".repeat(depth + 1);

    if (value === null) {
      return <span className="text-orange-600">null</span>;
    }

    if (typeof value === "boolean") {
      return <span className="text-purple-600">{value.toString()}</span>;
    }

    if (typeof value === "number") {
      return <span className="text-blue-600">{value}</span>;
    }

    if (typeof value === "string") {
      const escaped = value.replace(/"/g, '\\"').replace(/\n/g, "\\n");
      return <span className="text-green-600">"{escaped}"</span>;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <span className="text-foreground">[]</span>;
      }
      return (
        <>
          <span className="text-foreground">[</span>
          {"\n"}
          {value.map((item, index) => (
            <span key={index}>
              {nextIndent}
              {renderValue(item, depth + 1)}
              {index < value.length - 1 ? "," : ""}
              {"\n"}
            </span>
          ))}
          {indent}
          <span className="text-foreground">]</span>
        </>
      );
    }

    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (entries.length === 0) {
        return <span className="text-foreground">{"{}"}</span>;
      }
      return (
        <>
          <span className="text-foreground">{"{"}</span>
          {"\n"}
          {entries.map(([key, val], index) => (
            <span key={key}>
              {nextIndent}
              <span className="text-red-600">"{key}"</span>
              <span className="text-foreground">: </span>
              {renderValue(val, depth + 1)}
              {index < entries.length - 1 ? "," : ""}
              {"\n"}
            </span>
          ))}
          {indent}
          <span className="text-foreground">{"}"}</span>
        </>
      );
    }

    return <span className="text-foreground">{String(value)}</span>;
  };

  return <>{renderValue(data)}</>;
}
