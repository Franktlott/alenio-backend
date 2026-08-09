import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronRight, Plus } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { colors } from "@/theme";

function workspaceMeta(team: Team) {
  const count = team._count?.members;
  if (count == null) return formatTeamRole(team.role);
  return `${formatTeamRole(team.role)}  ·  ${count} Member${count === 1 ? "" : "s"}`;
}

export default function ManageWorkspacesScreen() {
  const insets = useSafeAreaInsets();
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });

  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="manage-workspaces-screen">
      <View style={styles.topBar}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.topAction}
          accessibilityRole="button"
          accessibilityLabel="Back"
          testID="manage-workspaces-back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.title}>Manage Workspaces</Text>
        <Pressable
          onPress={() =>
            router.push({
              pathname: "/onboarding",
              params: { intent: "add", mode: "create" },
            })
          }
          hitSlop={10}
          style={styles.topAction}
          accessibilityRole="button"
          accessibilityLabel="Create workspace"
          testID="manage-workspaces-create"
        >
          <Plus size={21} color={colors.brand} strokeWidth={2.3} />
        </Pressable>
      </View>

      <Text style={styles.subtitle}>
        View and manage all the workspaces{"\n"}you’re a member of.
      </Text>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
        >
          {sortedTeams.map((team) => (
            <Pressable
              key={team.id}
              onPress={() =>
                router.push({
                  pathname: "/workspace-settings",
                  params: { teamId: team.id },
                })
              }
              style={styles.workspaceCard}
              accessibilityRole="button"
              testID={`manage-workspace-${team.id}`}
            >
              <WorkspaceTeamAvatar team={team} size={48} radius={12} />
              <View style={styles.workspaceText}>
                <Text style={styles.workspaceName} numberOfLines={1}>
                  {team.name}
                </Text>
                <Text style={styles.workspaceMeta} numberOfLines={1}>
                  {workspaceMeta(team)}
                </Text>
              </View>
              <ChevronRight size={18} color="#A7B0BE" />
            </Pressable>
          ))}

          {sortedTeams.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No workspaces yet</Text>
              <Text style={styles.emptyBody}>
                Use the plus button to create your first workspace.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F7F8FC",
  },
  topBar: {
    height: 52,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  topAction: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 22,
    paddingHorizontal: 24,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    textAlign: "center",
    color: "#8A95A6",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 16,
    gap: 10,
  },
  workspaceCard: {
    minHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E8ECF2",
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.035,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  pressed: {
    opacity: 0.68,
  },
  workspaceText: {
    flex: 1,
    minWidth: 0,
  },
  workspaceName: {
    fontSize: 13.5,
    lineHeight: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  workspaceMeta: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    color: "#7C8798",
  },
  empty: {
    marginTop: 70,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyBody: {
    marginTop: 5,
    fontSize: 12,
    color: "#7C8798",
    textAlign: "center",
  },
});
