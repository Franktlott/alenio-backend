import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Star, Users } from "lucide-react-native";
import { STARS_GOLD } from "@/lib/stars";
import { elevation, gradients, palette } from "@/theme";
import { StarsHeroArt } from "./StarsHeroArt";

type Props = {
  activeCount: number;
  eligibleCount: number;
  needsNudgeCount: number;
  testID?: string;
};

export function StarsTeamHeroCard({
  activeCount,
  eligibleCount,
  needsNudgeCount,
  testID = "stars-team-hero",
}: Props) {
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
        <Text style={styles.label}>Team Progress</Text>
        <View style={styles.pill}>
          <Users size={12} color={palette.lilac} strokeWidth={2.2} />
          <Text style={styles.pillText}>
            {eligibleCount} {eligibleCount === 1 ? "member" : "members"}
          </Text>
        </View>
      </View>

      <View style={styles.countRow}>
        <Text style={styles.count}>{activeCount}</Text>
        <Star size={26} color={STARS_GOLD} fill={STARS_GOLD} strokeWidth={0} />
      </View>
      <Text style={styles.sub}>
        {activeCount === 1 ? "teammate filling stars" : "teammates filling stars"}
      </Text>

      <View style={styles.statsRow}>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>{needsNudgeCount}</Text>
          <Text style={styles.statLabel}>need a nudge</Text>
        </View>
        <View style={styles.statChip}>
          <Text style={styles.statValue}>
            {Math.max(0, eligibleCount - needsNudgeCount)}
          </Text>
          <Text style={styles.statLabel}>on the path</Text>
        </View>
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
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(196,181,253,0.18)",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "700",
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
    fontSize: 48,
    lineHeight: 52,
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
  statsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    zIndex: 1,
    maxWidth: "68%",
  },
  statChip: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.1)",
    gap: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(237,233,254,0.72)",
  },
});
