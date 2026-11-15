import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Star, Trophy } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { ActivityFeedItem } from "./types";
import { formatRelativeTime } from "./types";

type Props = {
  item: ActivityFeedItem;
  footer?: ReactNode;
  onLongPress?: () => void;
  testID?: string;
};

export function MilestoneActivityCard({
  item,
  footer,
  onLongPress,
  testID,
}: Props) {
  const actorName = item.actor?.name ?? "Someone";
  const count =
    item.metadata.count ?? (item.type === "task_milestone" ? 10 : 0);
  const isPersonalBest = item.type === "personal_best";
  const Icon = isPersonalBest ? Star : Trophy;

  return (
    <View style={styles.outer}>
      <Pressable
        onLongPress={onLongPress}
        disabled={!onLongPress}
        testID={testID ?? `milestone-activity-card-${item.id}`}
        style={({ pressed }) => [
          styles.card,
          pressed && onLongPress ? styles.pressed : null,
        ]}
      >
        <View style={styles.row}>
          <View style={styles.avatarWrap}>
            <UserAvatar
              user={item.actor ?? { name: actorName }}
              size={40}
              radius={12}
              backgroundColor="#EEE9FF"
              textColor="#6947E8"
              resetKey={item.id}
            />
            <View style={styles.flameBadge}>
              <Icon size={8} color="#FFFFFF" strokeWidth={2.5} />
            </View>
          </View>

          <View style={styles.copy}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>
                {isPersonalBest ? "STARS BEST" : "STARS MILESTONE"}
              </Text>
              <Text style={styles.time}>
                {formatRelativeTime(item.timestamp)}
              </Text>
            </View>
            <Text style={styles.title} numberOfLines={1}>
              {isPersonalBest
                ? `${actorName} set a new best`
                : `${actorName} reached a ${count}-task streak`}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {count} qualifying task{count === 1 ? "" : "s"} completed in a row
            </Text>
          </View>
        </View>
        {footer}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignSelf: "stretch",
    marginHorizontal: 12,
    marginVertical: 6,
    overflow: "hidden",
    minHeight: 64,
    borderRadius: 14,
    borderWidth: 1.25,
    borderColor: "#E8E2F1",
    backgroundColor: "#FAF9FC",
    shadowColor: "#6047B5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 9,
    elevation: 2,
  },
  card: {
    width: "100%",
    overflow: "hidden",
    borderRadius: 13,
  },
  pressed: { opacity: 0.84 },
  row: {
    minHeight: 64,
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarWrap: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 12,
    position: "relative",
  },
  flameBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#F7F4FF",
    backgroundColor: "#6947E8",
  },
  copy: { flex: 1, minWidth: 0 },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    flex: 1,
    fontSize: 7.5,
    lineHeight: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    color: "#A87312",
  },
  time: {
    flexShrink: 0,
    fontSize: 8,
    lineHeight: 10,
    color: "#9A94AA",
  },
  title: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "800",
    color: "#1A1F33",
  },
  subtitle: {
    marginTop: 1,
    fontSize: 9,
    lineHeight: 12,
    color: "#747D90",
  },
});
