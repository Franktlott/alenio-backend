/** Fixed bottom tab bar content height (excludes device safe-area inset). */
export const TAB_BAR_HEIGHT = 52;

export const TAB_BAR_ACTIVE_COLOR = "#4361EE";
export const TAB_BAR_INACTIVE_COLOR = "#94A3B8";
export const TAB_BAR_DIVIDER_COLOR = "#E2E8F0";
export const TAB_BAR_ACTIVE_HIGHLIGHT = "rgba(67, 97, 238, 0.08)";

export const TAB_BAR_ICON_SIZE = 24;
export const TAB_BAR_LABEL_SIZE = 11;

/** Scroll/content clearance: fixed tab bar + safe area + optional extra spacing. */
export function tabBarClearance(bottomInset: number, extra = 16): number {
  return TAB_BAR_HEIGHT + bottomInset + extra;
}

/** Workspace task list: tab bar + Seneca FAB so content is not covered. */
export const SENECA_FAB_SIZE = 56;
export const SENECA_FAB_RIGHT_INSET = 16;

export function workspaceTaskClearance(bottomInset: number): number {
  return tabBarClearance(bottomInset, 12) + SENECA_FAB_SIZE + 8;
}

export function workspaceTaskRightInset(): number {
  return SENECA_FAB_SIZE + SENECA_FAB_RIGHT_INSET - 8;
}

/** @deprecated Floating capsule removed — alias kept for compatibility */
export const FLOATING_TAB_BAR_HEIGHT = TAB_BAR_HEIGHT;
export const FLOATING_TAB_BAR_BOTTOM_GAP = 0;
export function floatingTabBarClearance(bottomInset: number, extra = 16): number {
  return tabBarClearance(bottomInset, extra);
}
