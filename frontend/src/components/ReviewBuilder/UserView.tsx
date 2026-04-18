import { useState, useRef } from "react";
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
import type { UserViewProps, ProductionScreen } from "./types";
import { SCREEN_TYPE_CONFIG, calculateTotalDuration, formatDuration } from "./types";

const PLACEHOLDER_IMAGES: Record<string, string> = {
  screen_recording: "/placeholders/screen_recording.png",
  slides: "/placeholders/slides_and_diagrams.png",
  whiteboard_animation: "/placeholders/whiteboard.png",
  whiteboard: "/placeholders/whiteboard.png",
  code_editor: "/placeholders/code_editor.png",
  stock_footage: "/placeholders/stock_footage.png",
  real_world: "/placeholders/real_world.png",
  talking_head: "/placeholders/talking_head.png",
  talking_head_with_split_screens: "/placeholders/talking_head.png",
  talking_head_left_with_notes: "/placeholders/talking_head.png",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  talking_head: "bg-[#E6F2EB] text-[#3A6B47]",
  talking_head_with_split_screens: "bg-[#E6F2EB] text-[#3A6B47]",
  talking_head_left_with_notes: "bg-[#E6F2EB] text-[#3A6B47]",
  slides: "bg-[#F7F0E0] text-[#7A5C1E]",
  stock_footage: "bg-[#E8F0E9] text-[#3A6B47]",
  real_world: "bg-[#E8F0E9] text-[#3A6B47]",
  screen_recording: "bg-[#E8EEF5] text-[#3A5A7A]",
  code_editor: "bg-[#E8EEF5] text-[#3A5A7A]",
  whiteboard_animation: "bg-[#F5F0E8] text-[#6B5A3A]",
  whiteboard: "bg-[#F5F0E8] text-[#6B5A3A]",
};

