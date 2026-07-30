export type TeamHealthBand = {
  key: "critical" | "needs_attention" | "strong" | "exceptional";
  label: string;
  range: string;
  color: string;
  bg: string;
  border: string;
  description: string;
  min: number;
  max: number;
};

/** Worst → best. Used by the score key and ring status. */
export const TEAM_HEALTH_BANDS: TeamHealthBand[] = [
  {
    key: "critical",
    label: "Critical",
    range: "0–49%",
    min: 0,
    max: 49,
    color: "#EF4444",
    bg: "#FEF2F2",
    border: "#FECACA",
    description: "Health is critically low — coach immediately on check-ins, goals, or tasks.",
  },
  {
    key: "needs_attention",
    label: "Needs attention",
    range: "50–74%",
    min: 50,
    max: 74,
    color: "#FACC15",
    bg: "#FEFCE8",
    border: "#FDE047",
    description: "Below target — prioritize the gaps dragging the score down.",
  },
  {
    key: "strong",
    label: "Strong",
    range: "75–94%",
    min: 75,
    max: 94,
    color: "#22C55E",
    bg: "#F0FDF4",
    border: "#86EFAC",
    description: "Team is performing well with only light coaching needed.",
  },
  {
    key: "exceptional",
    label: "Exceptional",
    range: "95–100%",
    min: 95,
    max: 100,
    color: "#D4AF37",
    bg: "#FFFBEB",
    border: "#E8C547",
    description: "Top-tier performance — standards are being met consistently across the team.",
  },
];

export function teamHealthBandForScore(value: number | null): TeamHealthBand | null {
  if (value == null) return null;
  const safe = Math.max(0, Math.min(100, value));
  for (let i = TEAM_HEALTH_BANDS.length - 1; i >= 0; i -= 1) {
    const band = TEAM_HEALTH_BANDS[i];
    if (safe >= band.min) return band;
  }
  return TEAM_HEALTH_BANDS[0];
}
