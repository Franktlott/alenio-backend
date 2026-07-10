import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar, Clock, Video } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SenecaPlanOneOnOneProposal } from "@/lib/seneca-api";
import { createPlannedCheckIn } from "@/lib/create-planned-check-in";
import {
  ONE_ON_ONE_DEFAULT_DURATION_MINUTES,
  ONE_ON_ONE_DURATION_OPTIONS,
  oneOnOneEndFromDuration,
} from "@/lib/plan-one-on-one";
import { formatEventDateAndTime } from "@/lib/format-event-time";

type Props = {
  teamId: string;
  proposal: SenecaPlanOneOnOneProposal;
  onSaved: (summary: string) => void;
  onDismiss: () => void;
};

export function SenecaPlanCheckInCard({ teamId, proposal, onSaved, onDismiss }: Props) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [eventStart, setEventStart] = useState(() => new Date(proposal.startDate));
  const [durationMinutes, setDurationMinutes] = useState(
    proposal.durationMinutes || ONE_ON_ONE_DEFAULT_DURATION_MINUTES,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const eventEnd = useMemo(
    () => oneOnOneEndFromDuration(eventStart, durationMinutes),
    [durationMinutes, eventStart],
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      createPlannedCheckIn(teamId, {
        memberUserId: proposal.memberUserId,
        memberName: proposal.memberName,
        startDate: eventStart,
        durationMinutes,
        isVideoMeeting: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["upcoming-video-meetings"] });
      void queryClient.invalidateQueries({
        queryKey: ["planned-one-on-ones", teamId, proposal.memberUserId],
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const summary = formatEventDateAndTime(eventStart.toISOString(), eventEnd.toISOString());
      onSaved(
        `Done — your virtual check-in with ${proposal.memberName} is on the calendar for ${summary}.`,
      );
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not save this check-in.");
    },
  });

  const handleSave = () => {
    setError(null);
    saveMutation.mutate();
  };

  return (
    <View style={styles.card} testID="seneca-plan-one-on-one-confirm">
      <Text style={styles.title}>{editing ? "Edit check-in" : "Check-in details"}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>With</Text>
        <Text style={styles.value}>{proposal.memberName}</Text>
      </View>

      {editing ? (
        <>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.editField}>
            <Calendar size={16} color="#4361EE" />
            <Text style={styles.editFieldText}>
              {eventStart.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </Text>
          </Pressable>

          <Pressable onPress={() => setShowTimePicker(true)} style={styles.editField}>
            <Clock size={16} color="#4361EE" />
            <Text style={styles.editFieldText}>
              {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </Text>
          </Pressable>

          <View style={styles.durationRow}>
            {ONE_ON_ONE_DURATION_OPTIONS.map((minutes) => {
              const active = durationMinutes === minutes;
              return (
                <Pressable
                  key={minutes}
                  onPress={() => setDurationMinutes(minutes)}
                  style={[styles.durationChip, active && styles.durationChipActive]}
                >
                  <Text style={[styles.durationChipText, active && styles.durationChipTextActive]}>
                    {minutes} min
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>When</Text>
            <Text style={styles.value}>
              {eventStart.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}{" "}
              · {eventStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Duration</Text>
            <Text style={styles.value}>{durationMinutes} min</Text>
          </View>
          <View style={styles.videoRow}>
            <Video size={14} color="#4361EE" />
            <Text style={styles.videoText}>Virtual meeting with join link</Text>
          </View>
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        {editing ? (
          <>
            <Pressable
              onPress={handleSave}
              disabled={saveMutation.isPending}
              style={styles.primary}
              testID="seneca-plan-one-on-one-save-button"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Save to calendar</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setEditing(false);
                setEventStart(new Date(proposal.startDate));
                setDurationMinutes(proposal.durationMinutes || ONE_ON_ONE_DEFAULT_DURATION_MINUTES);
                setError(null);
              }}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Cancel edit</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={handleSave}
              disabled={saveMutation.isPending}
              style={styles.primary}
              testID="seneca-plan-one-on-one-confirm-button"
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.primaryText}>Confirm & schedule</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setEditing(true)}
              style={styles.secondary}
              testID="seneca-plan-one-on-one-edit-button"
            >
              <Text style={styles.secondaryText}>Edit details</Text>
            </Pressable>
            <Pressable onPress={onDismiss} style={styles.ghost} testID="seneca-plan-one-on-one-cancel-button">
              <Text style={styles.ghostText}>Not now</Text>
            </Pressable>
          </>
        )}
      </View>

      {Platform.OS === "ios" ? (
        <>
          <Modal visible={showDatePicker} transparent animationType="slide">
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => setShowDatePicker(false)}
            >
              <Pressable onPress={(e) => e.stopPropagation?.()}>
                <View style={styles.pickerSheet}>
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
          <Modal visible={showTimePicker} transparent animationType="slide">
            <Pressable
              style={styles.pickerBackdrop}
              onPress={() => setShowTimePicker(false)}
            >
              <Pressable onPress={(e) => e.stopPropagation?.()}>
                <View style={styles.pickerSheet}>
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
          {showDatePicker ? (
            <DateTimePicker
              value={eventStart}
              mode="date"
              onChange={(_e, date) => {
                setShowDatePicker(false);
                if (date) {
                  const next = new Date(eventStart);
                  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
                  setEventStart(next);
                }
              }}
            />
          ) : null}
          {showTimePicker ? (
            <DateTimePicker
              value={eventStart}
              mode="time"
              onChange={(_e, date) => {
                setShowTimePicker(false);
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748B",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  label: {
    width: 68,
    fontSize: 13,
    color: "#94A3B8",
    fontWeight: "500",
  },
  value: {
    flex: 1,
    fontSize: 13,
    color: "#0F172A",
    fontWeight: "600",
  },
  videoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  videoText: {
    fontSize: 13,
    color: "#4361EE",
    fontWeight: "600",
  },
  editField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  editFieldText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  durationRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 2,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  durationChipActive: {
    backgroundColor: "#EEF2FF",
    borderColor: "#4361EE",
  },
  durationChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
  },
  durationChipTextActive: {
    color: "#4361EE",
  },
  error: {
    fontSize: 13,
    color: "#DC2626",
  },
  actions: {
    gap: 8,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  primary: {
    backgroundColor: "#4361EE",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  primaryText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  secondary: {
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  ghost: {
    paddingVertical: 8,
    alignItems: "center",
  },
  ghostText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  pickerBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  pickerSheet: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 24,
  },
});
