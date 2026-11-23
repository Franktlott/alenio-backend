import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { formatFeedTimestamp } from "@/lib/workspace-updates";
import {
  mapApiActivityToFeedItem,
  type ActivityApiEvent,
  type ActivityFeedItem,
} from "@/components/activity";

type ActivityPage = {
  items: ActivityApiEvent[];
  nextCursor: string | null;
};

type Props = {
  teamId: string | null;
  onViewAll: () => void;
  onPressItem: (item: ActivityFeedItem) => void;
};

const PURPLE = "#6d28d9";

/** Compact “16m ago” / “2d ago” labels for the timeline. */
function formatRelativeAgo(iso: string, now = Date.now()): string {
  const stamp = formatFeedTimestamp(iso, now);
  if (stamp === "now") return "just now";
  return `${stamp} ago`;
}

function overviewRowCopy(item: ActivityFeedItem): {
  title: string;
  subtitle: string;
} {
  const actor = item.actor?.name?.trim() || "Someone";
  const meta = item.metadata;

  switch (item.type) {
    case "calendar_event_added": {
      const eventTitle =
        meta.eventTitles?.[0]?.trim() ||
        meta.eventTitle?.trim() ||
        "an event";
      return {
        title: eventTitle,
        subtitle: `${actor} added “${eventTitle}” to the calendar.`,
      };
    }
    case "member_joined": {
      const name = meta.userName?.trim() || actor;
      return {
        title: `${name} joined`,
        subtitle: "New member joined the team.",
      };
    }
    case "member_removed": {
      const name = meta.userName?.trim() || actor;
      return {
        title: `${name} left`,
        subtitle: "Member left the team.",
      };
    }
    case "task_assigned": {
      const taskTitle = meta.taskTitles?.[0] || meta.taskTitle || "a task";
      return {
        title: taskTitle,
        subtitle: `${actor} was assigned a task.`,
      };
    }
    case "task_milestone":
      return {
        title: meta.taskTitle?.trim() || "Milestone reached",
        subtitle: item.description?.trim() || `${actor} hit a task milestone.`,
      };
    case "celebration": {
      const toName = meta.targetName?.trim() || "a teammate";
      return {
        title: `Recognized ${toName}`,
        subtitle:
          meta.message?.trim() || `${actor} recognized ${toName}.`,
      };
    }
    case "post":
      return {
        title: "Workspace update",
        subtitle:
          meta.body?.trim() ||
          item.description?.trim() ||
          `${actor} shared an update.`,
      };
    case "development_goal_completed":
      return {
        title: meta.goalTitle?.trim() || "Development goal completed",
        subtitle: `${actor} completed a development goal.`,
      };
    case "check_in_completed":
      return {
        title: "Check-in completed",
        subtitle: meta.memberName
          ? `Check-in with ${meta.memberName}.`
          : `${actor} published a check-in.`,
      };
    default:
      return {
        title: item.title,
        subtitle: item.description?.trim() || "Workspace activity.",
      };
  }
}

/**
 * Overview Recent Updates — timeline card matching the mock.
 */
export function WorkspaceOverviewRecentUpdates({
  teamId,
  onViewAll,
  onPressItem,
}: Props) {
  const query = useQuery({
    queryKey: ["workspace-overview-recent-updates", teamId],
    enabled: Boolean(teamId),
    queryFn: async () => {
      const response = await api.get<ActivityPage | ActivityApiEvent[]>(
        `/api/teams/${teamId}/activity?surface=overview&limit=3`,
      );
      if (Array.isArray(response)) return response.slice(0, 3);
      return response.items ?? [];
    },
  });

  const items = (query.data ?? []).map(mapApiActivityToFeedItem);

  return (
    <View style={styles.card} testID="workspace-overview-recent-updates">
      <View style={styles.header}>
        <Text style={styles.title}>Recent Updates</Text>
        <Pressable
          onPress={onViewAll}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="View all updates"
          testID="workspace-overview-recent-updates-view-all"
          style={({ pressed }) => [
            styles.viewLinkPress,
            pressed ? styles.viewLinkPressed : null,
          ]}
        >
          <View style={styles.viewLink}>
            <Text style={styles.viewLinkText}>View All</Text>
            <ArrowRight size={14} color={PURPLE} strokeWidth={2.4} />
          </View>
        </Pressable>
      </View>

      {query.isPending ? (
        <View
          style={styles.centered}
          testID="workspace-overview-recent-updates-loading"
        >
          <ActivityIndicator color={PURPLE} />
        </View>
      ) : query.isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn’t load updates</Text>
          <Pressable onPress={() => void query.refetch()} hitSlop={8}>
            <Text style={styles.retry}>Try again</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View
          style={styles.empty}
          testID="workspace-overview-recent-updates-empty"
        >
          <Text style={styles.emptyTitle}>Nothing new yet.</Text>
          <Text style={styles.emptyBody}>
            Important workspace activity will appear here as your team gets
            moving.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => {
            const { title, subtitle } = overviewRowCopy(item);
            const isFirst = index === 0;
            const isLast = index === items.length - 1;
            return (
              <Pressable
                key={item.id}
                onPress={() => onPressItem(item)}
                accessibilityRole="button"
                accessibilityLabel={title}
                testID={`workspace-overview-recent-update-${item.id}`}
                style={({ pressed }) => [
                  styles.rowPress,
                  pressed ? styles.rowPressed : null,
                ]}
              >
                <View style={styles.row}>
                  <View style={styles.rail}>
                    {!isFirst ? <View style={styles.railLineTop} /> : null}
                    <View style={styles.dot} />
                    {!isLast ? <View style={styles.railLineBottom} /> : null}
                  </View>
                  <View style={styles.copy}>
                    <View style={styles.titleRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {title}
                      </Text>
                      <Text style={styles.itemTime} numberOfLines={1}>
                        {formatRelativeAgo(item.timestamp)}
                      </Text>
                    </View>
                    <Text style={styles.itemBody} numberOfLines={2}>
                      {subtitle}
                    </Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#111827",
  },
  viewLinkPress: {
    marginLeft: 8,
  },
  viewLink: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewLinkPressed: {
    opacity: 0.65,
  },
  viewLinkText: {
    marginRight: 4,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "700",
    color: PURPLE,
  },
  centered: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: {
    paddingVertical: 14,
  },
  emptyTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111827",
  },
  emptyBody: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
    color: "#6B7280",
  },
  retry: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "700",
    color: PURPLE,
  },
  list: {
    width: "100%",
  },
  rowPress: {
    width: "100%",
  },
  rowPressed: {
    opacity: 0.7,
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "stretch",
  },
  rail: {
    width: 14,
    marginRight: 12,
    alignItems: "center",
  },
  railLineTop: {
    width: 2,
    flexGrow: 0,
    flexShrink: 0,
    height: 14,
    backgroundColor: "#E5E7EB",
  },
  railLineBottom: {
    width: 2,
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 12,
    backgroundColor: "#E5E7EB",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: PURPLE,
    flexShrink: 0,
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingBottom: 14,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  itemTitle: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
    color: "#111827",
  },
  itemTime: {
    flexShrink: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  itemBody: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
    color: "#6B7280",
  },
});
