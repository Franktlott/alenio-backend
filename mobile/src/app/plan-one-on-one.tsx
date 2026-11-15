import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SafeKeyboardAwareScrollView as KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  X,
  Calendar,
  ChevronRight,
  Clock,
  UserRound,
  Video,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { ME_QUERY_KEY } from "@/lib/auth/me-query";
import { invalidateDevelopmentCaches } from "@/lib/invalidate-development-caches";
import { isLeaderRole, memberMatchesUserId } from "@/lib/member-identity";
import type { Team } from "@/lib/types";
import {
  ONE_ON_ONE_DEFAULT_DURATION_MINUTES,
  ONE_ON_ONE_DURATION_OPTIONS,
  ONE_ON_ONE_EVENT_COLOR,
  ONE_ON_ONE_REMINDER_MINUTES,
  oneOnOneEndFromDuration,
  oneOnOneEventTitle,
  type OneOnOneCalendarEventFields,
} from "@/lib/plan-one-on-one";
import { formatEventTimeRange } from "@/lib/format-event-time";
import { durationMinutesFromRange } from "@/lib/video-meeting-duration";
import { UserAvatar } from "@/components/UserAvatar";
import { AlenioBottomSheet } from "@/components/AlenioBottomSheet";

type CalendarEvent = OneOnOneCalendarEventFields & {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  allDay: boolean;
  color: string;
  teamId: string;
  createdById: string;
  isHidden?: boolean;
  isVideoMeeting?: boolean;
};

function memberDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return email?.split("@")[0] ?? "Team member";
}

