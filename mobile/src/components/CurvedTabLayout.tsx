import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { AppTabHeader } from "@/components/AppTabHeader";

/** Shared curve so Chat / Workspace / Activity / Team / Settings stay consistent. */
export const CURVED_HEADER_OVERLAP = 48;
export const CURVED_SHEET_RADIUS = 16;
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
  notificationsSize?: "default" | "large";
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
  /** Override the shared top radius for a screen-specific flat transition. */
  sheetTopRadius?: number;
  headerTone?: "brand" | "light";
  /** Full-bleed node painted behind the header and sheet (e.g. a hero photo). */
  backdrop?: React.ReactNode;
  /** Header and sheet render transparent so the backdrop shows through. */
  backdropVisible?: boolean;
  headerTitlePlacement?: "center" | "leading";
  showWorkspaceSubtitle?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * AppTabHeader + white sheet with rounded top corners overlapping the header.
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
  notificationsSize,
  hideHeaderTitle,
  children,
  searchSlot,
  overlays,
  headerBridge,
  headerBridgeSize = 84,
  headerExtraHeight = 0,
  sheetTopRadius = CURVED_SHEET_RADIUS,
  headerTone = "light",
  backdrop,
  backdropVisible = false,
  headerTitlePlacement = "leading",
  showWorkspaceSubtitle = false,
  style,
}: Props) {
  return (
    <View style={[styles.screen, style]} testID={testID}>
      {backdrop ?? null}
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
        notificationsSize={notificationsSize}
        tone={headerTone}
        transparent={backdropVisible}
        titlePlacement={headerTitlePlacement}
        showWorkspaceSubtitle={showWorkspaceSubtitle}
      />
      <View style={styles.body}>
        <View
          style={[
            styles.sheet,
            backdropVisible ? styles.sheetTransparent : null,
            {
              borderTopLeftRadius: sheetTopRadius,
              borderTopRightRadius: sheetTopRadius,
            },
          ]}
        >
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
    position: "relative",
    backgroundColor: "#FFFFFF",
  },
  body: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  searchDock: {
    height: CURVED_SEARCH_DOCK_HEIGHT,
    marginTop: 12,
    marginHorizontal: 20,
    marginBottom: 6,
  },
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -CURVED_HEADER_OVERLAP,
    zIndex: 1,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  sheetTransparent: {
    backgroundColor: "transparent",
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
