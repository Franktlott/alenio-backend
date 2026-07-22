import React from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Lock } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import type { MemberStandardsCompliance } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";

const STANDARD_PHONE_MIN_WIDTH = 375;
const AVATAR_SIZE = 32;

export type MetricHealthTone = "good" | "attention" | "critical" | "neutral";

const METRIC_VALUE_COLORS: Record<MetricHealthTone, string> = {
  good: "#128A52",
  attention: "#D97706",
  critical: "#E02424",
  neutral: "#172033",
};

export function checkInHealthTone(
  status: MemberStandardsCompliance["checkInStatus"] | undefined,
  value?: string,
): MetricHealthTone {
  if (status === "on_track") return "good";
  if (status === "due_soon") return "attention";
  if (status === "overdue") return "critical";
  if (status === "not_required") return "neutral";
  if (!value || value === "—" || value.toLowerCase() === "none") return "critical";
  return "neutral";
}

export function goalsHealthTone(
  status: MemberStandardsCompliance["goalsStatus"] | undefined,
  value?: string,
): MetricHealthTone {
  if (status === "on_track") return "good";
  if (status === "missing_goals") return "critical";
  if (status === "not_required") return "neutral";
  if (!value || value === "—" || value === "0" || value.toLowerCase() === "none") return "critical";
  return "neutral";
}

export function getTeamMemberRowLayout(screenWidth: number) {
  const compact = screenWidth < STANDARD_PHONE_MIN_WIDTH;
  // Wider than the old Check-in/Goals columns so they fill the space Status used to occupy.
  const metricsCheckInWidth = compact ? 64 : 70;
  const metricsGoalsWidth = compact ? 48 : 52;
  return {
    compact,
    avatarSize: AVATAR_SIZE,
    rowPaddingHorizontal: compact ? 8 : 10,
    rowPaddingVertical: 6,
    nameFontSize: 13,
    avatarGap: 6,
    metricsCheckInWidth,
    metricsGoalsWidth,
    metricsRowWidth: metricsCheckInWidth + metricsGoalsWidth,
    metricsColumnWidth: compact ? 52 : 56,
    borderRadius: 11,
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
    />
  );
}

function IdentityBlock({
  name,
  role,
  isCurrentUser,
  nameFontSize,
}: {
  name: string;
  role: TeamMember["role"];
  isCurrentUser?: boolean;
  nameFontSize: number;
}) {
  const isOwner = role === "owner";
  const displayName = isCurrentUser ? `${name} (you)` : name;

  return (
    <View style={{ minWidth: 0, flexGrow: 1, flexShrink: 1, paddingRight: 4 }}>
      <Text
        style={{ fontSize: nameFontSize, fontWeight: "700", color: "#111827", lineHeight: 16 }}
        numberOfLines={2}
        ellipsizeMode="tail"
      >
        {displayName}
      </Text>
      {isOwner ? (
        <View
          style={{
            alignSelf: "flex-start",
            marginTop: 1,
            height: 15,
            paddingHorizontal: 6,
            borderRadius: 8,
            backgroundColor: "#EEF2FF",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "600", color: "#4361EE", lineHeight: 11 }}>
            {memberRoleLabel(role)}
          </Text>
        </View>
      ) : (
        <Text style={{ fontSize: 10, fontWeight: "500", color: "#667085", marginTop: 1, lineHeight: 12 }}>
          {memberRoleLabel(role)}
        </Text>
      )}
    </View>
  );
}

function MetricColumn({
  label,
  value,
  width,
  tone,
}: {
  label: string;
  value: string;
  width: number;
  tone: MetricHealthTone;
}) {
  return (
    <View style={{ width, alignItems: "center", justifyContent: "flex-start", flexShrink: 0 }}>
      <Text style={{ fontSize: 8, fontWeight: "500", color: "#7A8699", lineHeight: 10, textAlign: "center" }}>
        {label}
      </Text>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: METRIC_VALUE_COLORS[tone],
          lineHeight: 13,
          marginTop: 1,
          textAlign: "center",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricsRow({
  checkInValue,
  goalsValue,
  checkInTone,
  goalsTone,
  rowWidth,
  checkInWidth,
  goalsWidth,
}: {
  checkInValue: string;
  goalsValue: string;
  checkInTone: MetricHealthTone;
  goalsTone: MetricHealthTone;
  rowWidth: number;
  checkInWidth: number;
  goalsWidth: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        alignSelf: "flex-end",
        justifyContent: "flex-end",
        marginLeft: 6,
        width: rowWidth,
        flexShrink: 0,
      }}
    >
      <MetricColumn label="Check-in" value={checkInValue} width={checkInWidth} tone={checkInTone} />
      <MetricColumn label="Goals" value={goalsValue} width={goalsWidth} tone={goalsTone} />
    </View>
  );
}

