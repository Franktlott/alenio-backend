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
  CalendarDays,
  Check,
  ChevronRight,
  Flag,
  Info,
  Search,
  Star,
  UserPlus,
  X,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  AlenioSheetIcon,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import type { CalendarEvent, TeamMember, TeamRole } from "@/lib/types";
import { STARS_GOLD } from "@/lib/stars";
import { getWorkspaceRolePresentation } from "@/lib/workspace-permissions";
import { WS } from "@/components/workspace/workspace-ui";
import { colors, palette } from "@/theme";
import type {
  MemberStatsRow,
  WorkplaceStandards,
} from "@/lib/workplace-standards";
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
  /** Explains the role-aware destination of a member row. */
  memberPressHint?: string;
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

function shortCheckInLabel(
  event: CalendarEvent | undefined,
  daysSince: number | null | undefined,
  required: boolean,
): string {
  if (event) {
    const date = new Date(event.startDate);
    if (Number.isFinite(date.getTime())) {
      const today = new Date();
      if (
        date.getFullYear() === today.getFullYear() &&
        date.getMonth() === today.getMonth() &&
        date.getDate() === today.getDate()
      ) {
        return "Today";
      }
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
    }
  }
  if (!required) return "No check-in";
  if (daysSince == null) return "No check-in";
  if (daysSince === 0) return "Today";
  if (daysSince === 1) return "1 day ago";
  return `${daysSince} days ago`;
}

