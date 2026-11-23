import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CalendarDays,
  CheckSquare,
  Users,
  type LucideIcon,
} from "lucide-react-native";

type MetricKey = "members" | "tasks" | "events";

type Metric = {
  key: MetricKey;
  value: number;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
};

type Props = {
  memberCount: number;
  openTaskCount: number;
  upcomingEventCount: number;
  onPressMembers: () => void;
  onPressTasks: () => void;
  onPressEvents: () => void;
};

const PURPLE = "#6d28d9";
const TILE = "#EDE7FF";

/**
 * Overview pulse — matches mock exactly:
 * white card, no inner box, icon left of number with label under the number.
 */
export function WorkspaceOverviewPulse({
  memberCount,
  openTaskCount,
  upcomingEventCount,
  onPressMembers,
  onPressTasks,
  onPressEvents,
}: Props) {
  const metrics: Metric[] = [
    {
      key: "members",
      value: memberCount,
      label: "Members",
      Icon: Users,
      onPress: onPressMembers,
    },
    {
      key: "tasks",
      value: openTaskCount,
      label: "Open tasks",
      Icon: CheckSquare,
      onPress: onPressTasks,
    },
    {
      key: "events",
      value: upcomingEventCount,
      // Two lines so it fits on narrow screens (matches mock).
      label: "Upcoming\nevents",
      Icon: CalendarDays,
      onPress: onPressEvents,
    },
  ];

  return (
    <View style={styles.card} testID="workspace-overview-pulse">
      <View style={styles.header}>
        <Text style={styles.title}>Workspace Pulse</Text>
        <Text style={styles.subtitle}>
          A quick look at what’s happening in your workspace.
        </Text>
      </View>

      <View style={styles.metrics}>
        {metrics.map(({ key, value, label, Icon, onPress }, index) => {
          const isLast = index === metrics.length - 1;
          return (
            <View
              key={key}
              style={[
                styles.metricCell,
                index > 0 ? styles.metricCellAfterDivider : null,
                !isLast ? styles.metricDivider : null,
              ]}
            >
              <Pressable
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel={`${value} ${label.replace("\n", " ")}`}
                testID={`workspace-overview-pulse-${key}`}
                style={({ pressed }) => [
                  styles.metricPress,
                  pressed ? styles.metricPressed : null,
                ]}
              >
                <View style={styles.metricRow}>
                  <View style={styles.metricIcon}>
                    <Icon size={14} color={PURPLE} strokeWidth={2.2} />
                  </View>
                  <View style={styles.metricCopy}>
                    <Text style={styles.metricValue} numberOfLines={1}>
                      {value}
                    </Text>
                    <Text style={styles.metricLabel} numberOfLines={2}>
                      {label}
                    </Text>
                  </View>
                </View>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 14,
    overflow: "hidden",
  },
  header: {
    marginBottom: 14,
  },
  title: {
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
  metrics: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  metricCell: {
    width: "33.333%",
    minWidth: 0,
    overflow: "hidden",
  },
  metricCellAfterDivider: {
    paddingLeft: 10,
  },
  metricDivider: {
    borderRightWidth: 1,
    borderRightColor: "#E8E8E8",
  },
  metricPress: {
    paddingVertical: 2,
    paddingRight: 4,
  },
  metricPressed: {
    opacity: 0.65,
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  metricIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: TILE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  metricCopy: {
    flexShrink: 1,
    flexGrow: 1,
    minWidth: 0,
    marginLeft: 6,
    justifyContent: "center",
  },
  metricValue: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#111827",
  },
  metricLabel: {
    marginTop: 0,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
});
