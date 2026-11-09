import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { CalendarCheck, MessagesSquare, Plus } from "lucide-react-native";
import {
  DevelopmentEmptyMark,
  DevelopmentEmptyState,
} from "@/components/development/DevelopmentEmptyState";
import { colors } from "@/theme";

export function CheckInEmptyState({
  memberName,
  isSelf = false,
  canCreate,
  compact,
  error,
  onStart,
}: {
  memberName: string;
  memberImage?: string | null;
  /** The signed-in person is the member these check-ins belong to. */
  isSelf?: boolean;
  canCreate: boolean;
  recordingSupported: boolean;
  /** Set where the list cannot scroll, such as beside a live video call. */
  compact: boolean;
  error?: string | null;
  onStart?: () => void;
}) {
  const firstName = memberName.trim().split(/\s+/)[0] || memberName || "this teammate";

  if (error) {
    return (
      <DevelopmentEmptyState
        icon={CalendarCheck}
        title="Could not load check-ins"
        body={error}
        testID="check-in-empty-state-error"
      />
    );
  }

  // Someone who cannot run a check-in only needs to know why the list is empty.
  if (!canCreate) {
    return (
      <DevelopmentEmptyState
        icon={CalendarCheck}
        title="No check-ins yet"
        body={
          isSelf
            ? "Your check-ins will appear here once a leader runs one."
            : `Check-ins with ${firstName} will appear here once a leader runs one.`
        }
        testID="check-in-empty-state"
      />
    );
  }

  return (
    <View style={styles.wrap} testID="check-in-empty-state">
      {compact ? null : (
        <DevelopmentEmptyMark icon={MessagesSquare} label="No check-ins yet" />
      )}

      <View style={styles.copy}>
        <Text style={styles.title}>No check-ins yet</Text>
        <Text style={styles.subhead}>
          {isSelf
            ? "Talk it through. Seneca writes it up."
            : `Talk with ${firstName}. Seneca writes it up.`}
        </Text>
      </View>

      {onStart ? (
        <Pressable
          onPress={onStart}
          style={styles.cta}
          accessibilityRole="button"
          accessibilityLabel="Start a check-in"
          testID="check-in-empty-state-start"
        >
          <Plus size={13} color="#FFFFFF" strokeWidth={2.8} />
          <Text style={styles.ctaText}>Start a check-in</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingVertical: 10, gap: 12, alignItems: "center" },
  copy: { alignItems: "center", gap: 3 },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    color: "#0F172A",
  },
  subhead: {
    maxWidth: 280,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    color: "#1F2739",
    textAlign: "center",
  },
  /** Matches the workspace "+ New" pill so buttons read the same app-wide. */
  cta: {
    alignSelf: "center",
    height: 32,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  ctaText: { fontSize: 12.5, lineHeight: 15, fontWeight: "700", color: "#FFFFFF" },
});
