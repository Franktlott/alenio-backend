import { Image, StyleSheet, View } from "react-native";

const heroArt = require("@/assets/stars-hero-mountain.png");

/** Mountain + flag art for the Stars progress hero card. */
export function StarsHeroArt() {
  return (
    <View style={styles.wrap} pointerEvents="none" accessibilityElementsHidden>
      <Image
        source={heroArt}
        style={styles.image}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: -28,
    bottom: -24,
    width: 248,
    height: 248,
  },
  image: {
    width: "100%",
    height: "100%",
  },
});
