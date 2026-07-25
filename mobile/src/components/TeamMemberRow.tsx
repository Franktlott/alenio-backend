import React from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, ListChecks, Lock, Target } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import type { MemberStandardsCompliance } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";

const STANDARD_PHONE_MIN_WIDTH = 375;
const AVATAR_SIZE = 34;

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

function checkInDisplay(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
  value: string,
): { title: string; detail: string } {
  if (status === "not_required") return { title: "Optional", detail: "No schedule" };
  if (status === "overdue" && (value === "—" || value.toLowerCase() === "none")) {
    return { title: "Not started", detail: "No check-in" };
  }
  if (status === "overdue") return { title: "Overdue", detail: value };
  if (status === "due_soon") return { title: "Due soon", detail: value };
  if (status === "on_track") return { title: "Checked in", detail: value };
  return { title: "Check-in", detail: value === "—" ? "No data" : value };
}

function goalsDisplay(value: string): { title: string; detail: string } {
  const progress = value.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!progress) {
    return {
      title: "Goals",
      detail: value === "—" || value.toLowerCase() === "none" ? "No data" : value,
    };
  }
  const active = Number(progress[1]);
  return {
    title: `Goals ${active} / ${progress[2]}`,
    detail: `${active} active`,
  };
}

function tasksDisplay(
  completedTasks: number,
  activeTasks: number,
  overdueTasks: number,
): { title: string; detail: string } {
  const completed = Math.max(0, completedTasks);
  const active = Math.max(0, activeTasks);
  const overdue = Math.max(0, overdueTasks);

  const title = `Tasks ${completed}`;
  if (active === 0) return { title, detail: "Clear" };
  if (overdue > 0) return { title, detail: `${active} open · ${overdue} late` };
  return { title, detail: `${active} open` };
}

export function getTeamMemberRowLayout(screenWidth: number) {
  const compact = screenWidth < STANDARD_PHONE_MIN_WIDTH;
  return {
    compact,
    avatarSize: AVATAR_SIZE,
    rowPaddingHorizontal: compact ? 8 : 9,
    rowPaddingVertical: 5,
    nameFontSize: 13,
    avatarGap: 8,
    metricsWidth: compact ? 168 : 180,
  };
}

function memberRoleLabel(role: TeamMember["role"]): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

function MemberAvatar({ image, name, size }: { image?: string | null; name?: string | null; size: number }) {
  return (
    <UserAvatar
      user={{ name, image }}
      size={size}
      radius={size / 2}
      backgroundColor="#4361EE"
      textColor="#FFFFFF"
      fontSize={Math.max(11, Math.round(size * 0.4))}
      style={{ borderWidth: 1, borderColor: "#E0E7FF" }}
    />
  );
}

