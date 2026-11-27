import { StyleSheet } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Default scoop on phones — shallow so it doesn’t read as a clipped circle. */
export const PROFILE_HEADER_CURVE_DEPTH = 30;

/**
 * Width-aware scoop depth. Wide / Duo layouts stay flatter so purple isn’t
 * eaten into thin corner wedges.
 */
export function profileHeaderCurveDepth(width: number): number {
  if (width >= 900) return 22;
  if (width >= 700) return 24;
  if (width >= 500) return 28;
  return PROFILE_HEADER_CURVE_DEPTH;
}

/**
 * Purple banner silhouette: flat sides, soft scoop only under the avatar.
 * `height` is the full cover height; the bottom edge rises by `depth` at center.
 */
export function profileBannerPath(
  width: number,
  height: number,
  depth: number,
): string {
  const yFlat = height;
  const yDip = Math.max(0, height - depth);
  const left = width * 0.3;
  const right = width * 0.7;
  const mid = width * 0.5;
  return [
    `M0 0`,
    `L ${width} 0`,
    `L ${width} ${yFlat}`,
    `L ${right} ${yFlat}`,
    `C ${width * 0.62} ${yFlat} ${width * 0.58} ${yDip} ${mid} ${yDip}`,
    `C ${width * 0.42} ${yDip} ${width * 0.38} ${yFlat} ${left} ${yFlat}`,
    `L 0 ${yFlat}`,
    `Z`,
  ].join(" ");
}

/** White fill under the banner edge — used on custom photo headers. */
export function profileHeaderScoopPath(width: number, depth: number): string {
  const left = width * 0.3;
  const right = width * 0.7;
  const mid = width * 0.5;
  return [
    `M0 ${depth}`,
    `L ${left} ${depth}`,
    `C ${width * 0.38} ${depth} ${width * 0.42} 0 ${mid} 0`,
    `C ${width * 0.58} 0 ${width * 0.62} ${depth} ${right} ${depth}`,
    `L ${width} ${depth}`,
    `L ${width} ${depth + 2}`,
    `L 0 ${depth + 2}`,
    `Z`,
  ].join(" ");
}

/**
 * White scoop for custom photo headers — same soft wave as the branded default.
 */
export function ProfileHeaderCurve({
  width,
  fill = "#FFFFFF",
  depth,
}: {
  width: number;
  fill?: string;
  depth?: number;
}) {
  const scoop = depth ?? profileHeaderCurveDepth(width);
  if (width <= 0 || scoop <= 0) return null;
  const d = profileHeaderScoopPath(width, scoop);

  return (
    <Svg
      width={width}
      height={scoop + 2}
      viewBox={`0 0 ${width} ${scoop + 2}`}
      preserveAspectRatio="none"
      style={styles.curve}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Path d={d} fill={fill} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  curve: {
    position: "absolute",
    left: 0,
    bottom: 0,
  },
});
