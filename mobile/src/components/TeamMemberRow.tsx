import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, ListChecks, Target } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import type { MemberStandardsCompliance } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";
import { PROFILE_UI } from "@/components/profile/ProfileEnterpriseUI";

const DIRECTORY_AVATAR = 48;

export type MetricHealthTone = "good" | "attention" | "critical" | "progress" | "neutral";

const METRIC_VALUE_COLORS: Record<MetricHealthTone, string> = {
  good: "#128A52",
  attention: "#D97706",
  critical: "#E02424",
  progress: "#6D5CE7",
  neutral: "#64748B",
};

export function checkInHealthTone(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
  value?: string,
): MetricHealthTone {
  if (status === "on_track") return "good";
  if (status === "due_soon") return "attention";
  if (status === "overdue" && (!value || value === "—" || value.toLowerCase() === "none")) {
    return "attention";
  }
  if (status === "overdue") return "critical";
  if (status === "not_required") return "neutral";
  if (!value || value === "—" || value.toLowerCase() === "none") return "neutral";
  return "neutral";
}

export function goalsHealthTone(
  status: MemberStandardsCompliance["goalsStatus"] | undefined,
  value?: string,
): MetricHealthTone {
  if (status === "on_track") return "good";
  if (status === "missing_goals") return "progress";
  if (status === "not_required") return "neutral";
  if (!value || value === "—" || value === "0" || value.toLowerCase() === "none") return "neutral";
  return "neutral";
}

/** Tone for Tasks metric — completion-first; overdue only drives color. */
export function tasksHealthTone(
  completedTasks: number,
  activeTasks: number,
  overdueTasks: number,
): MetricHealthTone {
  const completed = Math.max(0, completedTasks);
  const active = Math.max(0, activeTasks);
  const overdue = Math.max(0, overdueTasks);

  if (active === 0 && completed === 0) return "neutral";
  if (overdue > 0 && (overdue >= active || completed === 0)) return "critical";
  if (overdue > 0) return "attention";
  if (completed > 0) return "good";
  return "neutral";
}

function checkInRingColor(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
): string {
  if (status === "on_track") return "#10B981";
  if (status === "due_soon") return "#F59E0B";
  if (status === "overdue") return "#EF4444";
  return "#CBD5E1";
}

function memberRoleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  const isLeader = role === "owner" || role === "team_leader";
  return (
    <View
      style={[
        styles.roleBadge,
        { backgroundColor: isLeader ? "#EEF2FF" : "#F1F5F9" },
      ]}
    >
      <Text style={[styles.roleBadgeText, { color: isLeader ? "#4338CA" : "#64748B" }]}>
        {memberRoleLabel(role)}
      </Text>
    </View>
  );
}