export default function UserView({
  screens,
  projectId: _projectId,
  projectTitle = "Storyboard",
  onScreensUpdate: _onScreensUpdate,
  onExport,
}: UserViewProps) {
  const [isExporting, setIsExporting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const totalDuration = calculateTotalDuration(screens);
  const totalWords = screens.reduce(
    (sum, s) => sum + (s.voiceover_text?.split(/\s+/).filter(Boolean).length || 0),
    0
  );

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");

      const styles = StyleSheet.create({
        page: { padding: 40, fontFamily: "Helvetica", backgroundColor: "#ffffff" },
        header: { marginBottom: 30, borderBottom: "2px solid #D9DDD2", paddingBottom: 15 },
        title: { fontSize: 24, fontWeight: "bold", color: "#1C2118", marginBottom: 8 },
        subtitle: { fontSize: 12, color: "#5A6352" },
        statsRow: { flexDirection: "row", gap: 20, marginTop: 10 },
        stat: { fontSize: 10, color: "#5A6352" },
        card: { marginBottom: 20, border: "1px solid #D9DDD2", borderRadius: 8, overflow: "hidden" },
        cardHeader: { flexDirection: "row", alignItems: "center", padding: 12, backgroundColor: "#E8F0E9", borderBottom: "1px solid #D9DDD2" },
        screenNumber: { width: 28, height: 28, borderRadius: 14, backgroundColor: "#3A6B47", color: "#ffffff", fontSize: 14, fontWeight: "bold", textAlign: "center", lineHeight: 28, marginRight: 10 },
        screenType: { fontSize: 10, fontWeight: "bold", color: "#3A6B47", textTransform: "uppercase" },
        duration: { marginLeft: "auto", fontSize: 10, color: "#5A6352" },
        cardBody: { padding: 15 },
        section: { marginBottom: 12 },
        sectionLabel: { fontSize: 8, fontWeight: "bold", color: "#5A6352", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 },
        sectionContent: { fontSize: 11, color: "#1C2118", lineHeight: 1.5 },
        voiceoverBox: { backgroundColor: "#E8F0E9", padding: 10, borderRadius: 4 },
        visualDirection: { backgroundColor: "#E8F0E9", padding: 10, borderRadius: 4 },
        bulletPoint: { flexDirection: "row", marginBottom: 4 },
        bullet: { width: 15, fontSize: 11, color: "#3A6B47" },
        bulletText: { flex: 1, fontSize: 11, color: "#1C2118" },
        footer: { position: "absolute", bottom: 30, left: 40, right: 40, textAlign: "center", fontSize: 9, color: "#5A6352", borderTop: "1px solid #D9DDD2", paddingTop: 10 },
      });

      const getVisuals = (direction: string | string[]): string[] => {
        if (Array.isArray(direction)) return direction;
        if (typeof direction === "string" && direction.trim()) {
          return direction.split(/[,;]/).map(s => s.trim()).filter(Boolean);
        }
        return [];
      };

      const MyDocument = () => (
        <Document>
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <Text style={styles.title}>{projectTitle}</Text>
              <Text style={styles.subtitle}>Video Storyboard</Text>
              <View style={styles.statsRow}>
                <Text style={styles.stat}>{screens.length} Panels</Text>
                <Text style={styles.stat}>{formatDuration(totalDuration)} Duration</Text>
                <Text style={styles.stat}>{totalWords} Words</Text>
              </View>
            </View>
            {screens.map((screen, index) => (
              <View key={index} style={styles.card} wrap={false}>
                <View style={styles.cardHeader}>
                  <Text style={styles.screenNumber}>{screen.screen_number}</Text>
                  <Text style={styles.screenType}>{screen.screen_type.replace(/_/g, " ")}</Text>
                  <Text style={styles.duration}>{screen.duration}s</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.section}>
                    <Text style={styles.sectionLabel}>Voiceover Script</Text>
                    <View style={styles.voiceoverBox}>
                      <Text style={styles.sectionContent}>"{screen.voiceover_text || "No voiceover"}"</Text>
                    </View>
                  </View>
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
                          {typeof screen.visual_direction === "string" ? screen.visual_direction : "No visual direction"}
                        </Text>
                      )}
                    </View>
                  </View>
                  {screen.text_overlay && (
                    <View style={styles.section}>
                      <Text style={styles.sectionLabel}>Text Overlay</Text>
                      <Text style={styles.sectionContent}>{screen.text_overlay}</Text>
                    </View>
                  )}
                </View>
              </View>
            ))}
            <Text style={styles.footer}>Generated by Plotline • {new Date().toLocaleDateString()}</Text>
          </Page>
        </Document>
      );

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
    const shareData = JSON.stringify(screens, null, 2);
    try {
      await navigator.clipboard.writeText(shareData);
      alert("Storyboard data copied to clipboard!");
    } catch {
      console.error("Failed to copy");
    }
  };

  const getTypeBadgeColor = (screenType: string) =>
    TYPE_BADGE_COLORS[screenType] || "bg-muted text-muted-foreground";

  const getTypeLabel = (screenType: string) => {
    const config = SCREEN_TYPE_CONFIG[screenType];
    return config?.label || screenType.replace(/_/g, " ");
  };

  const getVisualSrc = (screen: ProductionScreen) => {
    const hasGenerated = screen.on_screen_visual?.startsWith("/generated/") || screen.on_screen_visual?.startsWith("http");
    if (hasGenerated) return screen.on_screen_visual!;
    return PLACEHOLDER_IMAGES[screen.screen_type] || "/placeholders/slides_and_diagrams.png";
  };

  return (
    <div className="h-full flex flex-col bg-muted/10">
      {/* Header */}
      <header className="px-6 sm:px-10 py-4 sm:py-5 border-b border-border bg-background">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground mb-1">Review & Share</h2>
            <p className="text-sm text-muted-foreground">
              Review your storyboard. Export or share when ready.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-4 mr-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{formatDuration(totalDuration)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Layers className="w-4 h-4" />
                <span>{screens.length} panels</span>
              </div>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FileText className="w-4 h-4" />
                <span>{totalWords} words</span>
              </div>
            </div>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-background border border-border hover:bg-muted/50 rounded-lg transition-colors"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isExporting}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm bg-[#2D6A4F] text-white rounded-lg transition-colors",
                isExporting ? "opacity-70 cursor-not-allowed" : "hover:bg-[#2D6A4F]/90"
              )}
            >
              {isExporting ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Exporting...</>
              ) : (
                <><Download className="w-4 h-4" />Download PDF</>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Table */}
      <div ref={contentRef} className="flex-1 overflow-auto px-6 sm:px-10 py-6">
        {screens.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No storyboard panels to display.</p>
            <p className="text-sm mt-2">Complete the previous stages to see your storyboard here.</p>
          </div>
        ) : (
          <div className="w-full bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-10">#</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[110px]">Type</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Voiceover Script</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-14">Dur</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-[180px]">Visual</th>
                </tr>
              </thead>
              <tbody>
                {screens.map((screen, index) => (
                  <tr
                    key={`${screen.screen_number}-${index}`}
                    className={cn(
                      "border-b border-border/50 transition-colors hover:bg-muted/30",
                      index === screens.length - 1 && "border-b-0"
                    )}
                  >
                    <td className="px-4 py-3 text-center font-bold text-muted-foreground align-top">
                      {screen.screen_number}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap",
                        getTypeBadgeColor(screen.screen_type)
                      )}>
                        {getTypeLabel(screen.screen_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-foreground leading-relaxed align-top">
                      "{screen.voiceover_text || "..."}"
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground align-top">
                      {screen.duration || 0}s
                    </td>
                    <td className="px-4 py-3 align-top">
                      <img
                        src={getVisualSrc(screen)}
                        alt={`Panel ${screen.screen_number} visual`}
                        className="w-full aspect-video rounded-md object-cover border border-border/50"
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          el.style.display = "none";
                          const placeholder = document.createElement("div");
                          placeholder.className = "w-full aspect-video rounded-md bg-muted/50 border border-border/50";
                          el.parentNode?.appendChild(placeholder);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-6 sm:px-10 py-4 border-t border-border bg-background flex items-center justify-between">
        <div className="text-base text-muted-foreground">
          {screens.length} panel{screens.length !== 1 ? "s" : ""} &middot;{" "}
          {formatDuration(totalDuration)} total &middot;{" "}
          {totalWords} words
        </div>
        <button
          onClick={onExport}
          className="px-4 py-2 bg-[#2D6A4F] text-white rounded-lg hover:bg-[#2D6A4F]/90 transition-colors flex items-center gap-2"
        >
          <Check className="w-4 h-4" />
          Mark as Complete
        </button>
      </footer>
    </div>
  );
}
