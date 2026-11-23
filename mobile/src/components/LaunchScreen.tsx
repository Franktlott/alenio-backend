import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { setStatusBarStyle } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  LAUNCH_PHASE_LINES,
  launchStatusLine,
  type LaunchPhase,
} from "@/lib/launch-status";
import { palette } from "@/theme";

type Props = {
  /** True once session + Home’s first paint data are ready to reveal. */
  isReady: boolean;
  /** What the cold start is waiting on right now. */
  phase: LaunchPhase;
  onDone: () => void;
};

const LINE_ROTATE_MS = 2200;

/**
 * Step 2 in cold start: Splash → Launch → Landing/Home.
 * Sits over the navigator while auth and Home settle; status copy tracks work.
 */
export function LaunchScreen({ isReady, phase, onDone }: Props) {
  const insets = useSafeAreaInsets();
  const contentOpacity = useSharedValue(0);
  const contentScale = useSharedValue(0.96);
  const containerOpacity = useSharedValue(1);
  const hasStartedFadeOut = useRef(false);
  const [tick, setTick] = useState(0);
  const displayPhase: LaunchPhase = isReady ? "finish" : phase;
  const status = launchStatusLine(displayPhase, tick);

  useEffect(() => {
    setStatusBarStyle("light");
    contentOpacity.value = withTiming(1, { duration: 520 });
    contentScale.value = withTiming(1, { duration: 520 });
  }, [contentOpacity, contentScale]);

  useEffect(() => {
    setTick(0);
  }, [displayPhase]);

  useEffect(() => {
    if (displayPhase === "finish") return;
    if (LAUNCH_PHASE_LINES[displayPhase].length < 2) return;
    const timer = setInterval(() => {
      setTick((current) => current + 1);
    }, LINE_ROTATE_MS);
    return () => clearInterval(timer);
  }, [displayPhase]);

  useEffect(() => {
    if (!isReady || hasStartedFadeOut.current) return;
    hasStartedFadeOut.current = true;
    containerOpacity.value = withDelay(
      380,
      withTiming(0, { duration: 420 }, () => {
        runOnJS(onDone)();
      }),
    );
  }, [containerOpacity, isReady, onDone]);

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ scale: contentScale.value }],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  return (
    <Animated.View
      style={[styles.root, containerStyle]}
      pointerEvents="auto"
      testID="launch-screen"
    >
      <ImageBackground
        source={require("@/assets/alenio-launch-mountain.jpg")}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      >
        <LinearGradient
          colors={[
            "rgba(13,7,38,0.08)",
            "rgba(13,7,38,0.18)",
            "rgba(13,7,38,0.78)",
          ]}
          locations={[0, 0.42, 1]}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <Animated.View
        style={[
          styles.content,
          contentStyle,
          {
            paddingTop: insets.top + 56,
            paddingBottom: Math.max(insets.bottom, 28) + 28,
          },
        ]}
      >
        <Image
          source={require("@/assets/alenio-logo-white.png")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Alenio"
        />

        <View style={styles.footer}>
          <ActivityIndicator size="large" color={palette.violetBright} />
          <Text style={styles.status} testID="launch-status">
            {status}
          </Text>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: palette.night,
    zIndex: 100,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  logo: {
    width: 210,
    height: 73,
  },
  footer: {
    alignItems: "center",
    gap: 16,
    paddingBottom: 8,
  },
  status: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    letterSpacing: -0.1,
    textAlign: "center",
  },
});
