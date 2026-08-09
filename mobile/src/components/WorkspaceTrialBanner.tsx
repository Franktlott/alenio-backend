import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { AlertTriangle, Clock3, ChevronRight } from "lucide-react-native";
import { useWorkspaceAccess, trialBannerPresentation } from "@/lib/workspace-access";

export function WorkspaceTrialBanner() {
  const { teamId, access } = useWorkspaceAccess();
  const presentation = trialBannerPresentation(access);

  if (!teamId || !presentation.visible) return null;
  const critical = presentation.severity === "critical";
  const warning = presentation.severity === "warning";
  const Icon = critical || warning ? AlertTriangle : Clock3;

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/choose-plan", params: { teamId } })}
      style={[
        styles.banner,
        critical ? styles.critical : warning ? styles.warning : styles.info,
      ]}
      testID="workspace-trial-banner"
    >
      <Icon size={16} color={critical ? "#B91C1C" : warning ? "#B45309" : "#3730A3"} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.title, critical ? styles.criticalText : warning ? styles.warningText : styles.infoText]}>
          {presentation.title}
        </Text>
        {presentation.message ? <Text style={styles.message}>{presentation.message}</Text> : null}
      </View>
      <View style={styles.action}>
        <Text style={[styles.actionText, critical ? styles.criticalText : styles.infoText]}>Choose a Plan</Text>
        <ChevronRight size={14} color={critical ? "#B91C1C" : "#3730A3"} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
  },
  info: { backgroundColor: "#EEF2FF", borderBottomColor: "#C7D2FE" },
  warning: { backgroundColor: "#FFFBEB", borderBottomColor: "#FDE68A" },
  critical: { backgroundColor: "#FEF2F2", borderBottomColor: "#FECACA" },
  title: { fontSize: 11, fontWeight: "800" },
  message: { fontSize: 10, lineHeight: 14, color: "#64748B", marginTop: 1 },
  infoText: { color: "#3730A3" },
  warningText: { color: "#B45309" },
  criticalText: { color: "#B91C1C" },
  action: { flexDirection: "row", alignItems: "center", gap: 1 },
  actionText: { fontSize: 10, fontWeight: "800" },
});
