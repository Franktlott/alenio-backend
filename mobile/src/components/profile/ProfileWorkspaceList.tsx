import React from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import * as Haptics from "expo-haptics";
import { Building2, Check, ChevronRight, Plus } from "lucide-react-native";
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
  onViewAll?: () => void;
};

const MAX_INLINE_WORKSPACES = 4;

function ProfileWorkspaceRow({
  team,
  isActive,
  pendingCount,
  onPress,
  onLongPress,
}: {
  team: TeamWithRole;
  isActive: boolean;
  pendingCount: number;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={
        isActive && onLongPress
          ? () => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLongPress();
            }
          : undefined
      }
      delayLongPress={400}
      disabled={isActive && !onLongPress}
      testID={`team-row-${team.id}`}
      style={({ pressed }) => ({
        backgroundColor: isActive ? "#F8FAFC" : pressed ? "#F8FAFC" : "transparent",
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          paddingVertical: 12,
          minHeight: 56,
        }}
      >
        <WorkspaceTeamAvatar team={team} size={40} active={isActive} />
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <Text style={PROFILE_UI.rowTitle} numberOfLines={1}>
            {team.name}
          </Text>
          <Text style={PROFILE_UI.rowSubtitle} numberOfLines={2}>
            {formatTeamRole(team.role)}
            {isActive ? " · Current" : null}
            {isActive && onLongPress ? " · Hold to edit" : null}
          </Text>
        </View>
        {pendingCount > 0 ? (
          <View
            style={{
              minWidth: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: "#DC2626",
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 6,
              marginRight: 8,
            }}
          >
            <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>{pendingCount}</Text>
          </View>
        ) : null}
        {isActive ? (
          <Check size={20} color="#4338CA" strokeWidth={2.5} />
        ) : (
          <ChevronRight size={18} color="#94A3B8" />
        )}
      </View>
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
  onAddWorkspace,
  onViewAll,
}: ProfileWorkspaceListProps) {
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === activeTeamId) return -1;
    if (b.id === activeTeamId) return 1;
    return a.name.localeCompare(b.name);
  });

  const showViewAll = sortedTeams.length > MAX_INLINE_WORKSPACES && !!onViewAll;
  const visibleTeams = showViewAll ? sortedTeams.slice(0, MAX_INLINE_WORKSPACES) : sortedTeams;

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

  return (
    <ProfileCard>
      {visibleTeams.map((team, index) => {
        const isActive = team.id === activeTeamId;
        return (
          <View key={team.id}>
            {index > 0 ? <ProfileDivider inset /> : null}
            <ProfileWorkspaceRow
              team={team}
              isActive={isActive}
              pendingCount={pendingCountMap[team.id] ?? 0}
              onPress={() => {
                if (!isActive) onSelectTeam(team.id);
              }}
              onLongPress={isActive && onManageActive ? onManageActive : undefined}
            />
          </View>
        );
      })}

      {showViewAll ? (
        <>
          <ProfileDivider inset />
          <ProfileMenuRow
            icon={Building2}
            title="View all workspaces"
            subtitle={`${sortedTeams.length} workspaces`}
            onPress={onViewAll}
            testID="view-all-workspaces"
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
  );
}
