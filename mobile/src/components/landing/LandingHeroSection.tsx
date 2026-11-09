import { useState } from "react";
import { Image, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

const HERO_IMAGE = require("@/assets/alenio-welcome-team-hero-mobile.jpg");
const HERO_PLACEHOLDER = require("@/assets/alenio-welcome-team-hero.png");

type Props = {
  fill?: boolean;
  compact?: boolean;
  /**
   * Wide screens host the hero as a tall rounded panel beside the pitch rather
   * than a full-bleed band above it, so the photo keeps its faces in frame and
   * needs no crop to bleed past the screen edges.
   */
  panel?: boolean;
};

export function LandingHeroSection({ fill, compact, panel }: Props) {
  const [heroSource, setHeroSource] = useState(HERO_IMAGE);

  return (
    <View
      style={[
        styles.wrap,
        fill ? styles.wrapFill : null,
        compact ? styles.wrapCompact : null,
        panel ? styles.wrapPanel : null,
      ]}
      accessibilityRole="image"
      accessibilityLabel="Frontline team members using Alenio"
      testID="welcome-trust-card"
    >
      <Image
        source={heroSource}
        defaultSource={HERO_PLACEHOLDER}
        style={[styles.heroImage, panel ? styles.heroImagePanel : null]}
        resizeMode="cover"
        fadeDuration={0}
        onError={() => {
          if (heroSource !== HERO_PLACEHOLDER) {
            setHeroSource(HERO_PLACEHOLDER);
          }
        }}
      />
      {!panel ? (
        <>
          <LinearGradient
            colors={["#FFFFFF", "rgba(255,255,255,0.78)", "rgba(255,255,255,0)"]}
            locations={[0, 0.48, 1]}
            style={styles.heroTopFade}
            pointerEvents="none"
          />
          <LinearGradient
            colors={[
              "rgba(255,255,255,0)",
              "rgba(255,255,255,0.3)",
              "rgba(255,255,255,0.78)",
              "#FFFFFF",
            ]}
            locations={[0, 0.38, 0.76, 1]}
            style={styles.heroFade}
            pointerEvents="none"
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "relative",
    width: "100%",
    height: 340,
    overflow: "hidden",
    backgroundColor: "#EEF2F7",
  },
  wrapFill: {
    flex: 1,
    minHeight: 260,
  },
  wrapCompact: {
    height: 270,
    minHeight: 230,
  },
  wrapPanel: {
    flex: 1,
    height: "100%",
    minHeight: 0,
  },
  heroImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "100%",
    transform: [{ scale: 1.24 }],
  },
  /** A tall frame already fills with the photo, so it needs no crop to bleed. */
  heroImagePanel: {
    transform: [{ scale: 1 }],
  },
  heroFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
  },
  heroTopFade: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 72,
  },
});
