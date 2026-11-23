export type CoverInk = "light" | "dark";

/** WCAG relative luminance for a #RRGGBB / #RGB color. */
export function relativeLuminance(hex: string): number {
  const raw = hex.replace("#", "").trim();
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : raw.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 0;
  const channels = [0, 2, 4].map((i) => {
    const n = parseInt(full.slice(i, i + 2), 16) / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/**
 * Light backgrounds get dark (black) ink; dark backgrounds get light (white) ink.
 * Threshold ~0.55 keeps mid-tones on the white-ink side for photo covers.
 */
export function inkForBackground(hex: string): CoverInk {
  return relativeLuminance(hex) > 0.55 ? "dark" : "light";
}

export function coverInkColors(ink: CoverInk) {
  if (ink === "dark") {
    return {
      title: "#0F172A",
      label: "#1E293B",
      subtitle: "rgba(15, 23, 42, 0.72)",
      wash: [
        "rgba(255,255,255,0.92)",
        "rgba(255,255,255,0.72)",
        "rgba(255,255,255,0.28)",
        "rgba(255,255,255,0)",
      ] as const,
    };
  }
  return {
    title: "#FFFFFF",
    label: "rgba(255,255,255,0.94)",
    subtitle: "rgba(255,255,255,0.84)",
    wash: [
      "rgba(20,9,56,0.72)",
      "rgba(26,11,69,0.48)",
      "rgba(42,15,99,0.18)",
      "rgba(42,15,99,0)",
    ] as const,
  };
}
