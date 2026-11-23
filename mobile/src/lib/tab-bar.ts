import { useCallback } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";

/** Floating phone dock content height (excludes safe-area / float gap). */
export const TAB_BAR_HEIGHT = 58;

/** Side inset so the dock floats as a pill, not edge-to-edge. */
export const TAB_BAR_HORIZONTAL_INSET = 28;

/**
 * Max dock width on larger / landscape screens so it does not stretch edge to
 * edge. Narrow portrait phones keep the normal side insets instead.
 */
export const TAB_BAR_MAX_WIDTH = 380;

/** Apply the max-width cap once the window is at least this wide. */
export const TAB_BAR_WIDE_MIN_WIDTH = 430;

/** Air between the dock and the home indicator. */
export const TAB_BAR_BOTTOM_GAP = 12;

export const TAB_BAR_ACTIVE_COLOR = colors.brand;
export const TAB_BAR_INACTIVE_COLOR = "#0F172A";
export const TAB_BAR_DIVIDER_COLOR = colors.borderStrong;
export const TAB_BAR_ACTIVE_HIGHLIGHT = "rgba(109, 40, 217, 0.10)";
export const WORKSPACE_CARD_BOTTOM_GAP = 12;

export const TAB_BAR_ICON_SIZE = 21;
export const TAB_BAR_LABEL_SIZE = 9.5;

/** Scroll/content clearance: floating dock + safe area + optional extra. */
export function tabBarClearance(bottomInset: number, extra = 16): number {
  return (
    TAB_BAR_HEIGHT +
    Math.max(bottomInset, 8) +
    TAB_BAR_BOTTOM_GAP +
    extra
  );
}

/** Clearance with no bar to clear: safe area + optional extra. */
export function railClearance(bottomInset: number, extra = 16): number {
  return Math.max(bottomInset, 8) + extra;
}

/**
 * Clearance for screens under the main app tab bar. On wide screens the bar
 * becomes a side rail, so there is nothing left to pad past at the bottom.
 * Returns a function because most screens need more than one `extra`.
 */
export function useTabBarClearanceFn(): (extra?: number) => number {
  const insets = useSafeAreaInsets();
  const { showRail, iconRailEdge } = useAdaptiveLayout();
  const sideRail = showRail || iconRailEdge != null;
  return useCallback(
    (extra = 16) =>
      sideRail
        ? railClearance(insets.bottom, extra)
        : tabBarClearance(insets.bottom, extra),
    [insets.bottom, sideRail],
  );
}

export function useTabBarClearance(extra = 16): number {
  return useTabBarClearanceFn()(extra);
}

/** Outer FAB frame (Seneca image includes transparent padding). */
export const SENECA_FAB_SIZE = 43;
/**
 * Visible disc diameter for Seneca’s asset (~80% of the PNG).
 * Use this for sibling FABs (e.g. Celebrate +) so they match visually.
 */
export const SENECA_FAB_VISIBLE_SIZE = 36;
export const SENECA_FAB_RIGHT_INSET = 16;

/** Workspace lists: clear the tab bar and contextual Add FAB. */
export function workspaceTaskClearance(bottomInset: number): number {
  return tabBarClearance(bottomInset, 12) + SENECA_FAB_VISIBLE_SIZE + 12;
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