function CompactChip({
  label,
  tone,
  icon,
}: {
  label: string;
  tone: "green" | "orange" | "red" | "muted";
  icon: React.ReactNode;
}) {
  const palette =
    tone === "green"
      ? { bg: "#ECFDF5", text: "#059669" }
      : tone === "orange"
        ? { bg: "#FFF7ED", text: "#EA580C" }
        : tone === "red"
          ? { bg: "#FEF2F2", text: "#DC2626" }
          : { bg: "#F8FAFC", text: "#94A3B8" };

  return (
    <View style={[styles.chip, { backgroundColor: palette.bg }]}>
      {icon}
      <Text style={[styles.chipText, { color: palette.text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function goalsChipLabel(value: string): string {
  const progress = value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (progress) return `${progress[1]}/${progress[2]} goals`;
  if (!value || value === "—" || value.toLowerCase() === "none") return "No goals";
  return value;
}

function tasksChipLabel(activeTasks: number, overdueTasks: number): string {
  if (overdueTasks > 0) return `${overdueTasks} overdue`;
  if (activeTasks > 0) return `${activeTasks} open`;
  return "Tasks clear";
}

function checkInChipLabel(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
  value: string,
): { label: string; tone: "green" | "orange" | "red" | "muted" } | null {
  if (status === "not_required") return null;
  if (status === "on_track") return { label: value === "—" ? "Checked in" : value, tone: "green" };
  if (status === "due_soon") return { label: "Due soon", tone: "orange" };
  if (status === "overdue") {
    if (!value || value === "—" || value.toLowerCase() === "none") {
      return { label: "No check-in", tone: "red" };
    }
    return { label: `Overdue · ${value}`, tone: "red" };
  }
  return null;
}

/** @deprecated Prefer fixed directory layout; kept for callers. */
export function getTeamMemberRowLayout(_screenWidth: number) {
  return {
    compact: false,
    avatarSize: DIRECTORY_AVATAR,
    rowPaddingHorizontal: 12,
    rowPaddingVertical: 12,
    avatarGap: 12,
  };
}

export function teamMemberRowStyle(
  rowPaddingHorizontal: number,
  rowPaddingVertical: number,
  showDivider: boolean,
  withMetrics = true,
) {
  return {
    paddingHorizontal: rowPaddingHorizontal,
    paddingVertical: rowPaddingVertical,
    minHeight: withMetrics ? 72 : 64,
    borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
    borderBottomColor: PROFILE_UI.divider.backgroundColor,
    backgroundColor: "#FFFFFF",
  };
}

export type TeamMemberRowProps = {
  name: string;
  role: TeamMember["role"];
  image?: string | null;
  isCurrentUser?: boolean;
  checkInValue?: string;
  goalsValue?: string;
  completedTasks?: number;
  activeTasks?: number;
  overdueTasks?: number;
  checkInStatus?: MemberStandardsCompliance["checkInStatus"];
  goalsStatus?: MemberStandardsCompliance["goalsStatus"];
  showMetrics?: boolean;
  /** When false, hide the Check-in metric (workplace standard off). */
  showCheckInMetric?: boolean;
  /** When false, hide the Goals metric (workplace standard off). */
  showGoalsMetric?: boolean;
  hasProfilePermission?: boolean;
  showDivider?: boolean;
  onPress?: () => void;
  testID?: string;
};

export function TeamMemberRow({
  name,
  role,
  image,
  isCurrentUser,
  checkInValue = "—",
  goalsValue = "—",
  completedTasks: _completedTasks = 0,
  activeTasks = 0,
  overdueTasks = 0,
  checkInStatus,
  goalsStatus,
  showMetrics = true,
  showCheckInMetric = true,
  showGoalsMetric = true,
  hasProfilePermission = true,
  showDivider = true,
  onPress,
  testID,
}: TeamMemberRowProps) {
  const displayName = isCurrentUser ? `${name} (you)` : name;
  const ring = checkInRingColor(checkInStatus);
  const goalsTone =
    goalsStatus === "missing_goals" ? "orange" : goalsStatus === "on_track" ? "green" : "muted";
  const tasksTone = overdueTasks > 0 ? "orange" : activeTasks > 0 ? "muted" : "green";
  const checkInChip = showCheckInMetric ? checkInChipLabel(checkInStatus, checkInValue) : null;

  const row = (
    <View
      style={[
        styles.row,
        {
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: PROFILE_UI.divider.backgroundColor,
        },
      ]}
    >
      <View style={[styles.avatarRing, { borderColor: ring }]}>
        <UserAvatar
          user={{ name, image }}
          size={DIRECTORY_AVATAR - 6}
          radius={(DIRECTORY_AVATAR - 6) / 2}
          backgroundColor="#4361EE"
          textColor="#FFFFFF"
          fontSize={15}
        />
      </View>

      <View style={styles.main}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          <RoleBadge role={role} />
        </View>

        {showMetrics ? (
          hasProfilePermission ? (
            <View style={styles.chips}>
              {showGoalsMetric ? (
                <CompactChip
                  label={goalsChipLabel(goalsValue)}
                  tone={goalsTone}
                  icon={<Target size={10} color={METRIC_VALUE_COLORS[goalsTone === "green" ? "good" : goalsTone === "orange" ? "attention" : "neutral"]} />}
                />
              ) : null}
              <CompactChip
                label={tasksChipLabel(activeTasks, overdueTasks)}
                tone={tasksTone}
                icon={
                  <ListChecks
                    size={10}
                    color={
                      METRIC_VALUE_COLORS[
                        tasksTone === "green" ? "good" : tasksTone === "orange" ? "attention" : "neutral"
                      ]
                    }
                  />
                }
              />
              {checkInChip ? (
                <CompactChip
                  label={checkInChip.label}
                  tone={checkInChip.tone}
                  icon={null}
                />
              ) : null}
            </View>
          ) : (
            <Text style={styles.privateHint}>Private</Text>
          )
        ) : null}
      </View>

      {onPress ? <ChevronRight size={16} color="#CBD5E1" strokeWidth={2.25} /> : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        testID={testID}
        style={({ pressed }) => [styles.pressable, pressed ? styles.pressablePressed : null]}
      >
        {row}
      </Pressable>
    );
  }

  return <View testID={testID}>{row}</View>;
}

export function TeamMemberRowSkeleton({
  paid = true,
  showDivider = true,
}: {
  paid?: boolean;
  showDivider?: boolean;
}) {
  return (
    <View
      style={[
        styles.row,
        {
          borderBottomWidth: showDivider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: PROFILE_UI.divider.backgroundColor,
        },
      ]}
    >
      <View style={[styles.avatarRing, { borderColor: "#E2E8F0", backgroundColor: "#E2E8F0" }]} />
      <View style={styles.main}>
        <View style={{ height: 12, width: "55%", backgroundColor: "#E2E8F0", borderRadius: 4 }} />
        {paid ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            <View style={{ height: 20, width: 72, backgroundColor: "#F1F5F9", borderRadius: 8 }} />
            <View style={{ height: 20, width: 64, backgroundColor: "#F1F5F9", borderRadius: 8 }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** @deprecated Kept for callers; members now live in one grouped list. */
export const TEAM_MEMBER_ROW_GAP = 0;

const styles = StyleSheet.create({
  pressable: {
    backgroundColor: "#FFFFFF",
  },
  pressablePressed: {
    backgroundColor: "rgba(15, 23, 42, 0.03)",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 72,
    backgroundColor: "#FFFFFF",
  },
  avatarRing: {
    width: DIRECTORY_AVATAR,
    height: DIRECTORY_AVATAR,
    borderRadius: DIRECTORY_AVATAR / 2,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  name: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    letterSpacing: -0.2,
  },
  roleBadge: {
    height: 18,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: "100%",
  },
  chipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  privateHint: {
    fontSize: 12,
    fontWeight: "600",
    color: "#94A3B8",
  },
});
