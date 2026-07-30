import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Target } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  name: string;
  role: TeamMember["role"];
  image?: string | null;
  isCurrentUser?: boolean;
  goalsValue?: string;
  missingGoals?: number;
  showDivider?: boolean;
  onPress?: () => void;
  testID?: string;
};

function memberRoleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

function goalsMetricLabel(goalsDisplay: string): string {
  const progress = goalsDisplay.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (progress) return `${progress[1]}/${progress[2]}`;
  if (!goalsDisplay || goalsDisplay === "—") return "—";
  return goalsDisplay;
}

export function GoalsDueRow({
  name,
  role,
  image,
  isCurrentUser,
  goalsValue = "—",
  missingGoals = 0,
  showDivider = true,
  onPress,
  testID,
}: Props) {
  const displayName = isCurrentUser ? `${name} (you)` : name;
  const status =
    missingGoals > 0
      ? `Needs ${missingGoals} active goal${missingGoals === 1 ? "" : "s"}`
      : "Needs active goals";

  const content = (
    <View style={[styles.row, showDivider ? styles.rowDivider : null]}>
      <UserAvatar
        user={{ name, image }}
        size={32}
        radius={16}
        backgroundColor="#E2E8F0"
        textColor="#475569"
        fontSize={11}
      />

      <View style={styles.copy}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.roleBadge}>
            <Text style={styles.roleBadgeText} numberOfLines={1}>
              {memberRoleLabel(role)}
            </Text>
          </View>
        </View>
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      </View>

      <View style={styles.metric}>
        <View style={styles.metricValueRow}>
          <Target size={11} color="#64748B" strokeWidth={2.2} />
          <Text style={styles.metricValue}>{goalsMetricLabel(goalsValue)}</Text>
        </View>
        <Text style={styles.metricLabel}>Goals</Text>
      </View>

      <ChevronRight size={14} color="#CBD5E1" strokeWidth={2.25} />
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    height: 52,
    backgroundColor: "#FFFFFF",
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F1F5F9",
  },
  pressed: {
    backgroundColor: "#F8FAFC",
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    color: "#0F172A",
    lineHeight: 16,
  },
  roleBadge: {
    flexShrink: 0,
    borderRadius: 5,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    lineHeight: 11,
  },
  status: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 13,
  },
  metric: {
    alignItems: "center",
    minWidth: 34,
    flexShrink: 0,
    marginRight: 1,
  },
  metricValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
    lineHeight: 14,
  },
  metricLabel: {
    marginTop: 0,
    fontSize: 9,
    fontWeight: "600",
    color: "#94A3B8",
    lineHeight: 11,
  },
});
