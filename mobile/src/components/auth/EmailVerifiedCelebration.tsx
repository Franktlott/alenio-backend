import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, LockKeyhole } from "lucide-react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

function PulseRing({ delay, size }: { delay: number; size: number }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1350, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, [delay, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 0.42 * (1 - progress.value),
    transform: [{ scale: 0.82 + progress.value * 0.46 }],
  }));

  return (
    <Animated.View
      style={[
        styles.pulseRing,
        { width: size, height: size, borderRadius: size / 2 },
        animatedStyle,
      ]}
    />
  );
}

export function EmailVerifiedCelebration({ email }: { email: string }) {
  return (
    <LinearGradient
      colors={["#1769F5", "#5137E8", "#7138EF"]}
      locations={[0, 0.55, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
      testID="email-verified-celebration"
    >
      <StatusBar style="light" />
      <View style={styles.glowTop} pointerEvents="none" />
      <View style={styles.glowBottom} pointerEvents="none" />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <Animated.View entering={FadeIn.duration(350)} style={styles.brand}>
          <Image
            source={require("@/assets/alenio-logo-white.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        <View style={styles.content}>
          <View style={styles.markStage}>
            <PulseRing delay={350} size={142} />
            <PulseRing delay={950} size={142} />
            <Animated.View
              entering={ZoomIn.springify().damping(13).stiffness(150)}
              style={styles.markHalo}
            >
              <LinearGradient
                colors={["#FFFFFF", "#F4F2FF"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.mark}
              >
                <Check size={48} color="#5137E8" strokeWidth={3.2} />
              </LinearGradient>
            </Animated.View>
          </View>

          <Animated.Text entering={FadeInDown.delay(260).duration(450)} style={styles.eyebrow}>
            IDENTITY CONFIRMED
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(360).duration(500)} style={styles.title}>
            Email verified
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(470).duration(500)} style={styles.subtitle}>
            Welcome to Alenio. Your workspace is being prepared.
          </Animated.Text>

          <Animated.View
            entering={FadeInDown.delay(620).duration(500)}
            style={styles.verificationCard}
          >
            <View style={styles.lockChip}>
              <LockKeyhole size={16} color="#5137E8" strokeWidth={2.4} />
            </View>
            <View style={styles.emailCopy}>
              <Text style={styles.emailLabel}>Verified account</Text>
              <Text style={styles.email} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <View style={styles.statusDot} />
          </Animated.View>
        </View>

        <Animated.View entering={FadeIn.delay(850).duration(500)} style={styles.footer}>
          <View style={styles.loadingTrack}>
            <Animated.View
              entering={FadeIn.delay(900)}
              style={styles.loadingFill}
            />
          </View>
          <Text style={styles.footerText}>Welcoming you in...</Text>
        </Animated.View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  safe: {
    flex: 1,
    paddingHorizontal: 24,
  },
  glowTop: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: 165,
    backgroundColor: "rgba(255,255,255,0.10)",
    top: -150,
    right: -110,
  },
  glowBottom: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(109,213,255,0.10)",
    bottom: -125,
    left: -120,
  },
  brand: {
    alignItems: "center",
    paddingTop: 18,
  },
  logo: {
    width: 126,
    height: 42,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 20,
  },
  markStage: {
    width: 160,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  pulseRing: {
    position: "absolute",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.72)",
  },
  markHalo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  mark: {
    flex: 1,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#20107A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 9,
  },
  eyebrow: {
    color: "rgba(255,255,255,0.74)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    marginBottom: 10,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 34,
    lineHeight: 41,
    fontWeight: "800",
    letterSpacing: -0.9,
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 310,
    marginTop: 9,
  },
  verificationCard: {
    width: "100%",
    maxWidth: 340,
    minHeight: 70,
    borderRadius: 18,
    marginTop: 30,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
  },
  lockChip: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  emailCopy: {
    flex: 1,
    marginLeft: 12,
    minWidth: 0,
  },
  emailLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 11,
    fontWeight: "600",
    marginBottom: 3,
  },
  email: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  statusDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#6EE7B7",
    marginLeft: 10,
    shadowColor: "#6EE7B7",
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  footer: {
    alignItems: "center",
    paddingBottom: 19,
  },
  loadingTrack: {
    width: 112,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  loadingFill: {
    width: "72%",
    height: "100%",
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  footerText: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 10,
  },
});
