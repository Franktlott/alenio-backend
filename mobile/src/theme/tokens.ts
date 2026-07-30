import { StyleSheet } from "react-native";

/** Apple Enterprise visual tokens — Chat density is the source of truth. */
export const colors = {
  /** Pure white page canvas — cards separate via borders/shadows, not wash. */
  pageBg: "#FFFFFF",
  pageGradient: ["#FFFFFF", "#FFFFFF", "#FFFFFF"] as const,
  surface: "#FFFFFF",
  surfaceSecondary: "#F1F4F8",
  surfaceTint: "#EEF2FF",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#8B95A5",
  textPreview: "#6B7280",
  divider: "#F1F5F9",
  border: "rgba(15, 23, 42, 0.04)",
  borderStrong: "#E8ECF0",
  /** Soft card stroke — modern, light edge on white. */
  borderCard: "#F1F5F9",
  brand: "#4361EE",
  brandAccent: "#7C3AED",
  brandSoft: "#EEF2FF",
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
