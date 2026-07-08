import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Check, ChevronDown, LogOut, X } from "lucide-react-native";
import type { Team } from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";
import {
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import {
  PROFILE_UI,
  ProfileCard,
} from "@/components/profile/ProfileEnterpriseUI";

type TeamWithRole = Team & { role?: string };

type ProfileWorkspaceListProps = {
  teams: TeamWithRole[];
  activeTeamId: string | null;
  teamsLoading: boolean;
  isDemo: boolean;
  pendingCountMap: Record<string, number>;
  onSelectTeam: (teamId: string) => void;
  onManageActive?: () => void;
  onLeaveActive?: () => void;
  onAddWorkspace: () => void;
};

const MAX_VISIBLE_ROWS = 4;
const ROW_HEIGHT = 52;

function WorkspaceRowIcon({ team, active }: { team: Pick<Team, "name" | "image">; active: boolean }) {
  const imageUrl = resolveUserImageUrl(team.image);
  return (
    <View
      style={[
        PROFILE_UI.iconBox,
        {
          marginRight: 12,
          overflow: "hidden",
          padding: 0,
          backgroundColor: "#EEF2FF",
          borderColor: active ? "#6366F1" : "#E2E8F0",
        },
      ]}
    >
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={{ width: 36, height: 36 }} resizeMode="cover" />
      ) : (
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#4361EE" }}>
          {team.name?.[0]?.toUpperCase() ?? "?"}
        </Text>
      )}
    </View>
  );
}

function WorkspaceRowContent({
  team,
  isActive,
  title,
  subtitle,
  pendingCount,
  trailing,
}: {
  team: TeamWithRole;
  isActive: boolean;
  title: string;
  subtitle: string;
  pendingCount?: number;
  trailing?: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 13,
        minHeight: ROW_HEIGHT,
      }}
    >
      <WorkspaceRowIcon team={team} active={isActive} />
      <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
        <Text style={PROFILE_UI.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={PROFILE_UI.rowSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {(pendingCount ?? 0) > 0 ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: "#DC2626",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 6,
            marginRight: trailing ? 8 : 0,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>{pendingCount}</Text>
        </View>
      ) : null}
      {trailing ?? null}
    </View>
  );
}

function ActiveWorkspaceRow({
  team,
  pendingCount,
  canSwitch,
  onOpenPicker,
  onManageActive,
  onLeaveActive,
}: {
  team: TeamWithRole;
  pendingCount: number;
  canSwitch: boolean;
  onOpenPicker: () => void;
  onManageActive?: () => void;
  onLeaveActive?: () => void;
}) {
  const trailing = onLeaveActive ? (
    <Pressable
      onPress={onLeaveActive}
      hitSlop={8}
      testID="leave-active-workspace"
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, marginLeft: 4 })}
      accessibilityRole="button"
      accessibilityLabel="Leave workspace"
    >
      <LogOut size={18} color="#64748B" />
    </Pressable>
  ) : canSwitch ? (
    <ChevronDown size={18} color="#64748B" style={{ marginLeft: 4 }} />
  ) : (
    <Check size={20} color="#4338CA" strokeWidth={2.5} style={{ marginLeft: 4 }} />
  );

  return (
    <Pressable
      onPress={canSwitch ? onOpenPicker : undefined}
      onLongPress={onManageActive ?? undefined}
      delayLongPress={400}
      testID="workspace-dropdown-trigger"
      style={({ pressed }) => (canSwitch && pressed ? { backgroundColor: "#F8FAFC" } : undefined)}
    >
      <WorkspaceRowContent
        team={team}
        isActive
        title={team.name}
        subtitle={`${formatTeamRole(team.role)} · Current`}
        pendingCount={pendingCount}
        trailing={trailing}
      />
    </Pressable>
  );
}