export default function PlanOneOnOneScreen() {
  const {
    teamId,
    memberUserId: initialMemberUserId,
    myRole,
    eventId,
  } = useLocalSearchParams<{
    teamId: string;
    memberUserId?: string;
    myRole?: string;
    eventId?: string;
  }>();

  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: meProfile } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () =>
      api.get<{ id: string; name: string; email: string; image: string | null }>("/api/me"),
    enabled: !!session?.user,
    staleTime: 1000 * 60,
  });

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const { data: teamsList = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/api/teams"),
    enabled: !!session?.user,
    staleTime: 1000 * 60,
  });

  const sessionUserId = typeof session?.user?.id === "string" ? session.user.id : "";
  const sessionEmail = typeof session?.user?.email === "string" ? session.user.email : "";
  const myEmail = meProfile?.email || sessionEmail;
  const resolvedUserId = meProfile?.id || sessionUserId;
  const listTeamRole = teamsList.find((t) => t.id === teamId)?.role;
  const membership =
    team?.members?.find((m) => resolvedUserId && (m.userId === resolvedUserId || m.user.id === resolvedUserId)) ??
    team?.members?.find((m) => memberMatchesUserId(m, "", myEmail)) ??
    null;
  const paramRole = typeof myRole === "string" ? myRole : Array.isArray(myRole) ? myRole[0] : undefined;
  const resolvedRole =
    (team as Team & { role?: string } | undefined)?.role ||
    listTeamRole ||
    paramRole ||
    membership?.role ||
    null;
  const currentUserId = membership?.userId || resolvedUserId;
  const isOwnerOrLeader = isLeaderRole(resolvedRole);
  const isEditing = !!eventId;

  const cachedEvents = queryClient.getQueryData<CalendarEvent[]>(["calendar-events", teamId]) ?? [];
  const existingEvent = isEditing ? cachedEvents.find((event) => event.id === eventId) : null;

  const defaultStart = existingEvent?.startDate
    ? new Date(existingEvent.startDate)
    : new Date();
  if (!existingEvent?.startDate) {
    defaultStart.setMinutes(0, 0, 0);
    defaultStart.setHours(defaultStart.getHours() + 1);
  }

  const [selectedMemberUserId, setSelectedMemberUserId] = useState(
    existingEvent?.oneOnOneMemberUserId ?? initialMemberUserId ?? "",
  );
  const [eventStart, setEventStart] = useState<Date>(defaultStart);
  const [durationMinutes, setDurationMinutes] = useState(() => {
    if (existingEvent?.startDate && existingEvent.endDate) {
      return durationMinutesFromRange(new Date(existingEvent.startDate), new Date(existingEvent.endDate));
    }
    return ONE_ON_ONE_DEFAULT_DURATION_MINUTES;
  });
  const [isVideoMeeting, setIsVideoMeeting] = useState(
    existingEvent?.isVideoMeeting ?? true,
  );
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const memberOptions = useMemo(() => {
    return (team?.members ?? [])
      .filter((member) => !currentUserId || member.userId !== currentUserId)
      .map((member) => ({
        userId: member.userId,
        label: memberDisplayName(member.user.name, member.user.email),
        user: member.user,
        role: member.role,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [currentUserId, team?.members]);

  const selectedMember = memberOptions.find((member) => member.userId === selectedMemberUserId) ?? null;
  const eventEnd = oneOnOneEndFromDuration(eventStart, durationMinutes);

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post<CalendarEvent>(`/api/teams/${teamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      void invalidateDevelopmentCaches(queryClient, teamId);
      router.back();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<CalendarEvent>(`/api/teams/${teamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      void invalidateDevelopmentCaches(queryClient, teamId);
      router.back();
    },
  });

  const handleSave = () => {
    if (!isOwnerOrLeader) {
      setFormError("Only workspace owners and team leaders can schedule check-ins.");
      return;
    }
    if (!selectedMemberUserId) {
      setFormError("Choose a team member for this check-in.");
      return;
    }

    const title = oneOnOneEventTitle(selectedMember?.label ?? "");
    const payload = {
      title,
      startDate: eventStart.toISOString(),
      endDate: eventEnd.toISOString(),
      allDay: false,
      color: ONE_ON_ONE_EVENT_COLOR,
      isHidden: true,
      isOneOnOne: true,
      oneOnOneMemberUserId: selectedMemberUserId,
      isVideoMeeting: isVideoMeeting,
      reminderMinutes: ONE_ON_ONE_REMINDER_MINUTES,
      assigneeIds: [selectedMemberUserId],
    };

    setFormError(null);
    if (isEditing && eventId) {
      updateMutation.mutate({ id: eventId, data: payload });
      return;
    }
    createMutation.mutate(payload);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const mutationError =
    (createMutation.error instanceof Error ? createMutation.error.message : null) ??
    (updateMutation.error instanceof Error ? updateMutation.error.message : null);

  if (teamLoading && !resolvedRole) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#4361EE" />
      </SafeAreaView>
    );
  }

  if (!isOwnerOrLeader) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "transparent", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>
          Only leaders can schedule check-ins
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={styles.screen}
      edges={["top"]}
      testID="plan-one-on-one-modal"
    >
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable
            onPress={() => router.back()}
            style={styles.headerClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="close-plan-one-on-one-button"
          >
            <X size={18} color="#111827" strokeWidth={2.2} />
          </Pressable>
        </View>

        <Text style={styles.headerTitle} numberOfLines={1}>
          {isEditing ? "Edit check-in" : "Schedule check-in"}
        </Text>

        <View style={[styles.headerSide, styles.headerSideRight]}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving || teamLoading}
            style={[
              styles.headerAction,
              isSaving || teamLoading ? styles.headerActionDisabled : null,
            ]}
            accessibilityRole="button"
            testID="save-plan-one-on-one-button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={styles.headerActionText}>{isEditing ? "Save" : "Plan"}</Text>
            )}
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Block time on your calendar, then start the check-in when you meet.
        </Text>

        {formError || mutationError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{formError ?? mutationError}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <UserRound size={12} color="#6D4AFF" strokeWidth={2.2} />
            <Text style={styles.label}>Team member</Text>
          </View>
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            style={styles.field}
            testID="plan-one-on-one-member-picker"
          >
            <View style={styles.fieldIcon}>
              {selectedMember ? (
                <UserAvatar
                  user={selectedMember.user}
                  size={28}
                  radius={14}
                  backgroundColor="#EDE9FE"
                  textColor="#6656D9"
                  fontSize={10}
                />
              ) : (
                <UserRound size={17} color="#6656D9" strokeWidth={2} />
              )}
            </View>
            <Text
              style={[
                styles.fieldText,
                !selectedMember ? styles.fieldPlaceholder : null,
              ]}
              numberOfLines={1}
            >
              {selectedMember?.label ?? "Choose team member"}
            </Text>
            <ChevronRight size={16} color="#A3ACBA" strokeWidth={2.1} />
          </Pressable>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Calendar size={12} color="#6D4AFF" strokeWidth={2.2} />
            <Text style={styles.label}>Date & time</Text>
          </View>
          <View style={styles.groupedCard}>
            <Pressable
              onPress={() => setShowStartPicker(true)}
              style={styles.groupedRow}
            >
              <View style={styles.fieldIcon}>
                <Calendar size={17} color="#6656D9" strokeWidth={2} />
              </View>
              <Text style={styles.fieldText}>
                {eventStart.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <ChevronRight size={16} color="#A3ACBA" strokeWidth={2.1} />
            </Pressable>
            <View style={styles.groupedDivider} />
            <Pressable
              onPress={() => setShowStartTimePicker(true)}
              style={styles.groupedRow}
            >
              <View style={styles.fieldIcon}>
                <Clock size={17} color="#6656D9" strokeWidth={2} />
              </View>
              <Text style={styles.fieldText}>
                {eventStart.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
              <ChevronRight size={16} color="#A3ACBA" strokeWidth={2.1} />
            </Pressable>
          </View>
          <Text style={styles.helperText}>
            Ends {formatEventTimeRange(eventStart.toISOString(), eventEnd.toISOString())}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Clock size={12} color="#6D4AFF" strokeWidth={2.2} />
            <Text style={styles.label}>Duration</Text>
          </View>
          <View style={styles.segmentedControl}>
            {ONE_ON_ONE_DURATION_OPTIONS.map((minutes) => {
              const active = durationMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => setDurationMinutes(minutes)}
                  style={[
                    styles.segment,
                    active ? styles.segmentActive : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      active ? styles.segmentTextActive : null,
                    ]}
                  >
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.labelRow}>
            <Video size={12} color="#6D4AFF" strokeWidth={2.2} />
            <Text style={styles.label}>Video meeting</Text>
          </View>
          <View style={styles.videoCard}>
            <View style={styles.videoIcon}>
              <Video size={17} color="#6656D9" strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.videoTitle}>Video meeting</Text>
              <Text style={styles.videoSubtitle}>
                Add a join link on the calendar event.
              </Text>
            </View>
            <Switch
              value={isVideoMeeting}
              onValueChange={setIsVideoMeeting}
              trackColor={{ false: "#DDE3EA", true: "#5B45FF" }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#DDE3EA"
            />
          </View>
        </View>
      </KeyboardAwareScrollView>

      <MemberPickerModal
        visible={showMemberPicker}
        members={memberOptions}
        selectedUserId={selectedMemberUserId}
        onClose={() => setShowMemberPicker(false)}
        onSelect={(userId) => {
          setSelectedMemberUserId(userId);
          setShowMemberPicker(false);
        }}
      />

      {Platform.OS === "ios" ? (
        <>
          <Modal visible={showStartPicker} transparent animationType="slide" onRequestClose={() => setShowStartPicker(false)}>
            <View style={{ flex: 1, justifyContent: "flex-end" }}>
              <Pressable
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)" }}
                onPress={() => setShowStartPicker(false)}
              />
              <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 24 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                  <Pressable onPress={() => setShowStartPicker(false)}>
                    <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                  </Pressable>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Date</Text>
                  <Pressable onPress={() => setShowStartPicker(false)}>
                    <Text style={{ color: "#4361EE", fontSize: 15, fontWeight: "700" }}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={eventStart}
                  mode="date"
                  display="inline"
                  onChange={(_e, date) => {
                    if (date) {
                      const next = new Date(eventStart);
                      next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                      setEventStart(next);
                    }
                  }}
                  style={{ alignSelf: "center", marginHorizontal: 8 }}
                />
              </View>
            </View>
          </Modal>
          <Modal visible={showStartTimePicker} transparent animationType="slide">
            <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowStartTimePicker(false)}>
              <Pressable onPress={(e) => e.stopPropagation?.()}>
                <View style={{ backgroundColor: "white", paddingBottom: 24 }}>
                  <DateTimePicker
                    value={eventStart}
                    mode="time"
                    display="spinner"
                    onChange={(_e, date) => {
                      if (date) {
                        const next = new Date(eventStart);
                        next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                        setEventStart(next);
                      }
                    }}
                  />
                </View>
              </Pressable>
            </Pressable>
          </Modal>
        </>
      ) : (
        <>
          {showStartPicker ? (
            <DateTimePicker
              value={eventStart}
              mode="date"
              display="calendar"
              onChange={(_e, date) => {
                setShowStartPicker(false);
                if (date) {
                  const next = new Date(eventStart);
                  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                  setEventStart(next);
                }
              }}
            />
          ) : null}
          {showStartTimePicker ? (
            <DateTimePicker
              value={eventStart}
              mode="time"
              onChange={(_e, date) => {
                setShowStartTimePicker(false);
                if (date) {
                  const next = new Date(eventStart);
                  next.setHours(date.getHours(), date.getMinutes(), 0, 0);
                  setEventStart(next);
                }
              }}
            />
          ) : null}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E8EDF3",
    backgroundColor: "#FFFFFF",
  },
  headerSide: {
    width: 72,
    alignItems: "flex-start",
  },
  headerSideRight: {
    alignItems: "flex-end",
  },
  headerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F5F8",
  },
  headerTitle: {
    flex: 1,
    color: "#111827",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
    textAlign: "center",
  },
  headerAction: {
    minWidth: 58,
    minHeight: 34,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    backgroundColor: "#111827",
  },
  headerActionDisabled: {
    opacity: 0.55,
  },
  headerActionText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 42,
    gap: 19,
  },
  intro: {
    maxWidth: 330,
    alignSelf: "center",
    color: "#64748B",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  errorCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    backgroundColor: "#FFF7F7",
  },
  errorText: {
    color: "#B42318",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  section: {
    gap: 7,
  },
  labelRow: {
    minHeight: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    color: "#596579",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.65,
    textTransform: "uppercase",
  },
  field: {
    minHeight: 52,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E6EE",
    backgroundColor: "#FFFFFF",
  },
  fieldIcon: {
    width: 30,
    height: 30,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#F0EDFF",
  },
  fieldText: {
    flex: 1,
    minWidth: 0,
    color: "#172033",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
  },
  fieldPlaceholder: {
    color: "#8A96A8",
  },
  fieldCaption: {
    marginTop: 1,
    color: "#98A2B3",
    fontSize: 10,
    lineHeight: 13,
  },
  groupedCard: {
    overflow: "hidden",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E6EE",
    backgroundColor: "#FFFFFF",
  },
  groupedRow: {
    minHeight: 50,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  groupedDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 51,
    backgroundColor: "#E6EBF2",
  },
  helperText: {
    marginLeft: 2,
    color: "#98A2B3",
    fontSize: 10.5,
    lineHeight: 14,
  },
  segmentedControl: {
    padding: 3,
    flexDirection: "row",
    gap: 3,
    borderRadius: 13,
    backgroundColor: "#F1F4F8",
  },
  segment: {
    minHeight: 38,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  segmentActive: {
    borderWidth: 1,
    borderColor: "#DDD6FE",
    backgroundColor: "#FFFFFF",
    shadowColor: "#27324A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  segmentText: {
    color: "#697586",
    fontSize: 12.5,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: "#5D48C7",
  },
  videoCard: {
    minHeight: 62,
    paddingHorizontal: 11,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E1E6EE",
    backgroundColor: "#FFFFFF",
  },
  videoIcon: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: "#EAF0FF",
  },
  videoTitle: {
    color: "#172033",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  videoSubtitle: {
    marginTop: 2,
    color: "#7C8798",
    fontSize: 10.5,
    lineHeight: 14,
  },
});

function MemberPickerModal({
  visible,
  members,
  selectedUserId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  members: {
    userId: string;
    label: string;
    user: { name?: string | null; email?: string | null; image?: string | null };
  }[];
  selectedUserId: string;
  onClose: () => void;
  onSelect: (userId: string) => void;
}) {
  return (
    <AlenioBottomSheet
      visible={visible}
      title="Choose team member"
      subtitle="Select who you want to schedule a check-in with"
      onClose={onClose}
      compact
      showCloseButton
      bodyHeightRatio={0.52}
      showScrollIndicator={members.length > 5}
      testID="check-in-member-picker"
    >
      {members.length === 0 ? (
        <View style={{ paddingHorizontal: 16, paddingVertical: 28, alignItems: "center" }}>
          <Text style={{ fontSize: 14, color: "#94A3B8", textAlign: "center" }}>
            No other team members available.
          </Text>
        </View>
      ) : (
        members.map((member) => {
          const active = member.userId === selectedUserId;
          return (
            <Pressable
              key={member.userId}
              onPress={() => onSelect(member.userId)}
              style={{
                minHeight: 52,
                marginBottom: 6,
                paddingHorizontal: 10,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: active ? "#DDD6FE" : "#EEF1F5",
                backgroundColor: active ? "#F5F3FF" : "#FFFFFF",
              }}
            >
              <View style={{ flexShrink: 0 }}>
                <UserAvatar
                  user={member.user}
                  size={36}
                  radius={18}
                  backgroundColor="#EDE9FE"
                  textColor="#7C3AED"
                  fontSize={12}
                />
              </View>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: 14,
                  fontWeight: active ? "700" : "600",
                  color: "#0F172A",
                }}
              >
                {member.label}
              </Text>
            </Pressable>
          );
        })
      )}
    </AlenioBottomSheet>
  );
}
