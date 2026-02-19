import { useState, useRef, useCallback } from "react";
import {
  Download,
  Share2,
  Clock,
  Layers,
  FileText,
  Check,
  Loader2,
  Film,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReviewCard from "./ReviewCard";
import type { UserViewProps, ProductionScreen } from "./types";
import { calculateTotalDuration, formatDuration } from "./types";

/**
 * UserView - Main review interface for Stage 4.
 * Shows all panels as non-collapsible cards with hover-to-edit.
 * Supports PDF download and sharing.
 */
export default function UserView({
  screens,
  projectTitle = "Storyboard",
  onScreensUpdate,
  onExport,
}: UserViewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const contentRef = useRef<HTMLDivElement>(null);

  const totalDuration = calculateTotalDuration(screens);
  const totalWords = screens.reduce(
    (sum, s) => sum + (s.voiceover_text?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  const handleScreenChange = useCallback((index: number, updatedScreen: ProductionScreen) => {
    const newScreens = [...screens];
    newScreens[index] = updatedScreen;
    onScreensUpdate(newScreens);
  }, [screens, onScreensUpdate]);

  const handleSave = useCallback(() => {
    setSaveStatus("saving");
    // The auto-save in StageLayout will handle the actual save
    setTimeout(() => {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }, 500);
  }, []);

  const handleDownloadPDF = async () => {
    setIsExporting(true);

    try {
      // Dynamic import for PDF libraries
      const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");

      // Create styles for PDF
      const styles = StyleSheet.create({
        page: {
          padding: 40,
          fontFamily: "Helvetica",
          backgroundColor: "#ffffff",
        },
        header: {
          marginBottom: 30,
          borderBottom: "2px solid #3b82f6",
          paddingBottom: 15,
        },
        title: {
          fontSize: 24,
          fontWeight: "bold",
          color: "#1f2937",
          marginBottom: 8,
        },
        subtitle: {
          fontSize: 12,
          color: "#6b7280",
        },
        statsRow: {
          flexDirection: "row",
          gap: 20,
          marginTop: 10,
        },
        stat: {
          fontSize: 10,
          color: "#6b7280",
        },
        card: {
          marginBottom: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          overflow: "hidden",
        },
        cardHeader: {
          flexDirection: "row",
          alignItems: "center",
          padding: 12,
          backgroundColor: "#f9fafb",
          borderBottom: "1px solid #e5e7eb",
        },
        screenNumber: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: "#3b82f6",
          color: "#ffffff",
          fontSize: 14,
          fontWeight: "bold",
          textAlign: "center",
          lineHeight: 28,
          marginRight: 10,
        },
        screenType: {
          fontSize: 10,
          fontWeight: "bold",
          color: "#3b82f6",
          textTransform: "uppercase",
        },
        duration: {
          marginLeft: "auto",
          fontSize: 10,
          color: "#6b7280",
        },
        cardBody: {
          padding: 15,
        },
        section: {
          marginBottom: 12,
        },
        sectionLabel: {
          fontSize: 8,
          fontWeight: "bold",
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 4,
        },
        sectionContent: {
          fontSize: 11,
          color: "#374151",
          lineHeight: 1.5,
        },
        voiceoverBox: {
          backgroundColor: "#f3f4f6",
          padding: 10,
          borderRadius: 4,
        },
        visualDirection: {
          backgroundColor: "#eff6ff",
          padding: 10,
          borderRadius: 4,
        },
        bulletPoint: {
          flexDirection: "row",
          marginBottom: 4,
        },
        bullet: {
          width: 15,
          fontSize: 11,
          color: "#3b82f6",
        },
        bulletText: {
          flex: 1,
          fontSize: 11,
          color: "#374151",
        },
        footer: {
          position: "absolute",
          bottom: 30,
          left: 40,
          right: 40,
          textAlign: "center",
          fontSize: 9,
          color: "#9ca3af",
          borderTop: "1px solid #e5e7eb",
          paddingTop: 10,
        },
      });

      // Helper to get visual directions as array
      const getVisuals = (direction: string | string[]): string[] => {
        if (Array.isArray(direction)) return direction;
        if (typeof direction === "string" && direction.trim()) {
          return direction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        }
        return [];
      };

      // Create PDF document
      const MyDocument = () => (
        <Document>
          <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{projectTitle}</Text>
              <Text style={styles.subtitle}>Video Storyboard</Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{screens.length} Panels</Text>
                <Text style={styles.stat}>{formatDuration(totalDuration)} Duration</Text>
                <Text style={styles.stat}>{totalWords} Words</Text>
              </View>
            </View>

            {/* Cards */}
            {screens.map((screen, index) => (
              <View key={index} style={styles.card} wrap={false}>
                <View style={styles.cardHeader}>
                  <Text style={styles.screenNumber}>{screen.screen_number}</Text>
                  <Text style={styles.screenType}>{screen.screen_type.replace(/_/g, " ")}</Text>
                  <Text style={styles.duration}>{screen.target_duration_sec}s</Text>
                </View>
                <View style={styles.cardBody}>
                  {/* Voiceover */}
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Voiceover Script</Text>
                    <View style={styles.voiceoverBox}>
                      <Text style={styles.sectionContent}>
                        "{screen.voiceover_text || "No voiceover"}"
                      </Text>
                    </View>
                  </View>

                  {/* Visual Direction */}
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Visual Direction</Text>
                    <View style={styles.visualDirection}>
                      {getVisuals(screen.visual_direction).length > 0 ? (
                        getVisuals(screen.visual_direction).map((dir, idx) => (
                          <View key={idx} style={styles.bulletPoint}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.bulletText}>{dir}</Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.sectionContent}>
                          {typeof screen.visual_direction === "string"
                            ? screen.visual_direction
                            : "No visual direction"}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Text Overlay */}
                  {screen.text_overlay && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Text Overlay</Text>
                      <Text style={styles.sectionContent}>{screen.text_overlay}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}

            {/* Footer */}
            <Text style={styles.footer}>
              Generated by Plotline • {new Date().toLocaleDateString()}
            </Text>
          </Page>
        </Document>
      );

      // Generate and download PDF
      const blob = await pdf(<MyDocument />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectTitle.replace(/\s+/g, "-").toLowerCase()}-storyboard.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Failed to generate PDF:", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    // Copy shareable link or data to clipboard
    const shareData = JSON.stringify(screens, null, 2);
    try {
      await navigator.clipboard.writeText(shareData);
      alert("Storyboard data copied to clipboard!");
    } catch {
      console.error("Failed to copy");
    }
  };

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 py-4 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1 flex items-center gap-2">
              <Film className="w-5 h-5 text-primary" />
              Review & Share
            </h2>
            <p className="text-sm text-muted-foreground">
              Review your storyboard. Hover over any field to edit. Changes auto-save.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            {/* Save Status */}
            {saveStatus !== "idle" && (
              <span className={cn(
                "text-xs px-2 py-1 rounded flex items-center gap-1",
                saveStatus === "saving" && "text-muted-foreground",
                saveStatus === "saved" && "text-green-600 bg-green-50"
              )}>
                {saveStatus === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
                {saveStatus === "saved" && <Check className="w-3 h-3" />}
                {saveStatus === "saving" ? "Saving..." : "Saved"}
              </span>
            )}

            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-muted hover:bg-muted/80 rounded-lg transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg transition-colors",
                isExporting ? "opacity-70 cursor-not-allowed" : "hover:bg-primary/90"
              )}
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download PDF
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-6 mt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Layers className="w-4 h-4" />
            <span>{screens.length} panels</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>{formatDuration(totalDuration)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="w-4 h-4" />
            <span>{totalWords} words</span>
          </div>
        </div>
      </header>

      {/* Cards Grid */}
      <div ref={contentRef} className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {screens.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No storyboard panels to display.</p>
              <p className="text-sm mt-2">Complete the previous stages to see your storyboard here.</p>
            </div>
          ) : (
            screens.map((screen, index) => (
              <ReviewCard
                key={`${screen.screen_number}-${index}`}
                screen={screen}
                onChange={(updated) => handleScreenChange(index, updated)}
                onSave={handleSave}
              />
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-border bg-background flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {screens.length} panel{screens.length !== 1 ? "s" : ""} &middot;{" "}
          {formatDuration(totalDuration)} total &middot;{" "}
          {totalWords} words
        </div>
        <button
          onClick={onExport}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          Mark as Complete
        </button>
      </footer>
    </div>
  );
}
