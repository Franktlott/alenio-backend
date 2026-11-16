import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Flame, Star } from "lucide-react-native";
import {
  STARS_GOLD,
  starsHeroSegmentDisplay,
  starsMilestoneSegment,
} from "@/lib/stars";
import { elevation, gradients, palette } from "@/theme";
import { StarsHeroArt } from "./StarsHeroArt";

type Props = {
  currentStars: number;
  dayStreak?: number;
  filledInSegment?: number;
  segmentSize?: number;
  testID?: string;
};

export function StarsHeroCard({
  currentStars,
  dayStreak = 0,
  filledInSegment: filledOverride,
  segmentSize: sizeOverride,
  testID = "stars-hero-card",
}: Props) {
  const segment = starsMilestoneSegment(currentStars);
  const filledInSegment = filledOverride ?? segment.filledInSegment;
  const segmentSize = sizeOverride ?? segment.segmentSize;
  const display =
    filledOverride != null && sizeOverride != null
      ? {
          displaySize: Math.min(sizeOverride, 10),
          displayFilled: Math.round(
            (filledInSegment / Math.max(1, segmentSize)) *
              Math.min(sizeOverride, 10),
          ),
        }
      : starsHeroSegmentDisplay(currentStars);

  return (
    <LinearGradient
      colors={[...gradients.band]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
      testID={testID}
    >
      <StarsHeroArt />
      <View style={styles.topRow}>
        <Text style={styles.label}>Your Progress</Text>
        {dayStreak > 0 ? (
          <View style={styles.streakPill} testID={`${testID}-streak`}>
            <Flame size={12} color="#FDBA74" fill="#FDBA74" strokeWidth={0} />
            <Text style={styles.streakText}>{dayStreak}-day streak</Text>
          </View>
        ) : (
          <View style={styles.streakPillMuted} testID={`${testID}-streak`}>
            <Flame size={12} color={palette.lilac} strokeWidth={2} />
            <Text style={styles.streakTextMuted}>Start a streak</Text>
          </View>
        )}
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>{currentStars}</Text>
        <Star size={28} color={STARS_GOLD} fill={STARS_GOLD} strokeWidth={0} />
      </View>
      <Text style={styles.sub}>stars toward your next milestone</Text>

      <View style={styles.starRow} accessibilityRole="summary">
        {Array.from({ length: display.displaySize }, (_, index) => {
          const filled = index < display.displayFilled;
          return (
            <Star
              key={index}
              size={22}
              color={filled ? STARS_GOLD : "rgba(196,181,253,0.45)"}
              fill={filled ? STARS_GOLD : "transparent"}
              strokeWidth={1.6}
              testID={`${testID}-star-${index}-${filled ? "filled" : "hollow"}`}
            />
          );
        })}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    ...elevation.raised,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    overflow: "hidden",
    minHeight: 200,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(237,233,254,0.88)",
  },
  streakPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(251,146,60,0.22)",
    borderWidth: 1,
    borderColor: "rgba(253,186,116,0.35)",
  },
  streakText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FED7AA",
  },
  streakPillMuted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(196,181,253,0.16)",
    borderWidth: 1,
    borderColor: "rgba(196,181,253,0.35)",
  },
  streakTextMuted: {
    fontSize: 12,
    fontWeight: "600",
    color: palette.lilac,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
    maxWidth: "58%",
  },
  count: {
    fontSize: 52,
    lineHeight: 56,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  sub: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "rgba(237,233,254,0.72)",
    zIndex: 1,
    maxWidth: "58%",
  },
  starRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
    zIndex: 1,
    maxWidth: "62%",
  },
});
