import { Pressable, Text, TextInput, View } from "react-native";
import { Plus, Search, SlidersHorizontal } from "lucide-react-native";
import type { WorkspaceFiltersState } from "./workspace-types";
import { WS } from "./workspace-ui";
import { colors } from "@/theme";

type Props = {
  filters: WorkspaceFiltersState;
  searchQuery: string;
  onChangeSearch: (value: string) => void;
  onOpenFilterView: () => void;
  canCreateTask: boolean;
  onCreateTask: () => void;
  createLabel?: "Task";
};

const CONTROL_HEIGHT = 32;

export function TaskShowingRow({
  filters,
  searchQuery,
  onChangeSearch,
  onOpenFilterView,
  canCreateTask,
  onCreateTask,
  createLabel = "Task",
}: Props) {
  const filtersActive =
    filters.dueDate !== "all" ||
    filters.priority !== "all" ||
    (filters.statusTab === "completed" || filters.statusTab === "archived"
      ? filters.sort !== "newest"
      : filters.sort !== "due");

  return (
    <View testID="task-showing-row">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
        }}
      >
        <View
          style={{
            flex: 1,
            height: CONTROL_HEIGHT,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#EEF2F6",
            backgroundColor: "#FFFFFF",
          }}
          testID="task-search-control"
        >
          <Search size={13} color="#8A96A8" strokeWidth={2.1} />
          <TextInput
            value={searchQuery}
            onChangeText={onChangeSearch}
            placeholder="Search tasks..."
            placeholderTextColor="#8A96A8"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              marginLeft: 6,
              paddingVertical: 0,
              fontSize: 13,
              lineHeight: 18,
              textAlignVertical: "center",
              color: WS.ink,
            }}
            accessibilityLabel="Search tasks"
            testID="task-search-input"
          />
        </View>

        <Pressable
          onPress={onOpenFilterView}
          style={{
            height: CONTROL_HEIGHT,
            paddingHorizontal: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 5,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: filtersActive ? "#D7DEE8" : "#EEF2F6",
            backgroundColor: filtersActive ? "#F5F7FA" : "#FFFFFF",
          }}
          accessibilityRole="button"
          accessibilityLabel="Open task filters"
          testID="task-filter-button"
        >
          <SlidersHorizontal
            size={13}
            color={filtersActive ? WS.ink : WS.muted}
            strokeWidth={2.2}
          />
          <Text
            style={{
              fontSize: 12,
              fontWeight: "700",
              color: WS.ink,
            }}
          >
            Filters
          </Text>
        </Pressable>

        {canCreateTask ? (
          <Pressable
            onPress={onCreateTask}
            style={{
              height: CONTROL_HEIGHT,
              paddingHorizontal: 11,
              borderRadius: 999,
              backgroundColor: colors.brand,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
            }}
            accessibilityRole="button"
            accessibilityLabel={`New ${createLabel}`}
            testID="task-new-button"
          >
            <Plus size={13} color="#FFFFFF" strokeWidth={2.8} />
            <Text
              style={{
                marginLeft: 3,
                fontSize: 12.5,
                lineHeight: 15,
                fontWeight: "700",
                color: "#FFFFFF",
              }}
              numberOfLines={1}
            >
              New
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
