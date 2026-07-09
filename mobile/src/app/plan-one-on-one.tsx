import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { SafeKeyboardAwareScrollView as KeyboardAwareScrollView } from "@/lib/safe-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { X, Calendar, Clock, UserRound, Video } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import type { Team } from "@/lib/types";
import { fetchOneOnOneTemplates, type OneOnOneTemplate } from "@/lib/member-profile-api";
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
    startDate,
    templateId: initialTemplateId,
    myRole,
    eventId,
  } = useLocalSearchParams<{
    teamId: string;
    memberUserId?: string;
    startDate?: string;
    templateId?: string;
    myRole?: string;
    eventId?: string;
  }>();

  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });

  const resolvedRole =
    myRole ??
    team?.members?.find((member) => member.userId === session?.user?.id)?.role ??
    "member";
  const isOwnerOrLeader = resolvedRole === "owner" || resolvedRole === "team_leader";
  const isEditing = !!eventId;

  const cachedEvents = queryClient.getQueryData<CalendarEvent[]>(["calendar-events", teamId]) ?? [];
  const existingEvent = isEditing ? cachedEvents.find((event) => event.id === eventId) : null;

  const defaultStart = existingEvent?.startDate
    ? new Date(existingEvent.startDate)
    : startDate
      ? new Date(startDate)
      : new Date();
  if (!existingEvent?.startDate && !startDate) {
    defaultStart.setMinutes(0, 0, 0);
    defaultStart.setHours(defaultStart.getHours() + 1);
  }

  const [selectedMemberUserId, setSelectedMemberUserId] = useState(
    existingEvent?.oneOnOneMemberUserId ?? initialMemberUserId ?? "",
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState(
    existingEvent?.oneOnOneTemplateId ?? initialTemplateId ?? "",
  );
  const [eventStart, setEventStart] = useState<Date>(defaultStart);
  const [durationMinutes, setDurationMinutes] = useState(() => {
    if (existingEvent?.startDate && existingEvent.endDate) {
      return durationMinutesFromRange(new Date(existingEvent.startDate), new Date(existingEvent.endDate));
    }
    return ONE_ON_ONE_DEFAULT_DURATION_MINUTES;
  });
  const [isVideoMeeting, setIsVideoMeeting] = useState(existingEvent?.isVideoMeeting ?? false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showMemberPicker, setShowMemberPicker] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["one-on-one-templates", teamId],
    queryFn: () => fetchOneOnOneTemplates(teamId),
    enabled: !!teamId && isOwnerOrLeader,
  });

  const memberOptions = useMemo(() => {
    const currentUserId = session?.user?.id;
    return (team?.members ?? [])
      .filter((member) => member.userId !== currentUserId)
      .map((member) => ({
        userId: member.userId,
        label: memberDisplayName(member.user.name, member.user.email),
        role: member.role,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [session?.user?.id, team?.members]);

  const selectedMember = memberOptions.find((member) => member.userId === selectedMemberUserId) ?? null;
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId) ?? null;
  const eventEnd = oneOnOneEndFromDuration(eventStart, durationMinutes);

  const createMutation = useMutation({
    mutationFn: (data: object) => api.post<CalendarEvent>(`/api/teams/${teamId}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      router.back();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<CalendarEvent>(`/api/teams/${teamId}/events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      router.back();
    },
  });

  const handleSave = () => {
    if (!isOwnerOrLeader) {
      setFormError("Only workspace owners and team leaders can plan check-ins.");
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
      oneOnOneTemplateId: selectedTemplateId || undefined,
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

  if (!isOwnerOrLeader) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A", textAlign: "center" }}>
          Only leaders can plan check-ins
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16, alignSelf: "center" }}>
          <Text style={{ color: "#4361EE", fontWeight: "700" }}>Go back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="plan-one-on-one-modal">
      <LinearGradient colors={["#7C3AED", "#4361EE"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View
          style={{
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center",
            }}
            testID="close-plan-one-on-one-button"
          >
            <X size={18} color="white" />
          </Pressable>

          <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>
            {isEditing ? "Edit check-in plan" : "Plan check-in"}
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={isSaving || teamLoading}
            style={{
              backgroundColor: "rgba(255,255,255,0.22)",
              paddingHorizontal: 16,
              paddingVertical: 7,
              borderRadius: 20,
              opacity: isSaving ? 0.7 : 1,
            }}
            testID="save-plan-one-on-one-button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
                {isEditing ? "Save" : "Plan"}
              </Text>
            )}
          </Pressable>
        </View>
      </LinearGradient>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, gap: 18 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 14, color: "#64748B", lineHeight: 20 }}>
          Block time on your calendar, then start the check-in when you meet.
        </Text>

        {formError || mutationError ? (
          <Text style={{ color: "#DC2626", fontSize: 13 }}>{formError ?? mutationError}</Text>
        ) : null}

        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8 }}>Team member</Text>
          <Pressable
            onPress={() => setShowMemberPicker(true)}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "white",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
            testID="plan-one-on-one-member-picker"
          >
            <UserRound size={18} color="#7C3AED" />
            <Text style={{ flex: 1, fontSize: 15, color: selectedMember ? "#0F172A" : "#94A3B8", fontWeight: "600" }}>
              {selectedMember?.label ?? "Choose team member"}
            </Text>
          </Pressable>
        </View>

        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8 }}>Date and time</Text>
          <Pressable
            onPress={() => setShowStartPicker(true)}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "white",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Calendar size={18} color="#7C3AED" />
            <Text style={{ flex: 1, fontSize: 15, color: "#0F172A", fontWeight: "600" }}>
              {eventStart.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setShowStartTimePicker(true)}
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "white",
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Clock size={18} color="#7C3AED" />
            <Text style={{ flex: 1, fontSize: 15, color: "#0F172A", fontWeight: "600" }}>
              {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </Text>
          </Pressable>
          <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
            Ends {formatEventTimeRange(eventStart.toISOString(), eventEnd.toISOString())}
          </Text>
        </View>

        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8 }}>Duration</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {ONE_ON_ONE_DURATION_OPTIONS.map((minutes) => {
              const active = durationMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => setDurationMinutes(minutes)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: active ? "#EDE9FE" : "white",
                    borderWidth: 1,
                    borderColor: active ? "#7C3AED" : "#E2E8F0",
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: "700", color: active ? "#7C3AED" : "#64748B" }}>
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 8 }}>
            Check-in template (optional)
          </Text>
          <Pressable
            onPress={() => setShowTemplatePicker(true)}
            style={{
              borderWidth: 1,
              borderColor: "#E2E8F0",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "white",
            }}
            testID="plan-one-on-one-template-picker"
          >
            <Text style={{ fontSize: 15, color: selectedTemplate ? "#0F172A" : "#94A3B8", fontWeight: "600" }}>
              {templatesLoading
                ? "Loading templates…"
                : selectedTemplate?.title ?? "Choose later at check-in"}
            </Text>
          </Pressable>
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: "#E2E8F0",
            borderRadius: 12,
            padding: 14,
            backgroundColor: "white",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Video size={18} color="#4361EE" />
              <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Video meeting</Text>
            </View>
            <Text style={{ fontSize: 12, color: "#64748B", marginTop: 4, lineHeight: 18 }}>
              Add a join link on the calendar event.
            </Text>
          </View>
          <Switch value={isVideoMeeting} onValueChange={setIsVideoMeeting} />
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

      <TemplatePickerModal
        visible={showTemplatePicker}
        templates={templates}
        selectedTemplateId={selectedTemplateId}
        onClose={() => setShowTemplatePicker(false)}
        onSelect={(templateId) => {
          setSelectedTemplateId(templateId);
          setShowTemplatePicker(false);
        }}
      />

      {Platform.OS === "ios" ? (
        <>
          <Modal visible={showStartPicker} transparent animationType="slide">
            <Pressable style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" }} onPress={() => setShowStartPicker(false)}>
              <Pressable onPress={(e) => e.stopPropagation?.()}>
                <View style={{ backgroundColor: "white", paddingBottom: 24 }}>
                  <DateTimePicker
                    value={eventStart}
                    mode="date"
                    display="spinner"
                    onChange={(_e, date) => {
                      if (date) {
                        const next = new Date(eventStart);
                        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                        setEventStart(next);
                      }
                    }}
                  />
                </View>
              </Pressable>
            </Pressable>
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

function MemberPickerModal({
  visible,
  members,
  selectedUserId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  members: { userId: string; label: string }[];
  selectedUserId: string;
  onClose: () => void;
  onSelect: (userId: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Choose team member</Text>
            </View>
            <ScrollView>
              {members.map((member) => {
                const active = member.userId === selectedUserId;
                return (
                  <Pressable
                    key={member.userId}
                    onPress={() => onSelect(member.userId)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F8FAFC",
                      backgroundColor: active ? "#F5F3FF" : "white",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: active ? "700" : "500", color: "#0F172A" }}>
                      {member.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TemplatePickerModal({
  visible,
  templates,
  selectedTemplateId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  templates: OneOnOneTemplate[];
  selectedTemplateId: string;
  onClose: () => void;
  onSelect: (templateId: string) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation?.()}>
          <View style={{ backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "70%" }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#0F172A" }}>Check-in template</Text>
            </View>
            <ScrollView>
              <Pressable
                onPress={() => onSelect("")}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#F8FAFC",
                  backgroundColor: !selectedTemplateId ? "#F5F3FF" : "white",
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: !selectedTemplateId ? "700" : "500", color: "#0F172A" }}>
                  Choose later at check-in
                </Text>
              </Pressable>
              {templates.map((template) => {
                const active = template.id === selectedTemplateId;
                return (
                  <Pressable
                    key={template.id}
                    onPress={() => onSelect(template.id)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F8FAFC",
                      backgroundColor: active ? "#F5F3FF" : "white",
                    }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: active ? "700" : "500", color: "#0F172A" }}>
                      {template.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
