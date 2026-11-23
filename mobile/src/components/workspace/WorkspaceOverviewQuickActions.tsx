import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  CalendarDays,
  CheckSquare,
  Megaphone,
  Settings,
  UserPlus,
  type LucideIcon,
} from "lucide-react-native";

type ActionKey = "event" | "task" | "member" | "post" | "settings";

type Action = {
  key: ActionKey;
  line1: string;
  line2: string;
  Icon: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
};

type Props = {
  onScheduleEvent: () => void;
  onCreateTask: () => void;
  onAddMember: () => void;
  onPostUpdate: () => void;
  onWorkspaceSettings?: () => void;
  canScheduleEvent?: boolean;
  canCreateTask?: boolean;
  canAddMember?: boolean;
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
 */
export function WorkspaceOverviewQuickActions({
  onScheduleEvent,
  onCreateTask,
  onAddMember,
  onPostUpdate,
  onWorkspaceSettings,
  canScheduleEvent = true,
  canCreateTask = true,
  canAddMember = true,
  canPostUpdate = true,
  canOpenSettings = false,
}: Props) {
  const actions: Action[] = [
    {
      key: "event",
      line1: "Schedule",
      line2: "an event",
      Icon: CalendarDays,
      onPress: onScheduleEvent,
      disabled: !canScheduleEvent,
    },
    {
      key: "task",
      line1: "Create",
      line2: "a task",
      Icon: CheckSquare,
      onPress: onCreateTask,
      disabled: !canCreateTask,
    },
    {
      key: "member",
      line1: "Add",
      line2: "member",
      Icon: UserPlus,
      onPress: onAddMember,
      disabled: !canAddMember,
    },
    {
      key: "post",
      line1: "Post",
      line2: "an update",
      Icon: Megaphone,
      onPress: onPostUpdate,
      disabled: !canPostUpdate,
    },
  ];

  if (canOpenSettings && onWorkspaceSettings) {
    actions.push({
      key: "settings",
      line1: "Workspace",
      line2: "settings",
      Icon: Settings,
      onPress: onWorkspaceSettings,
    });
  }

  const compact = actions.length >= 5;

  return (
    <View style={styles.row} testID="workspace-overview-quick-actions">
      {actions.map(({ key, line1, line2, Icon, onPress, disabled }, index) => (
        <View
          key={key}
          style={[styles.cell, index > 0 ? styles.cellGap : null]}
        >
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`${line1} ${line2}`}
            accessibilityState={{ disabled: !!disabled }}
            testID={`workspace-overview-action-${key}`}
            style={styles.pressable}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.tile,
                  compact ? styles.tileCompact : null,
                  disabled ? styles.tileDisabled : null,
                  pressed && !disabled ? styles.tilePressed : null,
                ]}
              >
                <View style={[styles.iconChip, compact ? styles.iconChipCompact : null]}>
                  <Icon
                    size={compact ? 15 : 16}
                    color={ICON}
                    strokeWidth={2.2}
                  />
                </View>
                <Text style={[styles.label, compact ? styles.labelCompact : null]}>
                  {line1}
                  {"\n"}
                  {line2}
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
  },
  cell: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  cellGap: {
    marginLeft: 6,
  },
  pressable: {
    width: "100%",
  },
  tile: {
    width: "100%",
    minHeight: 88,
    borderRadius: 14,
    backgroundColor: TILE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 12,
    shadowColor: "#1E1B4B",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tileCompact: {
    minHeight: 84,
    paddingHorizontal: 2,
    paddingVertical: 10,
  },
  tilePressed: {
    backgroundColor: TILE_PRESSED,
    shadowOpacity: 0.03,
  },
  tileDisabled: {
    opacity: 0.4,
  },
  iconChip: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: CHIP,
    alignItems: "center",
    justifyContent: "center",
  },
  iconChipCompact: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  label: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "600",
    letterSpacing: -0.1,
    color: LABEL,
    textAlign: "center",
  },
  labelCompact: {
    marginTop: 6,
    fontSize: 10,
    lineHeight: 12,
  },
});
