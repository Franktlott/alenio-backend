import React from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle, Defs, Pattern, RadialGradient, Rect, Stop } from "react-native-svg";
import { gradients, palette } from "@/theme";

type Props = {
  /** Full height of the band, from the top of the screen. */
  height: number;
  /** Colour of the page below the band, painted under the rest of the screen. */
  pageColor?: string;
};

/**
 * The website hero as a band across the top of a tab: the site's purple, its
 * violet and cyan glows and dot grid, and the dusk peak from the auth pages.
 * Absolutely positioned, so it goes in a layout's backdrop slot.
 *
 * Paints edge-to-edge on Duo (including under the status column) so the
 * mountain reaches the glass; tab content clears that column itself.
 */
export function AppHeaderBand({ height, pageColor = palette.page }: Props) {
  const { width } = useWindowDimensions();
  /**
   * The peak sits at about 80% across and a third of the way down the photo.
   * Sizing from both edges keeps it framed at the right of the band on a phone
   * and on an unfolded screen alike.
   */
  const artWidth = Math.max(width, height * 1.6);
  const artHeight = artWidth * 0.75;
  const artTop = -artHeight * 0.2;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: pageColor }]}
    >
      <View style={[styles.band, { height }]}>
        <LinearGradient
          colors={[...gradients.band]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Image
          source={require("@/assets/alenio-auth-dusk-mountain.jpg")}
          style={{
            position: "absolute",
            right: 0,
            top: artTop,
            width: artWidth,
            height: artHeight,
            opacity: 0.85,
          }}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
        {/* Darkens the left, where the greeting sits, and the status bar. */}
        <LinearGradient
          colors={["rgba(13,7,38,0.9)", "rgba(13,7,38,0.55)", "rgba(13,7,38,0)"]}
          locations={[0, 0.45, 0.85]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        <LinearGradient
          colors={["rgba(13,7,38,0.55)", "rgba(13,7,38,0)", "rgba(26,11,69,0)", "rgba(26,11,69,0.7)"]}
          locations={[0, 0.3, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <RadialGradient id="bandViolet" cx="92%" cy="0%" rx="55%" ry="80%">
              <Stop offset="0" stopColor="#9333ea" stopOpacity="0.45" />
              <Stop offset="1" stopColor="#9333ea" stopOpacity="0" />
            </RadialGradient>
            <RadialGradient id="bandCyan" cx="0%" cy="100%" rx="45%" ry="70%">
              <Stop offset="0" stopColor="#22d3ee" stopOpacity="0.14" />
              <Stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
            </RadialGradient>
            <Pattern id="bandDots" width="22" height="22" patternUnits="userSpaceOnUse">
              <Circle cx="1" cy="1" r="1" fill="#fff" fillOpacity="0.06" />
            </Pattern>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#bandViolet)" />
          <Rect width="100%" height="100%" fill="url(#bandCyan)" />
          <Rect width="100%" height="70%" fill="url(#bandDots)" />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
    backgroundColor: palette.dusk,
  },
});
