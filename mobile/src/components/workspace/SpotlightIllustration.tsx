import { Image } from "expo-image";
import { StyleSheet } from "react-native";
import type { SpotlightKind } from "@/lib/workspace-spotlight";

const ART: Record<SpotlightKind, number> = {
  teamwork: require("@/assets/spotlight-teamwork.jpg"),
  welcome: require("@/assets/spotlight-welcome.jpg"),
  milestone: require("@/assets/spotlight-milestone.jpg"),
  quiet: require("@/assets/spotlight-quiet.jpg"),
};

type Props = {
  kind: SpotlightKind;
  wide: boolean;
};

/** Full-width scene. The picture spans the card instead of sitting in a small square. */
export function SpotlightIllustration({ kind, wide }: Props) {
  return (
    <Image
      source={ART[kind]}
      style={wide ? styles.wide : styles.compact}
      contentFit="cover"
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

const styles = StyleSheet.create({
  wide: {
    width: "100%",
    aspectRatio: 4 / 3,
  },
  compact: {
    width: "100%",
    height: 108,
  },
});
