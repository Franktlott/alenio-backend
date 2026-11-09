import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CalendarDays,
  ListChecks,
  Megaphone,
  Users,
  type LucideIcon,
} from "lucide-react-native";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { colors } from "@/theme";
import { WS } from "./workspace-ui";

export type WorkspaceViewMode =
  | "updates"
  | "calendar"
  | "tasks"
  | "development";

type Props = {
  mode: WorkspaceViewMode;
  onChange: (mode: WorkspaceViewMode) => void;
  calendarBadge?: number;
  tasksBadge?: number;
};

const TABS: {
  key: WorkspaceViewMode;
  label: string;
  Icon: LucideIcon;
}[] = [
  { key: "updates", label: "Feed", Icon: Megaphone },
  { key: "calendar", label: "Calendar", Icon: CalendarDays },
  { key: "tasks", label: "Tasks", Icon: ListChecks },
  // The roster was always a workspace mode; it just had no tab of its own.
  { key: "development", label: "Members", Icon: Users },
];

export function WorkspaceViewToggle({
  mode,
  onChange,
  calendarBadge = 0,
  tasksBadge = 0,
}: Props) {
  const cluster = useStatusClusterInset();
  const badges: Record<WorkspaceViewMode, number> = {
    updates: 0,
    calendar: calendarBadge,
    tasks: tasksBadge,
    development: 0,
  };

  return (
    <View
      style={[
        styles.track,
        {
          marginLeft: WS.pageGutter + cluster.left,
          marginRight: WS.pageGutter + cluster.right,
        },
      ]}
      testID="workspace-view-toggle"
      accessibilityRole="tablist"
    >
      {TABS.map(({ key, label, Icon }) => {
        const selected = mode === key;
        const badge = badges[key];
        const showBadge = badge > 0 && !selected;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={[styles.tab, selected ? styles.tabSelected : null]}
            testID={`workspace-view-${key}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={showBadge ? `${label}, ${badge} new` : label}
          >
            <Icon
              size={13}
              color={selected ? "#FFFFFF" : colors.textMuted}
              strokeWidth={selected ? 2.4 : 2.1}
            />
            <Text
              style={[styles.label, selected ? styles.labelSelected : null]}
              numberOfLines={1}
            >
              {label}
            </Text>
            {showBadge ? (
              <View style={styles.badge} testID={`workspace-view-${key}-badge`}>
                <Text style={styles.badgeText}>
                  {badge > 9 ? "9+" : String(badge)}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    marginTop: 8,
    marginBottom: 6,
    height: 38,
    padding: 3,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 12,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 9,
  },
  tabSelected: {
    backgroundColor: colors.brand,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  labelSelected: {
    fontWeight: "700",
    color: "#FFFFFF",
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.error,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
    lineHeight: 11,
  },
});
