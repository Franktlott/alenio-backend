import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, ChevronDown, ChevronRight, Search, UserPlus } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { isLeaderRole, memberMatchesUserId } from "@/lib/member-identity";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { isPersistedPaidPlan } from "@/lib/plan-access-copy";
import type { Team, TeamMember } from "@/lib/types";
import type {
  MemberStatsPayload,
  MemberStatsRow,
  MemberStandardsCompliance,
} from "@/lib/workplace-standards";
import { TeamMemberRowSkeleton } from "@/components/TeamMemberRow";
import { UserAvatar } from "@/components/UserAvatar";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { AppPageBackground } from "@/components/AppPageBackground";
import { colors, radii, space } from "@/theme";

type RoleFilter = "all" | "team_leader" | "member";

type FormerMemberRow = {
  userId: string;
  user: TeamMember["user"];
  isFormer: true;
};

const ROLE_CHIPS: { key: RoleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "team_leader", label: "Leaders" },
  { key: "member", label: "Members" },
];

function roleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  return "Member";
}

function checkInPresentation(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
): { label: string; color: string; ring: string } {
  if (status === "on_track") {
    return { label: "Checked in", color: "#128A52", ring: "#10B981" };
  }
  if (status === "due_soon") {
    return { label: "Due soon", color: "#D97706", ring: "#F59E0B" };
  }
  if (status === "overdue") {
    return { label: "Needs check-in", color: "#DC2626", ring: "#EF4444" };
  }
  return { label: "No check-in schedule", color: "#8B95A5", ring: "#CBD5E1" };
}

function DirectoryMemberRow({
  member,
  stats,
  isCurrentUser,
  canOpen,
  onPress,
  showDivider,
}: {
  member: TeamMember;
  stats?: MemberStatsRow;
  isCurrentUser: boolean;
  canOpen: boolean;
  onPress: () => void;
  showDivider: boolean;
}) {
  const status = checkInPresentation(stats?.standardsCompliance?.checkInStatus);
  const content = (
    <View
      style={[
        styles.memberRow,
        showDivider ? styles.memberRowDivider : null,
      ]}
    >
      <View style={[styles.memberAvatarRing, { borderColor: status.ring }]}>
        <UserAvatar
          user={member.user}
          size={36}
          radius={18}
          backgroundColor="#4361EE"
          textColor="#FFFFFF"
          fontSize={12}
        />
      </View>
      <View style={styles.memberCopy}>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.user.name?.trim() || "Member"}
          {isCurrentUser ? " (you)" : ""}
        </Text>
        <Text style={styles.memberRole}>{roleLabel(member.role)}</Text>
      </View>
      <Text style={[styles.memberStatus, { color: status.color }]} numberOfLines={1}>
        {status.label}
      </Text>
      {canOpen ? <ChevronRight size={15} color="#CBD5E1" strokeWidth={2.2} /> : null}
    </View>
  );

  if (!canOpen) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.72 } : undefined)}
    >
      {content}
    </Pressable>
  );
}

