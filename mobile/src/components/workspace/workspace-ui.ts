import { colors, palette, radii, space } from "@/theme";

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
  /** One geometry for every control on the screen: 32pt buttons inside a 38pt row. */
  controlHeight: 32,
  controlTrackPad: 3,
  controlRowHeight: 38,
  ink: colors.textPrimary,
  muted: colors.textSecondary,
  faint: colors.textMuted,
  surface: colors.surface,
  /** Warm off-white, so the white cards on it read as raised. */
  pageBg: palette.page,
  chipBg: colors.surfaceSecondary,
  accent: colors.brand,
};

/**
 * The frame both columns of a split Workspace page share. Same radius, stroke,
 * and fill as the calendar month card, so switching tabs does not change the box.
 */
export const splitPaneCard = {
  flex: 1,
  minHeight: 0,
  backgroundColor: colors.surface,
  borderRadius: 18,
  borderWidth: 1,
  borderColor: palette.cardBorder,
  overflow: "hidden" as const,
};
