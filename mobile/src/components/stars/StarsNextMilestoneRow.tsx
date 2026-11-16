import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronRight, Trophy } from "lucide-react-native";
import { STARS_GOLD } from "@/lib/stars";

type Props = {
  title: string;
  remaining: number;
  onPress?: () => void;
  testID?: string;
};

export function StarsNextMilestoneRow({
  title,
  remaining,
  onPress,
  testID = "stars-next-milestone",
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Next milestone: ${title}`}
    >
      <View style={styles.iconWrap}>
        <Trophy size={20} color={STARS_GOLD} strokeWidth={2} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>Next Milestone</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.sub}>
          {remaining <= 0
            ? "You hit this milestone — keep going"
            : `${remaining} more completed ${remaining === 1 ? "task" : "tasks"}`}
        </Text>
      </View>
      <ChevronRight size={20} color="#94A3B8" strokeWidth={2.2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7ED",
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  sub: {
    fontSize: 13,
    lineHeight: 17,
    color: "#64748B",
  },
});
