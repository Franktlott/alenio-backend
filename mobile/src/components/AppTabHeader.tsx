import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

type Props = {
  topInset: number;
  rightAction?: React.ReactNode;
  testID?: string;
  compact?: boolean;
};

const RIGHT_SLOT_MIN_WIDTH = 72;

export function AppTabHeader({ topInset, rightAction, testID, compact = false }: Props) {
  return (
    <LinearGradient
      colors={["#4361EE", "#7C3AED"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[
        styles.gradient,
        {
          paddingTop: topInset + (compact ? 8 : 12),
          paddingBottom: compact ? 10 : 16,
        },
      ]}
      testID={testID}
    >
      <View style={[styles.row, compact ? { minHeight: 32 } : null]}>
        <View style={styles.sideSlot} />
        <View style={styles.logoWrap} pointerEvents="none">
          <Image
            source={require("@/assets/alenio-logo-white.png")}
            style={[styles.logo, compact ? { height: 26, width: 90 } : null]}
            resizeMode="contain"
          />
        </View>
        <View style={[styles.sideSlot, styles.rightSlot]}>{rightAction ?? null}</View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 36,
  },
  sideSlot: {
    minWidth: RIGHT_SLOT_MIN_WIDTH,
    flex: 1,
  },
  rightSlot: {
    alignItems: "flex-end",
    justifyContent: "center",
  },
  logoWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  logo: {
    height: 30,
    width: 104,
  },
});
