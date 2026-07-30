import { Pressable, Text, View } from "react-native";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, ClipboardList } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { ActivityFeedGroup } from "./types";
import { formatRelativeTime } from "./types";
import { getActivityTintTokens } from "./activity-ui";

export function GroupedActivityRow({
  group,
  expanded,
  onToggle,
}: {
  group: ActivityFeedGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const first = group.items[0]!;
  const tint = getActivityTintTokens(group.activityType);
  const Icon =
    group.activityType === "calendar_event_added"
      ? CalendarDays
      : group.activityType === "task_assigned"
        ? ClipboardList
        : CheckCircle2;

  return (
    <View
      style={{
        marginHorizontal: 14,
        marginVertical: 4,
        borderRadius: 12,
        backgroundColor: tint.badgeBg,
        borderWidth: 1,
        borderColor: tint.border,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 8 }}>
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#FFFFFF",
          }}
        >
          <Icon size={13} color={tint.icon} strokeWidth={2.2} />
        </View>
        <UserAvatar
          user={first.actor ?? { name: "Someone" }}
          size={28}
          radius={14}
          backgroundColor="#FFFFFF"
          textColor="#64748B"
          resetKey={group.id}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: "700", color: "#182033" }}>
              {group.title}
            </Text>
            <Text style={{ fontSize: 9, color: "#8A94A6" }}>{formatRelativeTime(group.timestamp)}</Text>
          </View>
          <Text style={{ marginTop: 2, fontSize: 10, lineHeight: 13, color: "#667085" }} numberOfLines={2}>
            {group.subtitle}
          </Text>
          <Pressable
            onPress={onToggle}
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 6,
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              opacity: pressed ? 0.6 : 1,
            })}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: "#5B4EF5" }}>
              {expanded ? "Hide activity" : group.actionLabel}
            </Text>
            {expanded ? (
              <ChevronUp size={12} color="#5B4EF5" />
            ) : (
              <ChevronDown size={12} color="#5B4EF5" />
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
