import { useState, useEffect } from "react";
import { BouncingDots } from "./ui/bouncing-dots";
import "./storyboard-loading.css";

export type StoryboardLoaderState =
  | { kind: "indeterminate" }
  | { kind: "sectioned"; currentIndex: number; total: number; currentTitle: string; etaMs?: number };

interface StoryboardLoadingPanelProps {
  loaderState: StoryboardLoaderState;
  sectionCount?: number;
}

const INDETERMINATE_MESSAGES = [
  "Drafting the opening shot",
  "Sketching scenes from your outline",
  "Composing visuals for each beat",
  "Choosing camera angles",
  "Stitching the storyboard together",
];

export default function StoryboardLoadingPanel({
  loaderState,
  sectionCount = 6,
}: StoryboardLoadingPanelProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    if (loaderState.kind !== "indeterminate") return;
    const t = setInterval(
      () => setMsgIdx((v) => (v + 1) % INDETERMINATE_MESSAGES.length),
      1800
    );
    return () => clearInterval(t);
  }, [loaderState.kind]);

  const statusText =
    loaderState.kind === "sectioned"
      ? loaderState.currentTitle
      : INDETERMINATE_MESSAGES[msgIdx];

  const etaText =
    loaderState.kind === "sectioned" && loaderState.etaMs
      ? `${Math.ceil(loaderState.etaMs / 1000)}s remaining`
      : `${sectionCount} sections · ~${Math.ceil((sectionCount * 60) / 8)}s remaining`;

  const barCount =
    loaderState.kind === "sectioned" ? loaderState.total : sectionCount;

  return (
    <div className="w-full max-w-5xl">
      <section
        style={{
          background: "#ffffff",
          border: "1px solid #eeefe9",
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        {/* Loader hero */}
        <div
          style={{
            padding: "64px 28px 48px",
            background: "#f4f8f5",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 22,
            borderBottom: "1px solid #eeefe9",
          }}
        >
          <BouncingDots size={20} gap={10} />

          <div style={{ textAlign: "center" }}>
            <div
              key={msgIdx}
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "#3a6b4a",
                letterSpacing: "-0.005em",
                animation: "pl-fadeText 0.45s ease",
              }}
            >
              {statusText}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#7a847d",
                marginTop: 6,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {etaText}
            </div>
          </div>

          {/* Segmented progress bar */}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            {Array.from({ length: barCount }).map((_, i) => (
              <span
                key={i}
                style={{
                  width: 22,
                  height: 3,
                  borderRadius: 2,
                  background: "#e8f1ea",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "#3a6b4a",
                    transformOrigin: "left center",
                    animation: `pl-fillBar 1.6s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              </span>
            ))}
          </div>
        </div>

        {/* Skeleton frames */}
        <div style={{ padding: "20px 28px 28px" }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonFrame key={i} index={i + 1} delay={i * 0.18} />
          ))}
        </div>
      </section>
    </div>
  );
}

function SkeletonFrame({ index, delay }: { index: number; delay: number }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "38px 132px 1fr auto",
        gap: 18,
        padding: "18px 0",
        borderBottom: "1px solid #eeefe9",
        alignItems: "flex-start",
      }}
    >
      {/* Section number */}
      <span
        style={{
          fontFamily: '"Fraunces", serif',
          fontSize: 24,
          fontWeight: 300,
          color: "#a8b0aa",
        }}
      >
        {index}
      </span>

      {/* Thumbnail placeholder */}
      <div
        style={{
          width: 132,
          height: 76,
          borderRadius: 6,
          background: "#e8f1ea",
          position: "relative",
          overflow: "hidden",
          animation: `pl-skel 1.6s ease-in-out ${delay}s infinite`,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
            animation: `pl-shimmer 2.2s linear ${delay}s infinite`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 6,
            left: 7,
            fontSize: 9,
            fontWeight: 700,
            color: "#4d8a5f",
            fontFamily: "ui-monospace, monospace",
          }}
        >
          {String(index).padStart(2, "0")}
        </div>
      </div>

      {/* Text skeletons */}
      <div style={{ paddingTop: 4 }}>
        <div
          style={{
            height: 11,
            width: "70%",
            background: "#e8f1ea",
            borderRadius: 4,
            animation: `pl-skel 1.6s ease-in-out ${delay + 0.05}s infinite`,
          }}
        />
        <div
          style={{
            height: 8,
            width: "92%",
            background: "#eeefe9",
            borderRadius: 4,
            marginTop: 10,
            animation: `pl-skel 1.6s ease-in-out ${delay + 0.12}s infinite`,
          }}
        />
        <div
          style={{
            height: 8,
            width: "78%",
            background: "#eeefe9",
            borderRadius: 4,
            marginTop: 6,
            animation: `pl-skel 1.6s ease-in-out ${delay + 0.18}s infinite`,
          }}
        />
      </div>

      {/* Duration placeholder */}
      <span
        style={{
          fontFamily: "ui-monospace, monospace",
          fontSize: 11,
          color: "#a8b0aa",
          fontVariantNumeric: "tabular-nums",
          paddingTop: 6,
        }}
      >
        —s
      </span>
    </div>
  );
}
