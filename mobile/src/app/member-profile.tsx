import React, { useEffect, useMemo, useState } from "react";
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
  Shield,
  X,
} from "lucide-react-native";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import type { Team, TeamMember, TeamRole } from "@/lib/types";
import { ProfileOverviewTab } from "@/components/ProfileOverviewTab";
import { DevelopmentPlanTab } from "@/components/DevelopmentPlanTab";
import { OneOnOneHistoryTab } from "@/components/OneOnOneHistoryTab";
import { mergeWorkplaceStandards, type MemberStatsPayload } from "@/lib/workplace-standards";
import {
  ProfileCard,
  ProfileDivider,
  ProfileSection,
} from "@/components/profile/ProfileEnterpriseUI";

const PROFILE_TABS = ["Overview", "Growth", "Check-In"] as const;
const FORMER_MEMBER_TABS = ["Check-In"] as const;
const PAGE_BG = "#F3F5FC";
const PAGE_HEADER_BG = "#FAFBFF";
const PAGE_BORDER = "#E0E7FF";
const TAB_TRACK_BG = "#E8ECFA";
type ProfileTab = (typeof PROFILE_TABS)[number] | (typeof FORMER_MEMBER_TABS)[number];

function roleLabel(role: TeamRole): string {
  switch (role) {
    case "owner":
      return "Owner";
    case "team_leader":
      return "Team leader";
    case "admin":
      return "Admin";
    default:
      return "Member";
  }
}

function ManageActionRow({
  icon: Icon,
  title,
  subtitle,
  destructive,
  onPress,
  trailing,
  testID,
}: {
  icon: typeof Crown;
  title: string;
  subtitle: string;
  destructive?: boolean;
  onPress: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => (pressed ? { backgroundColor: "#F8FAFC" } : undefined)}
    >
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, gap: 12 }}>
        <Icon size={18} color={destructive ? "#DC2626" : "#475569"} strokeWidth={2} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: destructive ? "#DC2626" : "#0F172A" }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={{ fontSize: 12, color: destructive ? "#F87171" : "#64748B", marginTop: 2, lineHeight: 16 }}>
            {subtitle}
          </Text>
        </View>
        {trailing}
      </View>
    </Pressable>
  );
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

type FormerMemberRow = {
  userId: string;
  user: TeamMember["user"];
  isFormer: true;
};

