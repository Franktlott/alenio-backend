import React from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Linking,
} from "react-native";
import {
  BookOpen,
  Check,
  ChevronRight,
  ExternalLink,
  Search,
  UserPlus,
} from "lucide-react-native";
import { router } from "expo-router";
import type { Team, TeamMember } from "@/lib/types";
import { ProfileCard } from "@/components/profile/ProfileEnterpriseUI";
import { UserAvatar } from "@/components/UserAvatar";
import { formatTeamRole } from "@/components/WorkspaceTeamUI";
import { webBillingUrlForTeam } from "@/lib/plan-access-copy";
import { colors, radii, space, typography } from "@/theme";

const HELP_CENTER_URL = "https://alenio.com";
/** Enough to show the shape of the roster without turning this into the directory screen. */
const INLINE_MEMBER_LIMIT = 5;

const PRO_FEATURES = [
  "Check-ins",
  "Team health",
  "Goals & tracking",
  "Coaching insights",
] as const;

type Props = {
  team: Team | undefined;
  members: TeamMember[];
  myId: string;
  isOwner: boolean;
  isOwnerOrLeader: boolean;
  canViewMemberProfile: (targetUserId: string, targetRole: string) => boolean;
  contentBottomPad: number;
  refreshing: boolean;
  onRefresh: () => void;
  onInvite: () => void;
};

