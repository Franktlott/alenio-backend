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
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
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
import { mergeWorkplaceStandards, type MemberStatsPayload } from "@/lib/workplace-standards";

const PROFILE_TABS = ["Overview", "Growth", "Check-In"] as const;
const PAGE_BG = "#F3F5FC";
const PAGE_HEADER_BG = "#FAFBFF";
const PAGE_BORDER = "#E0E7FF";
const TAB_TRACK_BG = "#E8ECFA";
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

  const { data: memberStatsPayload } = useQuery({
    queryKey: ["member-stats", teamId],
    queryFn: () => api.get<MemberStatsPayload>(`/api/teams/${teamId}/tasks/member-stats`),
    enabled: !!teamId,
  });
  const memberStats = memberStatsPayload?.stats;
  const workplaceStandards = mergeWorkplaceStandards(memberStatsPayload?.workplaceStandards);

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
  const canCreateOneOne = myRole === "owner" || myRole === "team_leader";

  const stats = memberStats?.[memberUserId];
  const displayName = member?.user.name ?? member?.user.email ?? "Member";

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
    onError: (err: Error) => toast({ title: err.message || "Could not update role", preset: "error" }),
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
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#64748B" }}>Missing member information.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (isLoading || !member) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  const canViewProfile = isSelf || myRole === "owner" || myRole === "team_leader";
  if (!canViewProfile) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
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
    <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }} edges={["top", "bottom"]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          gap: 8,
          backgroundColor: PAGE_HEADER_BG,
          borderBottomWidth: 1,
          borderBottomColor: PAGE_BORDER,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: "white",
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: PAGE_BORDER,
          }}
          testID="member-profile-back"
        >
          <ArrowLeft size={18} color="#4361EE" />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Team member
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
            {displayName}
            {isSelf ? " (you)" : ""}
          </Text>
        </View>
        {canManage && !isDemo ? (
          <Pressable
            onPress={() => setManageOpen(true)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              backgroundColor: "white",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: PAGE_BORDER,
            }}
            testID="member-profile-manage"
          >
            <MoreVertical size={18} color="#64748B" />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(24, insets.bottom), paddingTop: 12 }}
        stickyHeaderIndices={[1]}
      >
        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <View
            style={{
              backgroundColor: "white",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: PAGE_BORDER,
              padding: 14,
              shadowColor: "#0F172A",
              shadowOpacity: 0.05,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: "#EEF2FF",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#E0E7FF",
                }}
              >
                {member.user.image ? (
                  <Image source={{ uri: member.user.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#4361EE" }}>
                    {member.user.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <View
                    style={{
                      backgroundColor: "#EEF2FF",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: "#C7D2FE",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#4338CA" }}>
                      {roleLabel(member.role)}
                    </Text>
                  </View>
                  <View
                    style={{
                      backgroundColor: "#ECFDF5",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: "#BBF7D0",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#15803D" }}>Active</Text>
                  </View>
                </View>
                {member.user.email ? (
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 6 }} numberOfLines={1}>
                    {member.user.email}
                  </Text>
                ) : null}
                {managerName && member.role !== "owner" ? (
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }} numberOfLines={1}>
                    Reports to {managerName}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: TAB_TRACK_BG,
              borderRadius: 12,
              padding: 3,
              gap: 3,
            }}
          >
            {PROFILE_TABS.map((tab) => (
              <Pressable
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: activeTab === tab ? "white" : "transparent",
                  alignItems: "center",
                  shadowColor: activeTab === tab ? "#0F172A" : "transparent",
                  shadowOpacity: activeTab === tab ? 0.06 : 0,
                  shadowRadius: 4,
                  shadowOffset: { width: 0, height: 1 },
                  elevation: activeTab === tab ? 1 : 0,
                }}
                testID={`member-profile-tab-${tab}`}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: activeTab === tab ? "#0F172A" : "#64748B",
                  }}
                >
                  {tab}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ paddingHorizontal: 12, paddingTop: 2 }}>
          {activeTab === "Overview" ? (
            <ProfileOverviewTab
              teamId={teamId}
              memberUserId={memberUserId}
              streak={isPaid ? stats?.streak : undefined}
              overdueFollowUpTasks={stats?.overdueFollowUpTasks}
              workplaceStandards={workplaceStandards}
              standardsCompliance={stats?.standardsCompliance}
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
              canCreate={canCreateOneOne}
              canModify={canCreateOneOne}
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

              {myRole === "owner" && member.role !== "owner" ? (
                member.role === "team_leader" ? (
                  <Pressable
                    onPress={() => {
                      Alert.alert(
                        "Remove Team Leader",
                        `Remove team leader role from ${member.user.name}? They will become a regular member.`,
                        [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Remove",
                            onPress: () =>
                              setRoleMutation.mutate({
                                userId: member.userId,
                                role: "member",
                              }),
                          },
                        ],
                      );
                    }}
                    disabled={setRoleMutation.isPending}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: "#EDE9FE",
                      marginBottom: 12,
                      opacity: setRoleMutation.isPending ? 0.6 : 1,
                    }}
                    testID="demote-team-leader"
                  >
                    {setRoleMutation.isPending ? (
                      <ActivityIndicator size="small" color="#7C3AED" />
                    ) : (
                      <Crown size={14} color="#7C3AED" />
                    )}
                    <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>
                      {setRoleMutation.isPending ? "Saving…" : "Remove Team Leader"}
                    </Text>
                  </Pressable>
                ) : member.role === "member" ? (
                  <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                    <Pressable
                      onPress={() => handleRemove(member)}
                      disabled={setRoleMutation.isPending}
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
                        opacity: setRoleMutation.isPending ? 0.6 : 1,
                      }}
                    >
                      <UserMinus size={14} color="#EF4444" />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#EF4444" }}>Remove</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        Alert.alert(
                          "Make Team Leader",
                          `Give ${member.user.name} team leader access?`,
                          [
                            { text: "Cancel", style: "cancel" },
                            {
                              text: "Confirm",
                              onPress: () =>
                                setRoleMutation.mutate({
                                  userId: member.userId,
                                  role: "team_leader",
                                }),
                            },
                          ],
                        );
                      }}
                      disabled={setRoleMutation.isPending}
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
                        opacity: setRoleMutation.isPending ? 0.6 : 1,
                      }}
                      testID="promote-team-leader"
                    >
                      {setRoleMutation.isPending ? (
                        <ActivityIndicator size="small" color="#7C3AED" />
                      ) : (
                        <Crown size={14} color="#7C3AED" />
                      )}
                      <Text style={{ fontSize: 13, fontWeight: "600", color: "#7C3AED" }}>Set Leader</Text>
                    </Pressable>
                  </View>
                ) : null
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
