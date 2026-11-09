import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";

type Props = {
  meetingTitle: string;
  live?: boolean;
  onPress: () => void;
  testID?: string;
};

export function AgendaRowJoinPill({
  meetingTitle,
  live = false,
  onPress,
  testID,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [live, pulse]);

  const opacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.45],
  });

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        live ? `Join active meeting ${meetingTitle}` : `Join ${meetingTitle}`
      }
      style={({ pressed }) => [styles.wrap, pressed ? styles.pressed : null]}
      testID={testID}
    >
      <Animated.Text style={[styles.label, live ? { opacity } : null]}>
        Join
      </Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexShrink: 0,
    marginRight: 6,
    paddingHorizontal: 2,
    minHeight: 32,
    justifyContent: "center",
  },
  label: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "700",
    color: "#16A34A",
    letterSpacing: 0.15,
  },
  pressed: {
    opacity: 0.7,
  },
});
