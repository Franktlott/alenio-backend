import React from "react";
import { View, Text, Pressable, Image, ScrollView, StyleSheet } from "react-native";
import MaskedView from "@react-native-masked-view/masked-view";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { ArrowRight, Calendar, CheckSquare, MessageCircle, Users } from "lucide-react-native";

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
    Icon: Calendar,
    title: "Calendar",
    description: "View schedules and never miss a beat.",
    iconBg: "#EFF6FF",
    iconColor: "#3B82F6",
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
  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.logoRow}>
            <Image source={require("@/assets/alenio-logo.png")} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.headlineRow}>
            <Text style={styles.headline}>The workspace built for </Text>
            <GradientText style={styles.headlineGradient}>frontline teams.</GradientText>
          </View>

          <Text style={styles.subheadline}>
            Connect your people, manage work, and stay aligned — all in one place.
          </Text>

          <View style={styles.grid}>
            {FEATURES.map(({ Icon, title, description, iconBg, iconColor }) => (
              <View key={title} style={styles.card}>
                <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                  <Icon size={22} color={iconColor} strokeWidth={2.2} />
                </View>
                <Text style={styles.cardTitle}>{title}</Text>
                <Text style={styles.cardDesc}>{description}</Text>
              </View>
            ))}
          </View>

          <Pressable onPress={() => router.push("/sign-up")} testID="welcome-get-started">
            <LinearGradient
              colors={[...GRADIENT]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Get Started</Text>
              <ArrowRight size={20} color="#fff" strokeWidth={2.5} />
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
        </ScrollView>
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
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
  },
  logoRow: {
    marginBottom: 28,
  },
  logo: {
    width: 130,
    height: 40,
  },
  headlineRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    marginBottom: 12,
  },
  headline: {
    fontSize: 30,
    fontWeight: "800",
    color: "#0F172A",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  headlineGradient: {
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subheadline: {
    fontSize: 15,
    color: "#64748B",
    lineHeight: 22,
    marginBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  card: {
    width: "47.5%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  cta: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
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
    marginTop: 18,
    marginBottom: 20,
  },
  signInMuted: {
    fontSize: 14,
    color: "#64748B",
  },
  signInLink: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4361EE",
  },
  legalRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  legalLink: {
    fontSize: 12,
    color: "#94A3B8",
  },
  legalDot: {
    fontSize: 12,
    color: "#CBD5E1",
  },
});
