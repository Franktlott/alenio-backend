import { View, Text, Pressable } from "react-native";
import type { TaskStatusTab } from "./workspace-types";
import { WS } from "./workspace-ui";

type Props = {
  statusTab: TaskStatusTab;
  activeCount: number;
  completedCount: number;
  onChange: (tab: TaskStatusTab) => void;
};

export function TaskStatusTabs({
  statusTab,
  activeCount,
  completedCount,
  onChange,
}: Props) {
  const tabs: { key: TaskStatusTab; label: string }[] = [
    { key: "active", label: `Active (${activeCount})` },
    { key: "completed", label: `Completed (${completedCount})` },
    { key: "archived", label: "Archive" },
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
        const isArchive = tab.key === "archived";
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={{
              flex: isArchive ? 0.72 : 1.14,
              borderRadius: 8,
              paddingVertical: 7,
              paddingHorizontal: isArchive ? 4 : 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? WS.accent : "transparent",
            }}
            testID={`filter-${tab.key}`}
          >
            <Text
              style={{
                fontSize: WS.control - 1,
                fontWeight: WS.controlWeight,
                color: selected ? "white" : WS.muted,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
