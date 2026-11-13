import { useEffect, useState } from "react";
import { Dimensions, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "@/theme";
import { PANE_GAP } from "@/lib/adaptive-layout-constants";

export {
  MASTER_PANE_WIDTH,
  PANE_GAP,
} from "@/lib/adaptive-layout-constants";

/**
 * Wide-screen layout rules shared by the Workspace screens.
 *
 * Two device families land here: iPad (where the extra room is symmetric) and
 * iPhone Duo (where it is not). On Duo the system collapses the status bar,
 * Dynamic Island, navigation, toolbar and tab bar into a single vertical bar
 * on one edge, so the horizontal safe-area insets are asymmetric and the side
 * they favour changes with the pose. Everything below therefore treats the
 * four insets as independent numbers rather than doubling one of them.
 */

/** Below this width a single column always wins, however tall the screen is. */
export const SPLIT_MIN_WIDTH = 700;
/**
 * Portrait keeps one column even when it is wide: iPad portrait at 820pt has
 * the height to show a full-bleed grid with the day list underneath, which
 * reads better than two cramped columns.
 */
export const SPLIT_MIN_ASPECT = 1.1;

export const RAIL_WIDTH = 74;

/** A sheet needs height as well as width, or it covers the screen regardless. */
export const SHEET_MIN_HEIGHT = 600;

/**
 * Whether a detail screen should be presented over what you were reading
 * instead of replacing it. Below either dimension the sheet fills the window
 * anyway, so the presentation costs the back gesture and buys nothing.
 */
export function fitsFormSheet(width: number, height: number): boolean {
  return width >= SPLIT_MIN_WIDTH && height >= SHEET_MIN_HEIGHT;
}

/**
 * Widest a single reading column gets. Past this a feed row is mostly empty
 * space with a line of text stranded on the left, so wide portrait screens
 * centre the column instead of stretching it. Split layouts opt out: they
 * already spend the width on a second pane.
 */
export const CONTENT_MAX_WIDTH = 680;

/**
 * Every Workspace tab splits at the same place, so switching tabs does not walk
 * the divider across the screen. The primary column takes the width an index row
 * needs — a title, who it belongs to, a time — and the detail pane takes the
 * rest, because that is where the reading and editing happen. Holding the index
 * to a target rather than a share is what keeps the two sides from growing
 * together and leaving the detail cramped on a large screen.
 */
export const PRIMARY_PANE_TARGET = 440;

/** The detail pane stops being useful outside this range. */
const DETAIL_MIN = 380;
const DETAIL_MAX = 560;
const GRID_MIN = 280;
/**
 * Seven columns of roughly 56pt: the point at which a month cell can still
 * carry a readable event chip rather than a truncated stub.
 */
const GRID_MIN_FOR_CENTERED_DIVIDER = 392;

export type SystemBarEdge = "left" | "right" | null;

/**
 * Pane widths for a split whose real position on screen is known, which is
 * the only way to place the divider on the hinge: ancestors add padding the
 * hook cannot see, so a row's width and window x have to be measured.
 *
 * The divider prefers the display's centre line, because that is where a
 * foldable's crease runs and a seam through the middle of one pane reads as
 * breakage while two unequal panes read as deliberate. It gives that up when
 * centring would squeeze the month grid below a readable column width, which
 * is what happens on iPad — so hingeless screens fall through to the clamped
 * ratio without anyone detecting hardware.
 */
export function splitPaneWidths(
  rowX: number,
  rowWidth: number,
  hingeX: number,
): { gridPaneWidth: number; detailPaneWidth: number; onHinge: boolean } {
  const area = Math.max(0, rowWidth - PANE_GAP);
  const centeredGrid = hingeX - rowX - PANE_GAP / 2;
  const centeredDetail = area - centeredGrid;
  const onHinge =
    centeredGrid >= GRID_MIN_FOR_CENTERED_DIVIDER &&
    centeredDetail >= DETAIL_MIN &&
    centeredDetail <= DETAIL_MAX;

  let grid = onHinge
    ? centeredGrid
    : area - Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, area - PRIMARY_PANE_TARGET));
  grid = Math.max(
    GRID_MIN,
    Math.min(grid, Math.max(GRID_MIN, area - DETAIL_MIN)),
  );
  return { gridPaneWidth: grid, detailPaneWidth: area - grid, onHinge };
}

