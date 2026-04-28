import "../storyboard-loading.css";

interface BouncingDotsProps {
  size?: number;
  gap?: number;
  light?: boolean;
}

export function BouncingDots({ size = 12, gap = 6, light = false }: BouncingDotsProps) {
  const color = light ? "#ffffff" : "#3a6b4a";
  const dim = light ? "rgba(255,255,255,0.55)" : "#4d8a5f";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "flex-end",
        gap,
        height: size + 8,
        lineHeight: 0,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: size,
            height: size,
            borderRadius: 3,
            background: i === 1 ? color : dim,
            boxShadow: light
              ? "inset 0 0 0 1.5px rgba(255,255,255,0.35)"
              : "inset 0 0 0 1.5px #e8f1ea",
            animation: `pl-bounce 1.1s cubic-bezier(.5,0,.5,1) ${i * 0.14}s infinite`,
            display: "inline-block",
          }}
        />
      ))}
    </span>
  );
}
