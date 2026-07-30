import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarClock, ChevronRight } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import type { MemberStandardsCompliance } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";

type Props = {
  name: string;
  role: TeamMember["role"];
  image?: string | null;
  isCurrentUser?: boolean;
  daysSinceLastCheckIn?: number | null;
  checkInStatus?: MemberStandardsCompliance["checkInStatus"];
  showLastCheckIn?: boolean;
  showDivider?: boolean;
  onPress?: () => void;
  testID?: string;
};

function memberRoleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

function missedStatusLabel(
  days: number | null | undefined,
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
): string {
  if (days == null) return "No check-in yet";
  if (status === "due_soon") {
    if (days === 0) return "Due today";
    if (days === 1) return "Due soon · 1 day";
    return `Due soon · ${days} days`;
  }
  if (days === 1) return "Missed yesterday";
  if (days === 0) return "Missed today";
  return `Missed ${days} days ago`;
}

function formatLastCheckInDate(days: number | null | undefined): string | null {
  if (days == null || days < 0) return null;
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function relativeCheckInLabel(days: number | null | undefined): string {
  if (days == null) return "—";
  if (days === 0) return "Today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export function MissedCheckInRow({
  name,
  role,
  image,
  isCurrentUser,
  daysSinceLastCheckIn,
  checkInStatus,
  showLastCheckIn = true,
  showDivider = true,
  onPress,
  testID,
}: Props) {
  const displayName = isCurrentUser ? `${name} (you)` : name;
  const lastCheckIn = showLastCheckIn ? formatLastCheckInDate(daysSinceLastCheckIn) : null;
  const statusText = missedStatusLabel(daysSinceLastCheckIn, checkInStatus);

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
          {statusText}
          {lastCheckIn ? ` · ${lastCheckIn}` : ""}
        </Text>
      </View>

      <View style={styles.metric}>
        <View style={styles.metricValueRow}>
          <CalendarClock size={11} color="#64748B" strokeWidth={2.2} />
          <Text style={styles.metricValue}>
            {relativeCheckInLabel(daysSinceLastCheckIn)}
          </Text>
        </View>
        <Text style={styles.metricLabel}>Since</Text>
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
