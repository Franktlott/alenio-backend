import { Text, View, StyleSheet } from "react-native";
import { Star } from "lucide-react-native";
import { STARS_GOLD, starsMilestoneSegment } from "@/lib/stars";

type Props = {
  currentStars: number;
  nextMilestone?: number;
  filledInSegment?: number;
  segmentSize?: number;
  remainingToMilestone?: number;
  testID?: string;
};

export function StarsPath({
  currentStars,
  nextMilestone: nextOverride,
  filledInSegment: filledOverride,
  segmentSize: sizeOverride,
  remainingToMilestone: remainingOverride,
  testID = "stars-path",
}: Props) {
  const segment = starsMilestoneSegment(currentStars);
  const nextMilestone = nextOverride ?? segment.nextMilestone;
  const filledInSegment = filledOverride ?? segment.filledInSegment;
  const segmentSize = sizeOverride ?? segment.segmentSize;
  const remaining =
    remainingOverride ?? segment.remainingToMilestone;

  return (
    <View style={styles.wrap} testID={testID}>
      <Text style={styles.count}>{currentStars}</Text>
      <Text style={styles.countLabel}>
        {currentStars === 1 ? "star" : "stars"} toward next milestone
      </Text>
      <Text style={styles.nextLine}>Next milestone: {nextMilestone}</Text>

      <View style={styles.row} accessibilityRole="summary">
        {Array.from({ length: segmentSize }, (_, index) => {
          const filled = index < filledInSegment;
          return (
            <View
              key={index}
              testID={`${testID}-star-${index}-${filled ? "filled" : "hollow"}`}
            >
              <Star
                size={28}
                color={filled ? STARS_GOLD : "#CBD5E1"}
                fill={filled ? STARS_GOLD : "transparent"}
                strokeWidth={1.8}
              />
            </View>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Milestone at {nextMilestone}</Text>
        <Text style={styles.cardBody}>
          {remaining === 0
            ? "You hit this milestone — keep going."
            : `${remaining} more assigned ${remaining === 1 ? "task" : "tasks"}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  count: {
    fontSize: 56,
    lineHeight: 62,
    fontWeight: "800",
    color: "#0F172A",
  },
  countLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    color: "#64748B",
  },
  nextLine: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  card: {
    alignSelf: "stretch",
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
});
