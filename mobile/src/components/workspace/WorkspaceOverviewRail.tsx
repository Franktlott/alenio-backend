import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  ArrowRight,
  CalendarCheck,
  Target,
  type LucideIcon,
} from "lucide-react-native";
import type { MemberDevelopmentStatus } from "@/lib/member-development-preview";

type DevelopmentProps = {
  variant?: "team" | "personal";
  checkInsOnTrackPercent: number;
  goalsOnTrackPercent: number;
  onTrackCount: number;
  needsAttentionCount: number;
  notStartedCount: number;
  /** Personal status for the member variant. */
  personalStatus?: MemberDevelopmentStatus | null;
  onPressCheckIns: () => void;
  onPressGoals: () => void;
  onPressViewMembers: () => void;
};

const PURPLE = "#6d28d9";
const AMBER = "#F59E0B";
const SLATE = "#CBD5E1";
const GREEN = "#22C55E";
const TRACK = "#E8E8EE";
const RING_SIZE = 78;
const RING_STROKE = 7;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function statusColor(level: MemberDevelopmentStatus["level"]): string {
  switch (level) {
    case "on_track":
      return GREEN;
    case "due_soon":
      return AMBER;
    case "needs_attention":
      return "#EF4444";
    case "not_required":
    case "unavailable":
    default:
      return SLATE;
  }
}

function ProgressRing({
  percent,
  label,
  accentColor,
  Icon,
  onPress,
  testID,
  accessibilityLabel,
}: {
  percent: number;
  label: string;
  accentColor: string;
  Icon: LucideIcon;
  onPress: () => void;
  testID: string;
  accessibilityLabel: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const dashOffset = RING_CIRCUMFERENCE * (1 - clamped / 100);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={({ pressed }) => [
        styles.ringColumn,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.ringTrack}>
        <Svg width={RING_SIZE} height={RING_SIZE} style={styles.ringSvg}>
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={TRACK}
            strokeWidth={RING_STROKE}
            fill="none"
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            stroke={accentColor}
            strokeWidth={RING_STROKE}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Icon size={12} color={accentColor} strokeWidth={2.4} />
          <Text style={styles.ringValue}>{clamped}%</Text>
          <Text style={styles.ringLabel}>{label}</Text>
        </View>
      </View>
    </Pressable>
  );
}

function KeyRow({
  color,
  label,
  count,
  showDivider,
}: {
  color: string;
  label: string;
  count: number;
  showDivider: boolean;
}) {
  return (
    <View>
      <View style={styles.keyRow}>
        <View style={[styles.keyDot, { backgroundColor: color }]} />
        <Text style={styles.keyLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.keyCount}>{count}</Text>
      </View>
      {showDivider ? <View style={styles.keyDivider} /> : null}
    </View>
  );
}

/**
 * Overview Team Development card — Check-ins | Goals | Key (phone + landscape).
 * `personal` shows the signed-in member’s own progress instead of the team board.
 */
export function WorkspaceOverviewTeamDevelopment({
  variant = "team",
  checkInsOnTrackPercent,
  goalsOnTrackPercent,
  onTrackCount,
  needsAttentionCount,
  notStartedCount,
  personalStatus = null,
  onPressCheckIns,
  onPressGoals,
  onPressViewMembers,
}: DevelopmentProps) {
  const isPersonal = variant === "personal";
  const statusDot = personalStatus
    ? statusColor(personalStatus.level)
    : SLATE;

  return (
    <View
      style={styles.card}
      testID="workspace-overview-team-development"
      accessibilityLabel={
        isPersonal ? "Your development" : "Team development"
      }
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.devTitle}>
            {isPersonal ? "Your Development" : "Team Development"}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {isPersonal ? "Your goals and check-ins" : "Goals and check-ins"}
          </Text>
        </View>
        <Pressable
          onPress={onPressViewMembers}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={isPersonal ? "Open your development" : "View members"}
          testID={
            isPersonal
              ? "workspace-overview-open-development"
              : "workspace-overview-view-members"
          }
          style={({ pressed }) => [
            styles.viewMembersPress,
            pressed ? styles.viewMembersPressed : null,
          ]}
        >
          <View style={styles.viewMembers}>
            <Text style={styles.viewMembersText}>
              {isPersonal ? "Open" : "Members"}
            </Text>
            <ArrowRight size={14} color={PURPLE} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>

      <View style={styles.body}>
        <ProgressRing
          percent={checkInsOnTrackPercent}
          label="Check-ins"
          accentColor={PURPLE}
          Icon={CalendarCheck}
          onPress={onPressCheckIns}
          testID="workspace-overview-check-ins"
          accessibilityLabel={
            isPersonal ? "Your check-ins" : "Active check-ins"
          }
        />
        <View style={styles.columnDivider} />
        <ProgressRing
          percent={goalsOnTrackPercent}
          label="Goals"
          accentColor={PURPLE}
          Icon={Target}
          onPress={onPressGoals}
          testID="workspace-overview-goals"
          accessibilityLabel={isPersonal ? "Your goals" : "Goals"}
        />
        <View style={styles.columnDivider} />
        {isPersonal ? (
          <Pressable
            onPress={onPressViewMembers}
            accessibilityRole="button"
            accessibilityLabel="Your development status"
            testID="workspace-overview-personal-status"
            style={({ pressed }) => [
              styles.keyColumn,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.keyTitle}>Status</Text>
            <View style={styles.statusBlock}>
              <View style={[styles.keyDot, { backgroundColor: statusDot }]} />
              <Text style={styles.statusTitle} numberOfLines={2}>
                {personalStatus?.title ?? "Status unavailable"}
              </Text>
            </View>
            <Text style={styles.statusDetail} numberOfLines={3}>
              {personalStatus?.detail ??
                "Your development status will appear when data is available."}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.keyColumn}>
            <Text style={styles.keyTitle}>Key</Text>
            <KeyRow
              color={GREEN}
              label="On Track"
              count={onTrackCount}
              showDivider
            />
            <KeyRow
              color={AMBER}
              label="Needs Attention"
              count={needsAttentionCount}
              showDivider
            />
            <KeyRow
              color={SLATE}
              label="Not Started"
              count={notStartedCount}
              showDivider={false}
            />
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    padding: 10,
  },
  pressed: {
    opacity: 0.72,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  devTitle: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111827",
  },
  subtitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
  viewMembersPress: {
    flexShrink: 0,
  },
  viewMembers: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  viewMembersPressed: {
    opacity: 0.65,
  },
  viewMembersText: {
    marginRight: 4,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: PURPLE,
  },
  body: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  ringColumn: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  columnDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#E5E7EB",
    marginHorizontal: 2,
  },
  ringTrack: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  ringSvg: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  ringCenter: {
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
  },
  ringValue: {
    fontSize: 15,
    lineHeight: 17,
    fontWeight: "800",
    color: "#111827",
  },
  ringLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  keyColumn: {
    flex: 1.1,
    minWidth: 100,
    paddingLeft: 2,
  },
  keyTitle: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 1,
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  keyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
    flexShrink: 0,
  },
  keyLabel: {
    flex: 1,
    minWidth: 0,
    marginRight: 4,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
    color: "#4B5563",
  },
  keyCount: {
    flexShrink: 0,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    color: "#111827",
  },
  keyDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#E5E7EB",
  },
  statusBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 4,
    marginBottom: 4,
  },
  statusTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#111827",
  },
  statusDetail: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
});
