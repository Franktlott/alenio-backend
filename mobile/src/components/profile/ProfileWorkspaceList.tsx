import React, { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Modal, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Check, ChevronDown, Pencil, Plus, X } from "lucide-react-native";
import type { Team } from "@/lib/types";
import {
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import {
  PROFILE_UI,
  ProfileCard,
  ProfileDivider,
  ProfileMenuRow,
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
  onAddWorkspace: () => void;
};

const AVATAR_SIZE = 40;
const MAX_VISIBLE_ROWS = 4;
const ROW_HEIGHT = 64;

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
    <View style={{ flexDirection: "row", alignItems: "center", width: "100%" }}>
      <WorkspaceTeamAvatar team={team} size={AVATAR_SIZE} active={isActive} />
      <View style={{ flex: 1, marginLeft: 12, minWidth: 0, justifyContent: "center" }}>
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

export function ProfileWorkspaceList({
  teams,
  activeTeamId,
  teamsLoading,
  isDemo,
  pendingCountMap,
  onSelectTeam,
  onManageActive,
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
        <Pressable
          onPress={canSwitch ? () => setPickerOpen(true) : undefined}
          disabled={!canSwitch}
          testID="workspace-dropdown-trigger"
          style={({ pressed }) => ({
            paddingHorizontal: 14,
            paddingVertical: 12,
            minHeight: ROW_HEIGHT,
            backgroundColor: pressed && canSwitch ? "#F8FAFC" : "transparent",
          })}
        >
          <WorkspaceRowContent
            team={activeTeam}
            isActive
            title={activeTeam.name}
            subtitle={`${formatTeamRole(activeTeam.role)} · Current`}
            pendingCount={pendingCount}
            trailing={
              canSwitch ? (
                <ChevronDown size={18} color="#64748B" />
              ) : (
                <Check size={20} color="#4338CA" strokeWidth={2.5} />
              )
            }
          />
        </Pressable>

        {onManageActive ? (
          <>
            <ProfileDivider inset />
            <ProfileMenuRow
              icon={Pencil}
              title="Edit workspace"
              subtitle="Name, photo, and settings"
              onPress={onManageActive}
              testID="edit-active-workspace"
            />
          </>
        ) : null}

        {!isDemo ? (
          <>
            <ProfileDivider />
            <ProfileMenuRow
              icon={Plus}
              title="Add workspace"
              onPress={onAddWorkspace}
              testID="create-join-team-button"
            />
          </>
        ) : null}
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
                            <View style={{ height: 1, backgroundColor: "#F1F5F9", marginLeft: 66 }} />
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
                            <View style={{ paddingHorizontal: 14, paddingVertical: 12, minHeight: ROW_HEIGHT }}>
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
                            </View>
                          </Pressable>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
