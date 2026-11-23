import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ActivityReactions } from "@/components/activity/types";
import {
  orderedReactionGroups,
  totalReactionCount,
} from "@/lib/workspace-updates";

const MAX_CIRCLES = 3;

type Props = {
  reactions: ActivityReactions;
  onPress: () => void;
  /** Smaller circles for comment bubbles. */
  compact?: boolean;
  testID?: string;
};

/**
 * Overlapping circles, one per distinct reaction, most popular first — tap to
 * see everyone who reacted.
 */
export function ReactionFacepile({
  reactions,
  onPress,
  compact = false,
  testID,
}: Props) {
  const groups = orderedReactionGroups(reactions);
  const total = totalReactionCount(reactions);
  if (groups.length === 0 || total === 0) return null;

  const shown = groups.slice(0, MAX_CIRCLES);
  const size = compact ? 18 : 22;
  const circle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${total} ${total === 1 ? "reaction" : "reactions"}. See who reacted.`}
      testID={testID}
      style={styles.row}
    >
      <View style={styles.stack}>
        {shown.map((group, index) => (
          <View
            key={group.emoji}
            style={[
              styles.circle,
              circle,
              // Each circle tucks behind the one before it.
              index > 0 ? { marginLeft: -size / 3 } : null,
              { zIndex: shown.length - index },
            ]}
          >
            <Text style={compact ? styles.emojiCompact : styles.emoji}>
              {group.emoji}
            </Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  stack: {
    flexDirection: "row",
    alignItems: "center",
  },
  circle: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
    // A faint ring keeps white circles legible on a white card.
    shadowColor: "#0F172A",
    shadowOpacity: 0.12,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  emoji: {
    fontSize: 12,
    lineHeight: 16,
  },
  emojiCompact: {
    fontSize: 10,
    lineHeight: 14,
  },
});
