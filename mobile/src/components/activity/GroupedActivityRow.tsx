import { Pressable, Text, View } from "react-native";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
} from "lucide-react-native";
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
  const tint = getActivityTintTokens(group.activityType);
  const isCalendarGroup = group.activityType === "calendar_event_added";
  const Icon = isCalendarGroup
    ? CalendarDays
    : group.activityType === "task_assigned"
      ? ClipboardList
      : CheckCircle2;
  const previewPeople = group.items
    .map((item) => item.actor)
    .filter(
      (actor): actor is { id: string; name: string; image: string | null } =>
        !!actor,
    )
    .filter(
      (actor, index, actors) =>
        actors.findIndex((candidate) => candidate.id === actor.id) === index,
    )
    .slice(0, 3);

  return (
    <View
      style={{
        marginHorizontal: isCalendarGroup ? 14 : 18,
        marginVertical: isCalendarGroup ? 4 : 0,
        borderWidth: isCalendarGroup ? 1 : 0,
        borderBottomWidth: isCalendarGroup ? 1 : 0.75,
        borderColor: isCalendarGroup ? "#DFE6F5" : "#F1F5F9",
        borderRadius: isCalendarGroup ? 17 : 0,
        backgroundColor: "#FFFFFF",
        overflow: isCalendarGroup ? "hidden" : "visible",
        shadowColor: isCalendarGroup ? "#2F4D8F" : "transparent",
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: isCalendarGroup ? 0.06 : 0,
        shadowRadius: isCalendarGroup ? 12 : 0,
        elevation: isCalendarGroup ? 2 : 0,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 9,
          paddingHorizontal: isCalendarGroup ? 11 : 0,
          paddingVertical: isCalendarGroup ? 8 : 7,
        }}
      >
        <View
          style={{
            width: isCalendarGroup ? 30 : 34,
            height: isCalendarGroup ? 30 : 34,
            borderRadius: isCalendarGroup ? 9 : 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint.badgeBg,
            flexShrink: 0,
          }}
        >
          <Icon
            size={isCalendarGroup ? 16 : 18}
            color={tint.icon}
            strokeWidth={2.1}
          />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 11,
                lineHeight: 14,
                fontWeight: "700",
                color: "#182033",
              }}
            >
              {group.title}
            </Text>
            <Text style={{ fontSize: 8.5, lineHeight: 11, color: "#8A94A6" }}>
              {formatRelativeTime(group.timestamp)}
            </Text>
          </View>
          <Text
            style={{
              marginTop: 2,
              fontSize: 9.5,
              lineHeight: 12,
              color: "#667085",
            }}
            numberOfLines={2}
          >
            {group.subtitle}
          </Text>
          <View
            style={{
              marginTop: 5,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={onToggle}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
                opacity: pressed ? 0.6 : 1,
              })}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "700",
                  color: tint.labelText,
                }}
              >
                {expanded ? "Hide activity" : group.actionLabel}
              </Text>
              {expanded ? (
                <ChevronUp size={12} color={tint.labelText} />
              ) : (
                <ChevronDown size={12} color={tint.labelText} />
              )}
            </Pressable>
            {previewPeople.length > 0 ? (
              <View style={{ flexDirection: "row", paddingRight: 2 }}>
                {previewPeople.map((person, index) => (
                  <View
                    key={person.id}
                    style={{
                      marginLeft: index === 0 ? 0 : -5,
                      borderRadius: 9,
                      borderWidth: 1.5,
                      borderColor: "#FFFFFF",
                    }}
                  >
                    <UserAvatar
                      user={person}
                      size={18}
                      radius={9}
                      backgroundColor="#EEF2FF"
                      textColor="#64748B"
                      resetKey={`${group.id}-${person.id}`}
                    />
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}
