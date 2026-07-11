import { useState } from "react";
import { Image, LayoutChangeEvent, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { WELCOME_UI } from "./welcome-ui";

const PAGE_BG = WELCOME_UI.pageBg;
const FADE = 10;
const CORNER_RADIUS = 20;
const LANDING_ASPECT = 1536 / 1024;
const SIDE_INSET = 4;

type Props = {
  compact?: boolean;
};

export function WelcomeIllustration({ compact }: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width === area.width && height === area.height) return;
    setArea({ width, height });
  };

  let imageWidth = 0;
  let imageHeight = 0;
  if (area.width > 0 && area.height > 0) {
    imageWidth = Math.max(area.width - SIDE_INSET * 2, 0);
    imageHeight = imageWidth / LANDING_ASPECT;
    if (imageHeight > area.height) {
      imageHeight = area.height;
      imageWidth = imageHeight * LANDING_ASPECT;
    }
  }

  return (
    <View
      style={[styles.wrap, { marginTop: compact ? 10 : 14 }]}
      onLayout={onLayout}
      accessibilityRole="image"
      accessibilityLabel="Frontline team members using Alenio on tablet and mobile devices"
    >
      {imageWidth > 0 && imageHeight > 0 ? (
        <View
          style={[
            styles.frame,
            {
              width: imageWidth,
              height: imageHeight,
              borderRadius: CORNER_RADIUS,
            },
          ]}
        >
          <Image source={require("@/assets/landing1.png")} style={styles.image} resizeMode="cover" />

          <LinearGradient colors={[PAGE_BG, "rgba(248,250,252,0)"]} style={styles.fadeTop} pointerEvents="none" />
          <LinearGradient colors={["rgba(248,250,252,0)", PAGE_BG]} style={styles.fadeBottom} pointerEvents="none" />
          <LinearGradient
            colors={[PAGE_BG, "rgba(248,250,252,0)"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fadeLeft}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(248,250,252,0)", PAGE_BG]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.fadeRight}
            pointerEvents="none"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  frame: {
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  fadeTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: FADE,
  },
  fadeBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: FADE,
  },
  fadeLeft: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: FADE,
  },
  fadeRight: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    width: FADE,
  },
});