export function ProfileWorkspaceList({
  teams,
  activeTeamId,
  teamsLoading,
  isDemo,
  pendingCountMap,
  onSelectTeam,
  onManageActive,
  onLeaveActive,
  onAddWorkspace,
}: ProfileWorkspaceListProps) {
  const insets = useSafeAreaInsets();
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeTeam = teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === activeTeamId) return -1;
    if (b.id === activeTeamId) return 1;
    return a.name.localeCompare(b.name);
  });
  const canSwitch = teams.length > 1;
  const listMaxHeight = Math.min(sortedTeams.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;
  const needsScroll = sortedTeams.length > MAX_VISIBLE_ROWS;

  if (teamsLoading) {
    return (
      <ProfileCard>
        <View style={{ paddingVertical: 32, alignItems: "center" }}>
          <ActivityIndicator color="#4338CA" />
        </View>
      </ProfileCard>
    );
  }

  if (teams.length === 0) {
    return (
      <ProfileCard>
        <View style={{ padding: 24, alignItems: "center" }}>
          <View style={[PROFILE_UI.iconBox, { width: 48, height: 48, borderRadius: 12, marginBottom: 12 }]}>
            <Building2 size={22} color="#64748B" />
          </View>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 4 }}>No workspaces</Text>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", lineHeight: 17, marginBottom: 16 }}>
            Create a workspace for your team or join with an invite code.
          </Text>
          {!isDemo ? (
            <Pressable
              onPress={onAddWorkspace}
              testID="create-join-team-button"
              style={{
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: "#4338CA",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Get started</Text>
            </Pressable>
          ) : null}
        </View>
      </ProfileCard>
    );
  }

  if (!activeTeam) return null;

  const pendingCount = pendingCountMap[activeTeam.id] ?? 0;

  return (
    <>
      <ProfileCard>
        <ActiveWorkspaceRow
          team={activeTeam}
          pendingCount={pendingCount}
          canSwitch={canSwitch}
          onOpenPicker={() => setPickerOpen(true)}
          onManageActive={onManageActive}
          onLeaveActive={onLeaveActive}
        />
      </ProfileCard>

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}
          onPress={() => setPickerOpen(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation?.()}>
            <View
              style={{
                backgroundColor: "white",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingTop: 12,
                paddingBottom: Math.max(insets.bottom, 16),
              }}
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center" }} />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingTop: 16,
                  paddingBottom: 14,
                }}
              >
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "800", color: "#0F172A" }}>Switch workspace</Text>
                  <Text style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                    {teams.length} {teams.length === 1 ? "workspace" : "workspaces"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPickerOpen(false)}
                  hitSlop={8}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    backgroundColor: "#F1F5F9",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={18} color="#64748B" />
                </Pressable>
              </View>

              <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
                <View style={PROFILE_UI.card}>
                  <ScrollView
                    style={{ maxHeight: listMaxHeight }}
                    bounces={needsScroll}
                    showsVerticalScrollIndicator={needsScroll}
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled
                  >
                    {sortedTeams.map((team, index) => {
                      const isActive = team.id === activeTeamId;
                      const pending = pendingCountMap[team.id] ?? 0;
                      return (
                        <View key={team.id}>
                          {index > 0 ? (
                            <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 52 }} />
                          ) : null}
                          <Pressable
                            onPress={() => {
                              setPickerOpen(false);
                              if (!isActive) onSelectTeam(team.id);
                            }}
                            disabled={isActive}
                            testID={`team-row-${team.id}`}
                            style={({ pressed }) => ({
                              backgroundColor: isActive ? "#F8FAFC" : pressed ? "#F8FAFC" : "transparent",
                            })}
                          >
                            <WorkspaceRowContent
                                team={team}
                                isActive={isActive}
                                title={team.name}
                                subtitle={`${formatTeamRole(team.role)}${isActive ? " · Current" : ""}`}
                                pendingCount={pending}
                                trailing={
                                  isActive ? (
                                    <Check size={20} color="#4338CA" strokeWidth={2.5} />
                                  ) : undefined
                                }
                              />
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
                {!isDemo ? (
                  <Pressable
                    onPress={() => {
                      setPickerOpen(false);
                      onAddWorkspace();
                    }}
                    style={{ paddingHorizontal: 20, paddingTop: 14, alignItems: "center" }}
                    testID="create-join-team-button"
                  >
                    <Text style={{ fontSize: 14, fontWeight: "600", color: "#4338CA" }}>Add workspace</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
