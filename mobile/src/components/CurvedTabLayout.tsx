import React, { useCallback, useState } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useFocusEffect } from "expo-router";
import { setStatusBarStyle } from "expo-status-bar";
import { AppTabHeader } from "@/components/AppTabHeader";
import { AppHeaderBand } from "@/components/AppHeaderBand";
import { palette } from "@/theme";

/** Shared curve so Chat / Workspace / Activity / Team / Settings stay consistent. */
export const CURVED_HEADER_OVERLAP = 48;
export const CURVED_SHEET_RADIUS = 16;
export const CURVED_SEARCH_DOCK_HEIGHT = 40;
/** The sheet's corners when it rises over the purple band. */
const BAND_SHEET_RADIUS = 24;

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
  /**
   * The website's purple band behind the header, with the warm sheet rising
   * over it. Header icons and the status bar switch to their light versions.
   */
  band?: boolean;
  /** Sheet fill. Band tabs default to the warm page so white cards can lift off it. */
  sheetColor?: string;
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
  sheetTopRadius,
  headerTone = "light",
  backdrop,
  backdropVisible = false,
  band = false,
  sheetColor,
  headerTitlePlacement = "leading",
  showWorkspaceSubtitle = false,
  style,
}: Props) {
  const [headerHeight, setHeaderHeight] = useState(0);
  useFocusEffect(
    useCallback(() => {
      if (!band) return undefined;
      setStatusBarStyle("light");
      return () => setStatusBarStyle("dark");
    }, [band]),
  );
  const radius = sheetTopRadius ?? (band ? BAND_SHEET_RADIUS : CURVED_SHEET_RADIUS);
  const fill = sheetColor ?? (band ? palette.page : "#FFFFFF");
  /** Home paints its own band via `backdrop`; keep the sheet clear so white greeting text stays readable. */
  const sheetClear = backdropVisible && !band;

  return (
    <View
      style={[styles.screen, { backgroundColor: sheetClear ? "transparent" : fill }, style]}
      testID={testID}
    >
      {band ? (
        <AppHeaderBand
          height={headerHeight > 0 ? headerHeight : topInset + 120}
          pageColor={fill}
        />
      ) : (
        backdrop ?? null
      )}
      <View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
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
          tone={band ? "brand" : headerTone}
          transparent={band || backdropVisible}
          titlePlacement={headerTitlePlacement}
          showWorkspaceSubtitle={showWorkspaceSubtitle}
        />
      </View>
      <View style={styles.body}>
        <View
          style={[
            styles.sheet,
            {
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              backgroundColor: sheetClear ? "transparent" : fill,
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
  headerBridge: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 2,
    elevation: 2,
    alignItems: "center",
  },
});
