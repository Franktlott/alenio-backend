import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Building2 } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import {
  CurrentWorkspaceBadge,
  WORKSPACE_SWITCH_HINT,
  WorkspaceTeamAvatar,
  WorkspaceTeamRow,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";

export default function SwitchWorkspaceScreen() {
  const { data: session } = useSession();
  const { switchWorkspace, activeTeamId } = useSwitchWorkspace();

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const sortedTeams = useMemo(() => {
    const copy = [...teams];
    copy.sort((a, b) => {
      if (a.id === activeTeamId) return -1;
      if (b.id === activeTeamId) return 1;
      return a.name.localeCompare(b.name);
    });
    return copy;
  }, [teams, activeTeamId]);

  const activeTeam = teams.find((t) => t.id === activeTeamId);
  const otherTeams = sortedTeams.filter((t) => t.id !== activeTeamId);

  const onSelect = async (teamId: string) => {
    if (teamId === activeTeamId) {
      router.back();
      return;
    }
    await switchWorkspace(teamId);
    if (router.canGoBack()) {
      router.back();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F1F5F9" }} edges={["top", "bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingVertical: 14,
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
          backgroundColor: "#FFFFFF",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              letterSpacing: 1.1,
              color: "#64748B",
              textTransform: "uppercase",
            }}
          >
            Workspaces
          </Text>
          <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginTop: 2 }}>Switch workspace</Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: "#F8FAFC",
            borderWidth: 1,
            borderColor: "#E2E8F0",
            alignItems: "center",
            justifyContent: "center",
          }}
          testID="close-switch-workspace"
        >
          <X size={20} color="#64748B" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {teams.length > 0 && !isLoading ? (
          <Text
            style={{ fontSize: 12, color: "#64748B", lineHeight: 17, marginBottom: 16, paddingHorizontal: 4 }}
            testID="workspace-switch-hint"
          >
            {WORKSPACE_SWITCH_HINT}
          </Text>
        ) : null}

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : teams.length === 0 ? (
          <View
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 14,
              padding: 28,
              alignItems: "center",
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Building2 size={28} color="#94A3B8" style={{ marginBottom: 12 }} />
            <Text style={{ color: "#64748B", textAlign: "center", fontSize: 13 }}>
              You are not part of any workspaces yet.
            </Text>
          </View>
        ) : (
          <>
            {activeTeam ? (
              <View style={{ marginBottom: 24 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 1.1,
                    color: "#64748B",
                    textTransform: "uppercase",
                    marginBottom: 10,
                    paddingHorizontal: 4,
                  }}
                >
                  Current workspace
                </Text>
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 14,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "#C7D2FE",
                    shadowColor: "#4361EE",
                    shadowOpacity: 0.08,
                    shadowRadius: 12,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <WorkspaceTeamAvatar team={activeTeam} size={44} active />
                    <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
                          {activeTeam.name}
                        </Text>
                        <CurrentWorkspaceBadge compact />
                      </View>
                      <Text style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>
                        {formatTeamRole((activeTeam as Team & { role?: string }).role)}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={() => router.back()}
                    style={{
                      marginTop: 14,
                      paddingVertical: 10,
                      borderRadius: 8,
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      alignItems: "center",
                    }}
                    testID="stay-on-current-workspace"
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Stay on current workspace</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {otherTeams.length > 0 ? (
              <View>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    letterSpacing: 1.1,
                    color: "#64748B",
                    textTransform: "uppercase",
                    marginBottom: 10,
                    paddingHorizontal: 4,
                  }}
                >
                  {activeTeam ? "Switch to" : "Your workspaces"}
                </Text>
                <View style={{ gap: 10 }}>
                  {otherTeams.map((team) => (
                    <WorkspaceTeamRow
                      key={team.id}
                      team={team as Team & { role?: string }}
                      isActive={false}
                      onPress={() => void onSelect(team.id)}
                      testID={`switch-workspace-${team.id}`}
                      trailing={
                        <View
                          style={{
                            marginLeft: 8,
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 8,
                            backgroundColor: "#4361EE",
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: "700", color: "#FFFFFF" }}>Switch</Text>
                        </View>
                      }
                      showChevron={false}
                    />
                  ))}
                </View>
              </View>
            ) : null}

            {!activeTeam && sortedTeams.length > 0 ? (
              <View style={{ gap: 10 }}>
                {sortedTeams.map((team) => (
                  <WorkspaceTeamRow
                    key={team.id}
                    team={team as Team & { role?: string }}
                    isActive={team.id === activeTeamId}
                    onPress={() => void onSelect(team.id)}
                    testID={`switch-workspace-${team.id}`}
                  />
                ))}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