export type AdaptiveLayout = {
  width: number;
  height: number;
  /** Two panes side by side: wide enough and landscape-shaped. */
  isSplit: boolean;
  /** Which edge the system vertical bar took, inferred from the insets. */
  systemBarEdge: SystemBarEdge;
  /** Our own rail goes on the edge the system left alone. */
  railEdge: "left" | "right";
  showRail: boolean;
  railWidth: number;
  /** Page gutter per edge — the base inset plus whatever the system reserved. */
  padLeft: number;
  padRight: number;
  /**
   * Padding a screen should apply to itself. The tab layout already offsets
   * the scene past the rail and its inset, so the rail's edge only needs the
   * plain gutter on top of that.
   */
  contentPadLeft: number;
  contentPadRight: number;
  /**
   * Cap for a centred single-column layout. Equals the window width on phones
   * and in split layouts, so applying it there changes nothing.
   */
  columnWidth: number;
  gridPaneWidth: number;
  detailPaneWidth: number;
  /**
   * True when the pane divider landed on the horizontal centre of the screen,
   * which is where a foldable's hinge runs.
   */
  dividerOnCenter: boolean;
  /** Window x of the display's centre line — pass to {@link splitPaneWidths}. */
  hingeX: number;
  /**
   * Icon-only tab rail in the Duo's status column. Null on a phone and on the
   * wide labeled rail, which already owns the edge.
   */
  iconRailEdge: SystemBarEdge;
  iconRailWidth: number;
};

/**
 * A difference this large between the left and right insets only happens when
 * the system has parked a vertical bar on one side.
 */
const SIDE_BAR_MIN_INSET = 24;

/**
 * The Duo's system bar lives outside our window, so the window is narrower
 * than the display and the hinge is not at the window's centre. Tracking the
 * screen width is the only way to find the hinge from here.
 */
function useScreenWidth(): number {
  const [screenWidth, setScreenWidth] = useState(
    () => Dimensions.get("screen").width,
  );
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ screen }) => {
      setScreenWidth(screen.width);
    });
    return () => sub.remove();
  }, []);
  return screenWidth;
}

export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  const screenWidth = useScreenWidth();
  const insets = useSafeAreaInsets();

  const isSplit = width >= SPLIT_MIN_WIDTH && width / height >= SPLIT_MIN_ASPECT;

  /**
   * iOS reports the screen in its native portrait orientation, so it is only
   * comparable to our window when it is the larger of the two.
   */
  const displayWidth = Math.max(screenWidth, width);
  /** How much of the display the system kept for itself, if any. */
  const systemBarWidth = Math.max(0, displayWidth - width);

  let systemBarEdge: SystemBarEdge = null;
  if (insets.left - insets.right >= SIDE_BAR_MIN_INSET) systemBarEdge = "left";
  else if (insets.right - insets.left >= SIDE_BAR_MIN_INSET)
    systemBarEdge = "right";
  else if (systemBarWidth >= SIDE_BAR_MIN_INSET) {
    /**
     * Measured on the Duo's inner display, iOS hands us a window that already
     * excludes the bar and reports symmetric insets, so nothing here says
     * which edge it took. The trailing edge is where it sat in every pose we
     * could observe, so assume that and keep our rail on the leading edge —
     * which is also the safer guess, since a leading rail matches iPad.
     */
    systemBarEdge = "right";
  }

  const railEdge = systemBarEdge === "left" ? "right" : "left";
  const clusterEdge = statusClusterEdge(width, height, insets);
  /**
   * The Duo's side column keeps the icon rail, including when the inner
   * display is open and sideways. The labeled rail is for a wide screen that
   * has no status column, such as an iPad.
   */
  const iconRailEdge = clusterEdge;
  const showRail = isSplit && iconRailEdge == null;

  const padLeft = insets.left + space.pagePad;
  const padRight = insets.right + space.pagePad;

  /** The rail sits flush against the content; only its own width is taken. */
  const railSpace = showRail ? RAIL_WIDTH : 0;
  const paneStart = padLeft + (railEdge === "left" ? railSpace : 0);
  const paneEnd = width - padRight - (railEdge === "right" ? railSpace : 0);
  const paneArea = Math.max(0, paneEnd - paneStart - PANE_GAP);

  /**
   * Display-centre estimate for Workspace grids.
   * RN still reports `screen` in portrait and hides the system bar from both
   * the window size and the insets, so this remains an estimate.
   */
  const hingeX =
    displayWidth / 2 - (systemBarEdge === "left" ? systemBarWidth : 0);

  /**
   * A first guess for screens that have not measured themselves yet; anything
   * laying out real panes should re-run {@link splitPaneWidths} against its
   * own frame, since ancestors add padding this cannot see.
   */
  const panes = splitPaneWidths(paneStart, paneArea + PANE_GAP, hingeX);

  return {
    width,
    height,
    isSplit,
    systemBarEdge,
    railEdge,
    showRail,
    railWidth: RAIL_WIDTH,
    padLeft,
    padRight,
    /**
     * Icon-rail scenes are full-bleed so the mountain band can reach the glass.
     * Content clears the status column itself. Labeled-rail scenes stay inset
     * by the tab layout, so they only need the plain page gutter here.
     */
    contentPadLeft:
      iconRailEdge === "left"
        ? CLOSED_DUO_CLUSTER + space.pagePad
        : showRail && railEdge === "left"
          ? space.pagePad
          : padLeft,
    contentPadRight:
      iconRailEdge === "right"
        ? CLOSED_DUO_CLUSTER + space.pagePad
        : showRail && railEdge === "right"
          ? space.pagePad
          : padRight,
    columnWidth: isSplit ? width : Math.min(width, CONTENT_MAX_WIDTH),
    gridPaneWidth: panes.gridPaneWidth,
    detailPaneWidth: panes.detailPaneWidth,
    dividerOnCenter: panes.onHinge,
    hingeX,
    iconRailEdge,
    iconRailWidth: iconRailEdge ? CLOSED_DUO_CLUSTER : 0,
  };
}

