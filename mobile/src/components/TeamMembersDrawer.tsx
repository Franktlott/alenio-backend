import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronDown, Search, UserPlus, X } from "lucide-react-native";
import { router } from "expo-router";
import type { TeamMember } from "@/lib/types";
import type { MemberStatsPayload } from "@/lib/workplace-standards";
import { memberMatchesUserId } from "@/lib/member-identity";
import { formatDaysSinceCheckIn } from "@/lib/member-stats-display";
import { TeamMemberRow, TeamMemberRowSkeleton } from "@/components/TeamMemberRow";
import { ProfileCard, ProfileToolbarButton } from "@/components/profile/ProfileEnterpriseUI";
import { StandardsStatusKey } from "@/components/StandardsStatusKey";
import { PendingInvitesChip } from "@/components/PendingInvitesSheet";
import { colors, radii, space } from "@/theme";

type FormerMemberRow = {
  userId: string;
  user: TeamMember["user"];
  isFormer: true;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  teamId: string;
  members: TeamMember[];
  formerMembers: FormerMemberRow[];
  myId: string;
  myEmail: string;
  isPaid: boolean;
  isOwner: boolean;
  isOwnerOrLeader: boolean;
  showSkeletons: boolean;
  memberStats?: MemberStatsPayload["stats"];
  checkInRequired: boolean;
  goalsRequired: boolean;
  pendingApprovalCount: number;
  pendingInviteCount: number;
  onOpenJoinRequests: () => void;
  onOpenPendingInvites: () => void;
  onInvite: () => void;
  canViewMemberProfile: (targetUserId: string, targetRole: string) => boolean;
  canManageMember: (targetUserId: string, targetRole: string) => boolean;
};

const SCREEN_W = Dimensions.get("window").width;
const PANEL_WIDTH = Math.min(Math.round(SCREEN_W * 0.88), 400);