/** Team tab for workspaces without Pro: coaching upsell, roster, and a way in to help. */
export function FreePlanTeamHome({
  team,
  members,
  myId,
  isOwner,
  isOwnerOrLeader,
  canViewMemberProfile,
  contentBottomPad,
  refreshing,
  onRefresh,
  onInvite,
}: Props) {
  const teamId = team?.id ?? "";
  const memberCount = members.length;
  const visibleMembers = members.slice(0, INLINE_MEMBER_LIMIT);
  const hiddenMemberCount = Math.max(0, memberCount - visibleMembers.length);

  const openDirectory = () => {
    router.push({ pathname: "/team-directory", params: { teamId } });
  };

  const openMemberProfile = (userId: string) => {
    router.push({
      pathname: "/member-profile",
      params: { teamId, memberUserId: userId },
    });
  };

  const openWorkspaceManagement = async () => {
    const url = webBillingUrlForTeam(teamId || undefined, { subscribe: true });
    try {
      if (await Linking.canOpenURL(url)) {
        await Linking.openURL(url);
        return;
      }
    } catch {
      // Fall back to the in-app plan screen below.
    }
    router.push("/account-hub");
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: space.pagePad,
        paddingTop: 10,
        paddingBottom: contentBottomPad,
        gap: space.section,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} colors={[colors.brand]} />
      }
      testID="free-plan-team-home"
    >
      <View style={styles.upsellCard}>
        <View style={styles.planBadge}>
          <Text style={styles.planBadgeText}>FREE PLAN</Text>
        </View>

        <View style={styles.upsellBody}>
          <Image
            source={require("@/assets/team-upgrade-people.png")}
            style={styles.upsellArt}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
          <View style={styles.upsellCopy}>
            <Text style={styles.upsellTitle}>Unlock team coaching</Text>
            <Text style={styles.upsellText}>
              The Free plan includes the team directory so you can connect with your people.
              {isOwner
                ? " Upgrade to Pro to coach, set goals, track progress, and get team insights."
                : " Pro adds coaching, goals, progress tracking, and team insights."}
            </Text>
          </View>
        </View>

        <View style={styles.featureGrid}>
          {PRO_FEATURES.map((feature) => (
            <View key={feature} style={styles.featureItem}>
              <Check size={12} color={colors.brandAccent} strokeWidth={3} />
              <Text style={styles.featureText} numberOfLines={1}>
                {feature}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.upsellActions}>
          <Pressable
            onPress={() => router.push("/account-hub")}
            style={({ pressed }) => [styles.primaryBtn, pressed ? styles.pressed : null]}
            accessibilityRole="button"
            accessibilityLabel="See Pro features"
            testID="team-upsell-see-pro"
          >
            <Text style={styles.primaryBtnText}>See Pro features</Text>
          </Pressable>

          {isOwner ? (
            <Pressable
              onPress={() => void openWorkspaceManagement()}
              style={({ pressed }) => [styles.secondaryBtn, pressed ? styles.pressed : null]}
              accessibilityRole="button"
              accessibilityLabel="Manage workspace"
              testID="team-upsell-manage-workspace"
            >
              <ExternalLink size={13} color={colors.brand} strokeWidth={2.3} />
              <Text style={styles.secondaryBtnText}>Manage workspace</Text>
            </Pressable>
          ) : null}
        </View>

        {isOwner ? null : (
          <Text style={styles.ownerHint}>A workspace owner manages access for this workspace.</Text>
        )}
      </View>

      <View>
        <View style={styles.directoryHeader}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={typography.sectionLabel}>Team directory</Text>
            <Text style={styles.directoryCount}>
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Text>
          </View>
          <Pressable
            onPress={openDirectory}
            style={({ pressed }) => [styles.iconBtn, pressed ? styles.pressed : null]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Search members"
            testID="free-plan-directory-search"
          >
            <Search size={14} color={colors.textSecondary} strokeWidth={2.3} />
          </Pressable>
          <Pressable
            onPress={onInvite}
            style={({ pressed }) => [styles.invitePill, pressed ? styles.pressed : null]}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={isOwnerOrLeader ? "Invite team members" : "Share invite code"}
            testID="free-plan-directory-invite"
          >
            <UserPlus size={13} color={colors.brand} strokeWidth={2.4} />
            <Text style={styles.invitePillText}>Invite</Text>
          </Pressable>
        </View>

        <ProfileCard>
          {visibleMembers.map((member, index) => {
            const isMe = member.userId === myId;
            const canOpen = canViewMemberProfile(member.userId, member.role);
            const row = (
              <View style={styles.memberRow}>
                <UserAvatar
                  user={member.user}
                  size={36}
                  radius={18}
                  backgroundColor={colors.brandSoft}
                  textColor={colors.brand}
                  fontSize={13}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {member.user.name?.trim() || "Member"}
                    {isMe ? " (you)" : ""}
                  </Text>
                  <Text style={styles.memberRole} numberOfLines={1}>
                    {formatTeamRole(member.role)}
                  </Text>
                  {member.user.email ? (
                    <Text style={styles.memberEmail} numberOfLines={1}>
                      {member.user.email}
                    </Text>
                  ) : null}
                </View>
                {canOpen ? <ChevronRight size={15} color="#CBD5E1" strokeWidth={2.2} /> : null}
              </View>
            );
            return (
              <View key={member.userId}>
                {index > 0 ? <View style={styles.memberDivider} /> : null}
                {canOpen ? (
                  <Pressable
                    onPress={() => openMemberProfile(member.userId)}
                    style={({ pressed }) => (pressed ? styles.rowPressed : undefined)}
                    testID={`free-plan-member-${member.userId}`}
                  >
                    {row}
                  </Pressable>
                ) : (
                  row
                )}
              </View>
            );
          })}

          {hiddenMemberCount > 0 ? (
            <>
              <View style={styles.memberDivider} />
              <Pressable
                onPress={openDirectory}
                style={({ pressed }) => (pressed ? styles.rowPressed : undefined)}
                testID="free-plan-directory-view-all"
              >
                <View style={styles.viewAllRow}>
                  <Text style={styles.viewAllText}>View all {memberCount} members</Text>
                  <ChevronRight size={14} color={colors.brand} strokeWidth={2.4} />
                </View>
              </Pressable>
            </>
          ) : null}
        </ProfileCard>

        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.inviteCta, pressed ? styles.pressed : null]}
          accessibilityRole="button"
          accessibilityLabel={isOwnerOrLeader ? "Invite team members" : "Share invite code"}
          testID="free-plan-invite-cta"
        >
          <View style={styles.inviteCtaIcon}>
            <UserPlus size={15} color={colors.brand} strokeWidth={2.3} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.inviteCtaTitle}>
              {isOwnerOrLeader ? "Invite team members" : "Share invite code"}
            </Text>
            <Text style={styles.inviteCtaBody} numberOfLines={2}>
              {isOwnerOrLeader
                ? "Add people to collaborate in your workspace."
                : "Send your workspace code so teammates can join."}
            </Text>
          </View>
        </Pressable>
      </View>

      <ProfileCard>
        <Pressable
          onPress={() => void Linking.openURL(HELP_CENTER_URL)}
          style={({ pressed }) => (pressed ? styles.rowPressed : undefined)}
          accessibilityRole="button"
          accessibilityLabel="View help center"
          testID="free-plan-help-center"
        >
          <View style={styles.helpRow}>
            <View style={styles.helpIcon}>
              <BookOpen size={15} color={colors.brandAccent} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.memberName}>New to Alenio?</Text>
              <Text style={styles.helpBody} numberOfLines={2}>
                Learn how teams use Alenio to stay connected and improve every day.
              </Text>
            </View>
            <Text style={styles.helpLink}>View help center</Text>
            <ChevronRight size={14} color="#CBD5E1" strokeWidth={2.2} />
          </View>
        </Pressable>
      </ProfileCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.72,
  },
  rowPressed: {
    backgroundColor: colors.pressOverlay,
  },
  upsellCard: {
    backgroundColor: "#FAFAFF",
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  planBadge: {
    alignSelf: "flex-start",
    borderRadius: radii.full,
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: "#6D4AFF",
  },
  upsellBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  upsellArt: {
    width: 80,
    height: 102,
    flexShrink: 0,
  },
  upsellCopy: {
    flex: 1,
    minWidth: 0,
  },
  upsellTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  upsellText: {
    marginTop: 5,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textSecondary,
  },
  featureGrid: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 7,
  },
  featureItem: {
    width: "50%",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 8,
  },
  featureText: {
    flex: 1,
    minWidth: 0,
    fontSize: 11.5,
    fontWeight: "600",
    color: "#334155",
  },
  upsellActions: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.full,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  primaryBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: "#C7D2FE",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.brand,
  },
  ownerHint: {
    marginTop: 10,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.textMuted,
  },
  directoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  directoryCount: {
    marginTop: 2,
    fontSize: 11,
    color: colors.textMuted,
  },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceSecondary,
    flexShrink: 0,
  },
  invitePill: {
    height: 28,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    backgroundColor: colors.brandSoft,
    flexShrink: 0,
  },
  invitePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
  },
  memberRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  memberDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginLeft: 58,
  },
  memberName: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  memberRole: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.brand,
  },
  memberEmail: {
    marginTop: 1,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  viewAllRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  viewAllText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: colors.brand,
  },
  inviteCta: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: "#DCE3EC",
    borderStyle: "dashed",
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inviteCtaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.brandSoft,
    flexShrink: 0,
  },
  inviteCtaTitle: {
    fontSize: 12.5,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  inviteCtaBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
  },
  helpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  helpIcon: {
    width: 32,
    height: 32,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
    flexShrink: 0,
  },
  helpBody: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 14,
    color: colors.textMuted,
  },
  helpLink: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.brand,
    flexShrink: 0,
  },
});
