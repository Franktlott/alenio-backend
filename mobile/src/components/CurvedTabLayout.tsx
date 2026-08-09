import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { AppTabHeader } from "@/components/AppTabHeader";

/** Shared curve so Chat / Workspace / Activity / Team / Settings stay consistent. */
export const CURVED_HEADER_OVERLAP = 48;
export const CURVED_SHEET_RADIUS = 48;
export const CURVED_SEARCH_DOCK_HEIGHT = 40;

type Props = {
  topInset: number;
  title: string;
  workspaceTitleSelector?: boolean;
  testID?: string;
  headerTestID?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  showNotifications?: boolean;
  hideHeaderTitle?: boolean;
  children: React.ReactNode;
  /** Search field pinned to the top of the sheet, clear of the curve. */
  searchSlot?: React.ReactNode;
  /** Extra nodes rendered outside the curved sheet (modals, absolute overlays). */
  overlays?: React.ReactNode;
  /** Optional centered element straddling the gradient and curved sheet. */
  headerBridge?: React.ReactNode;
  /** Rendered bridge diameter/height, used to center it on the sheet boundary. */
  headerBridgeSize?: number;
  /** Additional gradient depth for screens whose bridge needs title clearance. */
  headerExtraHeight?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Gradient AppTabHeader + white sheet with large top radii overlapping the header.
 * Use on main tab screens; keep modals in `overlays` so they sit above the sheet.
 */
export function CurvedTabLayout({
  topInset,
  title,
  workspaceTitleSelector,
  testID,
  headerTestID,
  leftAction,
  rightAction,
  showNotifications,
  hideHeaderTitle,
  children,
  searchSlot,
  overlays,
  headerBridge,
  headerBridgeSize = 84,
  headerExtraHeight = 0,
  style,
}: Props) {
  return (
    <View style={[styles.screen, style]} testID={testID}>
      <AppTabHeader
        topInset={topInset}
        testID={headerTestID}
        title={title}
        leftAction={leftAction}
        workspaceTitleSelector={workspaceTitleSelector}
        hideCenterContent={hideHeaderTitle}
        overlapPad={CURVED_HEADER_OVERLAP + Math.max(0, headerExtraHeight)}
        rightAction={rightAction}
        showNotifications={showNotifications}
      />
      <View style={styles.body}>
        <View style={styles.sheet}>
          {searchSlot ? <View style={styles.searchDock}>{searchSlot}</View> : null}
          {children}
        </View>
        {headerBridge ? (
          <View
            pointerEvents="box-none"
            style={[
              styles.headerBridge,
              { top: -CURVED_HEADER_OVERLAP - headerBridgeSize / 2 },
            ]}
          >
            {headerBridge}
          </View>
        ) : null}
      </View>
      {overlays}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    // White (not purple): edge hairlines from the curve sit on white instead of
    // showing a purple sliver beside the sheet. Purple still shows only under the
    // header gradient in the curved notch.
    backgroundColor: "#FFFFFF",
  },
  body: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  searchDock: {
    height: CURVED_SEARCH_DOCK_HEIGHT,
    // Clear of the curved corners, so the field never crosses the rounded edge.
    marginTop: 18,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -CURVED_HEADER_OVERLAP,
    zIndex: 1,
    // Keep the side tangent just outside the viewport while preserving a
    // pronounced curve. Equal padding keeps page content aligned.
    marginHorizontal: -2,
    paddingHorizontal: 2,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CURVED_SHEET_RADIUS,
    borderTopRightRadius: CURVED_SHEET_RADIUS,
    overflow: "hidden",
  },
  headerBridge: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
    alignItems: "center",
  },
});
