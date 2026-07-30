import React from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { AppTabHeader } from "@/components/AppTabHeader";

/** Shared curve so Chat / Workspace / Activity / Team / Settings stay consistent. */
export const CURVED_HEADER_OVERLAP = 48;
export const CURVED_SHEET_RADIUS = 48;

type Props = {
  topInset: number;
  title: string;
  subtitle?: string;
  workspaceTitleSelector?: boolean;
  testID?: string;
  headerTestID?: string;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  showNotifications?: boolean;
  children: React.ReactNode;
  /** Extra nodes rendered outside the curved sheet (modals, absolute overlays). */
  overlays?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Gradient AppTabHeader + white sheet with large top radii overlapping the header.
 * Use on main tab screens; keep modals in `overlays` so they sit above the sheet.
 */
export function CurvedTabLayout({
  topInset,
  title,
  subtitle,
  workspaceTitleSelector,
  testID,
  headerTestID,
  leftAction,
  rightAction,
  showNotifications,
  children,
  overlays,
  style,
}: Props) {
  return (
    <View style={[styles.screen, style]} testID={testID}>
      <AppTabHeader
        topInset={topInset}
        testID={headerTestID}
        title={title}
        subtitle={subtitle}
        leftAction={leftAction}
        workspaceTitleSelector={workspaceTitleSelector}
        overlapPad={CURVED_HEADER_OVERLAP}
        rightAction={rightAction}
        showNotifications={showNotifications}
      />
      <View style={styles.sheet}>{children}</View>
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
  sheet: {
    flex: 1,
    minHeight: 0,
    marginTop: -CURVED_HEADER_OVERLAP,
    // Keep the side tangent just outside the viewport while preserving a
    // pronounced curve. Equal padding keeps page content aligned.
    marginHorizontal: -2,
    paddingHorizontal: 2,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: CURVED_SHEET_RADIUS,
    borderTopRightRadius: CURVED_SHEET_RADIUS,
    overflow: "hidden",
  },
});
