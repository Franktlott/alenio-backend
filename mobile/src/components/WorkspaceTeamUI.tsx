import React from "react";
import { View, Text, Image, Pressable, type ViewStyle } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type { Team } from "@/lib/types";
import { resolveUserImageUrl } from "@/lib/user-avatar";

export const WORKSPACE_SWITCH_HINT = "Tap a workspace to switch.";

export function formatTeamRole(role?: string): string {
  if (!role) return "Member";
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CurrentWorkspaceBadge({ compact = false }: { compact?: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: compact ? 8 : 10,
        paddingVertical: compact ? 3 : 4,
        borderRadius: 6,
        backgroundColor: "#EEF2FF",
        borderWidth: 1,
        borderColor: "#C7D2FE",
      }}
      testID="current-workspace-badge"
    >
      <Text
        style={{
          fontSize: compact ? 10 : 11,
          fontWeight: "700",
          color: "#4338CA",
          letterSpacing: 0.6,
        }}
      >
        CURRENT
      </Text>
    </View>
  );
}

export function WorkspaceTeamAvatar({
  team,
  size = 48,
  active = false,
}: {
  team: Pick<Team, "name" | "image">;
  size?: number;
  active?: boolean;
}) {
  const radius = size >= 48 ? 14 : 8;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#EEF2FF",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        borderWidth: 1,
        borderColor: active ? "#6366F1" : "#E2E8F0",
        flexShrink: 0,
      }}
    >
      {(() => {
        const imageUrl = resolveUserImageUrl(team.image);
        return imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: size, height: size }} resizeMode="cover" />
        ) : (
          <Text style={{ fontSize: size * 0.42, fontWeight: "700", color: "#4361EE" }}>
            {team.name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        );
      })()}
    </View>
  );
}

type WorkspaceTeamRowProps = {
  team: Team & { role?: string };
  isActive: boolean;
  onPress: () => void;
  testID?: string;
  style?: ViewStyle;
  trailing?: React.ReactNode;
  showChevron?: boolean;
};

export function WorkspaceTeamRow({
  team,
  isActive,
  onPress,
  testID,
  style,
  trailing,
  showChevron = true,
}: WorkspaceTeamRowProps) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: isActive ? "#F5F7FF" : "#FFFFFF",
          borderRadius: 14,
          padding: 14,
          borderWidth: 1,
          borderColor: isActive ? "#C7D2FE" : "#E2E8F0",
        },
        style,
      ]}
    >
      <View style={{ marginRight: 12 }}>
        <WorkspaceTeamAvatar team={team} size={48} active={isActive} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Text
            style={{ fontSize: 14, fontWeight: "600", color: "#0F172A", flexShrink: 1 }}
            numberOfLines={1}
          >
            {team.name}
          </Text>
          {isActive ? <CurrentWorkspaceBadge compact /> : null}
        </View>
        <Text style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>{formatTeamRole(team.role)}</Text>
      </View>
      {trailing}
      {!trailing && showChevron && !isActive ? (
        <ChevronRight size={18} color="#94A3B8" style={{ marginLeft: 4 }} />
      ) : null}
      {!trailing && isActive ? (
        <Text style={{ fontSize: 11, fontWeight: "600", color: "#64748B", marginLeft: 8 }}>Active</Text>
      ) : null}
    </Pressable>
  );
}
