import { Text, View } from "react-native";
import type { ActivitySummary } from "./types";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  summary: ActivitySummary;
  testID?: string;
};

const CHIPS: { key: keyof ActivitySummary; label: string }[] = [
  { key: "updates", label: "Updates" },
  { key: "tasks", label: "Tasks" },
  { key: "events", label: "Events" },
];

export function ActivitySummaryChips({ summary, testID = "activity-summary-chips" }: Props) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16 }} testID={testID}>
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
  );
}
