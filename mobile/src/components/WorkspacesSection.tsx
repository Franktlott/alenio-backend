import React from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Team } from "@/lib/types";
import type { SpaceTopic } from "@/components/SpacesSection";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";

type Props = {
  activeTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  cardStyle?: object;
};

const rowStyle = {
  marginHorizontal: 14,
  marginBottom: 6,
  backgroundColor: "#FFFFFF",
  borderRadius: 10,
  paddingVertical: 9,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: "#E9EDF2",
} as const;

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        backgroundColor: "#EF4444",
        borderRadius: 9,
        minWidth: 18,
        height: 18,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 5,
        flexShrink: 0,
      }}
    >
      <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function WorkspacesSection({ activeTeamId, onSelectTeam }: Props) {
  const { data: session } = useSession();
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
  });

  const topicQueries = useQueries({
    queries: teams.map((t) => ({
      queryKey: ["topics", t.id],
      queryFn: () => api.get<SpaceTopic[]>(`/api/teams/${t.id}/topics`),
      enabled: !!t.id,
      refetchInterval: 15000,
    })),
  });

  const topicsByTeam: Record<string, SpaceTopic[]> = {};
  teams.forEach((t, i) => {
    topicsByTeam[t.id] = topicQueries[i]?.data ?? [];
  });

  const unreadQueries = useQueries({
    queries: teams.map((t) => {
      const topics = topicsByTeam[t.id] ?? [];
      const lastReadMap: Record<string, string> = {
        [`team:${t.id}`]: lastReadIds[`team:${t.id}`] ?? "",
      };
      topics.forEach((tp) => {
        lastReadMap[`topic:${tp.id}`] = lastReadIds[`topic:${tp.id}`] ?? "";
      });
      return {
        queryKey: ["team-unread-counts", t.id, "workspaces", lastReadMap],
        queryFn: () =>
          api.post<Record<string, number>>(`/api/teams/${t.id}/messages/unread-counts`, {
            lastReadIds: lastReadMap,
          }),
        enabled: !!t.id && !!session?.user,
        refetchInterval: 5000,
        staleTime: 0,
      };
    }),
  });

  const unreadByTeam: Record<string, Record<string, number>> = {};
  teams.forEach((t, i) => {
    unreadByTeam[t.id] = unreadQueries[i]?.data ?? {};
  });

  const workspaceTotalUnread = (teamId: string) =>
    Object.values(unreadByTeam[teamId] ?? {}).reduce((sum, n) => sum + (n || 0), 0);

  const openWorkspace = (team: Team) => {
    onSelectTeam(team.id);
    router.push({ pathname: "/workspace", params: { teamId: team.id, teamName: team.name } });
  };

  const header = (
    <View style={{ marginHorizontal: 14, marginTop: 16, marginBottom: 8, flexShrink: 0 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: "#64748B",
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 2,
        }}
      >
        Workspaces
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 16 }} numberOfLines={1}>
        {teams.length === 0
          ? "Team chats and channels"
          : `${teams.length} workspace${teams.length === 1 ? "" : "s"}`}
      </Text>
    </View>
  );

  const renderWorkspace = (team: Team) => {
    const channelCount = (topicsByTeam[team.id]?.length ?? 0) + 1;
    const totalUnread = workspaceTotalUnread(team.id);

    return (
      <Pressable
        key={team.id}
        testID={`workspace-row-${team.id}`}
        onPress={() => openWorkspace(team)}
        style={rowStyle}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <WorkspaceTeamAvatar team={team} size={32} active={team.id === activeTeamId} radius={9} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
              {team.name}
            </Text>
            <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }} numberOfLines={1}>
              {channelCount} channel{channelCount === 1 ? "" : "s"}
            </Text>
          </View>
          <UnreadBadge count={totalUnread} />
          <ChevronRight size={16} color="#CBD5E1" />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {header}
      {isLoading ? (
        <View style={{ paddingVertical: 20, alignItems: "center" }}>
          <ActivityIndicator color="#4361EE" />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {teams.map((team) => renderWorkspace(team))}
        </ScrollView>
      )}
    </View>
  );
}