export default function TeamDirectoryScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const params = useLocalSearchParams<{ teamId?: string }>();
  const teamId = typeof params.teamId === "string" ? params.teamId : "";
  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = isPersistedPaidPlan(plan);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [formerOpen, setFormerOpen] = useState(false);

  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; image: string | null }>("/api/me"),
    enabled: !!session?.user,
  });

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { data: memberStatsPayload, isLoading: statsLoading } = useQuery({
    queryKey: ["member-stats", teamId],
    queryFn: () => api.get<MemberStatsPayload>(`/api/teams/${teamId}/tasks/member-stats`),
    enabled: !!teamId && isPaid,
  });

  const myEmail = meProfile?.email || session?.user?.email || "";
  const resolvedUserId = meProfile?.id || session?.user?.id || "";
  const myId =
    team?.members?.find((m) => memberMatchesUserId(m, resolvedUserId, myEmail))?.userId ||
    resolvedUserId;
  const myRole = (team as Team & { role?: string } | undefined)?.role;
  const isOwnerOrLeader = isLeaderRole(myRole);
  const members = useMemo(() => {
    const unique = new Map<string, TeamMember>();
    const roleRank: Record<TeamMember["role"], number> = {
      owner: 3,
      team_leader: 2,
      member: 1,
    };
    for (const member of team?.members ?? []) {
      const existing = unique.get(member.userId);
      if (!existing || roleRank[member.role] > roleRank[existing.role]) {
        unique.set(member.userId, member);
      }
    }
    return [...unique.values()];
  }, [team?.members]);

  const { data: formerMembers = [] } = useQuery({
    queryKey: ["former-members", teamId],
    queryFn: () => api.get<FormerMemberRow[]>(`/api/teams/${teamId}/former-members`),
    enabled: !!teamId && isPaid && isOwnerOrLeader,
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = members.filter((m) => {
      if (roleFilter === "team_leader" && m.role !== "team_leader" && m.role !== "owner") {
        return false;
      }
      if (roleFilter === "member" && m.role !== "member") return false;
      if (!q) return true;
      const name = (m.user.name ?? "").toLowerCase();
      const email = (m.user.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });

    return [...list].sort((a, b) => {
      const aSelf = memberMatchesUserId(a, myId, myEmail);
      const bSelf = memberMatchesUserId(b, myId, myEmail);
      if (aSelf && !bSelf) return -1;
      if (!aSelf && bSelf) return 1;
      return (a.user.name ?? "").localeCompare(b.user.name ?? "");
    });
  }, [members, query, roleFilter, myId, myEmail]);

  const canViewMemberProfile = (targetUserId: string, targetRole: string) => {
    if (!myId || targetUserId === myId) return true;
    if (targetRole === "owner") return false;
    return isLeaderRole(myRole);
  };

  const canManageMember = (targetUserId: string, targetRole: string) => {
    if (!myRole || (myRole !== "owner" && myRole !== "team_leader")) return false;
    if (targetRole === "owner") return false;
    if (myRole === "team_leader" && targetRole !== "member") return false;
    return targetUserId !== myId;
  };

  const showSkeletons = teamLoading || (isPaid && statsLoading && !memberStatsPayload);

  if (!teamId) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <AppPageBackground />
        <Text style={styles.empty}>Missing workspace</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]} testID="team-directory-screen">
      <AppPageBackground />
      <View style={styles.topBar}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(app)/team"))}
          style={styles.iconBtn}
          testID="team-directory-back"
        >
          <ArrowLeft size={20} color="#0F172A" strokeWidth={2.25} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Team directory</Text>
          <Text style={styles.subtitle}>
            {members.length} member{members.length === 1 ? "" : "s"}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Search size={15} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search members…"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          testID="directory-search-input"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {ROLE_CHIPS.map((chip) => {
          const active = roleFilter === chip.key;
          return (
            <Pressable
              key={chip.key}
              onPress={() => setRoleFilter(chip.key)}
              style={[styles.filterChip, active ? styles.filterChipActive : null]}
              testID={`directory-filter-${chip.key}`}
            >
              <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: space.pagePad,
          paddingBottom: Math.max(insets.bottom, 12) + 88,
          gap: 12,
          paddingTop: 8,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {showSkeletons ? (
          <ProfileCard>
            {Array.from({ length: 5 }, (_, index) => (
              <TeamMemberRowSkeleton
                key={`dir-skel-${index}`}
                paid={isPaid}
                showDivider={index < 4}
              />
            ))}
          </ProfileCard>
        ) : filtered.length === 0 ? (
          <ProfileCard>
            <View style={{ paddingVertical: 28, alignItems: "center", paddingHorizontal: 16 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>No matches</Text>
              <Text style={{ marginTop: 4, fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
                Try a different search or filter.
              </Text>
            </View>
          </ProfileCard>
        ) : (
          <ProfileCard>
            {filtered.map((item, index) => {
              const stats = memberStatsPayload?.stats?.[item.userId];
              const isCurrentUser = memberMatchesUserId(item, myId, myEmail);
              const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
              const canOpenManagement = !isPaid && canManageMember(item.userId, item.role);
              const isPressable = hasProfilePermission || canOpenManagement;
              return (
                <DirectoryMemberRow
                  key={item.userId}
                  member={item}
                  stats={stats}
                  isCurrentUser={isCurrentUser}
                  canOpen={isPressable}
                  showDivider={index < filtered.length - 1}
                  onPress={() =>
                    router.push({
                      pathname: "/member-profile",
                      params: { teamId, memberUserId: item.userId },
                    })
                  }
                />
              );
            })}
          </ProfileCard>
        )}

        {isOwnerOrLeader && formerMembers.length > 0 ? (
          <View>
            <Pressable
              onPress={() => setFormerOpen((v) => !v)}
              style={styles.formerToggle}
              testID="directory-former-toggle"
            >
              <Text style={styles.formerLabel}>Former members ({formerMembers.length})</Text>
              <ChevronDown
                size={14}
                color="#8B95A5"
                style={{ transform: [{ rotate: formerOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            {formerOpen ? (
              <ProfileCard style={{ marginTop: 6 }}>
                {formerMembers.map((former, index) => (
                  <Pressable
                    key={former.userId}
                    onPress={() =>
                      router.push({
                        pathname: "/member-profile",
                        params: { teamId, memberUserId: former.userId },
                      })
                    }
                    style={({ pressed }) => ({
                      paddingVertical: 12,
                      paddingHorizontal: 14,
                      borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderTopColor: "#F1F5F9",
                      backgroundColor: pressed ? "rgba(15, 23, 42, 0.03)" : undefined,
                    })}
                    testID={`directory-former-${former.userId}`}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#64748B" }} numberOfLines={1}>
                      {former.user.name ?? former.user.email ?? "Member"}
                      <Text style={{ fontWeight: "500", color: "#94A3B8" }}> · archived check-ins</Text>
                    </Text>
                  </Pressable>
                ))}
              </ProfileCard>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {isOwnerOrLeader ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable
            onPress={() =>
              router.push({
                pathname: "/(app)/team",
                params: { openInvite: "1" },
              })
            }
            style={styles.footerBtnOutline}
            testID="directory-invite"
          >
            <UserPlus size={16} color={colors.brand} strokeWidth={2.5} />
            <Text style={styles.footerBtnOutlineText}>Invite team member</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: space.pagePad,
    paddingBottom: 10,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "#64748B",
  },
  empty: { marginTop: 40, textAlign: "center", color: "#64748B" },
  searchWrap: {
    marginHorizontal: space.pagePad,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: "#0F172A",
    padding: 0,
  },
  filterRow: {
    paddingHorizontal: space.pagePad,
    gap: 8,
    alignItems: "center",
  },
  filterScroll: {
    height: 38,
    maxHeight: 38,
    flexGrow: 0,
    flexShrink: 0,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  filterChipActive: {
    backgroundColor: colors.brandSoft,
    borderColor: "#C7D2FE",
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#64748B",
  },
  filterChipTextActive: {
    color: colors.brand,
  },
  memberRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "#FFFFFF",
  },
  memberRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF1F5",
  },
  memberAvatarRing: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  memberRole: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: "#8B95A5",
  },
  memberStatus: {
    maxWidth: 92,
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "right",
  },
  formerToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  formerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B95A5",
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: space.pagePad,
    paddingTop: 10,
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
  },
  footerBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: colors.brand,
    backgroundColor: "#FFFFFF",
  },
  footerBtnOutlineText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.brand,
  },
});
