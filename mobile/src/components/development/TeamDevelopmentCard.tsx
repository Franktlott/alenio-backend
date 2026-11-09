import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock,
  Lock,
  Minus,
  MoreHorizontal,
  Search,
  UserPlus,
} from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { CalendarEvent, TeamMember, TeamRole } from "@/lib/types";
import { getWorkspaceRolePresentation } from "@/lib/workspace-permissions";
import { WS } from "@/components/workspace/workspace-ui";
import { colors } from "@/theme";
import type {
  MemberStatsRow,
  WorkplaceStandards,
} from "@/lib/workplace-standards";
import { memberDevelopmentStatus } from "@/lib/member-development-preview";
import {
  nextCheckInByMember,
  sortDevelopmentMembers,
} from "@/lib/development-overview";

type Props = {
  members: TeamMember[];
  currentUserId: string | null;
  calendarEvents?: CalendarEvent[];
  memberStats?: Record<string, MemberStatsRow>;
  standards: WorkplaceStandards;
  onMemberPress: (member: TeamMember) => void;
  /**
   * Regular members can open only their own row. Everyone else is faded and
   * locked, because their goals and check-ins are not available.
   */
  lockOtherMembers?: boolean;
  /** Omitted for viewers who cannot manage anyone, which hides the row menu. */
  onManageMember?: (member: TeamMember) => void;
  /** Omitted for viewers who cannot invite. */
  onInvite?: () => void;
  /**
   * Marks the row whose detail is open beside the list. Only a split layout
   * has somewhere to show that, so a stacked layout leaves this unset.
   */
  selectedUserId?: string | null;
  /**
   * The split page already draws the shared pane card, so this list drops its
   * own box instead of sitting a card inside a card.
   */
  flush?: boolean;
};

const STATUS_TONES = {
  on_track: { color: "#059669", background: "#ECFDF5" },
  due_soon: { color: "#D97706", background: "#FFF7ED" },
  needs_attention: { color: "#DC2626", background: "#FEF2F2" },
  not_required: { color: "#64748B", background: "#F1F5F9" },
  unavailable: { color: "#64748B", background: "#F1F5F9" },
} as const;

/**
 * Each state gets its own shape, not just its own colour, so the row still
 * reads for anyone who cannot separate the red from the amber.
 */
const STATUS_ICONS = {
  on_track: Check,
  due_soon: Clock,
  needs_attention: AlertCircle,
  not_required: Minus,
  unavailable: Minus,
} as const;

