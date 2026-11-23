import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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

const CONTROL_HEIGHT = 28;

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
      <View style={styles.row}>
        <View style={styles.search} testID="task-search-control">
          <Search size={12} color="#8A96A8" strokeWidth={2.1} />
          <TextInput
            value={searchQuery}
            onChangeText={onChangeSearch}
            placeholder="Search tasks..."
            placeholderTextColor="#8A96A8"
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
            style={styles.searchInput}
            accessibilityLabel="Search tasks"
            testID="task-search-input"
          />
        </View>

        <Pressable
          onPress={onOpenFilterView}
          style={[
            styles.filter,
            filtersActive ? styles.filterActive : null,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Open task filters"
          testID="task-filter-button"
        >
          <SlidersHorizontal
            size={12}
            color={filtersActive ? WS.ink : WS.muted}
            strokeWidth={2.2}
          />
          <Text style={styles.filterLabel}>Filters</Text>
        </Pressable>

        {canCreateTask ? (
          <Pressable
            onPress={onCreateTask}
            style={styles.newButton}
            accessibilityRole="button"
            accessibilityLabel={`New ${createLabel}`}
            testID="task-new-button"
          >
            <Plus size={12} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={styles.newLabel} numberOfLines={1}>
              New
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  search: {
    flex: 1,
    height: CONTROL_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    marginLeft: 5,
    paddingVertical: 0,
    fontSize: 12.5,
    lineHeight: 16,
    textAlignVertical: "center",
    color: WS.ink,
  },
  filter: {
    height: CONTROL_HEIGHT,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E4E7EC",
    backgroundColor: "#FFFFFF",
  },
  filterActive: {
    borderColor: "#D0D5DD",
    backgroundColor: "#F5F7FA",
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: WS.ink,
  },
  newButton: {
    height: CONTROL_HEIGHT,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: colors.brand,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  newLabel: {
    marginLeft: 3,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
