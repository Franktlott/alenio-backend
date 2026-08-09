import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, Users } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { UserAvatar } from "@/components/UserAvatar";

export default function PublicWorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const { teamId, teamName } = useLocalSearchParams<{ teamId?: string; teamName?: string }>();
  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const name = team?.name ?? teamName ?? "Workspace";
  const members = team?.members ?? [];

  return (
    <View style={styles.screen} testID="public-workspace-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ArrowLeft size={20} color="#0F172A" />
        </Pressable>
        <Text style={styles.headerTitle}>Workspace</Text>
        <View style={styles.backButton} />
      </View>

      {isLoading ? (
        <View style={styles.centered}><ActivityIndicator color="#4361EE" /></View>
      ) : !team ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Workspace unavailable</Text>
          <Text style={styles.emptyBody}>Only shared workspace information is visible.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <WorkspaceTeamAvatar
              team={{ name, image: team.image }}
              size={82}
              radius={22}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              borderColor="#DDE4FF"
            />
            <Text style={styles.name}>{name}</Text>
            <View style={styles.memberCount}>
              <Users size={13} color="#64748B" />
              <Text style={styles.memberCountText}>
                {members.length} member{members.length === 1 ? "" : "s"}
              </Text>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeading}>
              <View style={styles.iconCircle}>
                <Building2 size={17} color="#4361EE" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Workspace information</Text>
                <Text style={styles.cardSubtitle}>A workspace you both belong to</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Members</Text>
            <View style={styles.card}>
              <View style={styles.avatarRow}>
                {members.slice(0, 8).map((member) => (
                  <UserAvatar
                    key={member.userId}
                    user={member.user}
                    size={38}
                    radius={19}
                    backgroundColor="#EEF2FF"
                    textColor="#4361EE"
                    fontSize={14}
                    style={styles.memberAvatar}
                  />
                ))}
                {members.length > 8 ? (
                  <View style={styles.overflowAvatar}>
                    <Text style={styles.overflowText}>+{members.length - 8}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F6F7FB" },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#0F172A" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#334155" },
  emptyBody: { marginTop: 5, fontSize: 12, color: "#94A3B8", textAlign: "center" },
  content: { paddingHorizontal: 16, paddingTop: 28 },
  identity: { alignItems: "center" },
  name: { marginTop: 12, fontSize: 22, lineHeight: 27, fontWeight: "800", color: "#172033", textAlign: "center" },
  memberCount: { marginTop: 6, flexDirection: "row", alignItems: "center", gap: 5 },
  memberCountText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  card: {
    marginTop: 24,
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  cardHeading: { flexDirection: "row", alignItems: "center", gap: 11 },
  iconCircle: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#172033" },
  cardSubtitle: { marginTop: 2, fontSize: 11, color: "#7A869A" },
  section: { marginTop: 24 },
  sectionTitle: { paddingHorizontal: 3, fontSize: 11, fontWeight: "800", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.55 },
  avatarRow: { flexDirection: "row", alignItems: "center", paddingLeft: 8 },
  memberAvatar: { marginLeft: -8, borderWidth: 2, borderColor: "#FFFFFF" },
  overflowAvatar: { width: 38, height: 38, borderRadius: 19, marginLeft: -8, backgroundColor: "#F1F5F9", borderWidth: 2, borderColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  overflowText: { fontSize: 11, fontWeight: "700", color: "#64748B" },
});
