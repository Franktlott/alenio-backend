import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  ImageBackground,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  RefreshControl,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, UserPlus, MessageCircle, AlertCircle, UserMinus, Clock, X, Check } from "lucide-react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api/api";
import { useTeamStore } from "@/lib/state/team-store";
import { useSession } from "@/lib/auth/use-session";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";

type JoinRequest = {
  id: string;
  status: string;
  team: { id: string; name: string; image: string | null };
  user?: { id: string; name: string; email: string; image: string | null };
  createdAt: string;
};

function MemberRow({
  member,
  isCurrentUser,
  onMessage,
  stats,
  isOwner,
  onRemove,
}: {
  member: TeamMember;
  isCurrentUser: boolean;
  onMessage: () => void;
  stats?: { activeTasks: number; overdueTasks: number; streak: number };
  isOwner?: boolean;
  onRemove?: () => void;
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
            <Text className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">🔥 {stats?.streak ?? 0}</Text>
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
      {isOwner && !isCurrentUser && member.role !== "owner" && member.role !== "team_leader" ? (
        <TouchableOpacity
          onPress={onRemove}
          className="w-8 h-8 rounded-full items-center justify-center mr-2"
          style={{ backgroundColor: "#EF444415" }}
          testID={`remove-member-${member.userId}`}
        >
          <UserMinus size={16} color="#EF4444" />
        </TouchableOpacity>
      ) : null}
      <View className={`px-2 py-0.5 rounded-full ${member.role === "owner" ? "bg-amber-100" : member.role === "team_leader" ? "bg-purple-100" : "bg-slate-100 dark:bg-slate-700"}`}>
        <Text className={`text-xs font-medium ${member.role === "owner" ? "text-amber-700" : member.role === "team_leader" ? "text-purple-700" : "text-slate-600 dark:text-slate-400"}`}>
          {member.role === "owner" ? "Owner" : member.role === "team_leader" ? "Team Leader" : member.role}
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
      api.get<Record<string, { activeTasks: number; overdueTasks: number; streak: number }>>(
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

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/api/teams/${activeTeamId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["member-stats", activeTeamId] });
    },
  });

  const handleRemove = (member: TeamMember) => {
    Alert.alert(
      "Remove Member",
      `Remove ${member.user.name} from the team?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => removeMutation.mutate(member.userId),
        },
      ]
    );
  };

  const currentMembership = team?.members?.find((m) => m.userId === session?.user?.id);
  const isOwner = currentMembership?.role === "owner" || currentMembership?.role === "team_leader";

  // Pending join requests (owner sees incoming requests; non-member sees their own)
  const { data: myPendingRequests = [] } = useQuery({
    queryKey: ["join-requests-mine"],
    queryFn: () => api.get<JoinRequest[]>("/api/join-requests/mine"),
    enabled: !activeTeamId,
    refetchInterval: 10000,
  });

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["team-join-requests", activeTeamId],
    queryFn: () => api.get<JoinRequest[]>(`/api/teams/${activeTeamId}/join-requests`),
    enabled: !!activeTeamId && isOwner,
    refetchInterval: 15000,
  });

  const cancelMutation = useMutation({
    mutationFn: (requestId: string) => api.delete(`/api/join-requests/${requestId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["join-requests-mine"] }),
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${activeTeamId}/join-requests/${requestId}/approve`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-join-requests", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) =>
      api.post(`/api/teams/${activeTeamId}/join-requests/${requestId}/reject`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-join-requests", activeTeamId] }),
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
    const myRequest = myPendingRequests[0] ?? null;
    if (myRequest) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]}>
          <ImageBackground source={require("@/assets/brand-bg.png")} style={{ width: "100%" }} resizeMode="cover">
            <View style={{ backgroundColor: "rgba(30,20,100,0.55)", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 }}>
              <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>Team</Text>
            </View>
          </ImageBackground>
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 24 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>
              Your Request
            </Text>
            {/* User card */}
            <View style={{ backgroundColor: "white", borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                  {session?.user?.image ? (
                    <Image source={{ uri: session.user.image }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={{ fontSize: 18, fontWeight: "700", color: "#4361EE" }}>
                      {session?.user?.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{session?.user?.name ?? "You"}</Text>
                  <Text style={{ fontSize: 13, color: "#94A3B8" }}>{session?.user?.email ?? ""}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "#FED7AA" }}>
                  <Clock size={12} color="#F59E0B" />
                  <Text style={{ fontSize: 12, fontWeight: "600", color: "#92400E" }}>Pending</Text>
                </View>
              </View>
              <View style={{ backgroundColor: "#F8FAFC", borderRadius: 10, padding: 12 }}>
                <Text style={{ fontSize: 12, color: "#64748B", marginBottom: 2 }}>Requested to join</Text>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B" }}>{myRequest.team.name}</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 3 }}>Waiting for a Team Leader to approve</Text>
              </View>
            </View>
            <Pressable
              onPress={() =>
                Alert.alert(
                  "Cancel Request",
                  `Are you sure you want to cancel your request to join ${myRequest.team.name}?`,
                  [
                    { text: "Keep Request", style: "cancel" },
                    {
                      text: "Cancel Request",
                      style: "destructive",
                      onPress: () => cancelMutation.mutate(myRequest.id),
                    },
                  ]
                )
              }
              disabled={cancelMutation.isPending}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: "#EF4444", paddingVertical: 13, borderRadius: 14 }}
              testID="cancel-request-button"
            >
              {cancelMutation.isPending ? (
                <ActivityIndicator color="#EF4444" size="small" />
              ) : (
                <>
                  <X size={15} color="#EF4444" />
                  <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 15 }}>Cancel Request</Text>
                </>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <NoTeamPlaceholder />
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
      <ImageBackground source={require("@/assets/brand-bg.png")} style={{ width: "100%" }} resizeMode="cover">
        <View style={{ backgroundColor: "rgba(30,20,100,0.55)", paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
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
      </ImageBackground>

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

      {/* Pending join requests — owners only */}
      {isOwner && incomingRequests.length > 0 ? (
        <View style={{ marginBottom: 4 }}>
          <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Pending Requests ({incomingRequests.length})
          </Text>
          {incomingRequests.map((req) => (
            <View key={req.id} style={{ backgroundColor: "white", marginHorizontal: 16, marginBottom: 8, borderRadius: 14, padding: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {req.user?.image ? (
                    <Image source={{ uri: req.user.image }} style={{ width: 40, height: 40 }} resizeMode="cover" />
                  ) : (
                    <Text style={{ fontSize: 16, fontWeight: "700", color: "#4361EE" }}>
                      {req.user?.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A" }}>{req.user?.name ?? "Unknown"}</Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8" }}>{req.user?.email ?? ""}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#FFF7ED", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, borderColor: "#FED7AA" }}>
                  <Clock size={11} color="#F59E0B" />
                  <Text style={{ fontSize: 11, fontWeight: "600", color: "#92400E" }}>Pending</Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  onPress={() => rejectMutation.mutate(req.id)}
                  disabled={rejectMutation.isPending || approveMutation.isPending}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: "#E2E8F0" }}
                  testID={`reject-request-${req.id}`}
                >
                  <X size={14} color="#64748B" />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B" }}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => approveMutation.mutate(req.id)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: "#4361EE" }}
                  testID={`approve-request-${req.id}`}
                >
                  {approveMutation.isPending ? (
                    <ActivityIndicator color="white" size="small" />
                  ) : (
                    <>
                      <Check size={14} color="white" />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "white" }}>Approve</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {/* Members list */}
      <Text className="px-4 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Members</Text>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />}
        testID="members-list"
      >
        {(team?.members ?? []).map((item) => (
          <MemberRow
            key={item.id}
            member={item}
            isCurrentUser={item.userId === session?.user?.id}
            onMessage={() => dmMutation.mutate(item.userId)}
            stats={memberStats?.[item.userId]}
            isOwner={isOwner}
            onRemove={() => handleRemove(item)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
