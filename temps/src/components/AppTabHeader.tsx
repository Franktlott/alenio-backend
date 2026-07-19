import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { BrandLogo } from "./BrandLogo";
import { colors } from "../lib/theme";

type Props = {
  topInset: number;
  rightAction?: React.ReactNode;
  onClose?: () => void;
  onMenuPress?: () => void;
  /** Home uses left logo; check screens keep centered logo. */
  logoAlign?: "left" | "center";
  /** Shift logo up into top padding without growing the header. */
  logoLift?: number;
  testID?: string;
  compact?: boolean;
};

const RIGHT_SLOT_MIN_WIDTH = 72;

function MenuIcon() {
  return (
    <View style={styles.menuIcon} accessibilityElementsHidden>
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
      <View style={styles.menuBar} />
    </View>
  );
}

/** White header with the Alenio Temp logo. */
export function AppTabHeader({
  topInset,
  rightAction,
  onClose,
  onMenuPress,
  logoAlign = "center",
  logoLift = 0,
  testID,
  compact = false,
}: Props) {
  const right =
    rightAction ??
    (onMenuPress ? (
      <Pressable
        onPress={onMenuPress}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Open menu"
        style={styles.iconBtn}
      >
        <MenuIcon />
      </Pressable>
    ) : onClose ? (
      <Pressable
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={styles.iconBtn}
      >
        <Text style={styles.closeX}>✕</Text>
      </Pressable>
    ) : null);

  const leftAligned = logoAlign === "left";

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: topInset + (compact ? 8 : 12),
          paddingBottom: compact ? 10 : 14,
        },
      ]}
      testID={testID}
    >
      <StatusBar style="dark" />
      <View style={[styles.row, compact ? { minHeight: 36 } : null]}>
        {leftAligned ? (
          <>
            <BrandLogo
              width={compact ? 150 : 168}
              height={compact ? 38 : 42}
              style={logoLift ? { marginTop: -logoLift } : undefined}
            />
            <View style={styles.rightSlot}>{right}</View>
          </>
        ) : (
          <>
            <View style={styles.sideSlot} />
            <View
              style={[styles.logoWrap, logoLift ? { top: -logoLift } : null]}
              pointerEvents="none"
            >
              <BrandLogo width={compact ? 150 : 180} height={compact ? 38 : 46} />
            </View>
            <View style={[styles.sideSlot, styles.rightSlot]}>{right}</View>
          </>
        )}
      </View>
    </View>
  );
}

/** Solid white nav header background (stack screens). */
export function GradientHeaderBackground() {
  return (
    <>
      <StatusBar style="dark" />
      <View style={[StyleSheet.absoluteFill, styles.headerBg]} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBg: {
    backgroundColor: "#FFFFFF",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 40,
  },
  sideSlot: {
    minWidth: RIGHT_SLOT_MIN_WIDTH,
    flex: 1,
  },
  rightSlot: {
    marginLeft: "auto",
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: RIGHT_SLOT_MIN_WIDTH,
  },
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  iconBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  closeX: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "500",
    lineHeight: 24,
  },
  menuIcon: {
    width: 22,
    height: 16,
    justifyContent: "space-between",
  },
  menuBar: {
    height: 2.5,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
});