export function TeamDevelopmentCard({
  members,
  currentUserId,
  calendarEvents = [],
  memberStats,
  standards,
  onMemberPress,
  memberPressHint,
  lockOtherMembers = false,
  onManageMember,
  onInvite,
  selectedUserId,
  flush = false,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [starsInfoOpen, setStarsInfoOpen] = useState(false);
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
      {memberPressHint ? (
        <View style={styles.memberPressHint} testID="members-press-hint">
          <Text style={styles.memberPressHintText}>{memberPressHint}</Text>
        </View>
      ) : null}
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

      <Text style={styles.sectionTitle} testID="workspace-members-section-title">
        Workspace members
      </Text>

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
            const displayName =
              member.user.name?.trim() ||
              member.user.email.split("@")[0] ||
              "Member";
            const role = getWorkspaceRolePresentation(
              member.role as TeamRole,
            );
            const compliance = stats?.standardsCompliance;
            const checkInsRequired =
              standards.checkInRequired &&
              compliance?.checkInStatus !== "not_required";
            const goalCount = Math.max(0, stats?.activeDevGoals ?? 0);
            const goalText =
              goalCount === 1 ? "1 goal" : `${goalCount} goals`;
            const checkInText = shortCheckInLabel(
              nextCheckIns.get(member.userId),
              stats?.daysSinceLastOneOnOne,
              checkInsRequired,
            );
            const growth = Math.max(0, stats?.streak ?? 0);
            const selected =
              !!selectedUserId && selectedUserId === member.userId;
            const locked =
              lockOtherMembers && member.userId !== currentUserId;
            const isYou = member.userId === currentUserId;
            const row = (
              <>
                <View
                  style={[
                    styles.selectedAccent,
                    (!selected || locked) && styles.selectedAccentHidden,
                  ]}
                />
                <View
                  style={[styles.memberMain, locked && styles.memberLocked]}
                >
                  <UserAvatar
                    user={member.user}
                    size={36}
                    radius={18}
                    backgroundColor="#F1F5F9"
                    textColor="#334155"
                    fontSize={12}
                  />
                  <View style={styles.memberCopy}>
                    <View style={styles.nameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text
                        style={[
                          styles.rolePill,
                          {
                            color: role.badgeText,
                            backgroundColor: role.badgeBackground,
                          },
                        ]}
                      >
                        {role.shortLabel}
                      </Text>
                      {isYou ? (
                        <Text style={styles.youPill}>You</Text>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      <View style={styles.metaItem}>
                        <Flag
                          size={12}
                          color={palette.inkMuted}
                          strokeWidth={2.1}
                        />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {goalText}
                        </Text>
                      </View>
                      <Text style={styles.metaDot}>·</Text>
                      <View style={styles.metaItem}>
                        <CalendarDays
                          size={12}
                          color={palette.inkMuted}
                          strokeWidth={2.1}
                        />
                        <Text style={styles.metaText} numberOfLines={1}>
                          {checkInText}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {/* Stars stay visible for the whole team even when the
                      development menu is locked to managers + self. */}
                  <View
                    style={[
                      styles.growthBadge,
                      growth > 0 ? styles.growthBadgeActive : null,
                    ]}
                    pointerEvents="none"
                    testID={`team-development-growth-${member.userId}`}
                  >
                    <Star
                      size={12}
                      color={growth > 0 ? STARS_GOLD : "#C4B5A0"}
                      fill={growth > 0 ? STARS_GOLD : "transparent"}
                      strokeWidth={2.2}
                    />
                    <Text
                      style={[
                        styles.growthValue,
                        growth > 0 ? styles.growthValueActive : null,
                      ]}
                      numberOfLines={1}
                    >
                      {String(growth)}
                    </Text>
                  </View>
                  {isYou && !locked ? (
                    <ChevronRight
                      size={16}
                      color="#94A3B8"
                      strokeWidth={2.2}
                    />
                  ) : null}
                </View>
              </>
            );
            return locked ? (
              <View
                key={member.userId}
                style={styles.memberCard}
                accessibilityRole="text"
                accessibilityLabel={`${displayName}, ${growth} ${growth === 1 ? "star" : "stars"}`}
                testID={`team-development-member-${member.userId}`}
              >
                {row}
              </View>
            ) : (
              <Pressable
                key={member.userId}
                onPress={() => onMemberPress(member)}
                onLongPress={
                  onManageMember ? () => onManageMember(member) : undefined
                }
                style={[
                  styles.memberCard,
                  selected && styles.memberCardSelected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Open goals and check-ins for ${displayName}`}
                testID={`team-development-member-${member.userId}`}
              >
                {row}
              </Pressable>
            );
          })}
          </ScrollView>
        )}
        {sortedMembers.length > 0 ? (
          <View style={styles.starsFootnote} testID="members-stars-footnote">
            <View style={styles.starsFootnoteIcon}>
              <Star
                size={12}
                color={STARS_GOLD}
                fill={STARS_GOLD}
                strokeWidth={2.2}
              />
            </View>
            <View style={styles.starsFootnoteCopy}>
              <View style={styles.starsFootnoteTitleRow}>
                <Text style={styles.sparkleInline} accessibilityElementsHidden>
                  ✦
                </Text>
                <Text style={styles.starsFootnoteTitle}>Stars</Text>
                <Text style={styles.sparkleInline} accessibilityElementsHidden>
                  ★
                </Text>
                <View style={styles.sparkleTrail} accessibilityElementsHidden>
                  <Text style={styles.sparkleTrailGlyph}>✦</Text>
                  <Text style={[styles.sparkleTrailGlyph, styles.sparkleTrailDim]}>
                    ★
                  </Text>
                  <Text style={[styles.sparkleTrailGlyph, styles.sparkleTrailFaint]}>
                    ✦
                  </Text>
                </View>
                <View style={styles.starsFootnoteTitleSpacer} />
                <Pressable
                  onPress={() => setStarsInfoOpen(true)}
                  hitSlop={10}
                  style={styles.starsFootnoteInfo}
                  accessibilityRole="button"
                  accessibilityLabel="What counts for a star"
                  testID="members-stars-info"
                >
                  <Info size={13} color="#A08955" strokeWidth={2.2} />
                </Pressable>
              </View>
              <Text style={styles.starsFootnoteText}>
                Finish assigned tasks to earn stars. Higher counts mean more
                momentum.
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <AlenioBottomSheet
        visible={starsInfoOpen}
        title="What counts for a star"
        subtitle="Assigned workspace work fills stars and builds momentum."
        onClose={() => setStarsInfoOpen(false)}
        compact
        showCloseButton
        scrollEnabled={false}
        testID="members-stars-info-sheet"
        footer={
          <Pressable
            onPress={() => setStarsInfoOpen(false)}
            style={styles.starsInfoDone}
            accessibilityRole="button"
            accessibilityLabel="Got it"
            testID="members-stars-info-done"
          >
            <Text style={styles.starsInfoDoneText}>Got it</Text>
          </Pressable>
        }
      >
        <View style={styles.starsInfoBody}>
          <AlenioSheetCard tint="purple" compact>
            <View style={styles.starsInfoSection}>
              <AlenioSheetIcon color={palette.violet} compact>
                <Check size={14} color="#FFFFFF" strokeWidth={2.6} />
              </AlenioSheetIcon>
              <View style={styles.starsInfoCopy}>
                <Text style={styles.starsInfoHeading}>Counts</Text>
                <Text style={styles.starsInfoLine}>
                  Completing an assigned workspace task
                </Text>
              </View>
            </View>
          </AlenioSheetCard>

          <AlenioSheetCard tint="slate" compact>
            <View style={styles.starsInfoSection}>
              <AlenioSheetIcon color="#94A3B8" compact>
                <X size={14} color="#FFFFFF" strokeWidth={2.6} />
              </AlenioSheetIcon>
              <View style={styles.starsInfoCopy}>
                <Text style={styles.starsInfoHeading}>Doesn’t count</Text>
                <Text style={styles.starsInfoLine}>Personal reminders</Text>
                <Text style={styles.starsInfoLine}>
                  Tasks you weren’t assigned
                </Text>
                <Text style={styles.starsInfoLine}>Goals or check-ins</Text>
              </View>
            </View>
          </AlenioSheetCard>

          <View style={styles.starsInfoMilestone}>
            <Star
              size={14}
              color={STARS_GOLD}
              fill={STARS_GOLD}
              strokeWidth={2.2}
            />
            <Text style={styles.starsInfoMilestoneText}>
              Milestones land at 5, 10, 20, 50… then every +50.
            </Text>
          </View>
        </View>
      </AlenioBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
  },
  memberPressHint: {
    marginHorizontal: WS.pageGutter,
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EEF2F6",
  },
  memberPressHintText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    letterSpacing: -0.1,
    color: "#64748B",
  },
  // Mirrors the Tasks heading strip: same gutter, spacing, and type.
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: WS.pageGutter,
    paddingTop: 2,
    paddingBottom: 6,
  },
  sectionTitle: {
    paddingHorizontal: WS.pageGutter,
    paddingTop: 6,
    paddingBottom: 8,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: colors.textPrimary,
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
  memberLocked: { opacity: 0.78 },
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
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  memberName: {
    flexShrink: 1,
    fontSize: 14.5,
    lineHeight: 18,
    fontWeight: "800",
    color: palette.ink,
  },
  rolePill: {
    overflow: "hidden",
    flexShrink: 0,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    fontSize: 10.5,
    fontWeight: "700",
  },
  youPill: {
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 999,
    backgroundColor: palette.lilacSoft,
    color: palette.violet,
    fontSize: 10.5,
    fontWeight: "700",
  },
  metaRow: {
    marginTop: 3,
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 6,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  metaDot: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#D0CBD8",
  },
  metaText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: "600",
    color: palette.inkSecondary,
  },
  growthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#F7F5F1",
  },
  growthBadgeActive: {
    backgroundColor: "#FFF8EB",
  },
  growthValue: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#9A8F7E",
  },
  growthValueActive: {
    color: "#8A6419",
  },
  starsFootnote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: "auto",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EEF0F4",
    backgroundColor: "#FCFAF6",
  },
  starsFootnoteIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF8EB",
    marginTop: 1,
  },
  starsFootnoteCopy: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  starsFootnoteTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  starsFootnoteTitleSpacer: {
    flex: 1,
    minWidth: 8,
  },
  sparkleInline: {
    fontSize: 10,
    lineHeight: 12,
    color: "#C9A84A",
  },
  sparkleTrail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    marginLeft: 2,
  },
  sparkleTrailGlyph: {
    fontSize: 9,
    lineHeight: 11,
    color: "#D4B56A",
  },
  sparkleTrailDim: {
    opacity: 0.7,
    fontSize: 8,
  },
  sparkleTrailFaint: {
    opacity: 0.45,
    fontSize: 7,
  },
  starsFootnoteTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    color: "#8A6419",
  },
  starsFootnoteInfo: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  starsFootnoteText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "500",
    color: "#8490A4",
  },
  starsInfoBody: {
    gap: 10,
  },
  starsInfoSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  starsInfoCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  starsInfoHeading: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#111A2B",
  },
  starsInfoLine: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#5B6475",
  },
  starsInfoMilestone: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  starsInfoMilestoneText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
    color: "#8A6419",
  },
  starsInfoDone: {
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.violet,
  },
  starsInfoDoneText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
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
