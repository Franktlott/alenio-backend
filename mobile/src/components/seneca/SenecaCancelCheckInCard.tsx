import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api/api";
import type { SenecaCancelOneOnOneProposal } from "@/lib/seneca-api";

type Props = {
  teamId: string;
  proposal: SenecaCancelOneOnOneProposal;
  onCancelled: (summary: string) => void;
  onDismiss: () => void;
};

export function SenecaCancelCheckInCard({ teamId, proposal, onCancelled, onDismiss }: Props) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => api.delete(`/api/teams/${teamId}/events/${proposal.eventId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar-events", teamId] });
      void queryClient.invalidateQueries({ queryKey: ["planned-one-on-ones", teamId] });
      void queryClient.invalidateQueries({
        queryKey: ["planned-one-on-ones", teamId, proposal.memberUserId],
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCancelled(
        `Done — I removed your check-in with ${proposal.memberName} on ${proposal.dateLabel} at ${proposal.timeLabel}.`,
      );
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not cancel this check-in.");
    },
  });

  return (
    <View style={styles.card} testID="seneca-cancel-check-in-confirm">
      <Text style={styles.title}>Cancel check-in</Text>
      <View style={styles.row}>
        <Text style={styles.label}>With</Text>
        <Text style={styles.value}>{proposal.memberName}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>When</Text>
        <Text style={styles.value}>
          {proposal.dateLabel} · {proposal.timeLabel}
        </Text>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => {
            setError(null);
            cancelMutation.mutate();
          }}
          disabled={cancelMutation.isPending}
          style={styles.primary}
          testID="seneca-cancel-check-in-confirm-button"
        >
          {cancelMutation.isPending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryText}>Confirm cancel</Text>
          )}
        </Pressable>
        <Pressable onPress={onDismiss} style={styles.ghost} testID="seneca-cancel-check-in-dismiss-button">
          <Text style={styles.ghostText}>Keep it</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 14,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#B91C1C",
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
  error: {
    fontSize: 13,
    color: "#DC2626",
  },
  actions: {
    gap: 8,
    marginTop: 6,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#FECACA",
  },
  primary: {
    backgroundColor: "#DC2626",
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
  ghost: {
    paddingVertical: 8,
    alignItems: "center",
  },
  ghostText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
});
