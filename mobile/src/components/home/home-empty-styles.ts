import { StyleSheet } from "react-native";

/**
 * The shape every empty card on Home shares: a tinted circle, a bold line and
 * a line of explanation. Only the tint changes per card, so the day, the week
 * and the feed read as a set rather than as three unrelated placeholders.
 *
 * Deliberately no action. Home reports the state of your day; the work itself
 * belongs to Workspace, and an empty card is the weakest possible reason to
 * start some.
 *
 * Sized so two of these can stack in one column of the wide layout without
 * pushing the page into a scroll. That ceiling is what keeps the circle at 50
 * rather than the 62 a single card on its own would carry comfortably.
 */
const ICON_SIZE = 50;

export const homeEmptyStyles = StyleSheet.create({
  block: {
    alignItems: "center",
    paddingHorizontal: 22,
    paddingTop: 4,
    paddingBottom: 16,
  },
  /** A card with height to spare centres the block instead of top-aligning it. */
  fill: {
    flexGrow: 1,
    justifyContent: "center",
  },
  icon: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 9,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#101828",
  },
  text: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "400",
    textAlign: "center",
    color: "#667085",
  },
});

/** Icon glyph size that sits correctly inside {@link homeEmptyStyles.icon}. */
export const HOME_EMPTY_GLYPH = 23;
