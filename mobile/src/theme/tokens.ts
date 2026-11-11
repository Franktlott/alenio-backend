import { StyleSheet } from "react-native";

/** Apple Enterprise visual tokens — Chat density is the source of truth. */
export const colors = {
  /** Pure white page canvas — cards separate via borders/shadows, not wash. */
  pageBg: "#FFFFFF",
  pageGradient: ["#FFFFFF", "#FFFFFF", "#FFFFFF"] as const,
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F4F8",
  surfaceTint: "#EFE9FF",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#8B95A5",
  textPreview: "#6B7280",
  divider: "#F1F5F9",
  border: "rgba(15, 23, 42, 0.04)",
  borderStrong: "#E8ECF0",
  /** Soft card stroke — modern, light edge on white. */
  borderCard: "#F1F5F9",
  /** The website's violet. Replaced the older #4361EE blue app-wide. */
  brand: "#6d28d9",
  brandAccent: "#8b5cf6",
  brandSoft: "#EFE9FF",
  success: "#128A52",
  warning: "#D97706",
  error: "#DC2626",
  info: "#4361EE",
  pressOverlay: "rgba(15, 23, 42, 0.03)",
  scrim: "rgba(15, 23, 42, 0.45)",
} as const;

export const radii = {
  xs: 7,
  sm: 8,
  /** Chat conversation / list cards */
  card: 9,
  md: 12,
  lg: 14,
  sheet: 20,
  full: 9999,
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  /** Gap between sections — compact enterprise */
  section: 14,
  /** Matches Chat horizontal card inset */
  pagePad: 12,
  rowMinHeight: 40,
  cardPadV: 7,
  cardPadH: 10,
  cardGap: 4,
  avatar: 28,
} as const;

export const typography = {
  heroTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  pageTitle: {
    fontSize: 17,
    fontWeight: "700" as const,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  /** Chat SectionHeader label */
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700" as const,
    letterSpacing: 0.7,
    color: colors.textSecondary,
    textTransform: "uppercase" as const,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 14,
  },
  /** Chat conversation title */
  rowTitle: {
    fontSize: 13,
    fontWeight: "600" as const,
    color: colors.textPrimary,
  },
  /** Chat preview / secondary line */
  rowSubtitle: {
    fontSize: 11,
    color: colors.textPreview,
    marginTop: 1,
    lineHeight: 14,
  },
  supporting: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  meta: {
    fontSize: 10,
    color: colors.textMuted,
  },
  metaTiny: {
    fontSize: 9,
    color: colors.textMuted,
  },
} as const;

export const surfaces = {
  /** Standalone Chat-style list card */
  listCard: {
    marginHorizontal: space.pagePad,
    marginBottom: space.cardGap,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    paddingVertical: space.cardPadV,
    paddingHorizontal: space.cardPadH,
    borderWidth: 1,
    borderColor: colors.borderCard,
  },
  /** Grouped settings / member lists */
  groupedCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    overflow: "hidden" as const,
    flexGrow: 0 as const,
    alignSelf: "stretch" as const,
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.borderCard,
    padding: space.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
  },
  iconBox: {
    width: space.avatar,
    height: space.avatar,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
} as const;

export const brandGradient = {
  colors: [colors.brand, colors.brandAccent] as const,
  soft: ["#5B6CF0", "#8B5CF6"] as const,
} as const;

/**
 * The website hero's palette (web/src/routes/website-home.css), shared by the
 * welcome and auth pages and the header band on the main tabs.
 */
export const palette = {
  night: "#0d0726",
  dusk: "#1a0b45",
  plum: "#2a0f63",
  violet: "#6d28d9",
  violetBright: "#8b5cf6",
  lilac: "#c4b5fd",
  lilacSoft: "#ede9fe",
  ink: "#160f2e",
  inkSecondary: "#5b5675",
  inkMuted: "#8d88a6",
  /** Warm off-white under the cards, so white cards read as raised. */
  page: "#F6F4FB",
  cardBorder: "rgba(76, 29, 149, 0.08)",
  rowDivider: "#F1EEF8",
} as const;

export const gradients = {
  band: [palette.night, palette.dusk, palette.plum] as const,
  brandText: ["#22d3ee", "#818cf8", "#d946ef"] as const,
  cta: ["#8b5cf6", "#a855f7", "#d946ef"] as const,
  progress: ["#8b5cf6", "#d946ef"] as const,
} as const;

/** Soft tinted tiles behind section icons. */
export const tints = {
  lavender: { bg: "#EFE9FF", fg: "#6d28d9" },
  mint: { bg: "#DFF7EE", fg: "#059669" },
  peach: { bg: "#FFE9DC", fg: "#EA580C" },
  sky: { bg: "#E0F2FE", fg: "#0284C7" },
} as const;

export const elevation = {
  /** White card on the warm page: hairline edge plus a soft violet-tinted lift. */
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    shadowColor: "#2A1660",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 3,
  },
  /** Feature surfaces that should sit above the cards around them. */
  raised: {
    borderRadius: 22,
    shadowColor: "#2A0F63",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 6,
  },
} as const;

export const premiumType = {
  sectionLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    fontWeight: "800" as const,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    color: palette.inkMuted,
  },
  sectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800" as const,
    letterSpacing: -0.3,
    color: palette.ink,
  },
  pageTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800" as const,
    letterSpacing: -0.6,
    color: palette.ink,
  },
  rowTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700" as const,
    color: "#111A2B",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500" as const,
    color: palette.ink,
  },
  supporting: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500" as const,
    color: "#667085",
  },
  meta: {
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600" as const,
    color: palette.inkMuted,
  },
} as const;

/** Status colours shared by badges, dots and inline alerts. Mirrors web ui.css. */
export const tones = {
  neutral: { bg: "#F1F0F6", fg: "#344054", dot: "#98A2B3" },
  accent: { bg: "#EFE9FF", fg: "#5B21B6", dot: "#6d28d9" },
  info: { bg: "#E0F2FE", fg: "#0369A1", dot: "#0284C7" },
  success: { bg: "#DFF7EE", fg: "#047857", dot: "#059669" },
  warning: { bg: "#FFF1DC", fg: "#B45309", dot: "#D97706" },
  danger: { bg: "#FEE4E2", fg: "#B42318", dot: "#DC2626" },
} as const;

export type Tone = keyof typeof tones;
