import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import type { ActivityReactions } from "@/components/activity/types";
import { feedReactionLabel } from "@/lib/feed-reactions";
import {
  orderedReactionGroups,
  totalReactionCount,
} from "@/lib/workspace-updates";

type Props = {
  visible: boolean;
  reactions: ActivityReactions;
  currentUserId?: string;
  onClose: () => void;
};

const ALL = "all";

/** Everyone who reacted, filterable by reaction. */
export function ReactionListSheet({
  visible,
  reactions,
  currentUserId,
  onClose,
}: Props) {
  const [filter, setFilter] = useState<string>(ALL);
  const groups = useMemo(() => orderedReactionGroups(reactions), [reactions]);
  const total = totalReactionCount(reactions);

  const people = useMemo(() => {
    const rows = groups
      .filter((group) => filter === ALL || group.emoji === filter)
      .flatMap((group) =>
        group.users.map((user) => ({ ...user, emoji: group.emoji })),
      );
    // The viewer first, then everyone else alphabetically.
    return rows.sort((left, right) => {
      if (left.id === currentUserId) return -1;
      if (right.id === currentUserId) return 1;
      return (left.name || "").localeCompare(right.name || "");
    });
  }, [currentUserId, filter, groups]);

  if (!visible) return null;

  return (
    <AlenioBottomSheet
      visible={visible}
      title="Reactions"
      subtitle={`${total} ${total === 1 ? "person reacted" : "people reacted"}`}
      onClose={onClose}
      compact
      testID="reaction-list-sheet"
    >
      {groups.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
        >
          <ReactionTab
            label="All"
            count={total}
            active={filter === ALL}
            onPress={() => setFilter(ALL)}
            testID="reaction-tab-all"
          />
          {groups.map((group) => (
            <ReactionTab
              key={group.emoji}
              emoji={group.emoji}
              count={group.count}
              active={filter === group.emoji}
              onPress={() => setFilter(group.emoji)}
              testID={`reaction-tab-${group.emoji}`}
            />
          ))}
        </ScrollView>
      ) : null}

      <View style={styles.list}>
        {people.map((person) => (
          <View
            key={`${person.emoji}-${person.id}`}
            style={styles.person}
            testID={`reaction-person-${person.id}`}
          >
            <UserAvatar
              user={{ name: person.name || "Someone" }}
              size={34}
              radius={17}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={13}
              workplaceConnected={false}
            />
            <View style={styles.personCopy}>
              <Text style={styles.personName} numberOfLines={1}>
                {person.id === currentUserId
                  ? "You"
                  : person.name || "Someone"}
              </Text>
              <Text style={styles.personReaction} numberOfLines={1}>
                {feedReactionLabel(person.emoji)}
              </Text>
            </View>
            <Text style={styles.personEmoji}>{person.emoji}</Text>
          </View>
        ))}
      </View>
    </AlenioBottomSheet>
  );
}

function ReactionTab({
  emoji,
  label,
  count,
  active,
  onPress,
  testID,
}: {
  emoji?: string;
  label?: string;
  count: number;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        emoji ? `${feedReactionLabel(emoji)}, ${count}` : `All, ${count}`
      }
      accessibilityState={{ selected: active }}
      testID={testID}
      style={[styles.tab, active ? styles.tabActive : null]}
    >
      {emoji ? <Text style={styles.tabEmoji}>{emoji}</Text> : null}
      {label ? (
        <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>
          {label}
        </Text>
      ) : null}
      <Text style={[styles.tabCount, active ? styles.tabLabelActive : null]}>
        {count}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#F3F5F9",
  },
  tabActive: {
    backgroundColor: "#EEF2FF",
  },
  tabEmoji: {
    fontSize: 14,
    lineHeight: 18,
  },
  tabLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    color: "#64748B",
  },
  tabLabelActive: {
    color: "#3A4FD1",
  },
  tabCount: {
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
    color: "#8A94A6",
  },
  list: {
    gap: 2,
  },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 7,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: 14.5,
    lineHeight: 19,
    fontWeight: "600",
    color: "#0F172A",
  },
  personReaction: {
    fontSize: 12,
    lineHeight: 16,
    color: "#8A94A6",
  },
  personEmoji: {
    fontSize: 19,
    lineHeight: 24,
  },
});
