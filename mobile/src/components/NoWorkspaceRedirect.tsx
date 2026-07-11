import { ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useTeamStore } from "@/lib/state/team-store";
import { NO_WORKSPACE_WELCOME_PATH } from "@/lib/no-workspace-routing";

/** Redirects users without a workspace out of tab screens into the welcome flow. */
export function NoWorkspaceRedirect() {
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);

  const { data: teams, isLoading, isFetched } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!hasHydrated || !isFetched) return;
    if (!teams || teams.length === 0) {
      router.replace(NO_WORKSPACE_WELCOME_PATH);
    }
  }, [hasHydrated, isFetched, teams]);

  if (!hasHydrated || isLoading || (teams && teams.length === 0)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  if (!activeTeamId) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
        <ActivityIndicator size="large" color="#4361EE" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" }}>
      <ActivityIndicator size="large" color="#4361EE" />
    </View>
  );
}
