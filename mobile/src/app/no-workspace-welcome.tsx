import { ActivityIndicator, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import type { Team } from "@/lib/types";
import { useTeamStore } from "@/lib/state/team-store";
import { NoWorkspaceWelcomeScreen } from "@/components/no-workspace-welcome/NoWorkspaceWelcomeScreen";
import {
  NO_WORKSPACE_WELCOME_PATH,
  resolveActiveTeamId,
} from "@/lib/no-workspace-routing";
import { WELCOME_UI } from "@/components/no-workspace-welcome/welcome-ui";

export default function NoWorkspaceWelcomeRoute() {
  const hasHydrated = useTeamStore((s) => s._hasHydrated);
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);

  const { data: teams, isLoading, isFetched } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!hasHydrated || !isFetched || !teams || teams.length === 0) return;
    const nextTeamId = resolveActiveTeamId(teams, activeTeamId);
    if (nextTeamId) {
      if (nextTeamId !== activeTeamId) setActiveTeamId(nextTeamId);
      router.replace("/(app)/chat");
    }
  }, [activeTeamId, hasHydrated, isFetched, setActiveTeamId, teams]);

  if (!hasHydrated || isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: WELCOME_UI.pageBg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={WELCOME_UI.primary} />
      </View>
    );
  }

  if (teams && teams.length > 0) {
    return (
      <View style={{ flex: 1, backgroundColor: WELCOME_UI.pageBg, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={WELCOME_UI.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, width: "100%", backgroundColor: WELCOME_UI.pageBg }} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <NoWorkspaceWelcomeScreen />
    </SafeAreaView>
  );
}

export { NO_WORKSPACE_WELCOME_PATH };
