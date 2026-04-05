import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Share,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, UserPlus, MessageCircle, AlertCircle } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";

function MemberRow({
  member,
  isCurrentUser,
  onMessage,
  stats,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  onMessage: () => void;
  stats?: { activeTasks: number; overdueTasks: number; onTimeCompletions: number };
}) {
  return (
    <View
      className="flex-row items-center px-4 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700"
      testID="member-row"
    >
      <View className="w-10 h-10 rounded-full bg-indigo-600 items-center justify-center mr-3 overflow-hidden">
        {member.user.image ? (
          <Image source={{ uri: member.user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <Text className="text-white font-bold text-sm">{member.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="text-slate-900 dark:text-white font-semibold">
          {member.user.name} {isCurrentUser ? "(you)" : ""}
        </Text>
        <Text className="text-slate-500 text-xs mb-1">{member.user.email}</Text>
        <View className="flex-row" style={{ gap: 6 }}>
          <View className="flex-row items-center bg-indigo-50 dark:bg-indigo-900/40 rounded-full px-2 py-0.5">
            <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-medium">{stats?.activeTasks ?? 0} active</Text>
          </View>
          {(stats?.overdueTasks ?? 0) > 0 ? (
            <View className="flex-row items-center bg-red-50 dark:bg-red-900/40 rounded-full px-2 py-0.5">
              <Text className="text-red-600 dark:text-red-400 text-xs font-medium">{stats?.overdueTasks} overdue</Text>
            </View>
          ) : null}
          <View className="flex-row items-center bg-emerald-50 dark:bg-emerald-900/40 rounded-full px-2 py-0.5">
            <Text className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">🔥 {stats?.onTimeCompletions ?? 0}</Text>
          </View>
        </View>
      </View>
      {!isCurrentUser ? (
        <TouchableOpacity
          testID={`message-member-${member.userId}`}
          onPress={onMessage}
          className="w-8 h-8 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: "#4361EE15" }}
        >
          <MessageCircle size={16} color="#4361EE" />
        </TouchableOpacity>
      ) : null}
      <View className={`px-2 py-0.5 rounded-full ${member.role === "owner" ? "bg-amber-100" : "bg-slate-100 dark:bg-slate-700"}`}>
        <Text className={`text-xs font-medium capitalize ${member.role === "owner" ? "text-amber-700" : "text-slate-600 dark:text-slate-400"}`}>
          {member.role}
        </Text>
      </View>
    </View>
  );
}

export default function TeamScreen() {
  const insets = useSafeAreaInsets();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: memberStats } = useQuery({
    queryKey: ["member-stats", activeTeamId],
    queryFn: () =>
      api.get<Record<string, { activeTasks: number; overdueTasks: number; onTimeCompletions: number }>>(
        `/api/teams/${activeTeamId}/tasks/member-stats`
      ),
    enabled: !!activeTeamId,
  });

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string } | null }>("/api/dms/find-or-create", { recipientId }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push({ pathname: "/dm-chat", params: { conversationId: conv.id, recipientName: conv.recipient?.name ?? "Direct Message" } });
    },
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    setRefreshing(false);
  };

  const handleCopyCode = async () => {
    if (team?.inviteCode) await Clipboard.setStringAsync(team.inviteCode);
  };

  const handleShareCode = () => {
    if (team?.inviteCode) {
      Share.share({ message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}` });
    }
  };

  const totalOverdue = memberStats
    ? Object.values(memberStats).reduce((sum, s) => sum + s.overdueTasks, 0)
    : 0;

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center">
        <Text className="text-slate-500">No team selected</Text>
        <TouchableOpacity className="mt-4 bg-indigo-600 rounded-xl px-6 py-3" onPress={() => router.push("/onboarding")}>
          <Text className="text-white font-semibold">Create or join a team</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900 items-center justify-center" testID="loading-indicator">
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]} testID="team-screen">
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {team?.image ? (
                <Image source={{ uri: team.image }} style={{ width: 30, height: 30 }} resizeMode="cover" />
              ) : (
                <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{team?.name?.[0]?.toUpperCase() ?? "T"}</Text>
              )}
            </View>
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{team?.name ?? "Team"}</Text>
          </View>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      {/* Invite code card */}
      <View className="mx-4 mb-4 mt-4 rounded-2xl p-4" style={{ backgroundColor: "#4361EE15" }}>
        <Text className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-2">Invite Code</Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-2xl font-bold text-indigo-600 tracking-widest">{team?.inviteCode}</Text>
          <View className="flex-row" style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={handleCopyCode}
              className="w-9 h-9 rounded-full items-center justify-center"
              style={{ backgroundColor: "#4361EE20" }}
              testID="copy-invite-code"
            >
              <Copy size={16} color="#4361EE" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleShareCode}
              className="w-9 h-9 rounded-full bg-indigo-600 items-center justify-center"
              testID="share-invite-code"
            >
              <UserPlus size={16} color="white" />
            </TouchableOpacity>
          </View>
        </View>
        <Text className="text-xs mt-1" style={{ color: "#4361EEb3" }}>Share this code to invite team members</Text>
      </View>

      {/* Overdue tasks pill */}
      {totalOverdue > 0 ? (
        <View className="mx-4 mb-3 flex-row items-center rounded-2xl px-4 py-3" style={{ backgroundColor: "#FEF2F2", gap: 10 }}>
          <AlertCircle size={18} color="#EF4444" />
          <Text className="flex-1 text-sm font-semibold text-red-600">
            {totalOverdue} overdue {totalOverdue === 1 ? "task" : "tasks"} across the team
          </Text>
        </View>
      ) : null}

      {/* Members list */}
      <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Members</Text>
      <FlatList
        data={team?.members ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MemberRow
            member={item}
            isCurrentUser={item.userId === session?.user?.id}
            onMessage={() => dmMutation.mutate(item.userId)}
            stats={memberStats?.[item.userId]}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        testID="members-list"
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    </SafeAreaView>
  );
}
