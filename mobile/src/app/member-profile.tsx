import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  MessageCircle,
  MoreVertical,
  UserMinus,
  Crown,
  ChevronRight,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { useDemoMode } from "@/lib/useDemo";
import type { Team, TeamMember, TeamRole } from "@/lib/types";
import { ProfileOverviewTab } from "@/components/ProfileOverviewTab";
import { DevelopmentPlanTab } from "@/components/DevelopmentPlanTab";
import { OneOnOneHistoryTab } from "@/components/OneOnOneHistoryTab";

const PROFILE_TABS = ["Overview", "Growth", "Check-In"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function roleLabel(role: TeamRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "team_leader":
      return "Team Leader";
    case "admin":
      return "Admin";
    default:
      return "Member";
  }
}

function parseTab(value: string | string[] | undefined): ProfileTab {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "check-in" || raw === "check_in" || raw === "growth" || raw === "dev-plan" || raw === "Development plan" || raw === "Growth") return "Growth";
  if (
    raw === "conversations" ||
    raw === "one-on-one" ||
    raw === "1:1 history" ||
    raw === "Conversations" ||
    raw === "Check-In"
  ) {
    return "Check-In";
  }
  return "Overview";
}

export default function MemberProfileScreen() {
  const params = useLocalSearchParams<{
    teamId?: string;
    memberUserId?: string;
    tab?: string;
  }>();
  const activeTeamIdFromStore = useTeamStore((s) => s.activeTeamId);
  const teamId = params.teamId ?? activeTeamIdFromStore ?? "";
  const memberUserId = params.memberUserId ?? "";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ProfileTab>(parseTab(params.tab));
  const [manageOpen, setManageOpen] = useState(false);

  const { data: team, isLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { data: memberStats } = useQuery({
    queryKey: ["member-stats", teamId],
    queryFn: () =>
      api.get<
        Record<
          string,
          {
            activeTasks: number;
            overdueTasks: number;
            completedTasks: number;
            streak: number;
            personalBestStreak: number;
          }
        >
      >(`/api/teams/${teamId}/tasks/member-stats`),
    enabled: !!teamId,
  });

  const member = team?.members?.find((m) => m.userId === memberUserId) ?? null;
  const myMembership = team?.members?.find((m) => m.userId === session?.user?.id);
  const myRole = myMembership?.role;
  const myId = session?.user?.id ?? "";
  const isSelf = memberUserId === myId;

  const ownerMember = team?.members?.find((m) => m.role === "owner");
  const managerName = ownerMember?.user.name ?? ownerMember?.user.email ?? null;
  const leaderUserId = ownerMember?.userId ?? null;

  const canManage = useMemo(() => {
    if (!member || !myRole) return false;
    if (myRole !== "owner" && myRole !== "team_leader") return false;
    if (member.role === "owner") return false;
    if (myRole === "team_leader" && member.role !== "member") return false;
    return member.userId !== myId;
  }, [member, myRole, myId]);

  const canCreateDevGoal =
    isSelf || myRole === "owner" || myRole === "team_leader" || myRole === "admin";
  const canAddDevNotes = canCreateDevGoal;

  const stats = memberStats?.[memberUserId];
  const displayName = member?.user.name ?? member?.user.email ?? "Member";

  const dmMutation = useMutation({
    mutationFn: (recipientId: string) =>
      api.post<{ id: string; recipient: { name: string } | null }>("/api/dms/find-or-create", {
        recipientId,
      }),
    onSuccess: (conv) => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.push({
        pathname: "/dm-chat",
        params: {
          conversationId: conv.id,
          recipientName: conv.recipient?.name ?? "Direct Message",
        },
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/teams/${teamId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
      toast({ title: "Member removed", preset: "done" });
      router.back();
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/api/teams/${teamId}/members/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      setManageOpen(false);
      toast({ title: "Role updated", preset: "done" });
    },
  });

  const transferOwnershipMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/api/teams/${teamId}/transfer-ownership`, { userId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      setManageOpen(false);
      toast({ title: "Ownership transferred", preset: "done" });
      router.back();
    },
    onError: () => toast({ title: "Transfer failed", preset: "error" }),
  });

  const handleRemove = (m: TeamMember) => {
    Alert.alert("Remove Member", `Remove ${m.user.name} from the team?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => removeMutation.mutate(m.userId),
      },
    ]);
  };

  if (!teamId || !memberUserId) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#64748B" }}>Missing member information.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isLoading || !member) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  const canViewProfile = isSelf || myRole === "owner" || myRole === "team_leader";
  if (!canViewProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "#64748B", textAlign: "center", lineHeight: 22 }}>
          You can only view your own profile. Owners and team leaders can view other members.
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, gap: 8 }}>
        <Pressable
          onPress={() => router.back()}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}
          testID="member-profile-back"
        >
          <ArrowLeft size={20} color="#0F172A" />
        </Pressable>
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Team member</Text>
        {canManage && !isDemo ? (
          <Pressable
            onPress={() => setManageOpen(true)}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "white", alignItems: "center", justifyContent: "center" }}
            testID="member-profile-manage"
          >
            <MoreVertical size={20} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom) }} stickyHeaderIndices={[1]}>
        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <LinearGradient
            colors={["#4361EE", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ borderRadius: 18, padding: 18 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 28,
                  backgroundColor: "rgba(255,255,255,0.25)",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {member.user.image ? (
                  <Image source={{ uri: member.user.image }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 22, fontWeight: "800", color: "white" }}>
                    {member.user.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, fontWeight: "800", color: "white" }}>
                  {displayName}
                  {isSelf ? " (you)" : ""}
                </Text>
                <View
                  style={{
                    marginTop: 6,
                    alignSelf: "flex-start",
                    backgroundColor: "rgba(255,255,255,0.2)",
                    borderRadius: 20,
                    paddingHorizontal: 10,
                    paddingVertical: 3,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "white" }}>
                    {roleLabel(member.role)}
                  </Text>
                </View>
                {member.user.email ? (
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 6 }}>
                    {member.user.email}
                  </Text>
                ) : null}
                {managerName && member.role !== "owner" ? (
                  <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>
                    Reports to {managerName}
                  </Text>
                ) : null}
              </View>
            </View>
          </LinearGradient>

          {!isSelf ? (
            <Pressable
              onPress={() => dmMutation.mutate(member.userId)}
              style={{
                marginTop: 12,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: "#4361EE",
                paddingVertical: 12,
                borderRadius: 12,
              }}
              testID="member-profile-message"
            >
              <MessageCircle size={16} color="white" />
              <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Message</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ backgroundColor: "#F8FAFC", paddingHorizontal: 12, paddingBottom: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {PROFILE_TABS.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 20,
                  backgroundColor: activeTab === tab ? "#4361EE" : "white",
                  borderWidth: 1,
                  borderColor: activeTab === tab ? "#4361EE" : "#E2E8F0",
                }}
                testID={`member-profile-tab-${tab}`}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: activeTab === tab ? "white" : "#64748B",
                  }}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {activeTab === "Overview" ? (
            <ProfileOverviewTab
              teamId={teamId}
              memberUserId={memberUserId}
              streak={isPaid ? stats?.streak : undefined}
              overdueTasks={stats?.overdueTasks}
            />
          ) : activeTab === "Growth" ? (
            <DevelopmentPlanTab
              teamId={teamId}
              memberUserId={memberUserId}
              memberName={displayName}
              managerName={managerName}
              canCreate={canCreateDevGoal}
              canAddNotes={canAddDevNotes}
            />
          ) : (
            <OneOnOneHistoryTab
              teamId={teamId}
              memberUserId={memberUserId}
              memberName={displayName}
              managerName={managerName}
              leaderUserId={leaderUserId}
              canCreate={false}
              canModify={false}
            />
          )}
        </View>
      </ScrollView>

      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={() => setManageOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
          onPress={() => setManageOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "white",
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                paddingBottom: Math.max(16, insets.bottom),
                paddingTop: 12,
                paddingHorizontal: 16,
              }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#E2E8F0",
                  alignSelf: "center",
                  marginBottom: 16,
                }}
              />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", marginBottom: 16 }}>
                Manage member
              </Text>

              {myRole === "owner" && member.role !== "owner" && member.role !== "team_leader" ? (
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => handleRemove(member)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: "#FECACA",
                    }}
                  >
                    <UserMinus size={14} color="#EF4444" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const isLeader = member.role === "team_leader";
                      Alert.alert(
                        isLeader ? "Remove Team Leader" : "Make Team Leader",
                        isLeader
                          ? `Remove team leader role from ${member.user.name}?`
                          : `Give ${member.user.name} team leader access?`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: isLeader ? "Remove" : "Confirm",
                            onPress: () =>
                              setRoleMutation.mutate({
                                userId: member.userId,
                                role: isLeader ? "member" : "team_leader",
                              }),
                          },
                        ],
                      );
                    }}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: "#EDE9FE",
                    }}
                  >
                    <Crown size={14} color="#7C3AED" />
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>Set Leader</Text>
                  </Pressable>
                </View>
              ) : null}

              {myRole === "owner" && member.userId !== myId && member.role !== "owner" ? (
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Transfer Ownership",
                      `Give full ownership of this team to ${member.user.name}? You will become a regular member.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Transfer",
                          style: "destructive",
                          onPress: () => transferOwnershipMutation.mutate(member.userId),
                        },
                      ],
                    );
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                    backgroundColor: "#FFF7ED",
                    borderRadius: 14,
                    padding: 14,
                    borderWidth: 1,
                    borderColor: "#FED7AA",
                  }}
                >
                  <Crown size={18} color="#F97316" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "#C2410C" }}>Transfer Ownership</Text>
                    <Text style={{ fontSize: 12, color: "#9A3412", marginTop: 1 }}>
                      Make {member.user.name} the new owner
                    </Text>
                  </View>
                  <ChevronRight size={16} color="#F97316" />
                </Pressable>
              ) : null}

              <Pressable
                onPress={() => setManageOpen(false)}
                style={{
                  paddingVertical: 14,
                  borderRadius: 12,
                  backgroundColor: "#F1F5F9",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "700", color: "#64748B" }}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
