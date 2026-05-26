import { useEffect } from "react";
import { Image, Text, View, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

type Props = {
  label?: string;
};

export function AlenioWorkspaceLoading({ label = "Switching Workspace" }: Props) {
  const spin = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.linear }),
      -1,
    );
  }, [spin]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value * 360}deg` }],
  }));

  return (
    <View style={styles.root} accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.ringWrap}>
        <Animated.View style={[styles.ring, ringStyle]} />
        <Image
          source={require("@/assets/alenio-logo.png")}
          style={styles.mark}
          accessibilityLabel="Alenio"
        />
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    gap: 16,
  },
  ringWrap: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    position: "absolute",
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.22)",
    borderTopColor: "#a5b4fc",
  },
  mark: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(248,250,252,0.92)",
  },
});
