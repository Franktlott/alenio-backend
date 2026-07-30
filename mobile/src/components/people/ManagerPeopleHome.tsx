import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Copy,
  HeartPulse,
  Search,
  Settings2,
  UserPlus,
  Users,
} from "lucide-react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import type { Team, TeamMember } from "@/lib/types";
import type { MemberStatsPayload } from "@/lib/workplace-standards";
import { memberMatchesUserId } from "@/lib/member-identity";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";
import { TeamMemberRow, TeamMemberRowSkeleton } from "@/components/TeamMemberRow";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { PendingInvitesChip } from "@/components/PendingInvitesSheet";
import { brandGradient, colors, radii, space } from "@/theme";

export type PeopleFilter = "all" | "checkInDue" | "goalsMissing" | "overdueTasks";

type FormerMemberRow = {
  userId: string;
  user: TeamMember["user"];
  isFormer: true;
};

type Props = {
  team: Team | undefined;
  members: TeamMember[];
  formerMembers: FormerMemberRow[];
  myId: string;
  myEmail: string;
  isPaid: boolean;
  isOwner: boolean;
  showSkeletons: boolean;
  memberStats?: MemberStatsPayload["stats"];
  checkInRequired: boolean;
  goalsRequired: boolean;
  memberCount: number;
  checkInsDueCount: number;
  teamHealthPct: number | null;
  uploadingTeamImage: boolean;
  pendingApprovalCount: number;
  pendingInviteCount: number;
  contentBottomPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onInvite: () => void;
  onCopyCode: () => void;
  onOpenPhotoMenu: () => void;
  onOpenInsights: () => void;
  onOpenJoinRequests: () => void;
  onOpenPendingInvites: () => void;
  onOpenWorkspaceSettings: () => void;
  canViewMemberProfile: (targetUserId: string, targetRole: string) => boolean;
  canManageMember: (targetUserId: string, targetRole: string) => boolean;
};

const FILTERS: { key: PeopleFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "checkInDue", label: "Check-in due" },
  { key: "goalsMissing", label: "Goals missing" },
  { key: "overdueTasks", label: "Overdue tasks" },
];

