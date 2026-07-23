import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Check, ChevronRight } from "lucide-react-native";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useSession } from "@/lib/auth/use-session";
import { useSwitchWorkspace } from "@/hooks/use-switch-workspace";
import {
  WORKSPACE_SWITCH_HINT,
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { PROFILE_UI } from "@/components/profile/ProfileEnterpriseUI";

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
    <SafeAreaView style={{ flex: 1, backgroundColor: "transparent" }} edges={["top", "bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: "#E2E8F0",
          backgroundColor: "#FFFFFF",
        }}
      >
        <Text style={{ fontSize: 17, fontWeight: "600", color: "#0F172A" }}>Workspaces</Text>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
          }}
          testID="close-switch-workspace"
        >
          <X size={22} color="#64748B" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
      >
        {!isLoading && teams.length > 0 ? (
          <Text
            style={{ fontSize: 12, color: "#64748B", lineHeight: 17, marginBottom: 12 }}
            testID="workspace-switch-hint"
          >
            {WORKSPACE_SWITCH_HINT}
          </Text>
        ) : null}

        {isLoading ? (
          <View style={{ paddingVertical: 48, alignItems: "center" }}>
            <ActivityIndicator color="#4338CA" />
          </View>
        ) : teams.length === 0 ? (
          <View style={[PROFILE_UI.card, { padding: 28, alignItems: "center" }]}>
            <Text style={{ color: "#64748B", textAlign: "center", fontSize: 13 }}>
              You are not part of any workspaces yet.
            </Text>
          </View>
        ) : (
          <View style={PROFILE_UI.card}>
            {sortedTeams.map((team, index) => {
              const isActive = team.id === activeTeamId;
              const role = (team as Team & { role?: string }).role;
              return (
                <View key={team.id}>
                  {index > 0 ? (
                    <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 66 }} />
                  ) : null}
                  <Pressable
                    onPress={() => void onSelect(team.id)}
                    disabled={isActive}
                    testID={`switch-workspace-${team.id}`}
                    style={({ pressed }) => ({
                      backgroundColor: isActive ? "#F8FAFC" : pressed ? "#F8FAFC" : "transparent",
                    })}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 14,
                        paddingVertical: 12,
                        minHeight: 56,
                      }}
                    >
                      <WorkspaceTeamAvatar team={team} size={40} active={isActive} />
                      <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                        <Text style={PROFILE_UI.rowTitle} numberOfLines={1}>
                          {team.name}
                        </Text>
                        <Text style={PROFILE_UI.rowSubtitle} numberOfLines={1}>
                          {formatTeamRole(role)}
                          {isActive ? " · Current" : null}
                        </Text>
                      </View>
                      {isActive ? (
                        <Check size={20} color="#4338CA" strokeWidth={2.5} />
                      ) : (
                        <ChevronRight size={18} color="#94A3B8" />
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
