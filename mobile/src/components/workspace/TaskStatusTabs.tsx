import { View, Text, Pressable } from "react-native";
import type { TaskStatusTab } from "./workspace-types";
import { WS } from "./workspace-ui";

type Props = {
  statusTab: TaskStatusTab;
  activeCount: number;
  completedCount: number;
  onChange: (tab: TaskStatusTab) => void;
};

export function TaskStatusTabs({ statusTab, activeCount, completedCount, onChange }: Props) {
  const tabs: { key: TaskStatusTab; label: string }[] = [
    { key: "active", label: `Active (${activeCount})` },
    { key: "completed", label: `Completed (${completedCount})` },
  ];

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: WS.chipBg,
        borderRadius: 10,
        padding: 3,
      }}
    >
      {tabs.map((tab) => {
        const selected = statusTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{
              flex: 1,
              borderRadius: 8,
              paddingVertical: 7,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? WS.accent : "transparent",
            }}
            testID={`filter-${tab.key}`}
          >
            <Text
              style={{
                fontSize: WS.control,
                fontWeight: WS.controlWeight,
                color: selected ? "white" : WS.muted,
              }}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
