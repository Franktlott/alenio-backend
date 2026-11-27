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
 * Overview hero — photo fills a short banner; Workspace mark + copy stacked.
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
    <View style={styles.shadow} testID="workspace-overview-card">
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
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: palette.title }]}
            numberOfLines={2}
          >
            {name}
          </Text>
          <Text
            style={[styles.subtitle, { color: palette.subtitle }]}
            numberOfLines={2}
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
    width: "100%",
    borderRadius: 14,
    backgroundColor: "transparent",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  card: {
    width: "100%",
    aspectRatio: WORKSPACE_COVER_ASPECT,
    minHeight: 88,
    borderRadius: 14,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    justifyContent: "center",
    gap: 6,
  },
  photo: {
    borderRadius: 14,
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 5,
    zIndex: 2,
  },
  copy: {
    maxWidth: "90%",
    zIndex: 2,
    gap: 2,
  },
  brandIcon: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  brandLabel: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "700",
    letterSpacing: 0.12,
  },
  title: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
    letterSpacing: -0.35,
  },
  subtitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
  },
});
