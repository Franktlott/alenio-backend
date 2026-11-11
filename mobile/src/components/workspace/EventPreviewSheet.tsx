import { Pressable, Text, View, Image } from "react-native";
import {
  CalendarDays,
  Clock3,
  FileText,
  Pencil,
  UserRound,
  Video,
} from "lucide-react-native";
import {
  AlenioBottomSheet,
  AlenioSheetCard,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { UserAvatar } from "@/components/UserAvatar";
import { eventCalendarDayRange } from "@/lib/calendar-grid";
import {
  eventShowsScheduledTime,
  formatEventTimeRange,
} from "@/lib/format-event-time";
import { resolveCalendarEventColor } from "@/lib/calendar-event-colors";
import type { CalendarEvent } from "@/lib/types";
import {
  formatWorkspaceTimeZoneContext,
  workspaceTimeZoneDiffersFromDevice,
} from "@/lib/workspace-event-time";
import { canShowAgendaVideoJoin } from "@/lib/video-meeting-join";
import { colors } from "@/theme";

type Props = {
  visible: boolean;
  event: CalendarEvent | null;
  workspaceTimeZone?: string | null;
  isOwnerOrLeader?: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onJoin?: () => void;
};

function formatEventDate(event: CalendarEvent): string {
  const { start, end } = eventCalendarDayRange(event);
  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    return start.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  const startLabel = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingVertical: 8,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 9,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.brandSoft,
        }}
      >
        <Icon size={15} color={colors.brand} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}
        >
          {label.toUpperCase()}
        </Text>
        <Text
          style={{
            marginTop: 1,
            fontSize: 13,
            lineHeight: 17,
            fontWeight: "600",
            color: colors.textPrimary,
          }}
          numberOfLines={2}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export function EventPreviewSheet({
  visible,
  event,
  workspaceTimeZone,
  onClose,
  onEdit,
  onJoin,
}: Props) {
  if (!event) return null;

  const isExternal = event.isExternal === true;
  const isPrivate = isExternal || event.isHidden === true;
  const isCheckIn = event.isOneOnOne === true;
  const isVideo = event.isVideoMeeting === true && !isCheckIn;
  const kindLabel = isExternal
    ? "Outlook event"
    : isCheckIn
      ? "Check-in"
      : isVideo
        ? "Video meeting"
        : "Calendar event";
  const visibilityLabel = isPrivate ? "Private" : "Public";
  const approvalLabel =
    event.approvalStatus === "pending"
      ? "Pending approval"
      : event.approvalStatus === "rejected"
        ? "Not approved"
        : null;
  const headerSubtitle = [kindLabel, visibilityLabel, approvalLabel]
    .filter(Boolean)
    .join(" · ");
  const timeLabel = eventShowsScheduledTime(event)
    ? formatEventTimeRange(event.startDate, event.endDate)
    : "All day";
  const workspaceTimeContext =
    !isExternal &&
    eventShowsScheduledTime(event) &&
    workspaceTimeZoneDiffersFromDevice(workspaceTimeZone)
      ? formatWorkspaceTimeZoneContext(workspaceTimeZone)
      : null;
  const accentColor = resolveCalendarEventColor({
    isExternal,
    isOneOnOne: event.isOneOnOne,
    isVideoMeeting: event.isVideoMeeting,
    isHidden: isPrivate,
  });
  const showJoin =
    Boolean(onJoin) &&
    isVideo &&
    canShowAgendaVideoJoin(event.startDate, event.endDate, Date.now());

  return (
    <AlenioBottomSheet
      visible={visible}
      title={event.title}
      subtitle={headerSubtitle}
      onClose={onClose}
      compact
      showCloseButton
      testID="workspace-event-preview"
      headerRight={
        onEdit ? (
          <Pressable
            onPress={onEdit}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={isCheckIn ? "Edit schedule" : "Edit event"}
            testID="workspace-event-preview-edit"
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pencil size={16} color="#6d28d9" strokeWidth={2.2} />
          </Pressable>
        ) : null
      }
      footer={
        showJoin ? (
          <Pressable
            onPress={onJoin}
            style={alenioSheetStyles.primaryButton}
            accessibilityRole="button"
            accessibilityLabel={`Join ${event.title}`}
            testID="workspace-event-preview-join"
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
            >
              <Video size={14} color="#FFFFFF" strokeWidth={2.3} />
              <Text style={alenioSheetStyles.primaryButtonText}>Join call</Text>
            </View>
          </Pressable>
        ) : undefined
      }
    >
      {event.image ? (
        <View
          style={{
            borderRadius: 12,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.brandSoft,
          }}
        >
          <View
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundColor: accentColor,
              zIndex: 1,
            }}
          />
          <Image
            source={{ uri: event.image }}
            style={{ width: "100%", height: 140 }}
            resizeMode="cover"
          />
        </View>
      ) : null}

      <View style={{ marginTop: event.image ? 8 : 0 }}>
        <DetailRow
          icon={CalendarDays}
          label="Date"
          value={formatEventDate(event)}
        />
        <DetailRow icon={Clock3} label="Time" value={timeLabel} />
        {workspaceTimeContext ? (
          <Text
            style={{
              marginLeft: 40,
              marginTop: -4,
              fontSize: 10.5,
              lineHeight: 14,
              color: colors.textMuted,
            }}
            testID="workspace-event-timezone-context"
          >
            {workspaceTimeContext}
          </Text>
        ) : null}
      </View>

      {event.description?.trim() ? (
        <AlenioSheetCard compact tint="slate">
          <View
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}
          >
            <FileText size={15} color={colors.textSecondary} strokeWidth={2} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "700",
                  color: colors.textMuted,
                }}
              >
                DESCRIPTION
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: 12,
                  lineHeight: 17,
                  color: colors.textSecondary,
                }}
              >
                {event.description.trim()}
              </Text>
            </View>
          </View>
        </AlenioSheetCard>
      ) : null}

      {event.createdBy ? (
        <View
          style={{
            marginTop: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
          }}
        >
          <UserAvatar
            user={event.createdBy}
            size={30}
            radius={15}
            resetKey={event.createdBy.id}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "700",
                color: colors.textMuted,
              }}
            >
              ORGANIZER
            </Text>
            <Text
              style={{
                marginTop: 1,
                fontSize: 12,
                fontWeight: "600",
                color: colors.textPrimary,
              }}
            >
              {event.createdBy.name}
            </Text>
          </View>
          <UserRound size={15} color={colors.textMuted} />
        </View>
      ) : null}
    </AlenioBottomSheet>
  );
}
