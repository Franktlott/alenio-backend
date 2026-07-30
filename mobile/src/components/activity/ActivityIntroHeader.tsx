import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, SlidersHorizontal } from "lucide-react-native";
import type { ActivityFilter } from "./types";
import { ACTIVITY_FILTER_OPTIONS } from "./types";

type Props = {
  filter: ActivityFilter;
  workspaceLabel?: string;
  onPressFilter: () => void;
  testID?: string;
};

const EDGE_PAD = 14;

export function ActivityIntroHeader({
  filter,
  workspaceLabel,
  onPressFilter,
  testID = "activity-intro-header",
}: Props) {
  const activityLabel =
    ACTIVITY_FILTER_OPTIONS.find((option) => option.key === filter)?.label ?? "All";
  const filterSummary =
    workspaceLabel && workspaceLabel !== "All workspaces"
      ? `${activityLabel} · ${workspaceLabel}`
      : activityLabel;

  return (
    <View style={styles.wrap} testID={testID}>
      <Pressable
        onPress={onPressFilter}
        accessibilityRole="button"
        accessibilityLabel={`Filter activity. Current: ${filterSummary}`}
        testID={`${testID}-filter`}
        style={({ pressed }) => [
          styles.filterButton,
          pressed ? styles.filterButtonPressed : null,
        ]}
      >
        <View style={styles.filterIcon}>
          <SlidersHorizontal size={15} color="#4361EE" strokeWidth={2.25} />
        </View>
        <View style={styles.filterCopy}>
          <Text style={styles.filterTitle}>Filters</Text>
          <Text style={styles.filterSummary} numberOfLines={1}>
            {filterSummary}
          </Text>
        </View>
        <ChevronDown size={16} color="#64748B" strokeWidth={2.25} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: EDGE_PAD,
  },
  filterButton: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  filterButtonPressed: {
    backgroundColor: "#F8FAFC",
  },
  filterIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF2FF",
  },
  filterCopy: {
    flex: 1,
    minWidth: 0,
  },
  filterTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  filterSummary: {
    marginTop: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "500",
    color: "#64748B",
  },
});
