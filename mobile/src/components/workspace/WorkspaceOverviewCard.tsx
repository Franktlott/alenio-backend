import { useEffect, useState } from "react";
import {
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { coverInkColors, type CoverInk } from "@/lib/cover-contrast";
import { detectCoverInk } from "@/lib/detect-cover-ink";
import { WORKSPACE_COVER_ASPECT } from "@/lib/workspace-cover";

const DEFAULT_COVER = require("../../assets/alenio-home-hero-mountain-half.jpg");
const ALENIO_ICON = require("../../assets/alenio-icon.png");

type Props = {
  workspaceName: string;
  /** Optional cover override. Defaults to the mountain hero. */
  coverSource?: ImageSourcePropType;
  /**
   * Force ink for previews. Leave unset to sample the cover automatically.
   */
  ink?: CoverInk;
};

/**
 * Overview hero — Alenio mark + Workspace label, name, and cover backdrop.
 * Text color follows cover brightness so photos stay readable.
 */
export function WorkspaceOverviewCard({
  workspaceName,
  coverSource = DEFAULT_COVER,
  ink: inkOverride,
}: Props) {
  const name = workspaceName.trim() || "Workspace";
  const [detectedInk, setDetectedInk] = useState<CoverInk>("light");
  const ink = inkOverride ?? detectedInk;
  const palette = coverInkColors(ink);

  useEffect(() => {
    if (inkOverride) return;
    let cancelled = false;
    void detectCoverInk(coverSource).then((next) => {
      if (!cancelled) setDetectedInk(next);
    });
    return () => {
      cancelled = true;
    };
  }, [coverSource, inkOverride]);

  return (
    <View
      style={[
        styles.shadow,
        { backgroundColor: ink === "dark" ? "#F8FAFC" : "#1A0B3A" },
      ]}
      testID="workspace-overview-card"
    >
      <ImageBackground
        source={coverSource}
        style={styles.card}
        imageStyle={styles.photo}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      >
        <LinearGradient
          colors={[...palette.wash]}
          locations={[0, 0.4, 0.72, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={styles.fade}
        />
        <View style={styles.copy}>
          <View style={styles.brandRow}>
            <Image
              source={ALENIO_ICON}
              style={styles.brandIcon}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <Text style={[styles.brandLabel, { color: palette.label }]}>
              Workspace
            </Text>
          </View>
          <Text style={[styles.title, { color: palette.title }]} numberOfLines={2}>
            {name}
          </Text>
          <Text
            style={[styles.subtitle, { color: palette.subtitle }]}
            numberOfLines={3}
          >
            Team operations, communication, and development in one place.
          </Text>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  shadow: {
    borderRadius: 16,
    shadowColor: "#1A0B3A",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  card: {
    width: "100%",
    aspectRatio: Math.max(WORKSPACE_COVER_ASPECT, 2.75),
    minHeight: 96,
    borderRadius: 16,
    overflow: "hidden",
    justifyContent: "center",
  },
  photo: {
    borderRadius: 16,
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
  },
  copy: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: "84%",
    zIndex: 1,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  brandIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
  },
  brandLabel: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
    letterSpacing: 0.15,
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "500",
  },
});
