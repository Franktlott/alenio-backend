import { Pressable, Text, View } from "react-native";
import { ListFilter } from "lucide-react-native";
import type { ActivitySummary } from "./types";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  summary: ActivitySummary;
  onPressFilter?: () => void;
  testID?: string;
};

const CHIPS: { key: keyof ActivitySummary; label: string }[] = [
  { key: "updates", label: "Updates" },
  { key: "tasks", label: "Tasks" },
  { key: "events", label: "Events" },
];

export function ActivitySummaryChips({
  summary,
  onPressFilter,
  testID = "activity-summary-chips",
}: Props) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        gap: 8,
      }}
      testID={testID}
    >
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 6, minWidth: 0 }}>
        {CHIPS.map((chip) => {
          const count = summary[chip.key];
          return (
            <View
              key={chip.key}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 8,
                backgroundColor: ACTIVITY_COLORS.white,
                borderWidth: 1,
                borderColor: ACTIVITY_COLORS.slate200,
              }}
              testID={`${testID}-${chip.key}`}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color: ACTIVITY_COLORS.slate900 }}>{count}</Text>
              <Text style={{ fontSize: 12, fontWeight: "500", color: ACTIVITY_COLORS.slate500 }}>{chip.label}</Text>
            </View>
          );
        })}
      </View>

      {onPressFilter ? (
        <Pressable
          onPress={onPressFilter}
          hitSlop={8}
          testID={`${testID}-filter`}
          accessibilityRole="button"
          accessibilityLabel="Filter activity"
          style={({ pressed }) => ({
            width: 34,
            height: 34,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: pressed ? ACTIVITY_COLORS.slate100 : ACTIVITY_COLORS.white,
            borderWidth: 1,
            borderColor: ACTIVITY_COLORS.slate200,
            flexShrink: 0,
          })}
        >
          <ListFilter size={16} color={ACTIVITY_COLORS.slate700} strokeWidth={2.25} />
        </Pressable>
      ) : null}
    </View>
  );
}
