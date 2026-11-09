import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FileAudio, X } from "lucide-react-native";

import {
  fetchCheckInRecordingForMeeting,
  type CheckInRecording,
} from "@/lib/check-in-recordings-api";
import { CheckInAudioSection } from "./CheckInAudioSection";

/**
 * Shows the transcript behind a recorded check-in.
 *
 * Renders as an overlay inside its parent rather than a Modal: the screens that
 * open it are already presented modally, and iOS will not stack a second modal
 * on top of the first.
 */
export function CheckInTranscriptPanel({
  teamId,
  memberUserId,
  meetingId,
  onClose,
}: {
  teamId: string;
  memberUserId: string;
  meetingId: string;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [recording, setRecording] = useState<CheckInRecording | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCheckInRecordingForMeeting(teamId, memberUserId, meetingId)
      .then((loaded) => {
        if (cancelled) return;
        setRecording(loaded);
        setTranscript(loaded.transcript?.trim() || "");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "We could not load that transcript.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, memberUserId, meetingId]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close transcript" />
      <View style={[styles.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
        <View style={styles.handleWrap}>
          <View style={styles.handle} />
        </View>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <FileAudio size={15} color="#5B3FF0" strokeWidth={2.3} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>Conversation transcript</Text>
            <Text style={styles.subtitle}>Only you can see this.</Text>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={16} color="#475569" strokeWidth={2.4} />
          </Pressable>
        </View>

        {recording ? (
          <CheckInAudioSection
            teamId={teamId}
            memberUserId={memberUserId}
            recordingId={recording.id}
            audioStatus={recording.audioStatus}
            audioExpiresAt={recording.audioExpiresAt}
            audioRetained={recording.audioRetained}
            audioDeleteReason={recording.audioDeleteReason}
            canPlayAudio={recording.canPlayAudio}
            durationSec={recording.durationSec}
          />
        ) : null}

        {loading ? (
          <View style={styles.state}>
            <ActivityIndicator color="#5B3FF0" />
          </View>
        ) : error ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{error}</Text>
          </View>
        ) : transcript ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.body} selectable testID="check-in-transcript-text">
              {transcript}
            </Text>
          </ScrollView>
        ) : (
          <View style={styles.state}>
            <Text style={styles.stateText}>
              There is no transcript saved for this check-in.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.45)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "82%",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  handleWrap: { alignItems: "center", paddingTop: 8, paddingBottom: 4 },
  handle: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3FF",
  },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "800", letterSpacing: -0.2, color: "#0F172A" },
  subtitle: { marginTop: 2, fontSize: 11, color: "#667085" },
  close: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 18, paddingBottom: 8 },
  body: { fontSize: 13, lineHeight: 20, color: "#334155" },
  state: { paddingHorizontal: 18, paddingVertical: 26, alignItems: "center" },
  stateText: {
    maxWidth: 280,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },
});
