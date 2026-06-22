import { Image, type ImageStyle, type StyleProp } from "react-native";

const senecaIcon = require("@/assets/seneca-icon.png");

/** Native asset ratio (174×276). `size` is the rendered height. */
const SENECA_LOGO_ASPECT = 174 / 276;

type Props = {
  size?: number;
  style?: StyleProp<ImageStyle>;
};

export function SenecaIcon({ size = 20, style }: Props) {
  const height = size;
  const width = Math.round(size * SENECA_LOGO_ASPECT);

  return (
    <Image
      source={senecaIcon}
      style={[{ width, height }, style]}
      resizeMode="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
