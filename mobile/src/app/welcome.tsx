import React from "react";
import { View, Text, Pressable, Image, StyleSheet, useWindowDimensions } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import {
  ArrowRight,
  BarChart3,
  CheckSquare,
  Lock,
  MessageCircle,
  Users,
} from "lucide-react-native";
import { LandingHeroSection } from "@/components/landing/LandingHeroSection";

const GRADIENT = ["#4361EE", "#7C3AED"] as const;

const FEATURES = [
  {
    Icon: MessageCircle,
    title: "Communicate",
    description: "Message your team in real time.",
    iconBg: "#EFF6FF",
    iconColor: "#4361EE",
  },
  {
    Icon: CheckSquare,
    title: "Execute",
    description: "Assign tasks and track progress.",
    iconBg: "#ECFDF5",
    iconColor: "#10B981",
  },
  {
    Icon: Users,
    title: "Develop",
    description: "Set goals and grow together.",
    iconBg: "#F5F3FF",
    iconColor: "#7C3AED",
  },
  {
    Icon: BarChart3,
    title: "See Impact",
    description: "Measure what matters.",
    iconBg: "#FFF7ED",
    iconColor: "#EA580C",
  },
] as const;

function GradientText({
  children,
  style,
}: {
  children: string;
  style?: object | object[];
}) {
  return (
    <MaskedView
      style={{ flexShrink: 0 }}
      maskElement={<Text style={[style, { backgroundColor: "transparent" }]}>{children}</Text>}
    >
      <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

function WelcomeBackground() {
  return (
    <View style={styles.bg} pointerEvents="none">
      <View style={styles.blobTopRight} />
      <View style={styles.blobTopRightSoft} />
      <View style={styles.blobMidRight} />
      <View style={styles.blobLower} />
    </View>
  );
}

export default function WelcomeScreen() {
  const { height, width } = useWindowDimensions();
  const isShort = height < 780;
  // Keep second line from overflowing on narrower phones (SF vs Roboto width differs).
  const isNarrow = !isShort && width < 390;
  const headlineStyle = [styles.headline, isShort && styles.headlineShort, isNarrow && styles.headlineNarrow];
  const headlineGradientStyle = [
    styles.headlineGradient,
    isShort && styles.headlineShort,
    isNarrow && styles.headlineNarrow,
  ];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <WelcomeBackground />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.page}>
          <View style={styles.top}>
            <Image source={require("@/assets/alenio-logo.png")} style={styles.logo} resizeMode="contain" />

            {/* Explicit lines so iOS MaskedView cannot force uneven wraps. */}
            <View style={styles.headlineWrap} testID="welcome-headline">
              <View style={styles.headlineLine}>
                <Text style={headlineStyle}>Built for the </Text>
                <GradientText style={headlineGradientStyle}>frontline.</GradientText>
              </View>
              <View style={styles.headlineLine}>
                <Text style={headlineStyle}>Designed for </Text>
                <GradientText style={headlineGradientStyle}>execution.</GradientText>
              </View>
            </View>

            <Text style={[styles.subheadline, isShort && styles.subheadlineShort]} numberOfLines={2}>
              Connect your people, simplify work, and keep every shift aligned.
            </Text>

            <View style={[styles.featureRow, isShort && styles.featureRowShort]}>
              {FEATURES.map(({ Icon, title, description, iconBg, iconColor }) => (
                <View key={title} style={styles.featureItem}>
                  <View style={[styles.featureIcon, { backgroundColor: iconBg }]}>
                    <Icon size={isShort ? 14 : 15} color={iconColor} strokeWidth={2.3} />
                  </View>
                  <Text style={[styles.featureTitle, isShort && styles.featureTitleShort]} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={[styles.featureDesc, isShort && styles.featureDescShort]} numberOfLines={2}>
                    {description}
                  </Text>
                </View>
              ))}
            </View>

            <LandingHeroSection fill compact={isShort} />
          </View>

          <View style={styles.bottom}>
            <Pressable onPress={() => router.push("/sign-up")} testID="welcome-get-started">
              <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                <Text style={styles.ctaText}>Get Started</Text>
                <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
            </Pressable>

            <Pressable
              onPress={() => router.push("/sign-in")}
              style={styles.signInRow}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
              testID="welcome-sign-in"
            >
              <Text style={styles.signInMuted}>Already have an account? </Text>
              <Text style={styles.signInLink}>Sign in</Text>
            </Pressable>

            <View style={styles.footerRow}>
              <View style={styles.secureRow}>
                <Lock size={11} color="#94A3B8" strokeWidth={2.2} />
                <Text style={styles.secureText}>Your data is secure</Text>
              </View>
              <View style={styles.legalRow}>
                <Pressable onPress={() => router.push("/terms-of-service")} hitSlop={8}>
                  <Text style={styles.legalLink}>Terms of Service</Text>
                </Pressable>
                <Text style={styles.legalDot}> · </Text>
                <Pressable onPress={() => router.push("/privacy-policy")} hitSlop={8}>
                  <Text style={styles.legalLink}>Privacy Policy</Text>
                </Pressable>
              </View>
            </View>
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
  bg: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  blobTopRight: {
    position: "absolute",
    top: -80,
    right: -90,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(124, 58, 237, 0.11)",
  },
  blobTopRightSoft: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 200,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(67, 97, 238, 0.08)",
  },
  blobMidRight: {
    position: "absolute",
    top: 120,
    right: -70,
    width: 180,
    height: 220,
    borderRadius: 100,
    backgroundColor: "rgba(124, 58, 237, 0.07)",
    transform: [{ rotate: "18deg" }],
  },
  blobLower: {
    position: "absolute",
    top: 260,
    right: 40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(167, 139, 250, 0.08)",
  },
  safe: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 8,
    justifyContent: "space-between",
  },
  top: {
    flex: 1,
    minHeight: 0,
  },
  logo: {
    width: 108,
    height: 32,
    marginBottom: 14,
  },
  headlineWrap: {
    marginBottom: 8,
  },
  headlineLine: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "flex-end",
    flexShrink: 1,
  },
  headline: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 34,
    letterSpacing: -0.6,
    includeFontPadding: false,
  },
  headlineShort: {
    fontSize: 24,
    lineHeight: 30,
  },
  headlineNarrow: {
    fontSize: 26,
    lineHeight: 32,
  },
  headlineGradient: {
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
    letterSpacing: -0.6,
    includeFontPadding: false,
  },
  subheadline: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 16,
    maxWidth: 340,
  },
  subheadlineShort: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  featureRowShort: {
    gap: 6,
  },
  featureItem: {
    flex: 1,
    minWidth: 0,
    alignItems: "flex-start",
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  featureTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
    letterSpacing: -0.2,
  },
  featureTitleShort: {
    fontSize: 10,
  },
  featureDesc: {
    fontSize: 10,
    color: "#64748B",
    lineHeight: 13,
  },
  featureDescShort: {
    fontSize: 9,
    lineHeight: 12,
  },
  bottom: {
    flexShrink: 0,
    paddingTop: 10,
  },
  cta: {
    borderRadius: 999,
    paddingVertical: 17,
    paddingHorizontal: 24,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
    paddingVertical: 14,
    minHeight: 48,
  },
  signInMuted: {
    fontSize: 15,
    color: "#64748B",
  },
  signInLink: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4361EE",
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
    gap: 8,
  },
  secureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexShrink: 1,
  },
  secureText: {
    fontSize: 11,
    color: "#94A3B8",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
  },
  legalLink: {
    fontSize: 11,
    color: "#94A3B8",
  },
  legalDot: {
    fontSize: 11,
    color: "#CBD5E1",
  },
});
