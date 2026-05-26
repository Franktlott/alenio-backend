import React from "react";
import { View, Text, Pressable, TouchableOpacity, ActivityIndicator, type ViewStyle } from "react-native";
import { ChevronRight, Copy, Pencil, Plus, LogOut } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Share } from "react-native";
import type { Team } from "@/lib/types";
import {
  CurrentWorkspaceBadge,
  WorkspaceTeamAvatar,
  formatTeamRole,
} from "@/components/WorkspaceTeamUI";
import { PROFILE_UI } from "@/components/profile/ProfileEnterpriseUI";

function WorkspaceProfileCard({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[PROFILE_UI.card, style]}>{children}</View>;
}

type TeamWithRole = Team & { role?: string };

type ProfileWorkspaceListProps = {
  teams: TeamWithRole[];
  activeTeamId: string | null;
  teamsLoading: boolean;
  isDemo: boolean;
  pendingCountMap: Record<string, number>;
  onSelectTeam: (teamId: string) => void;
  onOpenTeam: (teamId: string) => void;
  onEditTeam: (team: TeamWithRole) => void;
  onLeaveTeam: (team: TeamWithRole) => void;
  onSwitchWorkspaces: () => void;
  onAddWorkspace: () => void;
};

function WorkspaceItemCard({
  team,
  isActive,
  isDemo,
  pendingCount,
  onPress,
  onEdit,
  onLeave,
}: {
  team: TeamWithRole;
  isActive: boolean;
  isDemo: boolean;
  pendingCount: number;
  onPress: () => void;
  onEdit: () => void;
  onLeave: () => void;
}) {
  const role = team.role;
  const isOwner = ["owner", "team_leader"].includes(role ?? "");

  return (
    <Pressable
      onPress={onPress}
      testID={`team-row-${team.id}`}
      style={({ pressed }) => ({
        borderRadius: 10,
        borderWidth: 1,
        borderColor: isActive ? "#C7D2FE" : "#E2E8F0",
        backgroundColor: isActive ? "#F5F7FF" : pressed ? "#F8FAFC" : "#FFFFFF",
        padding: 12,
      })}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <WorkspaceTeamAvatar team={team} size={44} active={isActive} />
        <View style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }} numberOfLines={1}>
              {team.name}
            </Text>
            {isActive ? <CurrentWorkspaceBadge compact /> : null}
          </View>
          <Text style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{formatTeamRole(role)}</Text>
          {team.inviteCode && isOwner ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  backgroundColor: "#F8FAFC",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  gap: 6,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: "700", color: "#475569", letterSpacing: 1.2 }}>
                  {team.inviteCode}
                </Text>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    void Clipboard.setStringAsync(team.inviteCode!);
                  }}
                  hitSlop={8}
                  testID={`copy-code-${team.id}`}
                >
                  <Copy size={12} color="#64748B" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation?.();
                  void Share.share({
                    message: `Join my team "${team.name}" on Alenio! Use invite code: ${team.inviteCode}`,
                  });
                }}
                hitSlop={8}
                testID={`share-code-${team.id}`}
              >
                <Text style={{ fontSize: 11, fontWeight: "600", color: "#1E40AF" }}>Share invite</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 8 }}>
          {isOwner && pendingCount > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: "#DC2626",
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 5,
              }}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 10, fontWeight: "700" }}>{pendingCount}</Text>
            </View>
          ) : null}
          {!isDemo && isOwner ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                onEdit();
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
              testID={`edit-team-${team.id}`}
              hitSlop={8}
            >
              <Pencil size={15} color="#475569" />
            </TouchableOpacity>
          ) : null}
          {!isDemo && !isOwner ? (
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                onLeave();
              }}
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
                borderWidth: 1,
                borderColor: "#E2E8F0",
              }}
              testID={`leave-team-${team.id}`}
              hitSlop={8}
            >
              <LogOut size={15} color="#94A3B8" />
            </TouchableOpacity>
          ) : null}
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: isActive ? "#EEF2FF" : "#F8FAFC",
              borderWidth: 1,
              borderColor: isActive ? "#C7D2FE" : "#E2E8F0",
            }}
          >
            <ChevronRight size={18} color={isActive ? "#4338CA" : "#94A3B8"} />
          </View>
        </View>
      </View>
      {isActive ? (
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onPress();
          }}
          style={{
            marginTop: 10,
            paddingVertical: 8,
            borderRadius: 8,
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#C7D2FE",
            alignItems: "center",
          }}
          testID={`open-team-${team.id}`}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: "#4338CA" }}>Open workspace</Text>
        </Pressable>
      ) : !isActive ? (
        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 8 }}>Tap to switch to this workspace</Text>
      ) : null}
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
  onOpenTeam,
  onEditTeam,
  onLeaveTeam,
  onSwitchWorkspaces,
  onAddWorkspace,
}: ProfileWorkspaceListProps) {
  const sortedTeams = [...teams].sort((a, b) => {
    if (a.id === activeTeamId) return -1;
    if (b.id === activeTeamId) return 1;
    return a.name.localeCompare(b.name);
  });

  if (teamsLoading) {
    return (
      <WorkspaceProfileCard>
        <View style={{ paddingVertical: 36, alignItems: "center" }}>
          <ActivityIndicator color="#1E40AF" />
        </View>
      </WorkspaceProfileCard>
    );
  }

  if (teams.length === 0) {
    return (
      <WorkspaceProfileCard>
        <View style={{ padding: 20, alignItems: "center" }}>
          <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", marginBottom: 6 }}>No workspaces yet</Text>
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", lineHeight: 17, marginBottom: 16 }}>
            Create a new workspace for your team or join one with an invite code.
          </Text>
          {!isDemo ? (
            <Pressable
              onPress={onAddWorkspace}
              testID="create-join-team-button"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: "#1E40AF",
              }}
            >
              <Plus size={16} color="#FFFFFF" />
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Create or join workspace</Text>
            </Pressable>
          ) : null}
        </View>
      </WorkspaceProfileCard>
    );
  }

  return (
    <WorkspaceProfileCard style={{ padding: 12, gap: 8 }}>
      {sortedTeams.map((team) => {
        const isActive = team.id === activeTeamId;
        return (
          <WorkspaceItemCard
            key={team.id}
            team={team}
            isActive={isActive}
            isDemo={isDemo}
            pendingCount={pendingCountMap[team.id] ?? 0}
            onPress={() => {
              if (isActive) onOpenTeam(team.id);
              else onSelectTeam(team.id);
            }}
            onEdit={() => onEditTeam(team)}
            onLeave={() => onLeaveTeam(team)}
          />
        );
      })}

      {!isDemo ? (
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            marginTop: 4,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: "#F1F5F9",
          }}
        >
          {teams.length > 1 ? (
            <Pressable
              onPress={onSwitchWorkspaces}
              testID="switch-workspace-button"
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: "#EEF2FF",
                borderWidth: 1,
                borderColor: "#C7D2FE",
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#4338CA" }}>Switch workspace</Text>
              <ChevronRight size={14} color="#4338CA" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={onAddWorkspace}
            testID="create-join-team-button"
            style={{
              flex: teams.length > 1 ? 1 : undefined,
              width: teams.length > 1 ? undefined : "100%",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              paddingVertical: 10,
              borderRadius: 8,
              backgroundColor: "#F8FAFC",
              borderWidth: 1,
              borderColor: "#E2E8F0",
            }}
          >
            <Plus size={14} color="#475569" />
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#475569" }}>Add workspace</Text>
          </Pressable>
        </View>
      ) : null}
    </WorkspaceProfileCard>
  );
}
