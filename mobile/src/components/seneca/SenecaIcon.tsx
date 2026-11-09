import { Image, type ImageStyle, type StyleProp } from "react-native";

/**
 * Enterprise Seneca mark is a square disc (1:1).
 * `size` is the rendered width and height.
 */
type Props = {
  size?: number;
  /** @deprecated Square mark — kept for call-site compatibility. */
  cover?: boolean;
  style?: StyleProp<ImageStyle>;
};

export function SenecaIcon({ size = 20, style }: Props) {
  return (
    <Image
      source={require("@/assets/seneca-button-icon.png")}
      style={[{ width: size, height: size, borderRadius: size / 2 }, style]}
      resizeMode="contain"
      accessibilityLabel="Seneca"
    />
  );
}
