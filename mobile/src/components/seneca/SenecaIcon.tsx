import { Image, type ImageStyle, type StyleProp } from "react-native";

const senecaIcon = require("@/assets/seneca-icon.png");

/** Native asset ratio (174×276). `size` is the rendered height in contain mode. */
const SENECA_LOGO_ASPECT = 174 / 276;

type Props = {
  size?: number;
  /** Fill a square (e.g. circular badge) by cropping the tall logo. */
  cover?: boolean;
  style?: StyleProp<ImageStyle>;
};

export function SenecaIcon({ size = 20, cover = false, style }: Props) {
  const dimensions = cover
    ? { width: size, height: size }
    : { width: Math.round(size * SENECA_LOGO_ASPECT), height: size };

  return (
    <Image
      source={senecaIcon}
      style={[dimensions, style]}
      resizeMode={cover ? "cover" : "contain"}
      accessibilityIgnoresInvertColors
    />
  );
}
