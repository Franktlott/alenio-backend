import { View, Text, Pressable, Platform } from "react-native";
import type { TaskStatusTab } from "./workspace-types";
import { WS } from "./workspace-ui";

type Props = {
  statusTab: TaskStatusTab;
  activeCount: number;
  completedCount: number;
  onChange: (tab: TaskStatusTab) => void;
};

const TAB_HEIGHT = 32;
const TAB_FONT = WS.control - 1;
const TAB_LINE = TAB_FONT + 2;

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
        alignItems: "center",
        backgroundColor: WS.chipBg,
        borderRadius: 10,
        padding: 3,
        height: TAB_HEIGHT + 6,
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
              height: TAB_HEIGHT,
              borderRadius: 8,
              paddingHorizontal: isArchive ? 4 : 2,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: selected ? WS.accent : "transparent",
            }}
            testID={`filter-${tab.key}`}
          >
            <Text
              style={{
                fontSize: TAB_FONT,
                lineHeight: TAB_LINE,
                fontWeight: WS.controlWeight,
                color: selected ? "white" : WS.muted,
                textAlign: "center",
                ...(Platform.OS === "android"
                  ? { includeFontPadding: false, textAlignVertical: "center" as const }
                  : {}),
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