function shortCheckInDate(event: CalendarEvent | undefined): string {
  if (!event) return "";
  const date = new Date(event.startDate);
  if (!Number.isFinite(date.getTime())) return "";
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return "Today";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TeamDevelopmentCard({
  members,
  currentUserId,
  calendarEvents = [],
  memberStats,
  standards,
  onMemberPress,
  lockOtherMembers = false,
  onManageMember,
  onInvite,
  selectedUserId,
  flush = false,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const sortedMembers = sortDevelopmentMembers(
    members,
    memberStats,
    standards,
  );
  const query = searchQuery.trim().toLowerCase();
  const visibleMembers = query
    ? sortedMembers.filter((member) => {
        const name = member.user.name?.toLowerCase() ?? "";
        const email = member.user.email.toLowerCase();
        return name.includes(query) || email.includes(query);
      })
    : sortedMembers;
  const nextCheckIns = nextCheckInByMember(calendarEvents);
  const [memberListHeight, setMemberListHeight] = useState(0);
  const [memberListContentHeight, setMemberListContentHeight] = useState(0);
  const memberListScrollable =
    memberListContentHeight > memberListHeight + 1;

  return (
    <View style={styles.page} testID="team-development-card">
      {/* The Members tab names the page, so only the controls sit up here. */}
      <View style={styles.titleRow}>
        {/* Nothing to search in an empty workspace; Invite still needs the row. */}
        {sortedMembers.length === 0 ? (
          <View style={styles.searchSpacer} />
        ) : (
        <View style={styles.searchControl} testID="member-search-control">
          <Search size={13} color="#8A96A8" strokeWidth={2.1} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search members..."
            placeholderTextColor="#8A96A8"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.searchInput}
            accessibilityLabel="Search members"
            testID="member-search-input"
          />
        </View>
        )}
        {onInvite ? (
          <Pressable
            onPress={onInvite}
            hitSlop={8}
            style={styles.inviteButton}
            accessibilityRole="button"
            accessibilityLabel="Invite a member"
            testID="team-development-invite"
          >
            <UserPlus size={13} color="#FFFFFF" strokeWidth={2.8} />
            <Text style={styles.inviteLabel}>Invite</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.card, flush ? styles.cardFlush : null]}>
        {visibleMembers.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>
            {query ? "No matches" : "No members yet"}
          </Text>
          <Text style={styles.emptyText}>
            {query
              ? `Nobody here matches "${searchQuery.trim()}".`
              : "Invite people to this workspace to track their goals and check-ins."}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.memberList}
          contentContainerStyle={styles.memberListContent}
          nestedScrollEnabled
          scrollEnabled={memberListScrollable}
          showsVerticalScrollIndicator={memberListScrollable}
          persistentScrollbar={memberListScrollable}
          onLayout={(event) =>
            setMemberListHeight(event.nativeEvent.layout.height)
          }
          onContentSizeChange={(_, height) =>
            setMemberListContentHeight(height)
          }
        >
          {visibleMembers.map((member) => {
            const stats = memberStats?.[member.userId];
            const status = memberDevelopmentStatus(stats, standards);
            const tone = STATUS_TONES[status.level];
            const StatusIcon = STATUS_ICONS[status.level];
            const displayName =
              member.user.name?.trim() ||
              member.user.email.split("@")[0] ||
              "Member";
            const roleLabel = getWorkspaceRolePresentation(
              member.role as TeamRole,
            ).shortLabel;
            const compliance = stats?.standardsCompliance;
            const goalsRequired =
              standards.goalsRequired &&
              compliance?.goalsStatus !== "not_required";
            const checkInsRequired =
              standards.checkInRequired &&
              compliance?.checkInStatus !== "not_required";

            // What someone actually has beats what the workspace asks of them,
            // so a real count or a booked date always wins. "Optional" only
            // fills the gap where there would otherwise be a bare zero that
            // reads like a failing.
            const goalCount = Math.max(0, stats?.activeDevGoals ?? 0);
            const goalText =
              goalCount > 0
                ? `${goalCount} ${goalCount === 1 ? "goal" : "goals"}`
                : goalsRequired
                  ? "0 goals"
                  : "Goals optional";

            const nextCheckIn = nextCheckIns.get(member.userId);
            const nextDate = shortCheckInDate(nextCheckIn);
            const checkInStatus = nextDate
              ? `Next check-in ${nextDate}`
              : !checkInsRequired
                ? "Check-ins optional"
                : compliance?.checkInStatus === "overdue"
                  ? stats?.daysSinceLastOneOnOne == null
                    ? "No check-in yet"
                    : "Check-in overdue"
                  : compliance?.checkInStatus === "due_soon"
                    ? "Check-in due soon"
                    : "Check-ins current";
            const selected = !!selectedUserId && selectedUserId === member.userId;
            const locked =
              lockOtherMembers && member.userId !== currentUserId;
            const row = (
              <>
                {/* Reads as the open row even where the tint is too faint. */}
                <View
                  style={[
                    styles.selectedAccent,
                    (!selected || locked) && styles.selectedAccentHidden,
                  ]}
                />
                <View style={[styles.memberMain, locked && styles.memberLocked]}>
                <UserAvatar
                  user={member.user}
                  size={34}
                  radius={17}
                  backgroundColor="#EEEAFE"
                  textColor="#684BFF"
                  fontSize={11}
                />
                <View style={styles.memberCopy}>
                  <View style={styles.nameRow}>
                    <Text style={styles.memberName} numberOfLines={1}>
                      {displayName}
                    </Text>
                    {/* Kept out of the line below so a long email cannot
                        truncate the role away. */}
                    <View style={styles.rolePill}>
                      <Text style={styles.roleText}>{roleLabel}</Text>
                    </View>
                  </View>
                  {member.user.email ? (
                    <Text style={styles.memberIdentity} numberOfLines={1}>
                      {member.user.email}
                    </Text>
                  ) : null}
                  <Text style={styles.memberDetail} numberOfLines={1}>
                    {goalText} · {checkInStatus}
                  </Text>
                </View>
                {locked ? null : (
                  <View
                    style={[
                      styles.statusIcon,
                      { backgroundColor: tone.background },
                    ]}
                    accessible
                    accessibilityLabel={status.title}
                  >
                    <StatusIcon size={14} color={tone.color} strokeWidth={2.6} />
                  </View>
                )}
                </View>
                {locked ? (
                  <Lock size={16} color="#98A2B3" strokeWidth={2.4} />
                ) : onManageMember ? (
                  <Pressable
                    onPress={() => onManageMember(member)}
                    hitSlop={8}
                    style={styles.manageButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Manage ${displayName}`}
                    testID={`team-development-manage-${member.userId}`}
                  >
                    <MoreHorizontal size={16} color="#94A3B8" strokeWidth={2.2} />
                  </Pressable>
                ) : (
                  <ChevronRight size={15} color="#94A3B8" strokeWidth={2.2} />
                )}
              </>
            );
            return locked ? (
              <View
                key={member.userId}
                style={styles.memberCard}
                accessibilityRole="text"
                accessibilityLabel={`${displayName} is locked`}
                testID={`team-development-member-${member.userId}`}
              >
                {row}
              </View>
            ) : (
              <Pressable
                key={member.userId}
                onPress={() => onMemberPress(member)}
                style={[styles.memberCard, selected && styles.memberCardSelected]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Open ${displayName}'s development, ${status.title}`}
                testID={`team-development-member-${member.userId}`}
              >
                {row}
              </Pressable>
            );
          })}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
  },
  // Mirrors the Tasks heading strip: same gutter, spacing, and type.
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: WS.pageGutter,
    paddingTop: 8,
    paddingBottom: 6,
  },
  card: {
    flex: 1,
    minHeight: 0,
    marginHorizontal: WS.pageGutter,
    paddingTop: 7,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F3F5F8",
    backgroundColor: "#FFFFFF",
    shadowOpacity: 0,
    elevation: 0,
    overflow: "hidden",
  },
  cardFlush: {
    marginHorizontal: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
  },
  memberList: {
    flex: 1,
    minHeight: 0,
  },
  memberListContent: {
    paddingHorizontal: 10,
  },
  memberCard: {
    minHeight: 48,
    paddingHorizontal: 2,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F4F7",
  },
  memberMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  memberLocked: { opacity: 0.4 },
  memberCardSelected: {
    backgroundColor: "#EEF2FF",
    borderRadius: 10,
    borderBottomColor: "transparent",
  },
  selectedAccent: {
    width: 3,
    alignSelf: "stretch",
    marginVertical: 4,
    borderRadius: 2,
    backgroundColor: colors.brand,
  },
  /** Held in place rather than dropped, so rows never shift on selection. */
  selectedAccentHidden: {
    backgroundColor: "transparent",
  },
  memberCopy: {
    flex: 1,
    minWidth: 0,
  },
  // Matches the task search control so both tabs read the same.
  searchControl: {
    flex: 1,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#EEF2F6",
    backgroundColor: "#FFFFFF",
  },
  searchSpacer: {
    flex: 1,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    marginLeft: 6,
    paddingVertical: 0,
    fontSize: 13,
    color: WS.ink,
  },
  // Same pill as the "New" button on Tasks.
  inviteButton: {
    height: 32,
    paddingHorizontal: 11,
    borderRadius: 999,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inviteLabel: {
    marginLeft: 3,
    fontSize: 12.5,
    lineHeight: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  manageButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  // Matched to a task row, so a member reads at the same size as their work.
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  memberName: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    color: "#20283C",
  },
  // Deliberately quiet: it labels the person, it is not a status.
  rolePill: {
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    backgroundColor: "#F1F3F7",
  },
  roleText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
    color: "#6B7789",
  },
  memberIdentity: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: "#8490A4",
  },
  memberDetail: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: "#8490A4",
  },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    minHeight: 90,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#30384C",
  },
  emptyText: {
    marginTop: 3,
    fontSize: 9,
    color: "#8A94A8",
  },
});
