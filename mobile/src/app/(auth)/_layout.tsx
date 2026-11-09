import { StyleSheet, useWindowDimensions, View } from "react-native";
import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LandingHeroSection } from "@/components/landing/LandingHeroSection";
import { SPLIT_MIN_ASPECT, SPLIT_MIN_WIDTH } from "@/lib/adaptive-layout";
import { useScreenOrientation } from "@/lib/use-screen-orientation";

/**
 * The hero panel lives here rather than in each screen so it survives
 * navigation: welcome, sign-in and sign-up share this layout, so moving between
 * them swaps the column on the left and leaves the photo untouched. Rendering it
 * per screen meant the navigator tore the whole page down and slid a new one in,
 * panel included, which read as a jump.
 */
export default function AuthLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= SPLIT_MIN_WIDTH && width / height >= SPLIT_MIN_ASPECT;
  const screenOrientation = useScreenOrientation();
  /** Enough for the 460pt form column plus its gutters, and no wider. */
  const formSideWidth = Math.round(Math.min(560, Math.max(508, width * 0.48)));

  const pages = (
    <Stack
      screenOptions={{
        headerShown: false,
        /**
         * The panel outlives the transition, so the animation only ever moves
         * the column. A fade keeps the two halves from looking detached the way
         * a slide beside a stationary photo would.
         */
        animation: wide ? "fade" : "default",
        contentStyle: { backgroundColor: "#FFFFFF" },
        orientation: screenOrientation,
      }}
    />
  );

  if (!wide) return pages;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
        <View style={styles.row}>
          <View style={{ width: formSideWidth }}>{pages}</View>
          <View style={styles.heroPanel}>
            <LandingHeroSection panel />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  safe: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },
  heroPanel: {
    flex: 1,
    marginTop: 22,
    marginBottom: 22,
    marginRight: 22,
    borderRadius: 28,
    overflow: "hidden",
  },
});
