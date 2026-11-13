import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { Check, Sparkles } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useTeamStore } from "@/lib/state/team-store";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";

type Highlight = { title: string; detail: string };

const TRIAL_HIGHLIGHTS: Highlight[] = [
  {
    title: "Full Operations access",
    detail: "Every workspace tool, for 14 days",
  },
  { title: "Invite your team", detail: "Start assigning work right away" },
  { title: "Nothing disappears", detail: "Your content stays if the trial ends" },
];

const PAID_HIGHLIGHTS: Highlight[] = [
  { title: "Paid access is active", detail: "Every workspace tool, no limits" },
  { title: "Invite your team", detail: "Start assigning work right away" },
  { title: "Billing when you need it", detail: "Manage it in Workspace Settings" },
];

export default function WorkspaceWelcomeScreen() {
  const { teamId, teamName, access } = useLocalSearchParams<{
    teamId?: string;
    teamName?: string;
    access?: string;
  }>();
  const queryClient = useQueryClient();
  const setActiveTeamId = useTeamStore((state) => state.setActiveTeamId);
  const name =
    typeof teamName === "string" && teamName.trim()
      ? teamName.trim()
      : "Your workspace";
  const isPaid = access === "paid";
  const enterAlenio = async () => {
    const resolvedTeamId =
      typeof teamId === "string" && teamId.trim() ? teamId.trim() : null;
    if (resolvedTeamId) setActiveTeamId(resolvedTeamId);
    try {
      await queryClient.fetchQuery({
        queryKey: ["teams"],
        queryFn: () => api.get<Team[]>("/api/teams"),
        staleTime: 0,
      });
    } finally {
      router.replace("/(app)/home");
    }
  };

  return (
    <SafeAreaView style={styles.screen} testID="workspace-welcome-screen">
      <View style={styles.content}>
        <LinearGradient
          colors={["#FFFFFF", "#F8F5FF", "#F3EEFF"]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
          testID="workspace-welcome-hero"
        >
          {/* The mark bleeds off the right edge, behind the copy. */}
          <Image
            source={require("@/assets/alenio-icon.png")}
            style={styles.heroMark}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.heroCopy}>
            <View style={styles.badge}>
              <Sparkles size={12} color="#4361EE" strokeWidth={2.4} />
              <Text style={styles.badgeText}>
                {isPaid ? "PAID ACCESS" : "14-DAY TRIAL"}
              </Text>
            </View>
            <Text style={styles.eyebrow}>WORKSPACE READY</Text>
            <Text style={styles.title}>{name} is ready to go</Text>
            <Text style={styles.body}>
              {isPaid
                ? "Your paid workspace is active. Invite your team and start working together."
                : "Your Operations trial is active. Explore every tool with your team — no card required."}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          {(isPaid ? PAID_HIGHLIGHTS : TRIAL_HIGHLIGHTS).map(
            (highlight, index) => (
              <React.Fragment key={highlight.title}>
                {/* Inset so the rule starts under the copy, not the check. */}
                {index > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={styles.check}>
                    <Check size={15} color="#0F9D6E" strokeWidth={2.8} />
                  </View>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{highlight.title}</Text>
                    <Text style={styles.rowDetail}>{highlight.detail}</Text>
                  </View>
                </View>
              </React.Fragment>
            ),
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={enterAlenio}
          activeOpacity={0.86}
          style={styles.button}
          accessibilityRole="button"
          accessibilityLabel="Enter Alenio"
          testID="enter-workspace-button"
        >
          <Text style={styles.buttonText}>Enter Alenio</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          {isPaid
            ? "Billing details are in Workspace Settings → Plan & billing."
            : "We’ll keep your remaining trial time visible in the app."}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { flex: 1, paddingHorizontal: 18, paddingTop: 28 },
  hero: {
    padding: 18,
    borderRadius: 22,
    overflow: "hidden",
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  /**
   * The card is taller than the mark is wide, so `contain` sizes the art to
   * this width: it is exactly how far left the artwork reaches.
   */
  heroMark: {
    position: "absolute",
    right: -22,
    top: -16,
    bottom: -16,
    width: 132,
  },
  /** Clears the mark, which runs the full height of the card. */
  heroCopy: { paddingRight: 104 },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    height: 24,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E8F0FF",
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 1,
    color: "#4361EE",
  },
  eyebrow: {
    marginTop: 14,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 1.1,
    color: "#8A93A8",
  },
  title: {
    marginTop: 6,
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#111A2B",
  },
  body: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#7A8699",
  },
  card: {
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#24324A",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 11,
    elevation: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 62,
    backgroundColor: "#ECEFF5",
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  check: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4F6EE",
  },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
    color: "#253042",
  },
  rowDetail: {
    marginTop: 1,
    fontSize: 11.5,
    lineHeight: 15,
    color: "#909AAA",
  },
  footer: { paddingHorizontal: 18, paddingBottom: 14 },
  button: {
    height: 52,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4361EE",
    shadowColor: "#4361EE",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  buttonText: { fontSize: 15.5, fontWeight: "800", color: "#FFFFFF" },
  footerNote: {
    marginTop: 14,
    fontSize: 11,
    lineHeight: 15,
    color: "#A0A8B8",
    textAlign: "center",
  },
});
