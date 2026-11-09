import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { CalendarCheck, ChevronRight } from "lucide-react-native";
import { UserAvatar } from "@/components/UserAvatar";
import type { CalendarEvent, TeamMember } from "@/lib/types";
import { selectUpcomingDevelopmentCheckIns } from "@/lib/development-overview";
import { oneOnOneMember } from "@/lib/workspace-snapshot-details";

type Props = {
  events: CalendarEvent[];
  members: TeamMember[];
  onViewAll: () => void;
  onSchedule: () => void;
};

function eventDateLabel(event: CalendarEvent): string {
  const date = new Date(event.startDate);
  if (!Number.isFinite(date.getTime())) return "Upcoming";
  const today = new Date();
  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return "Today";
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function eventTimeLabel(event: CalendarEvent): string {
  const date = new Date(event.startDate);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function UpcomingCheckInsCard({
  events,
  members,
  onViewAll,
  onSchedule,
}: Props) {
  const upcoming = selectUpcomingDevelopmentCheckIns(events);
  if (upcoming.length === 0) {
    return (
      <View style={styles.section} testID="development-upcoming-check-ins-empty">
        <View style={styles.header}>
          <Text style={styles.eyebrow}>UPCOMING CHECK-INS</Text>
        </View>
        <View style={styles.emptyCard}>
          <View style={styles.calendarIcon}>
            <CalendarCheck size={16} color="#684BFF" strokeWidth={2.2} />
          </View>
          <View style={styles.emptyCopy}>
            <Text style={styles.emptyTitle}>No upcoming check-ins</Text>
            <Text style={styles.emptyText} numberOfLines={1}>
              Plan the next development conversation.
            </Text>
          </View>
          <Pressable
            onPress={onSchedule}
            style={styles.scheduleAction}
            accessibilityRole="button"
          >
            <Text style={styles.scheduleActionText}>Schedule</Text>
            <ChevronRight size={11} color="#684BFF" strokeWidth={2.3} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.section} testID="development-upcoming-check-ins">
      <View style={styles.header}>
        <Text style={styles.eyebrow}>UPCOMING CHECK-INS</Text>
        <Pressable
          onPress={onViewAll}
          hitSlop={10}
          style={styles.viewAllAction}
          accessibilityRole="button"
        >
          <Text style={styles.viewAllText}>View all</Text>
          <ChevronRight size={13} color="#684BFF" strokeWidth={2.3} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={upcoming.length > 3}
        nestedScrollEnabled
      >
        {upcoming.map((event) => {
          const member = oneOnOneMember(event, members);
          const name =
            member?.user.name?.trim().split(/\s+/)[0] ||
            member?.user.email.split("@")[0] ||
            "Member";
                const checkInName = event.title?.trim() || "Check-in";
          return (
            <View
              key={event.id}
              style={styles.eventRow}
              accessibilityLabel={`${checkInName} with ${name}`}
            >
              {member ? (
                <UserAvatar
                  user={member.user}
                  size={30}
                  radius={15}
                  backgroundColor="#EEEAFE"
                  textColor="#684BFF"
                  fontSize={10}
                />
              ) : (
                <View style={styles.calendarIcon}>
                  <CalendarCheck size={15} color="#684BFF" strokeWidth={2.2} />
                </View>
              )}
              <View style={styles.eventCopy}>
                       <Text style={styles.checkInName} numberOfLines={1}>
                         {checkInName}
                </Text>
                       <Text style={styles.memberName} numberOfLines={1}>
                         With {name}
                </Text>
              </View>
                     <View style={styles.scheduleCopy}>
                       <Text style={styles.scheduleDate} numberOfLines={1}>
                         {eventDateLabel(event)}
                       </Text>
                       <Text style={styles.scheduleTime} numberOfLines={1}>
                         {eventTimeLabel(event)}
                       </Text>
                     </View>
            </View>
          );
        })}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 13,
  },
  header: {
    minHeight: 22,
    marginHorizontal: 16,
    paddingHorizontal: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  eyebrow: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 1.05,
    color: "#59657A",
  },
  viewAllAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewAllText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#684BFF",
  },
  list: {
    maxHeight: 146,
          marginHorizontal: 16,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#F3F5F8",
    backgroundColor: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 9,
  },
  eventRow: {
    minHeight: 48,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F5F8",
  },
  calendarIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0ECFF",
  },
  emptyCard: {
    minHeight: 66,
    marginHorizontal: 16,
    paddingHorizontal: 11,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "#F3F5F8",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  emptyCopy: {
    flex: 1,
    minWidth: 0,
  },
  emptyTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    color: "#273047",
  },
  emptyText: {
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 11,
    color: "#8490A4",
  },
  scheduleAction: {
    minHeight: 29,
    paddingHorizontal: 9,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "#DCD6FF",
    backgroundColor: "#FAF9FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
  },
  scheduleActionText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#684BFF",
  },
  checkInName: {
    width: "100%",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
    color: "#273047",
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    marginTop: 2,
    fontSize: 8.5,
    lineHeight: 11,
    color: "#7C8799",
  },
  scheduleCopy: {
    minWidth: 62,
    marginRight: 14,
    alignItems: "flex-end",
  },
  scheduleDate: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "700",
    color: "#59657A",
  },
  scheduleTime: {
    marginTop: 1,
    fontSize: 8.5,
    lineHeight: 11,
    color: "#8A94A8",
  },
});