export default function MemberProfileScreen() {
  const params = useLocalSearchParams<{
    teamId?: string;
    memberUserId?: string;
    tab?: string;
    startCheckIn?: string;
    templateId?: string;
    plannedEventId?: string;
  }>();
  const activeTeamIdFromStore = useTeamStore((s) => s.activeTeamId);
  const teamId = params.teamId ?? activeTeamIdFromStore ?? "";
  const memberUserId = params.memberUserId ?? "";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ProfileTab>(() =>
    params.startCheckIn === "1" ? "Check-In" : parseTab(params.tab),
  );
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
  const canViewAsLeader = myRole === "owner" || myRole === "team_leader";
  const { data: formerMembers = [], isLoading: formerMembersLoading } = useQuery({
    queryKey: ["former-members", teamId],
    queryFn: () => api.get<FormerMemberRow[]>(`/api/teams/${teamId}/former-members`),
    enabled: !!teamId && canViewAsLeader && !member,
  });
  const formerMember = formerMembers.find((row) => row.userId === memberUserId) ?? null;
  const profileMember: TeamMember | null =
    member ??
    (formerMember
      ? {
          id: `former-${formerMember.userId}`,
          role: "member",
          userId: formerMember.userId,
          teamId: teamId ?? "",
          joinedAt: "",
          user: formerMember.user,
        }
      : null);
  const isFormerMember = !member && !!formerMember;
  const myId = session?.user?.id ?? "";
  const isSelf = memberUserId === myId;

  const ownerMember = team?.members?.find((m) => m.role === "owner");
  const managerName = ownerMember?.user.name ?? ownerMember?.user.email ?? null;
  const leaderUserId = ownerMember?.userId ?? null;

  const canManage = useMemo(() => {
    if (isFormerMember || !profileMember || !myRole) return false;
    if (myRole !== "owner" && myRole !== "team_leader") return false;
    if (profileMember.role === "owner") return false;
    if (myRole === "team_leader" && profileMember.role !== "member") return false;
    return profileMember.userId !== myId;
  }, [isFormerMember, profileMember, myRole, myId]);

  const canCreateDevGoal =
    !isFormerMember &&
    (isSelf || myRole === "owner" || myRole === "team_leader" || myRole === "admin");
  const canAddDevNotes = canCreateDevGoal;
  const canCreateOneOne = !isFormerMember && (myRole === "owner" || myRole === "team_leader");
  const shouldAutoStartCheckIn = params.startCheckIn === "1";
  const preferredCheckInTemplateId =
    typeof params.templateId === "string" && params.templateId.length > 0 ? params.templateId : null;
  const plannedCheckInEventId =
    typeof params.plannedEventId === "string" && params.plannedEventId.length > 0
      ? params.plannedEventId
      : null;

  const stats = memberStats?.[memberUserId];
  const displayName = profileMember?.user.name ?? profileMember?.user.email ?? "Member";

  useEffect(() => {
    if (isFormerMember) {
      setActiveTab("Check-In");
    }
  }, [isFormerMember, memberUserId]);

  const removeMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/teams/${teamId}/members/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team", teamId] });
      queryClient.invalidateQueries({ queryKey: ["member-stats", teamId] });
      queryClient.invalidateQueries({ queryKey: ["former-members", teamId] });
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

  if (isLoading || (!member && canViewAsLeader && formerMembersLoading)) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  if (!profileMember) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Text style={{ color: "#64748B", textAlign: "center", lineHeight: 22 }}>Member not found.</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
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

  const visibleTabs = isFormerMember
    ? isPaid
      ? FORMER_MEMBER_TABS
      : ([] as const)
    : isPaid
      ? PROFILE_TABS
      : (["Overview"] as const);
  const activeTabSafe = (visibleTabs as readonly string[]).includes(activeTab)
    ? activeTab
    : (visibleTabs[0] ?? "Overview");

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
            {isFormerMember ? "Former member" : "Team member"}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }} numberOfLines={1}>
            {displayName}
            {isSelf ? " (you)" : ""}
          </Text>
        </View>
        {canManage ? (
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

      <View style={{ flex: 1, paddingTop: 12 }}>
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
                {profileMember.user.image ? (
                  <Image source={{ uri: profileMember.user.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#4361EE" }}>
                    {profileMember.user.name?.[0]?.toUpperCase() ?? "?"}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <View
                    style={{
                      backgroundColor: isFormerMember ? "#F8FAFC" : "#EEF2FF",
                      borderRadius: 6,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderWidth: 1,
                      borderColor: isFormerMember ? "#E2E8F0" : "#C7D2FE",
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: "700", color: isFormerMember ? "#64748B" : "#4338CA" }}>
                      {isFormerMember ? "Former member" : roleLabel(profileMember.role)}
                    </Text>
                  </View>
                  {!isFormerMember ? (
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
                  ) : null}
                </View>
                {profileMember.user.email ? (
                  <Text style={{ fontSize: 12, color: "#64748B", marginTop: 6 }} numberOfLines={1}>
                    {profileMember.user.email}
                  </Text>
                ) : null}
                {managerName && profileMember.role !== "owner" && !isFormerMember ? (
                  <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }} numberOfLines={1}>
                    Reports to {managerName}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
          {visibleTabs.length > 1 ? (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: TAB_TRACK_BG,
                borderRadius: 12,
                padding: 3,
                gap: 3,
              }}
            >
              {visibleTabs.map((tab) => (
                <Pressable
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 10,
                    backgroundColor: activeTabSafe === tab ? "white" : "transparent",
                    alignItems: "center",
                    shadowColor: activeTabSafe === tab ? "#0F172A" : "transparent",
                    shadowOpacity: activeTabSafe === tab ? 0.06 : 0,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: activeTabSafe === tab ? 1 : 0,
                  }}
                  testID={`member-profile-tab-${tab}`}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: activeTabSafe === tab ? "#0F172A" : "#64748B",
                    }}
                  >
                    {tab}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>

        {visibleTabs.length === 0 ? (
          <View style={{ flex: 1, paddingHorizontal: 24, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#64748B", textAlign: "center", lineHeight: 22 }}>
              Check-in history for former members requires Team access.
            </Text>
          </View>
        ) : activeTabSafe === "Overview" ? (
          <View style={{ flex: 1, paddingHorizontal: 12, paddingBottom: Math.max(12, insets.bottom) }}>
            <ProfileOverviewTab
              teamId={teamId}
              memberUserId={memberUserId}
              streak={stats?.streak}
              overdueFollowUpTasks={stats?.overdueFollowUpTasks}
              workplaceStandards={workplaceStandards}
              standardsCompliance={stats?.standardsCompliance}
              daysSinceLastCheckIn={stats?.daysSinceLastOneOnOne}
            />
          </View>
        ) : (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              flexGrow: 1,
              paddingHorizontal: 12,
              paddingBottom: Math.max(24, insets.bottom),
              paddingTop: 2,
            }}
            nestedScrollEnabled
          >
            {activeTabSafe === "Growth" ? (
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
                isSelf={isSelf}
                autoStartCheckIn={shouldAutoStartCheckIn}
                preferredTemplateId={preferredCheckInTemplateId}
                plannedEventId={plannedCheckInEventId}
              />
            )}
          </ScrollView>
        )}
      </View>

      <Modal visible={manageOpen} transparent animationType="slide" onRequestClose={() => setManageOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(15, 23, 42, 0.4)", justifyContent: "flex-end" }}
          onPress={() => setManageOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                overflow: "hidden",
                maxHeight: "78%",
                shadowColor: "#0F172A",
                shadowOpacity: 0.16,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: -4 },
                elevation: 8,
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#E2E8F0",
                  backgroundColor: "#F8FAFC",
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 14 }} />
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>Member settings</Text>
                    <Text style={{ fontSize: 13, color: "#64748B", marginTop: 3 }} numberOfLines={1}>
                      {displayName}
                    </Text>
                    <View
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 8,
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: "#EEF2FF",
                        borderWidth: 1,
                        borderColor: "#C7D2FE",
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.4, color: "#4338CA" }}>
                        {roleLabel(profileMember.role).toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setManageOpen(false)} hitSlop={12} testID="member-settings-close" style={{ paddingTop: 2 }}>
                    <X size={20} color="#64748B" />
                  </Pressable>
                </View>
              </View>

              <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 }}>
                <ProfileSection title="Actions">
                  <ProfileCard>
                    {member && myRole === "owner" && member.role === "team_leader" ? (
                      <>
                        <ManageActionRow
                          icon={Shield}
                          title="Remove team leader access"
                          subtitle="Return this person to a standard member role"
                          trailing={setRoleMutation.isPending ? <ActivityIndicator size="small" color="#6366F1" /> : undefined}
                          onPress={() => {
                            Alert.alert(
                              "Remove team leader access",
                              `Remove team leader access from ${member.user.name}? They will become a regular member.`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Confirm",
                                  onPress: () => setRoleMutation.mutate({ userId: member.userId, role: "member" }),
                                },
                              ],
                            );
                          }}
                          testID="demote-team-leader"
                        />
                        <ProfileDivider inset />
                      </>
                    ) : null}

                    {member && myRole === "owner" && member.role === "member" ? (
                      <>
                        <ManageActionRow
                          icon={Crown}
                          title="Promote to team leader"
                          subtitle="Grant leadership access for this workplace"
                          trailing={setRoleMutation.isPending ? <ActivityIndicator size="small" color="#6366F1" /> : undefined}
                          onPress={() => {
                            Alert.alert(
                              "Promote to team leader",
                              `Give ${member.user.name} team leader access for this workplace?`,
                              [
                                { text: "Cancel", style: "cancel" },
                                {
                                  text: "Confirm",
                                  onPress: () => setRoleMutation.mutate({ userId: member.userId, role: "team_leader" }),
                                },
                              ],
                            );
                          }}
                          testID="promote-team-leader"
                        />
                        <ProfileDivider inset />
                      </>
                    ) : null}

                    {member && (myRole === "owner" || myRole === "team_leader") && member.role !== "owner" ? (
                      <ManageActionRow
                        icon={UserMinus}
                        title="Remove from workplace"
                        subtitle="Revoke access to this workplace immediately"
                        destructive
                        onPress={() => handleRemove(member)}
                        testID="remove-member"
                      />
                    ) : null}
                  </ProfileCard>
                </ProfileSection>
              </View>

              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 12,
                  paddingBottom: Math.max(16, insets.bottom),
                  borderTopWidth: 1,
                  borderTopColor: "#EEF2F6",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Pressable
                  onPress={() => setManageOpen(false)}
                  style={{
                    paddingVertical: 12,
                    borderRadius: 10,
                    backgroundColor: "#0F172A",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "700", color: "#FFFFFF", fontSize: 14 }}>Done</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
