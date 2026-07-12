import { Pressable, Text, View } from "react-native";
import { ChevronDown } from "lucide-react-native";
import type { ActivityFilter } from "./types";
import { ACTIVITY_COLORS } from "./activity-ui";

type Props = {
  title?: string;
  subtitle?: string;
  filter: ActivityFilter;
  filterLabel: string;
  onPressFilter?: () => void;
  testID?: string;
};

export function ActivityIntroHeader({
  title = "Activity",
  subtitle = "What's happening with your team",
  filter: _filter,
  filterLabel,
  onPressFilter,
  testID = "activity-intro-header",
}: Props) {
  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        flexDirection: "row",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
      testID={testID}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ fontSize: 22, fontWeight: "800", color: ACTIVITY_COLORS.slate900, letterSpacing: -0.4 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: ACTIVITY_COLORS.slate500, lineHeight: 16 }}>{subtitle}</Text>
      </View>

      {onPressFilter ? (
        <Pressable
          onPress={onPressFilter}
          testID={`${testID}-filter-trigger`}
          hitSlop={6}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            backgroundColor: pressed ? ACTIVITY_COLORS.slate100 : ACTIVITY_COLORS.white,
            borderWidth: 1,
            borderColor: ACTIVITY_COLORS.slate200,
            marginTop: 2,
          })}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: ACTIVITY_COLORS.slate700 }} numberOfLines={1}>
            {filterLabel}
          </Text>
          <ChevronDown size={14} color={ACTIVITY_COLORS.slate500} />
        </Pressable>
      ) : null}
    </View>
  );
}
