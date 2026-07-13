import React, { useEffect } from "react";
import { Image, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import {
  BarChart3,
  Calendar,
  Check,
  MessageCircle,
  Megaphone,
  ShieldCheck,
} from "lucide-react-native";
import { AUTH_LOADING_COLORS } from "./types";

function FloatCard({
  children,
  style,
  delayMs = 0,
  amplitude = 4,
}: {
  children: React.ReactNode;
  style?: object;
  delayMs?: number;
  amplitude?: number;
}) {
  const y = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    y.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(-amplitude, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
          withTiming(amplitude, { duration: 2200, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
    pulse.value = withDelay(
      delayMs + 200,
      withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [amplitude, delayMs, pulse, y]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: pulse.value }],
  }));

  return <Animated.View style={[style, animStyle]}>{children}</Animated.View>;
}

function PulseIcon({
  children,
  style,
  delayMs = 0,
}: {
  children: React.ReactNode;
  style?: object;
  delayMs?: number;
}) {
  const scale = useSharedValue(1);
  useEffect(() => {
    scale.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [delayMs, scale]);
  const styleAnim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Animated.View style={[style, styleAnim]}>{children}</Animated.View>;
}

function ProgressBarFill() {
  const width = useSharedValue(0.35);
  useEffect(() => {
    width.value = withRepeat(
      withSequence(
        withTiming(0.72, { duration: 2400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 1800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
  }, [width]);
  const style = useAnimatedStyle(() => ({
    width: `${Math.round(width.value * 100)}%`,
  }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

export function LoadingIllustration() {
  const { width } = useWindowDimensions();
  const heroWidth = Math.min(width - 32, 360);
  const heroHeight = heroWidth * 0.62;

  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(
      withSequence(
        withTiming(-2, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        withTiming(2, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );
  }, [bob]);
  const heroBob = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  return (
    <View style={[styles.wrap, { width: heroWidth, height: heroHeight + 36 }]} testID="auth-loading-illustration">
      <View style={[styles.glow, { width: heroWidth * 0.9, height: heroHeight * 0.9 }]} />

      {/* Soft dashed connectors (static paths via borders — calm, not aggressive) */}
      <View style={[styles.dash, styles.dashLeft]} />
      <View style={[styles.dash, styles.dashRight]} />
      <View style={[styles.dash, styles.dashTopRight]} />

      <FloatCard style={[styles.card, styles.tasksCard]} delayMs={0} amplitude={3.5}>
        <View style={styles.cardHeader}>
          <View style={styles.iconChip}>
            <Check size={12} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={3} />
          </View>
          <Text style={styles.cardTitle}>Tasks</Text>
        </View>
        <Text style={styles.cardSub}>Opening checklist</Text>
        <ProgressBarFill />
        <Text style={styles.cardMeta}>3 of 5 completed</Text>
      </FloatCard>

      <FloatCard style={[styles.card, styles.teamCard]} delayMs={350} amplitude={4}>
        <View style={styles.cardHeader}>
          <View style={styles.iconChip}>
            <Megaphone size={12} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={2.5} />
          </View>
          <Text style={styles.cardTitle}>Team Update</Text>
        </View>
        <Text style={styles.cardBody} numberOfLines={2}>
          Great job team! Sales goal achieved today!
        </Text>
        <Text style={styles.cardMeta}>9:41 AM</Text>
      </FloatCard>

      <FloatCard style={[styles.card, styles.calendarCard]} delayMs={700} amplitude={3}>
        <View style={styles.cardHeader}>
          <View style={styles.iconChip}>
            <Calendar size={12} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={2.5} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>1:1 with Taylor</Text>
            <Text style={styles.cardMeta}>Today at 2:00 PM</Text>
          </View>
        </View>
      </FloatCard>

      <PulseIcon style={[styles.miniIcon, styles.chatIcon]} delayMs={200}>
        <MessageCircle size={14} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={2.4} />
      </PulseIcon>
      <PulseIcon style={[styles.miniIcon, styles.chartIcon]} delayMs={500}>
        <BarChart3 size={14} color={AUTH_LOADING_COLORS.brandPurple} strokeWidth={2.4} />
      </PulseIcon>
      <PulseIcon style={[styles.miniIcon, styles.shieldIcon]} delayMs={100}>
        <ShieldCheck size={14} color="#16A34A" strokeWidth={2.4} />
      </PulseIcon>

      <Animated.View style={[{ width: heroWidth, height: heroHeight }, heroBob]}>
        <Image
          source={require("@/assets/auth-loading-hero.png")}
          style={{ width: heroWidth, height: heroHeight, borderRadius: 20 }}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  glow: {
    position: "absolute",
    borderRadius: 999,
    backgroundColor: AUTH_LOADING_COLORS.glow,
  },
  dash: {
    position: "absolute",
    borderStyle: "dashed",
    borderColor: "rgba(148, 163, 184, 0.55)",
    borderWidth: 1,
    zIndex: 1,
  },
  dashLeft: {
    width: 48,
    height: 48,
    borderRadius: 24,
    top: "28%",
    left: "8%",
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  dashRight: {
    width: 40,
    height: 40,
    borderRadius: 20,
    top: "42%",
    right: "6%",
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  dashTopRight: {
    width: 56,
    height: 36,
    borderRadius: 18,
    top: "12%",
    right: "18%",
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  card: {
    position: "absolute",
    zIndex: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    maxWidth: 148,
  },
  tasksCard: {
    top: 4,
    left: 0,
  },
  teamCard: {
    top: 0,
    right: 0,
    maxWidth: 156,
  },
  calendarCard: {
    right: 4,
    bottom: 28,
    maxWidth: 150,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  iconChip: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: AUTH_LOADING_COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: AUTH_LOADING_COLORS.title,
  },
  cardSub: {
    marginTop: 4,
    fontSize: 11,
    color: AUTH_LOADING_COLORS.subtitle,
  },
  cardBody: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    color: AUTH_LOADING_COLORS.subtitle,
  },
  cardMeta: {
    marginTop: 4,
    fontSize: 10,
    color: AUTH_LOADING_COLORS.footer,
    fontWeight: "500",
  },
  progressTrack: {
    marginTop: 6,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 3,
    backgroundColor: AUTH_LOADING_COLORS.brandPurple,
  },
  miniIcon: {
    position: "absolute",
    zIndex: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chatIcon: {
    left: 10,
    bottom: 48,
  },
  chartIcon: {
    right: 18,
    top: "38%",
  },
  shieldIcon: {
    top: 8,
    left: "50%",
    marginLeft: -14,
  },
});
