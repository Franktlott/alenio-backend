import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

/**
 * Decorative summit-and-flag motif for development surfaces: layered ranges,
 * a snow cap, and a flag planted on the peak. Drawn rather than iconified so it
 * reads as artwork behind the copy instead of a stray outline glyph.
 */
export function DevelopmentPeakArt({
  width = 120,
  height = 56,
  opacity = 1,
}: {
  width?: number;
  height?: number;
  opacity?: number;
}) {
  return (
    <Svg
      width={width}
      height={height}
      viewBox="0 0 120 56"
      opacity={opacity}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="peakFace" x1="0" y1="0" x2="0.35" y2="1">
          <Stop offset="0" stopColor="#C9BEFB" />
          <Stop offset="1" stopColor="#EAE5FE" />
        </LinearGradient>
        <LinearGradient id="peakShade" x1="0" y1="0" x2="1" y2="0.6">
          <Stop offset="0" stopColor="#B4A6F7" />
          <Stop offset="1" stopColor="#D6CEFC" />
        </LinearGradient>
      </Defs>

      {/* Back ranges, flatter and paler so they sit behind the hero peak. */}
      <Path d="M0 56 L24 27 L41 44 L55 33 L74 56 Z" fill="#F1EEFE" />
      <Path d="M66 56 L90 29 L120 56 Z" fill="#EFEBFE" />

      {/* Hero peak: lit face plus a shaded right flank. */}
      <Path d="M16 56 L52 11 L74 39 L64 56 Z" fill="url(#peakFace)" />
      <Path d="M52 11 L88 56 L64 56 L74 39 Z" fill="url(#peakShade)" />

      {/* Snow cap. */}
      <Path
        d="M52 11 L63 25 L57.5 23.2 L52 26.5 L46.5 23.2 L41 25 Z"
        fill="#FFFFFF"
      />

      {/* Flag on the summit. */}
      <Path
        d="M52 11 L52 1.5"
        stroke="#7C5CFF"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Path d="M53 2 L62.5 4.9 L53 8.2 Z" fill="#6D4AFF" />
    </Svg>
  );
}
