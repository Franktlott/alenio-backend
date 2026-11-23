import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, palette } from "@/theme";

export const TIMELINE_TIME_COL = 52;
export const TIMELINE_MARKER_COL = 28;

type Props = {
  timeMain: string;
  timeSub?: string | null;
  leading: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  selected?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /**
   * Vertical line joining stacked rows. Keep for day/schedule timelines;
   * turn off for the Tasks tab list.
   */
  showRail?: boolean;
  /** Soften the time column (e.g. overdue / past). */
  timeMuted?: boolean;
  /** Tighter padding for task lists. */
  dense?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  testID?: string;
};

/**
 * Shared daily-timeline chrome: time | rail through marker | content | trailing.
 * The vertical line runs through the checkbox/icon column so stacked rows join.
 */
export function TimelineRow({
  timeMain,
  timeSub,
  leading,
  children,
  trailing,
  selected = false,
  isFirst = false,
  isLast = false,
  showRail = true,
  timeMuted = false,
  dense = false,
  onPress,
  onLongPress,
  testID,
}: Props) {
  const drawRail = showRail && !(isFirst && isLast);
  return (
    <View
      style={[
        styles.row,
        dense ? styles.rowDense : null,
        !isLast ? styles.rowDivider : null,
        selected ? styles.rowSelected : null,
      ]}
    >
      <View style={styles.timeCol}>
        <Text
          style={[styles.timeMain, timeMuted ? styles.timeMuted : null]}
          numberOfLines={1}
        >
          {timeMain}
        </Text>
        {timeSub ? (
          <Text
            style={[styles.timeSub, timeMuted ? styles.timeMuted : null]}
            numberOfLines={1}
          >
            {timeSub}
          </Text>
        ) : null}
      </View>

      <View style={styles.markerCol}>
        {drawRail ? (
          <View
            style={[
              styles.rail,
              isFirst ? styles.railFirst : null,
              isLast ? styles.railLast : null,
            ]}
          />
        ) : null}
        <View
          style={[styles.marker, selected ? styles.markerSelected : null]}
        >
          {leading}
        </View>
      </View>

      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        disabled={!onPress && !onLongPress}
        style={[styles.body, dense ? styles.bodyDense : null]}
        testID={testID}
      >
        <View style={styles.content}>{children}</View>
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
    minHeight: 44,
    /** Transparent so parent rounded cards clip cleanly — no square white corners. */
    backgroundColor: "transparent",
  },
  rowDense: {
    minHeight: 36,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.rowDivider,
  },
  rowSelected: {
    backgroundColor: "#F5F7FF",
  },
  timeCol: {
    width: TIMELINE_TIME_COL,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  timeMain: {
    width: "100%",
    textAlign: "center",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    fontVariant: ["tabular-nums"],
  },
  timeSub: {
    width: "100%",
    textAlign: "center",
    marginTop: 0,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: colors.textMuted,
    fontVariant: ["tabular-nums"],
  },
  timeMuted: {
    color: colors.textMuted,
  },
  markerCol: {
    width: TIMELINE_MARKER_COL,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  rail: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "#DCD5F7",
  },
  /** Start at the first checkbox instead of extending into the header. */
  railFirst: {
    top: "50%",
  },
  /** Stop at the last checkbox instead of trailing past it. */
  railLast: {
    bottom: "50%",
  },
  marker: {
    zIndex: 1,
    alignItems: "center",
    justifyContent: "center",
    /** Opaque pad so the rail reads as joining into the checkbox/icon. */
    backgroundColor: "#FFFFFF",
    paddingVertical: 2,
  },
  markerSelected: {
    backgroundColor: "#F5F7FF",
  },
  body: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 5,
    paddingLeft: 8,
    paddingRight: 8,
  },
  bodyDense: {
    paddingVertical: 3,
    paddingLeft: 6,
    paddingRight: 6,
  },
  content: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    flexShrink: 0,
    marginLeft: 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
