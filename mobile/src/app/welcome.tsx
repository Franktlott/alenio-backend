import React from "react";
import { View, Text, Pressable, Image, StyleSheet, useWindowDimensions } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowRight, CheckSquare, MessageCircle, TrendingUp, Users } from "lucide-react-native";
import { LandingHeroSection } from "@/components/landing/LandingHeroSection";

const GRADIENT = ["#4361EE", "#7C3AED"] as const;

const FEATURES = [
  {
    Icon: MessageCircle,
    title: "Chat",
    description: "Message your team and stay in sync.",
    iconBg: "#EFF6FF",
    iconColor: "#4361EE",
  },
  {
    Icon: CheckSquare,
    title: "Tasks",
    description: "Assign, track, and get things done.",
    iconBg: "#ECFDF5",
    iconColor: "#10B981",
  },
  {
    Icon: Users,
    title: "Team",
    description: "See who's doing what, together.",
    iconBg: "#F5F3FF",
    iconColor: "#7C3AED",
  },
  {
    Icon: TrendingUp,
    title: "Development",
    description: "Set goals, track growth, and coach your team.",
    iconBg: "#FFF7ED",
    iconColor: "#EA580C",
  },
] as const;

function GradientText({ children, style }: { children: string; style?: object }) {
  return (
    <MaskedView maskElement={<Text style={[style, { backgroundColor: "transparent" }]}>{children}</Text>}>
      <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <Text style={[style, { opacity: 0 }]}>{children}</Text>
      </LinearGradient>
    </MaskedView>
  );
}

export default function WelcomeScreen() {
  const { height } = useWindowDimensions();
  const isShort = height < 780;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.page}>
          <View style={styles.top}>
            <Image source={require("@/assets/alenio-logo.png")} style={styles.logo} resizeMode="contain" />

            <Text style={[styles.headline, isShort && styles.headlineShort]}>The workspace built for</Text>
            <GradientText style={[styles.headlineGradient, isShort && styles.headlineShort]}>
              frontline teams.
            </GradientText>

            <Text style={[styles.subheadline, isShort && styles.subheadlineShort]} numberOfLines={2}>
              Connect your people, manage work, and stay aligned — all in one place.
            </Text>

            <LandingHeroSection fill />
          </View>

          <View style={styles.grid}>
            {FEATURES.map(({ Icon, title, description, iconBg, iconColor }) => (
              <View key={title} style={[styles.card, isShort && styles.cardShort]}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <Icon size={17} color={iconColor} strokeWidth={2.2} />
                </View>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {description}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.bottom}>
            <Pressable onPress={() => router.push("/sign-up")} testID="welcome-get-started">
              <LinearGradient colors={[...GRADIENT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                <Text style={styles.ctaText}>Get Started</Text>
                <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
            </Pressable>

            <Pressable onPress={() => router.push("/sign-in")} style={styles.signInRow} testID="welcome-sign-in">
              <Text style={styles.signInMuted}>Already have an account? </Text>
              <Text style={styles.signInLink}>Sign in</Text>
            </Pressable>

            <View style={styles.legalRow}>
              <Pressable onPress={() => router.push("/terms-of-service")}>
                <Text style={styles.legalLink}>Terms of Service</Text>
              </Pressable>
              <Text style={styles.legalDot}> · </Text>
              <Pressable onPress={() => router.push("/privacy-policy")}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Pressable>
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
    marginBottom: 10,
  },
  headline: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 30,
    letterSpacing: -0.5,
  },
  headlineShort: {
    fontSize: 24,
    lineHeight: 28,
  },
  headlineGradient: {
    fontSize: 26,
    fontWeight: "800",
    lineHeight: 30,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subheadline: {
    fontSize: 14,
    color: "#64748B",
    lineHeight: 19,
    marginBottom: 2,
    maxWidth: 320,
  },
  subheadlineShort: {
    fontSize: 13,
    lineHeight: 18,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  card: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    padding: 10,
    minHeight: 96,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardShort: {
    minHeight: 88,
    padding: 9,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 7,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 10,
    color: "#64748B",
    lineHeight: 13,
  },
  bottom: {
    flexShrink: 0,
  },
  cta: {
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  signInRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 10,
    marginBottom: 8,
  },
  signInMuted: {
    fontSize: 13,
    color: "#64748B",
  },
  signInLink: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4361EE",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
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
