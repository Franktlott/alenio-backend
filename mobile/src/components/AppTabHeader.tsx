import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { HeaderNotificationsButton } from "@/components/HeaderNotificationsButton";

type Props = {
  topInset: number;
  rightAction?: React.ReactNode;
  testID?: string;
  /** Kept for compatibility — all tab headers use the same compact height. */
  compact?: boolean;
  /** leading = logo left (default, all tabs). centered = logo in middle. */
  layout?: "centered" | "leading";
  /** Show the shared notifications bell (default true). */
  showNotifications?: boolean;
};

/** Shared tab header metrics — same on every main tab. */
const HEADER_PAD_TOP = 6;
const HEADER_PAD_BOTTOM = 6;
const ROW_MIN_HEIGHT = 32;

export function AppTabHeader({
  topInset,
  rightAction,
  testID,
  layout = "leading",
  showNotifications = true,
}: Props) {
  const isLeading = layout !== "centered";
  const trailing = (
    <>
      {rightAction ?? null}
      {showNotifications ? <HeaderNotificationsButton /> : null}
    </>
  );

  return (
    <LinearGradient
      colors={["#4361EE", "#7C3AED"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        styles.gradient,
        isLeading ? styles.gradientLeading : null,
        {
          paddingTop: topInset + HEADER_PAD_TOP,
          paddingBottom: HEADER_PAD_BOTTOM,
        },
      ]}
      testID={testID}
    >
      {isLeading ? (
        <View style={[styles.row, styles.leadingRow]}>
          <Image
            source={require("@/assets/alenio-logo-white.png")}
            style={styles.logoLeading}
            resizeMode="contain"
          />
          <View style={styles.trailingCluster}>{trailing}</View>
        </View>
      ) : (
        <View style={styles.row}>
          <View style={styles.sideSlot} />
          <View style={styles.logoWrap} pointerEvents="none">
            <Image
              source={require("@/assets/alenio-logo-white.png")}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <View style={[styles.sideSlot, styles.rightSlot]}>{trailing}</View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingHorizontal: 16,
  },
  gradientLeading: {
    paddingLeft: 4,
    paddingRight: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: ROW_MIN_HEIGHT,
  },
  leadingRow: {
    gap: 8,
  },
  sideSlot: {
    minWidth: 72,
    flex: 1,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  trailingCluster: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
    minWidth: 0,
  },
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  logo: {
    height: 28,
    width: 96,
  },
  logoLeading: {
    height: 28,
    width: 96,
    flexShrink: 0,
  },
});
