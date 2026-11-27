import { Image, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import {
  profileBannerPath,
  profileHeaderCurveDepth,
} from "@/components/profile/ProfileHeaderCurve";
import { palette } from "@/theme";

const ALENIO_ICON = require("@/assets/alenio-icon.png");

/**
 * Default member-profile cover — same dark→purple band + dot fade as home,
 * clipped to a soft center scoop (not a full-width circle cut).
 */
export function AlenioDefaultProfileHeader({
  height,
  width,
  /** Unique per instance when many headers share a screen (SVG clip ids). */
  instanceId,
  curveDepth,
  showWatermark = true,
}: {
  height: number;
  width: number;
  instanceId?: string;
  curveDepth?: number;
  showWatermark?: boolean;
}) {
  const bandWidth = Math.max(0, Math.round(width));
  const bandHeight = Math.max(0, Math.round(height));
  const depth = curveDepth ?? profileHeaderCurveDepth(bandWidth);

  if (bandWidth <= 0 || bandHeight <= 0) {
    return (
      <View
        style={[styles.root, { height }]}
        testID="alenio-default-profile-header"
      />
    );
  }

  const path = profileBannerPath(bandWidth, bandHeight, depth);
  const uid = `${instanceId ?? "default"}-${bandWidth}x${bandHeight}`;

  return (
    <View
      style={[styles.root, { height: bandHeight }]}
      testID="alenio-default-profile-header"
    >
      <Svg
        width={bandWidth}
        height={bandHeight}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Defs>
          <ClipPath id={`clip-${uid}`}>
            <Path d={path} />
          </ClipPath>
          <SvgGradient id={`band-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={palette.night} />
            <Stop offset="0.5" stopColor={palette.dusk} />
            <Stop offset="1" stopColor={palette.plum} />
          </SvgGradient>
          <SvgGradient id={`wash-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={palette.night} stopOpacity="0.4" />
            <Stop offset="0.55" stopColor={palette.night} stopOpacity="0.1" />
            <Stop offset="1" stopColor={palette.dusk} stopOpacity="0.3" />
          </SvgGradient>
          <RadialGradient
            id={`violet-${uid}`}
            cx="100%"
            cy="0%"
            rx="70%"
            ry="90%"
          >
            <Stop offset="0" stopColor="#9333ea" stopOpacity="0.28" />
            <Stop offset="1" stopColor="#9333ea" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient
            id={`cyan-${uid}`}
            cx="0%"
            cy="100%"
            rx="60%"
            ry="80%"
          >
            <Stop offset="0" stopColor="#22d3ee" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#22d3ee" stopOpacity="0" />
          </RadialGradient>
          <Pattern
            id={`dots-${uid}`}
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
          fill={`url(#band-${uid})`}
          clipPath={`url(#clip-${uid})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#wash-${uid})`}
          clipPath={`url(#clip-${uid})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#violet-${uid})`}
          clipPath={`url(#clip-${uid})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#cyan-${uid})`}
          clipPath={`url(#clip-${uid})`}
        />
        <Rect
          width={bandWidth}
          height={bandHeight}
          fill={`url(#dots-${uid})`}
          clipPath={`url(#clip-${uid})`}
        />
      </Svg>
      {showWatermark ? (
        <Image
          source={ALENIO_ICON}
          style={[styles.mark, { bottom: depth - 6 }]}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  mark: {
    position: "absolute",
    right: -6,
    width: 96,
    height: 96,
    opacity: 0.14,
    tintColor: "#FFFFFF",
  },
});
