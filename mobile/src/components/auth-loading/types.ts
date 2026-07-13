export type AuthLoadingStepStatus = "pending" | "active" | "done";

export type AuthLoadingStepId =
  | "authenticating"
  | "loading_workspace"
  | "syncing_team"
  | "preparing_dashboard";

export type AuthLoadingStep = {
  id: AuthLoadingStepId;
  title: string;
};

export const AUTH_LOADING_STEPS: AuthLoadingStep[] = [
  { id: "authenticating", title: "Authenticating with Microsoft" },
  { id: "loading_workspace", title: "Loading your workplace" },
  { id: "syncing_team", title: "Syncing your team" },
  { id: "preparing_dashboard", title: "Preparing your dashboard" },
];

/** Soft enterprise palette for the auth boot screen. */
export const AUTH_LOADING_COLORS = {
  background: "#F8FAFC",
  title: "#0F172A",
  subtitle: "#64748B",
  footer: "#94A3B8",
  card: "#FFFFFF",
  accent: "#6366F1",
  accentSoft: "#EEF2FF",
  brandPurple: "#7C3AED",
  brandBlue: "#4361EE",
  success: "#22C55E",
  pendingRing: "#CBD5E1",
  glow: "rgba(99, 102, 241, 0.18)",
} as const;

export function stepStatusAt(index: number, activeIndex: number, allDone: boolean): AuthLoadingStepStatus {
  if (allDone || index < activeIndex) return "done";
  if (index === activeIndex) return "active";
  return "pending";
}
