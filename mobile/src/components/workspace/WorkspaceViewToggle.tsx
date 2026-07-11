import { View, Text, Pressable } from "react-native";
import { CalendarDays, ListTodo } from "lucide-react-native";
import { WS } from "./workspace-ui";

export type WorkspaceViewMode = "calendar" | "tasks";

type Props = {
  mode: WorkspaceViewMode;
  onChange: (mode: WorkspaceViewMode) => void;
  calendarBadge?: number;
  tasksBadge?: number;
};

export function WorkspaceViewToggle({
  mode,
  onChange,
  calendarBadge = 0,
  tasksBadge = 0,
}: Props) {
  const tabs: {
    key: WorkspaceViewMode;
    label: string;
    Icon: typeof CalendarDays;
    badge: number;
  }[] = [
    { key: "calendar", label: "Calendar", Icon: CalendarDays, badge: calendarBadge },
    { key: "tasks", label: "Tasks", Icon: ListTodo, badge: tasksBadge },
  ];

  return (
    <View
      style={{
        marginHorizontal: WS.pageGutter,
        marginTop: WS.sectionGap,
        marginBottom: 4,
        flexDirection: "row",
        backgroundColor: WS.chipBg,
        borderRadius: 10,
        padding: 3,
      }}
      testID="workspace-view-toggle"
    >
      {tabs.map(({ key, label, Icon, badge }) => {
        const selected = mode === key;
        const showBadge = badge > 0 && !selected;
        return (
          <Pressable
            key={key}
            onPress={() => onChange(key)}
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              borderRadius: 8,
              paddingVertical: 7,
              backgroundColor: selected ? WS.accent : "transparent",
            }}
            testID={`workspace-view-${key}`}
            accessibilityLabel={showBadge ? `${label}, ${badge} new` : label}
          >
            <View style={{ position: "relative" }}>
              <Icon size={14} color={selected ? "#FFFFFF" : WS.muted} strokeWidth={2.25} />
              {showBadge ? (
                <View
                  style={{
                    position: "absolute",
                    top: -5,
                    right: -8,
                    minWidth: 14,
                    height: 14,
                    borderRadius: 7,
                    backgroundColor: "#EF4444",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 3,
                    borderWidth: 1.5,
                    borderColor: selected ? WS.accent : WS.chipBg,
                  }}
                  testID={`workspace-view-${key}-badge`}
                >
                  <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "800", lineHeight: 11 }}>
                    {badge > 9 ? "9+" : String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: WS.control,
                fontWeight: WS.controlWeight,
                color: selected ? "#FFFFFF" : WS.muted,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
