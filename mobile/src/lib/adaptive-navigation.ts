export type SystemBarEdge = "left" | "right" | null;
export type NavigationMode = "bottom" | "compactRail" | "labeledRail";

export const COMPACT_RAIL_WIDTH = 84;
/** Floating Duo dock width (icons + Seneca). */
export const COMPACT_DOCK_WIDTH = 56;
/**
 * How far page content stays from the Duo edge. Dock width plus a small air
 * gap — tight enough to feel intentional, loose enough to match other apps.
 */
export const COMPACT_RAIL_CONTENT_INSET = COMPACT_DOCK_WIDTH + 12;
export const LABELED_RAIL_WIDTH = 74;

/**
 * The closed cover's status column, on the right. The cover is 450–520pt
 * wide. A phone's short side stays under 450pt, so this never matches one.
 */
export function closedCoverClusterEdge(
  width: number,
  height: number,
): SystemBarEdge {
  if (width < height && width >= 450 && width <= 520 && height < 760) return "right";
  return null;
}

export function resolveNavigationMode(
  isSplit: boolean,
  iconRailEdge: SystemBarEdge,
): NavigationMode {
  if (iconRailEdge) return "compactRail";
  return isSplit ? "labeledRail" : "bottom";
}

export function navigationSceneInsets(
  mode: NavigationMode,
  edge: "left" | "right",
  insets: { left: number; right: number },
): { left: number; right: number } {
  if (mode === "bottom") return { left: 0, right: 0 };
  const width =
    mode === "compactRail"
      ? COMPACT_RAIL_CONTENT_INSET
      : LABELED_RAIL_WIDTH +
        (edge === "left" ? insets.left : insets.right);
  return edge === "left" ? { left: width, right: 0 } : { left: 0, right: width };
}
