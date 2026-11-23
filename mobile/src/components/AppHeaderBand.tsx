import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { useAdaptiveLayout } from "@/lib/adaptive-layout";
import { gradients, palette } from "@/theme";

type Props = {
  /** Full height of the band, from the top of the screen. */
  height: number;
  /** Colour of the page below the band, painted under the rest of the screen. */
  pageColor?: string;
  /**
   * Kept for call-site compatibility. Mountains are no longer drawn — the band
   * is one continuous purple field with a full left-to-right dot grid.
   */
  showMountain?: boolean;
};

/**
 * Purple header band: one continuous gradient and a full-bleed dot field.
 * Extends under the Duo status column. Remounts when the window width changes
 * so an open Duo does not keep a closed-width SVG cut off mid-screen.
 */
export function AppHeaderBand({
  height,
  pageColor = palette.page,
}: Props) {
  const { width, sceneInsetLeft, sceneInsetRight } = useAdaptiveLayout();
  const bandWidth = Math.max(1, Math.round(width));
  const bandHeight = Math.max(1, Math.round(height));
  /**
   * Scene content is inset for the Duo column; the band bleeds back into that
   * inset. Width is the full window so dots/gradients never stop at the hinge.
   */
  const layoutKey = `${bandWidth}x${bandHeight}:${sceneInsetLeft}:${sceneInsetRight}`;

  const dots = useMemo(
    () => (
      <Svg width={bandWidth} height={bandHeight}>
        <Defs>
          <RadialGradient id={`bandViolet-${layoutKey}`} cx="100%" cy="0%" rx="70%" ry="90%">
            <Stop offset="0" stopColor="#9333ea" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#9333ea" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id={`bandCyan-${layoutKey}`} cx="0%" cy="100%" rx="60%" ry="80%">
            <Stop offset="0" stopColor="#22d3ee" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </RadialGradient>
          <Pattern
            id={`bandDots-${layoutKey}`}
            width="22"
            height="22"
            patternUnits="userSpaceOnUse"
          >
            <Circle cx="1" cy="1" r="1" fill="#fff" fillOpacity="0.08" />
          </Pattern>
        </Defs>
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#bandViolet-${layoutKey})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#bandCyan-${layoutKey})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#bandDots-${layoutKey})`}
        />
      </Svg>
    ),
    [bandHeight, bandWidth, layoutKey],
  );

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.host,
        { backgroundColor: pageColor },
      ]}
    >
      <View
        key={layoutKey}
        style={[
          styles.band,
          {
            height: bandHeight,
            width: bandWidth,
            left: -sceneInsetLeft,
          },
        ]}
      >
        <LinearGradient
          key={`grad-${layoutKey}`}
          colors={[...gradients.band]}
          locations={[0, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          key={`wash-${layoutKey}`}
          colors={[
            "rgba(13,7,38,0.4)",
            "rgba(13,7,38,0.1)",
            "rgba(26,11,69,0.3)",
          ]}
          locations={[0, 0.55, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={StyleSheet.absoluteFill}>{dots}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    overflow: "visible",
  },
  band: {
    position: "absolute",
    top: 0,
    overflow: "hidden",
    backgroundColor: palette.dusk,
  },
});