export function ManagerPeopleHome({
  team,
  members,
  formerMembers,
  myId,
  myEmail,
  isPaid,
  isOwner,
  showSkeletons,
  memberStats,
  checkInRequired,
  goalsRequired,
  memberCount,
  checkInsDueCount,
  teamHealthPct,
  uploadingTeamImage,
  pendingApprovalCount,
  pendingInviteCount,
  contentBottomPad,
  refreshing,
  onRefresh,
  onInvite,
  onCopyCode,
  onOpenPhotoMenu,
  onOpenInsights,
  onOpenJoinRequests,
  onOpenPendingInvites,
  onOpenWorkspaceSettings,
  canViewMemberProfile,
  canManageMember,
}: Props) {
  const [filter, setFilter] = useState<PeopleFilter>("all");
  const [query, setQuery] = useState("");
  const [formerOpen, setFormerOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (q) {
        const name = (m.user.name ?? "").toLowerCase();
        const email = (m.user.email ?? "").toLowerCase();
        if (!name.includes(q) && !email.includes(q)) return false;
      }
      if (filter === "all" || !isPaid) return true;
      const stats = memberStats?.[m.userId];
      const compliance = stats?.standardsCompliance;
      if (filter === "checkInDue") {
        const status = compliance?.checkInStatus;
        return status === "due_soon" || status === "overdue";
      }
      if (filter === "goalsMissing") {
        return compliance?.goalsStatus === "missing_goals";
      }
      if (filter === "overdueTasks") {
        return (stats?.overdueTasks ?? 0) > 0;
      }
      return true;
    });
  }, [members, query, filter, isPaid, memberStats]);

  const openProfile = (userId: string) => {
    router.push({
      pathname: "/member-profile",
      params: { teamId: team?.id ?? "", memberUserId: userId },
    });
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: space.pagePad,
        paddingTop: 10,
        paddingBottom: contentBottomPad,
        gap: 12,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" colors={["#4361EE"]} />
      }
      testID="manager-people-home"
    >
      <View style={styles.heroWrap}>
        <LinearGradient
          colors={[...brandGradient.colors]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <TouchableOpacity
              onPress={onOpenPhotoMenu}
              disabled={uploadingTeamImage}
              testID="team-photo-button"
              style={{ position: "relative" }}
            >
              <View style={styles.heroAvatar}>
                {uploadingTeamImage ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <WorkspaceTeamAvatar
                    team={{ name: team?.name ?? "Workspace", image: team?.image ?? null }}
                    size={44}
                    radius={22}
                    backgroundColor="rgba(255,255,255,0.20)"
                    textColor="#FFFFFF"
                    borderColor="transparent"
                  />
                )}
              </View>
              <View style={styles.cameraBadge}>
                <Camera size={9} color="white" />
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.heroTitle} numberOfLines={1}>
                {team?.name ?? "Team"}
              </Text>
              <Pressable onPress={onCopyCode} style={styles.codeRow} testID="copy-invite-code" hitSlop={8}>
                <Text style={styles.codeText}>{team?.inviteCode}</Text>
                <Copy size={12} color="rgba(255,255,255,0.85)" />
              </Pressable>
            </View>

            <Pressable onPress={onInvite} style={styles.inviteBtn} testID="share-invite-code">
              <UserPlus size={16} color="white" />
              <Text style={styles.inviteLabel}>Invite</Text>
            </Pressable>
          </View>

          {isPaid ? (
            <>
              <View style={styles.heroDivider} />
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Users size={12} color="#FFFFFF" strokeWidth={2.25} />
                  <Text style={styles.statValue}>{memberCount}</Text>
                  <Text style={styles.statLabel}>Members</Text>
                </View>
                {checkInRequired ? (
                  <>
                    <View style={styles.statRule} />
                    <View style={styles.stat}>
                      <Text style={styles.statValue}>{checkInsDueCount}</Text>
                      <Text style={styles.statLabel}>Check-ins due</Text>
                    </View>
                  </>
                ) : null}
                <View style={styles.statRule} />
                <Pressable style={styles.stat} onPress={onOpenInsights} testID="team-health-stat">
                  <HeartPulse size={12} color="#FFFFFF" strokeWidth={2.25} />
                  <Text style={styles.statValue}>
                    {teamHealthPct == null ? "—" : `${teamHealthPct}%`}
                  </Text>
                  <Text style={styles.statLabel}>Team health</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </LinearGradient>
      </View>

      {isOwner ? (
        <Pressable
          onPress={onOpenWorkspaceSettings}
          style={({ pressed }) => [styles.settingsRow, pressed ? { opacity: 0.75 } : null]}
          testID="people-workplace-settings"
        >
          <Settings2 size={15} color={colors.brand} />
          <Text style={styles.settingsText}>Workplace settings</Text>
          <ChevronRight size={16} color="#CBD5E1" />
        </Pressable>
      ) : null}

      {pendingApprovalCount > 0 || pendingInviteCount > 0 ? (
        <View style={styles.chipsRow}>
          {pendingApprovalCount > 0 ? (
            <Pressable onPress={onOpenJoinRequests} style={styles.chip} testID="pending-join-requests-chip">
              <UserPlus size={12} color="#4338CA" />
              <Text style={styles.chipText}>
                {pendingApprovalCount === 1 ? "1 request" : `${pendingApprovalCount} requests`}
              </Text>
            </Pressable>
          ) : null}
          <PendingInvitesChip count={pendingInviteCount} onPress={onOpenPendingInvites} />
        </View>
      ) : null}

      <View style={styles.searchWrap}>
        <Search size={15} color="#94A3B8" />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search people"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          testID="people-search-input"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {isPaid ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          testID="people-filter-chips"
        >
          {FILTERS.filter((f) => {
            if (f.key === "checkInDue" && !checkInRequired) return false;
            if (f.key === "goalsMissing" && !goalsRequired) return false;
            return true;
          }).map((f) => {
            const active = filter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setFilter(f.key)}
                style={[styles.filterChip, active ? styles.filterChipActive : null]}
                testID={`people-filter-${f.key}`}
              >
                <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <Text style={styles.sectionLabel}>
        People · {filtered.length}
        {filter !== "all" || query.trim() ? ` of ${members.length}` : ""}
      </Text>

      {showSkeletons || filtered.length > 0 ? (
        <ProfileCard>
          {showSkeletons
            ? Array.from({ length: 5 }, (_, index) => (
                <TeamMemberRowSkeleton
                  key={`people-skeleton-${index}`}
                  paid={isPaid}
                  showDivider={index < 4}
                />
              ))
            : filtered.map((item, index) => {
                const stats = memberStats?.[item.userId];
                const compliance = stats?.standardsCompliance;
                const isCurrentUser = memberMatchesUserId(item, myId, myEmail);
                const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
                const canOpenManagement = !isPaid && canManageMember(item.userId, item.role);
                const isPressable = hasProfilePermission || canOpenManagement;

                return (
                  <TeamMemberRow
                    key={item.id}
                    name={item.user.name ?? "Member"}
                    role={item.role}
                    image={item.user.image}
                    isCurrentUser={isCurrentUser}
                    showMetrics={isPaid}
                    hasProfilePermission={hasProfilePermission}
                    checkInValue={formatDaysSinceCheckIn(stats?.daysSinceLastOneOnOne)}
                    goalsValue={compliance?.goalsDisplay ?? "—"}
                    completedTasks={stats?.completedTasks ?? 0}
                    activeTasks={stats?.activeTasks ?? 0}
                    overdueTasks={stats?.overdueTasks ?? 0}
                    checkInStatus={compliance?.checkInStatus}
                    goalsStatus={compliance?.goalsStatus}
                    showCheckInMetric={checkInRequired}
                    showGoalsMetric={goalsRequired}
                    showDivider={index < filtered.length - 1}
                    onPress={isPressable ? () => openProfile(item.userId) : undefined}
                    testID={`member-row-${item.userId}`}
                  />
                );
              })}
        </ProfileCard>
      ) : (
        <ProfileCard>
          <View style={{ paddingVertical: 28, alignItems: "center", paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 4 }}>
              {query.trim() || filter !== "all" ? "No matches" : "No members yet"}
            </Text>
            <Text style={{ fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
              {query.trim() || filter !== "all"
                ? "Try a different search or filter."
                : "Invite teammates with your workspace code."}
            </Text>
          </View>
        </ProfileCard>
      )}

      {formerMembers.length > 0 ? (
        <View>
          <Pressable
            onPress={() => setFormerOpen((v) => !v)}
            style={styles.formerToggle}
            testID="former-members-toggle"
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
                  onPress={() => openProfile(former.userId)}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    borderTopWidth: index === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: "#F1F5F9",
                    backgroundColor: pressed ? "rgba(15, 23, 42, 0.03)" : undefined,
                  })}
                  testID={`former-member-row-${former.userId}`}
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
  );
}

const styles = StyleSheet.create({
  heroWrap: {
    borderRadius: radii.lg,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(67, 97, 238, 0.14)",
  },
  hero: {
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.20)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cameraBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.28)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.50)",
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
    letterSpacing: -0.2,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 3,
    alignSelf: "flex-start",
  },
  codeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "rgba(255,255,255,0.94)",
    letterSpacing: 1.4,
  },
  inviteBtn: {
    alignItems: "center",
    gap: 2,
    flexShrink: 0,
  },
  inviteLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "rgba(255,255,255,0.92)",
  },
  heroDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginTop: 12,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  stat: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
    gap: 2,
  },
  statRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.35)",
    marginVertical: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 17,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
    textAlign: "center",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  settingsText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.sm,
    minHeight: 28,
    gap: 4,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4338CA",
  },
  searchWrap: {
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
    gap: 8,
    paddingRight: 4,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E2E8F0",
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 2,
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
});
