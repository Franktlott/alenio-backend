import { colors, radii, space } from "@/theme";

/** Shared Workspace Calendar/Tasks density — matches Chat list cards. */
export const WS = {
  pageGutter: space.pagePad,
  sectionGap: space.sm,
  cardRadius: radii.card,
  cardBorder: colors.borderCard,
  title: 13,
  titleWeight: "600" as const,
  body: 11,
  meta: 10,
  control: 11,
  controlWeight: "700" as const,
  ink: colors.textPrimary,
  muted: colors.textSecondary,
  faint: colors.textMuted,
  surface: colors.surface,
  pageBg: colors.pageBg,
  chipBg: colors.surfaceSecondary,
  accent: colors.brand,
};
