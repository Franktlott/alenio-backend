import { colors } from "@/theme";

/** Fixed bottom tab bar content height (excludes safe-area inset). */
export const TAB_BAR_HEIGHT = 58;

/** @deprecated Island inset — fixed bar is edge-to-edge. Kept for compatibility. */
export const TAB_BAR_HORIZONTAL_INSET = 0;

/** @deprecated Island float gap — fixed bar uses safe-area only. Kept for compatibility. */
export const TAB_BAR_BOTTOM_GAP = 0;

export const TAB_BAR_ACTIVE_COLOR = colors.brand;
export const TAB_BAR_INACTIVE_COLOR = colors.textMuted;
export const TAB_BAR_DIVIDER_COLOR = colors.borderStrong;
export const TAB_BAR_ACTIVE_HIGHLIGHT = "rgba(67, 97, 238, 0.08)";

export const TAB_BAR_ICON_SIZE = 22;
export const TAB_BAR_LABEL_SIZE = 10;

/** Scroll/content clearance: fixed tab bar + safe area + optional extra. */
export function tabBarClearance(bottomInset: number, extra = 16): number {
  return TAB_BAR_HEIGHT + Math.max(bottomInset, 8) + extra;
}

/** Outer FAB frame (Seneca image includes transparent padding). */
export const SENECA_FAB_SIZE = 48;
/**
 * Visible disc diameter for Seneca’s asset (~80% of the PNG).
 * Use this for sibling FABs (e.g. Celebrate +) so they match visually.
 */
export const SENECA_FAB_VISIBLE_SIZE = 40;
export const SENECA_FAB_RIGHT_INSET = 16;

/** Workspace lists: clear tab bar + Seneca + primary Add FAB. */
export function workspaceTaskClearance(bottomInset: number): number {
  // Tab bar + Seneca + Workspace primary + gap so list content clears both FABs.
  return (
    tabBarClearance(bottomInset, 12) +
    SENECA_FAB_SIZE +
    10 +
    SENECA_FAB_VISIBLE_SIZE +
    8
  );
}

export function workspaceTaskRightInset(): number {
  return SENECA_FAB_SIZE + SENECA_FAB_RIGHT_INSET - 8;
}

/** @deprecated Use TAB_BAR_HEIGHT — alias kept for compatibility */
export const FLOATING_TAB_BAR_HEIGHT = TAB_BAR_HEIGHT;
export const FLOATING_TAB_BAR_BOTTOM_GAP = TAB_BAR_BOTTOM_GAP;
export function floatingTabBarClearance(bottomInset: number, extra = 16): number {
  return tabBarClearance(bottomInset, extra);
}
