import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CalendarDays,
  CheckSquare,
  Megaphone,
  Settings,
  type LucideIcon,
} from "lucide-react-native";

type ActionKey = "event" | "task" | "post" | "settings";

type Action = {
  key: ActionKey;
  label: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
};

type Props = {
  onScheduleEvent: () => void;
  onCreateTask: () => void;
  onPostUpdate: () => void;
  onWorkspaceSettings?: () => void;
  canScheduleEvent?: boolean;
  canCreateTask?: boolean;
  canPostUpdate?: boolean;
  /** Owners/leaders: show Workspace settings tile. */
  canOpenSettings?: boolean;
};

/** Soft white tiles + muted brand icon chips — premium without loud purple fills. */
const ICON = "#5B21B6";
const LABEL = "#1F2937";
const TILE = "#FFFFFF";
const TILE_PRESSED = "#F8FAFC";
const CHIP = "#F5F3FF";
const BORDER = "#E8EAF0";

/**
 * Overview quick actions under the workspace card.
 * Settings appears for owners/leaders only.
 * Labels stay on one line — no orphan second-line words.
 */
export function WorkspaceOverviewQuickActions({
  onScheduleEvent,
  onCreateTask,
  onPostUpdate,
  onWorkspaceSettings,
  canScheduleEvent = true,
  canCreateTask = true,
  canPostUpdate = true,
  canOpenSettings = false,
}: Props) {
  const actions: Action[] = [
    {
      key: "event",
      label: "New event",
      Icon: CalendarDays,
      onPress: onScheduleEvent,
      disabled: !canScheduleEvent,
    },
    {
      key: "task",
      label: "New task",
      Icon: CheckSquare,
      onPress: onCreateTask,
      disabled: !canCreateTask,
    },
    {
      key: "post",
      label: "Post update",
      Icon: Megaphone,
      onPress: onPostUpdate,
      disabled: !canPostUpdate,
    },
  ];

  if (canOpenSettings && onWorkspaceSettings) {
    actions.push({
      key: "settings",
      label: "Settings",
      Icon: Settings,
      onPress: onWorkspaceSettings,
    });
  }

  return (
    <View style={styles.row} testID="workspace-overview-quick-actions">
      {actions.map(({ key, label, Icon, onPress, disabled }) => (
        <View key={key} style={styles.cell}>
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: !!disabled }}
            testID={`workspace-overview-action-${key}`}
            style={styles.pressable}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.tile,
                  disabled ? styles.tileDisabled : null,
                  pressed && !disabled ? styles.tilePressed : null,
                ]}
              >
                <View style={styles.iconChip}>
                  <Icon size={14} color={ICON} strokeWidth={2.2} />
                </View>
                <Text style={styles.label} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
    gap: 6,
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    maxWidth: 120,
  },
  pressable: {
    width: "100%",
  },
  tile: {
    width: "100%",
    minHeight: 68,
    borderRadius: 12,
    backgroundColor: TILE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    paddingVertical: 10,
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  tilePressed: {
    backgroundColor: TILE_PRESSED,
    shadowOpacity: 0.03,
  },
  tileDisabled: {
    opacity: 0.4,
  },
  iconChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: CHIP,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 6,
    width: "100%",
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: LABEL,
    textAlign: "center",
  },
});
