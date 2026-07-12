import React from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { Lock } from "lucide-react-native";
import type { TeamMember } from "@/lib/types";
import { formatMemberRosterStatusLabel } from "@/lib/member-stats-display";
import type { StandardsBadgeDisplay } from "@/lib/workplace-standards";
import { UserAvatar } from "@/components/UserAvatar";

const STANDARD_PHONE_MIN_WIDTH = 375;
const AVATAR_SIZE = 32;

export function getTeamMemberRowLayout(screenWidth: number) {
  const compact = screenWidth < STANDARD_PHONE_MIN_WIDTH;
  const metricsCheckInWidth = compact ? 40 : 42;
  const metricsGoalsWidth = compact ? 34 : 36;
  const metricsStatusWidth = compact ? 72 : 76;
  return {
    compact,
    avatarSize: AVATAR_SIZE,
    rowPaddingHorizontal: compact ? 8 : 10,
    rowPaddingVertical: 6,
    nameFontSize: 13,
    avatarGap: 6,
    metricsTabInset: 0,
    metricsTopGap: 1,
    metricsCheckInWidth,
    metricsGoalsWidth,
    metricsStatusWidth,
    metricsRowWidth: metricsCheckInWidth + metricsGoalsWidth + metricsStatusWidth,
    // kept for skeleton / older call sites that expect equal columns
    metricsColumnWidth: compact ? 44 : 46,
    borderRadius: 11,
  };
}

export function rosterStatusBadgeColors(label: string): { bg: string; text: string } {
  switch (label) {
    case "Not complete":
      return { bg: "#FEECEE", text: "#E02424" };
    case "Due soon":
      return { bg: "#FFF4E5", text: "#D97706" };
    case "On track":
      return { bg: "#E9F9F0", text: "#128A52" };
    case "Overdue":
      return { bg: "#FDECEC", text: "#C81E1E" };
    default:
      return { bg: "#F1F5F9", text: "#64748B" };
  }
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

function MetricColumn({ label, value, width }: { label: string; value: string; width: number }) {
  return (
    <View style={{ width, alignItems: "center", justifyContent: "flex-start", flexShrink: 0 }}>
      <Text style={{ fontSize: 8, fontWeight: "500", color: "#7A8699", lineHeight: 10, textAlign: "center" }}>
        {label}
      </Text>
      <Text
        style={{ fontSize: 11, fontWeight: "700", color: "#172033", lineHeight: 13, marginTop: 1, textAlign: "center" }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function StatusColumn({ badge, width }: { badge: StandardsBadgeDisplay | null; width: number }) {
  if (!badge) {
    return (
      <View style={{ width, alignItems: "center", justifyContent: "flex-start", flexShrink: 0 }}>
        <Text style={{ fontSize: 8, fontWeight: "500", color: "#7A8699", lineHeight: 10, textAlign: "center" }}>
          Status
        </Text>
        <Text style={{ fontSize: 11, fontWeight: "700", color: "#94A3B8", lineHeight: 13, marginTop: 1, textAlign: "center" }}>
          —
        </Text>
      </View>
    );
  }

  const label = formatMemberRosterStatusLabel(badge.label);
  const colors = rosterStatusBadgeColors(label);

  return (
    <View style={{ width, alignItems: "center", justifyContent: "flex-start", flexShrink: 0 }}>
      <Text style={{ fontSize: 8, fontWeight: "500", color: "#7A8699", lineHeight: 10, textAlign: "center" }}>
        Status
      </Text>
      <View
        style={{
          marginTop: 1,
          height: 16,
          paddingHorizontal: 7,
          borderRadius: 8,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
          alignSelf: "center",
        }}
      >
        <Text style={{ fontSize: 8, fontWeight: "700", color: colors.text, lineHeight: 10 }}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function MetricsRow({
  checkInValue,
  goalsValue,
  statusBadge,
  topGap,
  rowWidth,
  checkInWidth,
  goalsWidth,
  statusWidth,
}: {
  checkInValue: string;
  goalsValue: string;
  statusBadge: StandardsBadgeDisplay | null;
  topGap: number;
  rowWidth: number;
  checkInWidth: number;
  goalsWidth: number;
  statusWidth: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        alignSelf: "flex-end",
        justifyContent: "flex-end",
        marginTop: topGap,
        marginLeft: 6,
        width: rowWidth,
        flexShrink: 0,
      }}
    >
      <MetricColumn label="Check-in" value={checkInValue} width={checkInWidth} />
      <MetricColumn label="Goals" value={goalsValue} width={goalsWidth} />
      <StatusColumn badge={statusBadge} width={statusWidth} />
    </View>
  );
}

function PrivateMetricsRow({ topGap }: { topGap: number }) {
  return (
    <View style={{ marginTop: topGap, alignSelf: "flex-end" }}>
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
  statusBadge?: StandardsBadgeDisplay | null;
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
  statusBadge = null,
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
            statusBadge={statusBadge}
            topGap={0}
            rowWidth={layout.metricsRowWidth}
            checkInWidth={layout.metricsCheckInWidth}
            goalsWidth={layout.metricsGoalsWidth}
            statusWidth={layout.metricsStatusWidth}
          />
        ) : showMetrics ? (
          <PrivateMetricsRow topGap={0} />
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
          {[0, 1, 2].map((index) => (
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