function IdentityBlock({
  name,
  isCurrentUser,
  nameFontSize,
}: {
  name: string;
  isCurrentUser?: boolean;
  nameFontSize: number;
}) {
  const displayName = isCurrentUser ? `${name} (you)` : name;

  return (
    <View style={{ minWidth: 0, flexShrink: 1 }}>
      <Text
        style={{ fontSize: nameFontSize, fontWeight: "700", color: "#172033", lineHeight: 16 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {displayName}
      </Text>
    </View>
  );
}

function RoleBadge({ role }: { role: TeamMember["role"] }) {
  const isLeader = role === "owner" || role === "team_leader";
  return (
    <View
      style={{
        height: 17,
        paddingHorizontal: 6,
        borderRadius: 9,
        backgroundColor: isLeader ? "#EEF2FF" : "#F1F5F9",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text style={{ fontSize: 9, fontWeight: "700", color: isLeader ? "#4F46E5" : "#64748B" }}>
        {memberRoleLabel(role)}
      </Text>
    </View>
  );
}

function MetricBlock({
  title,
  detail,
  tone,
  icon,
}: {
  title: string;
  detail: string;
  tone: MetricHealthTone;
  icon: React.ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 4,
        flex: 1,
        minWidth: 0,
      }}
    >
      <View style={{ paddingTop: 1 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 9.5, fontWeight: "700", color: METRIC_VALUE_COLORS[tone], lineHeight: 11 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.9}
        >
          {title}
        </Text>
        <Text
          style={{ fontSize: 8.25, fontWeight: "500", color: "#7A8699", lineHeight: 10 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.9}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}

function MetricsRow({
  checkInValue,
  goalsValue,
  completedTasks,
  activeTasks,
  overdueTasks,
  checkInTone,
  goalsTone,
  tasksTone,
  checkInStatus,
  width,
}: {
  checkInValue: string;
  goalsValue: string;
  completedTasks: number;
  activeTasks: number;
  overdueTasks: number;
  checkInTone: MetricHealthTone;
  goalsTone: MetricHealthTone;
  tasksTone: MetricHealthTone;
  checkInStatus?: MemberStandardsCompliance["checkInStatus"];
  width: number;
}) {
  const checkIn = checkInDisplay(checkInStatus, checkInValue);
  const goals = goalsDisplay(goalsValue);
  const tasks = tasksDisplay(completedTasks, activeTasks, overdueTasks);
  const checkInIcon =
    checkInStatus === "on_track" ? (
      <CheckCircle2 size={10} color={METRIC_VALUE_COLORS[checkInTone]} />
    ) : checkInStatus === "due_soon" ? (
      <Clock3 size={10} color={METRIC_VALUE_COLORS[checkInTone]} />
    ) : (
      <AlertCircle size={10} color={METRIC_VALUE_COLORS[checkInTone]} />
    );

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 4,
        minWidth: 0,
        width,
        flexShrink: 0,
      }}
    >
      <MetricBlock
        title={checkIn.title}
        detail={checkIn.detail}
        tone={checkInTone}
        icon={checkInIcon}
      />
      <View style={{ width: 1, height: 20, backgroundColor: "#E8ECF3" }} />
      <MetricBlock
        title={goals.title}
        detail={goals.detail}
        tone={goalsTone}
        icon={<Target size={10} color={METRIC_VALUE_COLORS[goalsTone]} />}
      />
      <View style={{ width: 1, height: 20, backgroundColor: "#E8ECF3" }} />
      <MetricBlock
        title={tasks.title}
        detail={tasks.detail}
        tone={tasksTone}
        icon={<ListChecks size={10} color={METRIC_VALUE_COLORS[tasksTone]} />}
      />
    </View>
  );
}

function PrivateMetricsRow() {
  return (
    <View style={{ alignSelf: "center" }}>
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: "#F1F5F9",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lock size={10} color="#94A3B8" />
      </View>
    </View>
  );
}

export function teamMemberRowStyle(
  rowPaddingHorizontal: number,
  rowPaddingVertical: number,
  showDivider: boolean,
) {
  return {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: rowPaddingHorizontal,
    paddingVertical: rowPaddingVertical,
    borderBottomWidth: showDivider ? 1 : 0,
    borderBottomColor: "#EDF0F5",
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
  completedTasks = 0,
  activeTasks = 0,
  overdueTasks = 0,
  checkInStatus,
  goalsStatus,
  showMetrics = true,
  hasProfilePermission = true,
  showDivider = true,
  onPress,
  testID,
}: TeamMemberRowProps) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = getTeamMemberRowLayout(screenWidth);
  const rowStyle = teamMemberRowStyle(
    layout.rowPaddingHorizontal,
    layout.rowPaddingVertical,
    showDivider,
  );
  const checkInTone = checkInHealthTone(checkInStatus, checkInValue);
  const goalsTone = goalsHealthTone(goalsStatus, goalsValue);
  const tasksTone = tasksHealthTone(completedTasks, activeTasks, overdueTasks);

  const content = (
    <>
      <MemberAvatar image={image} name={name} size={layout.avatarSize} />
      <View style={{ width: layout.avatarGap, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <IdentityBlock
            name={name}
            isCurrentUser={isCurrentUser}
            nameFontSize={layout.nameFontSize}
          />
          <View style={{ alignSelf: "flex-start", marginTop: 2 }}>
            <RoleBadge role={role} />
          </View>
        </View>
        {showMetrics ? (
          <View style={{ marginLeft: 6, transform: [{ translateY: -1 }] }}>
            {hasProfilePermission ? (
              <MetricsRow
                checkInValue={checkInValue}
                goalsValue={goalsValue}
                completedTasks={completedTasks}
                activeTasks={activeTasks}
                overdueTasks={overdueTasks}
                checkInTone={checkInTone}
                goalsTone={goalsTone}
                tasksTone={tasksTone}
                checkInStatus={checkInStatus}
                width={layout.metricsWidth}
              />
            ) : (
              <PrivateMetricsRow />
            )}
          </View>
        ) : null}
        {onPress ? <ChevronRight size={14} color="#94A3B8" style={{ marginLeft: 4 }} /> : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} testID={testID} style={rowStyle}>
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={rowStyle}>
      {content}
    </View>
  );
}

export function TeamMemberRowSkeleton({ paid = true, showDivider = true }: { paid?: boolean; showDivider?: boolean }) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = getTeamMemberRowLayout(screenWidth);
  const rowStyle = teamMemberRowStyle(
    layout.rowPaddingHorizontal,
    layout.rowPaddingVertical,
    showDivider,
  );

  if (!paid) {
    return (
      <View style={rowStyle}>
        <View
          style={{
            width: layout.avatarSize,
            height: layout.avatarSize,
            borderRadius: layout.avatarSize / 2,
            backgroundColor: "#E2E8F0",
            flexShrink: 0,
          }}
        />
        <View style={{ width: layout.avatarGap }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: 10, width: "68%", backgroundColor: "#E2E8F0", borderRadius: 3 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={rowStyle}>
      <View
        style={{
          width: layout.avatarSize,
          height: layout.avatarSize,
          borderRadius: layout.avatarSize / 2,
          backgroundColor: "#E2E8F0",
          flexShrink: 0,
        }}
      />
      <View style={{ width: layout.avatarGap }} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: 10, width: "72%", backgroundColor: "#E2E8F0", borderRadius: 3, marginBottom: 4 }} />
          <View style={{ height: 14, width: 48, backgroundColor: "#F1F5F9", borderRadius: 7 }} />
        </View>
        <View style={{ width: layout.metricsWidth, flexDirection: "row", gap: 4 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ height: 7, width: "78%", backgroundColor: "#E2E8F0", borderRadius: 2 }} />
            <View style={{ height: 6, width: "64%", backgroundColor: "#F1F5F9", borderRadius: 2 }} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ height: 7, width: "72%", backgroundColor: "#E2E8F0", borderRadius: 2 }} />
            <View style={{ height: 6, width: "82%", backgroundColor: "#F1F5F9", borderRadius: 2 }} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <View style={{ height: 7, width: "70%", backgroundColor: "#E2E8F0", borderRadius: 2 }} />
            <View style={{ height: 6, width: "76%", backgroundColor: "#F1F5F9", borderRadius: 2 }} />
          </View>
        </View>
      </View>
    </View>
  );
}

/** Gap between member row cards in the list. */
export const TEAM_MEMBER_ROW_GAP = 5;
