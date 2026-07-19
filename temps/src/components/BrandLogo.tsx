import { Image, StyleSheet, type ImageStyle, type StyleProp, View, type ViewStyle } from "react-native";

/** Same asset as web `/AlenioTemp.png`. */
const LOGO = require("../../assets/alenio-temp.png");

type Props = {
  width?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

/** Alenio Temp logo — prefer at the top of branded screens. */
export function BrandLogo({ width = 220, height = 56, style, imageStyle }: Props) {
  return (
    <View
      style={[styles.wrap, { width, height }, style]}
      accessibilityRole="image"
      accessibilityLabel="Alenio Temp"
    >
      <Image source={LOGO} style={[styles.image, imageStyle]} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