function PrivateMetricsRow() {
  return (
    <View style={{ alignSelf: "flex-end" }}>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: 12,
          backgroundColor: "#F1F5F9",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Lock size={12} color="#94A3B8" />
      </View>
    </View>
  );
}

export function teamMemberRowStyle(
  rowPaddingHorizontal: number,
  rowPaddingVertical: number,
  borderRadius: number,
) {
  return {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    paddingHorizontal: rowPaddingHorizontal,
    paddingVertical: rowPaddingVertical,
    borderRadius,
    borderWidth: 1,
    borderColor: "#E3E8F0",
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
  checkInStatus?: MemberStandardsCompliance["checkInStatus"];
  goalsStatus?: MemberStandardsCompliance["goalsStatus"];
  showMetrics?: boolean;
  hasProfilePermission?: boolean;
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
  checkInStatus,
  goalsStatus,
  showMetrics = true,
  hasProfilePermission = true,
  onPress,
  testID,
}: TeamMemberRowProps) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = getTeamMemberRowLayout(screenWidth);
  const rowStyle = teamMemberRowStyle(
    layout.rowPaddingHorizontal,
    layout.rowPaddingVertical,
    layout.borderRadius,
  );
  const checkInTone = checkInHealthTone(checkInStatus, checkInValue);
  const goalsTone = goalsHealthTone(goalsStatus, goalsValue);

  const content = (
    <>
      <MemberAvatar image={image} name={name} size={layout.avatarSize} />
      <View style={{ width: layout.avatarGap, flexShrink: 0 }} />
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <IdentityBlock
            name={name}
            role={role}
            isCurrentUser={isCurrentUser}
            nameFontSize={layout.nameFontSize}
          />
        </View>
        {showMetrics && hasProfilePermission ? (
          <MetricsRow
            checkInValue={checkInValue}
            goalsValue={goalsValue}
            checkInTone={checkInTone}
            goalsTone={goalsTone}
            rowWidth={layout.metricsRowWidth}
            checkInWidth={layout.metricsCheckInWidth}
            goalsWidth={layout.metricsGoalsWidth}
          />
        ) : showMetrics ? (
          <PrivateMetricsRow />
        ) : null}
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

export function TeamMemberRowSkeleton({ paid = true }: { paid?: boolean }) {
  const { width: screenWidth } = useWindowDimensions();
  const layout = getTeamMemberRowLayout(screenWidth);
  const rowStyle = teamMemberRowStyle(
    layout.rowPaddingHorizontal,
    layout.rowPaddingVertical,
    layout.borderRadius,
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
          <View style={{ height: 10, width: "68%", backgroundColor: "#E2E8F0", borderRadius: 3, marginBottom: 4 }} />
          <View style={{ height: 8, width: "32%", backgroundColor: "#F1F5F9", borderRadius: 3 }} />
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
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start" }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: 10, width: "64%", backgroundColor: "#E2E8F0", borderRadius: 3, marginBottom: 4 }} />
          <View style={{ height: 8, width: "28%", backgroundColor: "#F1F5F9", borderRadius: 3 }} />
        </View>
        <View
          style={{
            flexDirection: "row",
            width: layout.metricsRowWidth,
            justifyContent: "flex-end",
            flexShrink: 0,
          }}
        >
          {[0, 1].map((index) => (
            <View key={index} style={{ width: layout.metricsColumnWidth, alignItems: "center", gap: 3 }}>
              <View style={{ height: 6, width: "58%", backgroundColor: "#F1F5F9", borderRadius: 2 }} />
              <View style={{ height: 8, width: "42%", backgroundColor: "#E2E8F0", borderRadius: 3 }} />
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** Extra scroll padding so the last row clears the guidance banner. */
export function teamMemberListBottomPadding(hasFormerMembers: boolean): number {
  return hasFormerMembers ? 64 : 56;
}

/** Gap between member row cards in the list. */
export const TEAM_MEMBER_ROW_GAP = 5;
