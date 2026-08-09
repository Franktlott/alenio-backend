import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircle2, Sparkles } from "lucide-react-native";
import { AppPageBackground } from "@/components/AppPageBackground";

export default function WorkspaceWelcomeScreen() {
  const { teamName } = useLocalSearchParams<{ teamName?: string }>();
  const name = typeof teamName === "string" && teamName.trim() ? teamName.trim() : "Your workspace";

  return (
    <SafeAreaView style={styles.screen} testID="workspace-welcome-screen">
      <AppPageBackground />
      <View style={styles.content}>
        <Image source={require("@/assets/alenio-icon.png")} style={styles.logo} />
        <View style={styles.successIcon}>
          <Sparkles size={28} color="white" />
        </View>
        <Text style={styles.eyebrow}>WORKSPACE READY</Text>
        <Text style={styles.title}>{name} is ready to go</Text>
        <Text style={styles.body}>
          Your 14-day Alenio Operations trial is active. Explore every workspace tool with your team—no card required.
        </Text>

        <View style={styles.card}>
          {[
            "Full Operations access for 14 days",
            "Invite your team and start assigning work",
            "Your content remains available if the trial ends",
          ].map((item) => (
            <View key={item} style={styles.row}>
              <CheckCircle2 size={18} color="#16A34A" />
              <Text style={styles.rowText}>{item}</Text>
            </View>
          ))}
        </View>
        <View style={styles.ctaWrap}>
          <Pressable
            onPress={() => router.replace("/(app)/chat")}
            style={({ pressed }) => [styles.button, pressed ? styles.buttonPressed : null]}
            accessibilityRole="button"
            accessibilityLabel="Enter Alenio"
            testID="enter-workspace-button"
          >
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Enter Alenio</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>We’ll keep your remaining trial time visible in the app.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8FAFC" },
  content: { flex: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" },
  logo: { width: 42, height: 42, borderRadius: 10, position: "absolute", top: 14, right: 20 },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 21,
    backgroundColor: "#4361EE",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#4361EE",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  eyebrow: { marginTop: 20, color: "#4361EE", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 },
  title: { marginTop: 8, fontSize: 28, lineHeight: 34, fontWeight: "800", color: "#0F172A", textAlign: "center" },
  body: { marginTop: 12, maxWidth: 340, fontSize: 15, lineHeight: 22, color: "#64748B", textAlign: "center" },
  card: {
    width: "100%",
    marginTop: 28,
    padding: 17,
    borderRadius: 18,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 13,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowText: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: "600", color: "#334155" },
  ctaWrap: {
    width: "100%",
    height: 54,
    marginTop: 20,
    borderRadius: 15,
    overflow: "hidden",
    backgroundColor: "#4361EE",
    shadowColor: "#4361EE",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  button: { width: "100%", height: 54 },
  buttonContent: { width: "100%", height: 54, alignItems: "center", justifyContent: "center" },
  buttonPressed: { opacity: 0.86 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "800" },
  footer: { paddingHorizontal: 20, paddingBottom: 12 },
  footerNote: { fontSize: 11, color: "#94A3B8", textAlign: "center" },
});
