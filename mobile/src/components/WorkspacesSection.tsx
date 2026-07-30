import React from "react";
import { View, Text, Pressable, ActivityIndicator, ScrollView, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueries } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";
import { router } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import { tabBarClearance } from "@/lib/tab-bar";
import type { Team } from "@/lib/types";
import type { SpaceTopic } from "@/components/SpacesSection";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { surfaces, typography } from "@/theme";

type Props = {
  activeTeamId: string | null;
  onSelectTeam: (teamId: string) => void;
  /** Match Messages panel row chrome from chat.tsx */
  cardStyle?: StyleProp<ViewStyle>;
};

const AVATAR = 28;

const defaultRowStyle = surfaces.listCard;

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        backgroundColor: "#EF4444",
        borderRadius: 8,
        minWidth: 16,
        height: 16,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 4,
        marginLeft: 6,
        flexShrink: 0,
      }}
    >
      <Text style={{ color: "white", fontSize: 9, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
}

export function WorkspacesSection({ activeTeamId, onSelectTeam, cardStyle }: Props) {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const rowStyle = cardStyle ?? defaultRowStyle;

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
    <View style={{ marginHorizontal: 12, marginTop: 8, marginBottom: 4, flexShrink: 0 }}>
      <Text style={[typography.sectionLabel, { marginBottom: 1 }]}>Workspaces</Text>
      <Text style={typography.sectionSubtitle} numberOfLines={1}>
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <WorkspaceTeamAvatar team={team} size={AVATAR} active={team.id === activeTeamId} radius={8} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", flex: 1 }} numberOfLines={1}>
                {team.name}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#6B7280", flex: 1 }} numberOfLines={1}>
                {channelCount} channel{channelCount === 1 ? "" : "s"}
              </Text>
              <UnreadBadge count={totalUnread} />
            </View>
          </View>
          <ChevronRight size={14} color="#CBD5E1" style={{ flexShrink: 0 }} />
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
          contentContainerStyle={{ paddingBottom: tabBarClearance(insets.bottom, 8) }}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          {teams.map((team) => renderWorkspace(team))}
        </ScrollView>
      )}
    </View>
  );
}