/**
 * Which edge holds the Duo's status cluster. A phone is narrower than the
 * closed Duo and reports no side inset, so it returns null.
 */
export function statusClusterEdge(
  width: number,
  height: number,
  insets: { left: number; right: number },
): SystemBarEdge {
  // Open and upright keeps the bottom bar. The clock is back on top.
  const openUpright = width < height && width >= 600 && width <= 750 && height >= 800;
  if (!openUpright) {
    if (insets.right - insets.left >= SIDE_BAR_MIN_INSET) return "right";
    if (insets.left - insets.right >= SIDE_BAR_MIN_INSET) return "left";
  }
  // Closed outer display. A phone is at most ~440pt wide.
  if (width < height && width >= 450 && width <= 520 && height < 760) return "right";
  // Open inner display, sideways. Wider than a phone, narrower than an iPad.
  if (width > height && width >= 760 && width <= 980 && height >= 580 && height <= 760) {
    return "right";
  }
  return null;
}

/**
 * The closed Duo's status cluster, when the safe area does not report it.
 * Matches the 84pt column iOS reserves beside the camera on that display.
 * A phone is at most ~440pt wide, so this never applies there.
 */
const CLOSED_DUO_CLUSTER = 84;

/**
 * Side space the status cluster occupies, for controls at the top of the page.
 * A phone reports no side inset and is narrower than the closed Duo, so the
 * result stays zero and those screens do not move. The rail's own edge is
 * already offset by the tab layout.
 */
export function useStatusClusterInset(options?: {
  /**
   * A screen drawn over the whole window, such as New post. The tab scene's
   * padding does not apply here, so the camera column still has to be cleared.
   */
  fullScreen?: boolean;
}): { left: number; right: number } {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { showRail, railEdge, iconRailEdge, iconRailWidth } = useAdaptiveLayout();
  /**
   * Tab scenes paint full-bleed under the icon rail so the header band can
   * reach the glass. Headers still clear the status column themselves.
   */
  if (iconRailEdge && !options?.fullScreen) {
    return {
      left: iconRailEdge === "left" ? iconRailWidth : 0,
      right: iconRailEdge === "right" ? iconRailWidth : 0,
    };
  }
  let left = showRail && railEdge === "left" ? 0 : insets.left;
  let right = showRail && railEdge === "right" ? 0 : insets.right;
  const edge = statusClusterEdge(width, height, { left, right });
  if (edge === "right" && right < SIDE_BAR_MIN_INSET) right = CLOSED_DUO_CLUSTER;
  if (edge === "left" && left < SIDE_BAR_MIN_INSET) left = CLOSED_DUO_CLUSTER;
  return { left, right };
}
