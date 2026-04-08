import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  Switch,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import DateTimePicker from "@react-native-community/datetimepicker";
import { X, Calendar, Trash2, UserRound, Video, Clock } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";

type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  startDate: string;
  endDate?: string | null;
  allDay: boolean;
  color: string;
  teamId: string;
  createdById: string;
  createdAt: string;
  isHidden?: boolean;
  isVideoMeeting?: boolean;
};

const EVENT_COLORS = ["#4361EE", "#7C3AED", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];

export default function CreateEventScreen() {
  const {
    teamId, startDate, eventId, eventTitle: initialTitle, eventDescription: initialDescription,
    eventColor: initialColor, eventEndDate, eventIsHidden, eventIsVideoMeeting,
  } = useLocalSearchParams<{
    teamId: string;
    startDate?: string;
    eventId?: string;
    eventTitle?: string;
    eventDescription?: string;
    eventColor?: string;
    eventEndDate?: string;
    eventIsHidden?: string;
    eventIsVideoMeeting?: string;
  }>();

  const queryClient = useQueryClient();
  const isEditing = !!eventId;

  const defaultStart = startDate ? new Date(startDate) : new Date();
  const defaultEnd = eventEndDate
    ? new Date(eventEndDate)
    : startDate
    ? new Date(startDate)
    : new Date();

  const [eventTitle, setEventTitle] = useState(initialTitle ?? "");
  const [eventDescription, setEventDescription] = useState(initialDescription ?? "");
  const [eventStart, setEventStart] = useState<Date>(defaultStart);
  const [eventEnd, setEventEnd] = useState<Date>(defaultEnd);
  const [eventColor, setEventColor] = useState(initialColor ?? "#4361EE");
  const [isHidden, setIsHidden] = useState(eventIsHidden === "true");
  const [isVideoMeeting, setIsVideoMeeting] = useState(eventIsVideoMeeting === "true");
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showStartTimePicker, setShowStartTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const onSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
    router.back();
  };

  const createMutation = useMutation({
    mutationFn: (data: object) =>
      api.post<CalendarEvent>(`/api/teams/${teamId}/events`, data),
    onSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      api.patch<CalendarEvent>(`/api/teams/${teamId}/events/${id}`, data),
    onSuccess,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/teams/${teamId}/events/${id}`),
    onSuccess,
  });

  const handleSave = () => {
    if (!eventTitle.trim()) {
      setFormError("Please enter an event title");
      return;
    }
    const end = eventEnd < eventStart ? eventStart : eventEnd;
    const payload = {
      title: eventTitle.trim(),
      description: eventDescription.trim() || undefined,
      startDate: eventStart.toISOString(),
      endDate: end.toISOString(),
      color: eventColor,
      allDay: !isVideoMeeting,
      isHidden: isHidden,
      isVideoMeeting: isVideoMeeting,
    };
    if (isEditing && eventId) {
      updateMutation.mutate({ id: eventId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }} edges={["top"]} testID="event-modal">
      {/* Gradient header */}
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable
            onPress={() => router.back()}
            style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" }}
            testID="close-modal-button"
          >
            <X size={18} color="white" />
          </Pressable>

          <Text style={{ color: "white", fontSize: 17, fontWeight: "700" }}>
            {isEditing ? "Edit Event" : "New Event"}
          </Text>

          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={{ backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20 }}
            testID="save-event-button"
          >
            {isSaving ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text style={{ color: "white", fontSize: 14, fontWeight: "600" }}>
                {isEditing ? "Save" : "Create"}
              </Text>
            )}
          </Pressable>
        </View>
      </LinearGradient>

      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Title</Text>
        <TextInput
          style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#0F172A", marginBottom: 14, backgroundColor: "white" }}
          placeholder="Event title..."
          placeholderTextColor="#CBD5E1"
          value={eventTitle}
          onChangeText={(t) => { setEventTitle(t); setFormError(null); }}
          testID="event-title-input"
        />

        {/* Description */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Description (optional)</Text>
        <TextInput
          style={{ borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#0F172A", marginBottom: 14, minHeight: 80, textAlignVertical: "top", backgroundColor: "white" }}
          placeholder="Add a description..."
          placeholderTextColor="#CBD5E1"
          value={eventDescription}
          onChangeText={setEventDescription}
          multiline
          numberOfLines={3}
          testID="event-description-input"
        />

        {/* Start / End dates */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Date</Text>
            <Pressable
              onPress={() => setShowStartPicker(true)}
              style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#4361EE0D" }}
              testID="event-start-date-button"
            >
              <Calendar size={13} color="#4361EE" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE" }}>
                {eventStart.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </Pressable>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Date</Text>
            <Pressable
              onPress={() => setShowEndPicker(true)}
              style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED0D" }}
              testID="event-end-date-button"
            >
              <Calendar size={13} color="#7C3AED" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED" }}>
                {eventEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Time pickers (video meetings only) */}
        {isVideoMeeting ? (
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>Start Time</Text>
              <Pressable
                onPress={() => setShowStartTimePicker(true)}
                style={{ borderWidth: 1.5, borderColor: "#4361EE", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#4361EE0D" }}
                testID="event-start-time-button"
              >
                <Clock size={13} color="#4361EE" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: "#4361EE" }}>
                  {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </Text>
              </Pressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 6 }}>End Time</Text>
              <Pressable
                onPress={() => setShowEndTimePicker(true)}
                style={{ borderWidth: 1.5, borderColor: "#7C3AED", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, flexDirection: "row", alignItems: "center", backgroundColor: "#7C3AED0D" }}
                testID="event-end-time-button"
              >
                <Clock size={13} color="#7C3AED" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 12, fontWeight: "500", color: "#7C3AED" }}>
                  {eventEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {/* iOS date pickers */}
        {Platform.OS === "ios" ? (
          <>
            <Modal visible={showStartPicker} transparent animationType="slide">
              <View style={{ flex: 1, justifyContent: "flex-end" }}>
                <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                    <Pressable onPress={() => setShowStartPicker(false)}>
                      <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Start Date</Text>
                    <Pressable onPress={() => setShowStartPicker(false)}>
                      <Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={eventStart}
                    mode="date"
                    display="inline"
                    onChange={(_e, d) => {
                      if (d) {
                        setEventStart(d);
                        if (d > eventEnd) setEventEnd(d);
                      }
                    }}
                    testID="start-date-picker"
                  />
                  <View style={{ height: 20 }} />
                </View>
              </View>
            </Modal>
            <Modal visible={showEndPicker} transparent animationType="slide">
              <View style={{ flex: 1, justifyContent: "flex-end" }}>
                <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                    <Pressable onPress={() => setShowEndPicker(false)}>
                      <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>End Date</Text>
                    <Pressable onPress={() => setShowEndPicker(false)}>
                      <Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={eventEnd}
                    mode="date"
                    display="inline"
                    minimumDate={eventStart}
                    onChange={(_e, d) => {
                      if (d) setEventEnd(d);
                    }}
                    testID="end-date-picker"
                  />
                  <View style={{ height: 20 }} />
                </View>
              </View>
            </Modal>
            {/* iOS time pickers for video meetings */}
            <Modal visible={showStartTimePicker} transparent animationType="slide">
              <View style={{ flex: 1, justifyContent: "flex-end" }}>
                <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                    <Pressable onPress={() => setShowStartTimePicker(false)}>
                      <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>Start Time</Text>
                    <Pressable onPress={() => setShowStartTimePicker(false)}>
                      <Text style={{ color: "#4361EE", fontWeight: "600", fontSize: 15 }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={eventStart}
                    mode="time"
                    display="spinner"
                    onChange={(_e, d) => { if (d) setEventStart(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
                    testID="start-time-picker"
                  />
                  <View style={{ height: 20 }} />
                </View>
              </View>
            </Modal>
            <Modal visible={showEndTimePicker} transparent animationType="slide">
              <View style={{ flex: 1, justifyContent: "flex-end" }}>
                <View style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
                    <Pressable onPress={() => setShowEndTimePicker(false)}>
                      <Text style={{ color: "#64748B", fontSize: 15 }}>Cancel</Text>
                    </Pressable>
                    <Text style={{ fontSize: 15, fontWeight: "600", color: "#0F172A" }}>End Time</Text>
                    <Pressable onPress={() => setShowEndTimePicker(false)}>
                      <Text style={{ color: "#7C3AED", fontWeight: "600", fontSize: 15 }}>Done</Text>
                    </Pressable>
                  </View>
                  <DateTimePicker
                    value={eventEnd}
                    mode="time"
                    display="spinner"
                    onChange={(_e, d) => { if (d) setEventEnd(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; }); }}
                    testID="end-time-picker"
                  />
                  <View style={{ height: 20 }} />
                </View>
              </View>
            </Modal>
          </>
        ) : (
          <>
            {showStartPicker ? (
              <DateTimePicker
                value={eventStart}
                mode="date"
                display="calendar"
                onChange={(_e, d) => {
                  setShowStartPicker(false);
                  if (d) {
                    setEventStart(d);
                    if (d > eventEnd) setEventEnd(d);
                  }
                }}
                testID="start-date-picker"
              />
            ) : null}
            {showEndPicker ? (
              <DateTimePicker
                value={eventEnd}
                mode="date"
                display="calendar"
                minimumDate={eventStart}
                onChange={(_e, d) => {
                  setShowEndPicker(false);
                  if (d) setEventEnd(d);
                }}
                testID="end-date-picker"
              />
            ) : null}
            {isVideoMeeting && showStartTimePicker ? (
              <DateTimePicker
                value={eventStart}
                mode="time"
                display="clock"
                onChange={(_e, d) => {
                  setShowStartTimePicker(false);
                  if (d) setEventStart(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; });
                }}
                testID="start-time-picker"
              />
            ) : null}
            {isVideoMeeting && showEndTimePicker ? (
              <DateTimePicker
                value={eventEnd}
                mode="time"
                display="clock"
                onChange={(_e, d) => {
                  setShowEndTimePicker(false);
                  if (d) setEventEnd(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; });
                }}
                testID="end-time-picker"
              />
            ) : null}
          </>
        )}

        {/* Video Meeting toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "white", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 1.5, borderColor: isVideoMeeting ? "#4361EE" : "#E2E8F0" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Video size={18} color={isVideoMeeting ? "#4361EE" : "#CBD5E1"} />
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Video Meeting</Text>
              <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Includes a video call link</Text>
            </View>
          </View>
          <Switch
            value={isVideoMeeting}
            onValueChange={(val) => {
              setIsVideoMeeting(val);
              if (val) {
                const newEnd = new Date(eventStart);
                newEnd.setHours(newEnd.getHours() + 1);
                setEventEnd(newEnd);
              }
            }}
            trackColor={{ false: "#E2E8F0", true: "#4361EE" }}
            thumbColor="white"
            testID="video-meeting-toggle"
          />
        </View>

        {/* Hidden toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "white", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 1.5, borderColor: isHidden ? "#94A3B8" : "#E2E8F0" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <UserRound size={18} color={isHidden ? "#64748B" : "#CBD5E1"} />
            <View>
              <Text style={{ fontSize: 14, fontWeight: "600", color: "#0F172A" }}>Incognito</Text>
              <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>Only visible to you</Text>
            </View>
          </View>
          <Switch
            value={isHidden}
            onValueChange={setIsHidden}
            trackColor={{ false: "#E2E8F0", true: "#64748B" }}
            thumbColor="white"
            testID="hidden-toggle"
          />
        </View>

        {/* Color picker */}
        <Text style={{ fontSize: 12, fontWeight: "600", color: "#64748B", marginBottom: 10 }}>Color</Text>
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
          {EVENT_COLORS.map((color) => (
            <Pressable
              key={color}
              onPress={() => setEventColor(color)}
              style={{
                width: 30,
                height: 30,
                borderRadius: 15,
                backgroundColor: color,
                borderWidth: eventColor === color ? 3 : 0,
                borderColor: "white",
                shadowColor: color,
                shadowOpacity: eventColor === color ? 0.5 : 0,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 0 },
                elevation: eventColor === color ? 4 : 0,
              }}
              testID={`color-swatch-${color}`}
            />
          ))}
        </View>

        {formError ? (
          <Text style={{ color: "#EF4444", fontSize: 13, marginBottom: 12 }} testID="form-error">
            {formError}
          </Text>
        ) : null}

        {/* Delete button (edit mode only) */}
        {isEditing && eventId ? (
          <Pressable
            onPress={() => deleteMutation.mutate(eventId)}
            disabled={deleteMutation.isPending}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14, backgroundColor: "#FEE2E2", marginBottom: 16 }}
            testID="delete-event-button"
          >
            {deleteMutation.isPending ? (
              <ActivityIndicator size="small" color="#EF4444" />
            ) : (
              <>
                <Trash2 size={18} color="#EF4444" />
                <Text style={{ color: "#EF4444", fontWeight: "700", fontSize: 15 }}>Delete Event</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}