export function TeamMembersDrawer({
  visible,
  onClose,
  teamId,
  members,
  formerMembers,
  myId,
  myEmail,
  isPaid,
  isOwner,
  isOwnerOrLeader,
  showSkeletons,
  memberStats,
  checkInRequired,
  goalsRequired,
  pendingApprovalCount,
  pendingInviteCount,
  onOpenJoinRequests,
  onOpenPendingInvites,
  onInvite,
  canViewMemberProfile,
  canManageMember,
}: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [formerOpen, setFormerOpen] = useState(false);
  const [mounted, setMounted] = useState(visible);
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateX.setValue(PANEL_WIDTH);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    if (!mounted) return;
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: PANEL_WIDTH,
        duration: 240,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) {
        setMounted(false);
        setQuery("");
        setSearchOpen(false);
      }
    });
  }, [visible, mounted, translateX, backdropOpacity]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = (m.user.name ?? "").toLowerCase();
      const email = (m.user.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, query]);

  const openProfile = (userId: string) => {
    onClose();
    router.push({
      pathname: "/member-profile",
      params: { teamId, memberUserId: userId },
    });
  };

  const openWorkplaceSettings = () => {
    onClose();
    router.push({
      pathname: "/workspace-settings",
      params: { teamId },
    });
  };

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root} pointerEvents="box-none">
        <Animated.View style={[styles.backdropFill, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close team members" />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: PANEL_WIDTH,
              paddingTop: Math.max(insets.top, 12),
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={styles.iconBtn}
              testID="team-members-drawer-close"
            >
              <X size={20} color="#64748B" strokeWidth={2.25} />
            </Pressable>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.title}>Team Members</Text>
              <Text style={styles.count}>{members.length} Members</Text>
            </View>
            <Pressable
              onPress={() => setSearchOpen((v) => !v)}
              hitSlop={10}
              style={styles.iconBtn}
              testID="team-members-drawer-search"
            >
              <Search size={18} color="#64748B" strokeWidth={2.25} />
            </Pressable>
            {isOwner ? (
              <ProfileToolbarButton
                label="Workplace Settings"
                onPress={openWorkplaceSettings}
                testID="drawer-workplace-settings"
              />
            ) : null}
          </View>

          {searchOpen ? (
            <View style={styles.searchWrap}>
              <Search size={15} color="#94A3B8" />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search members"
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
                autoFocus
                testID="team-members-search-input"
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
          ) : null}

          {(isOwnerOrLeader && (pendingApprovalCount > 0 || pendingInviteCount > 0)) || isPaid ? (
            <View style={styles.toolbar}>
              {isPaid ? <StandardsStatusKey iconSize={12} /> : <View style={{ flex: 1 }} />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                {isOwnerOrLeader && pendingApprovalCount > 0 ? (
                  <Pressable
                    onPress={() => {
                      onClose();
                      onOpenJoinRequests();
                    }}
                    style={styles.chip}
                    testID="drawer-pending-join-requests"
                  >
                    <UserPlus size={12} color="#4338CA" />
                    <Text style={styles.chipText}>
                      {pendingApprovalCount === 1 ? "1 request" : `${pendingApprovalCount} requests`}
                    </Text>
                  </Pressable>
                ) : null}
                {isOwnerOrLeader ? (
                  <PendingInvitesChip
                    count={pendingInviteCount}
                    onPress={() => {
                      onClose();
                      onOpenPendingInvites();
                    }}
                  />
                ) : null}
              </View>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: space.pagePad, paddingBottom: 16 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            testID="team-members-drawer-list"
          >
            {showSkeletons || filtered.length > 0 ? (
              <ProfileCard>
                {showSkeletons
                  ? Array.from({ length: 4 }, (_, index) => (
                      <TeamMemberRowSkeleton
                        key={`drawer-skeleton-${index}`}
                        paid={isPaid}
                        showDivider={index < 3}
                      />
                    ))
                  : filtered.map((item, index) => {
                      const stats = memberStats?.[item.userId];
                      const compliance = stats?.standardsCompliance;
                      const isCurrentUser = memberMatchesUserId(item, myId, myEmail);
                      const hasProfilePermission = canViewMemberProfile(item.userId, item.role);
                      const canOpenProfile = hasProfilePermission;
                      const canOpenManagement = !isPaid && canManageMember(item.userId, item.role);
                      const isPressable = canOpenProfile || canOpenManagement;

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
                          testID={`drawer-member-row-${item.userId}`}
                        />
                      );
                    })}
              </ProfileCard>
            ) : (
              <ProfileCard>
                <View style={{ paddingVertical: 28, alignItems: "center", paddingHorizontal: 16 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 4 }}>
                    {query.trim() ? "No matches" : "No members yet"}
                  </Text>
                  <Text style={{ fontSize: 12, color: "#8B95A5", textAlign: "center" }}>
                    {query.trim()
                      ? "Try a different name or email."
                      : "Invite teammates with your workspace code."}
                  </Text>
                </View>
              </ProfileCard>
            )}

            {isOwnerOrLeader && formerMembers.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <Pressable
                  onPress={() => setFormerOpen((v) => !v)}
                  style={styles.formerToggle}
                  testID="drawer-former-members-toggle"
                >
                  <Text style={styles.formerLabel}>
                    Former members ({formerMembers.length})
                  </Text>
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
                        testID={`drawer-former-member-row-${former.userId}`}
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

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              onPress={() => {
                onClose();
                onInvite();
              }}
              style={styles.inviteBtn}
              testID="drawer-invite-people"
            >
              <UserPlus size={16} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.inviteBtnText}>Invite people</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    flexDirection: "row",
  },
  backdropFill: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
  },
  panel: {
    height: "100%",
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 18,
    borderBottomLeftRadius: 18,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: -6, height: 0 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    fontFamily: "Inter_700Bold",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  count: {
    marginTop: 1,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: "#64748B",
  },
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
    fontFamily: "Inter_500Medium",
    color: "#0F172A",
    padding: 0,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingHorizontal: space.pagePad,
    marginBottom: 10,
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
  formerToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  formerLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#8B95A5",
  },
  footer: {
    paddingHorizontal: space.pagePad,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    borderBottomLeftRadius: 18,
    overflow: "hidden",
  },
  inviteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radii.md,
    paddingVertical: 14,
  },
  inviteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
  },
});
