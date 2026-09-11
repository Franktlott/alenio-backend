import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { AudioLines, Pause, Play, Trash2 } from "lucide-react-native";

import {
  deleteCheckInRecordingAudio,
  fetchCheckInRecordingAudio,
  type CheckInAudioDeleteReason,
  type CheckInAudioPart,
  type CheckInAudioStatus,
} from "@/lib/check-in-recordings-api";
import { isAudioPlaybackSupported, loadExpoAudio } from "@/lib/expo-audio-module";
import { formatEventDateAndTime } from "@/lib/format-event-time";

/** Minimal slice of an expo-audio player, so this file needs no native types. */
type Player = {
  play: () => void;
  pause: () => void;
  remove: () => void;
  currentTime: number;
  duration: number;
  addListener: (
    event: "playbackStatusUpdate",
    listener: (status: { didJustFinish: boolean; currentTime: number }) => void,
  ) => { remove: () => void };
};

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * The original audio behind a recorded check-in.
 *
 * Only the person who recorded the conversation sees a player here, and only
 * for seven days. Once the audio is gone this becomes a plain status line: the
 * transcript, summary and saved check-in are unaffected, so there is nothing
 * broken to apologise for and no dead play button to offer.
 */
export function CheckInAudioSection({
  teamId,
  memberUserId,
  recordingId,
  audioStatus,
  audioExpiresAt,
  audioRetained,
  audioDeleteReason,
  canPlayAudio,
  durationSec,
}: {
  teamId: string;
  memberUserId: string;
  recordingId: string;
  audioStatus: CheckInAudioStatus;
  audioExpiresAt: string | null;
  audioRetained: boolean;
  audioDeleteReason: CheckInAudioDeleteReason | null;
  canPlayAudio: boolean;
  durationSec: number;
}) {
  const [status, setStatus] = useState<CheckInAudioStatus>(audioStatus);
  const [deletedByHand, setDeletedByHand] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // A conversation is stored as several parts, so playback walks them in order
  // with one player at a time rather than pretending it is a single file.
  const partsRef = useRef<CheckInAudioPart[]>([]);
  const partIndexRef = useRef(0);
  const elapsedBeforePartRef = useRef(0);
  const playerRef = useRef<Player | null>(null);
  const subscriptionRef = useRef<{ remove: () => void } | null>(null);
  const liveRef = useRef(true);

  useEffect(() => setStatus(audioStatus), [audioStatus]);

  const teardown = useCallback(() => {
    subscriptionRef.current?.remove();
    subscriptionRef.current = null;
    const player = playerRef.current;
    playerRef.current = null;
    if (!player) return;
    // Pause before releasing. Releasing the player on its own does not
    // reliably stop the sound, so closing the screen would leave the
    // conversation playing out loud with nothing on screen to stop it.
    try {
      player.pause();
    } catch {
      /* already stopped */
    }
    try {
      player.remove();
    } catch {
      /* already released */
    }
  }, []);

  // Releasing the native player on unmount matters here: leaving one alive
  // holds the audio session and quietly blocks the next recording.
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      teardown();
    };
  }, [teardown]);

  const stopPlayback = useCallback(() => {
    teardown();
    partIndexRef.current = 0;
    elapsedBeforePartRef.current = 0;
    setPlaying(false);
    setElapsedSec(0);
  }, [teardown]);

  const playPart = useCallback(
    (index: number) => {
      const audio = loadExpoAudio();
      const part = partsRef.current[index];
      if (!audio || !part) {
        stopPlayback();
        return;
      }
      teardown();
      partIndexRef.current = index;
      const player = audio.createAudioPlayer({ uri: part.url }) as unknown as Player;
      playerRef.current = player;
      subscriptionRef.current = player.addListener(
        "playbackStatusUpdate",
        (update) => {
          if (!liveRef.current) return;
          setElapsedSec(elapsedBeforePartRef.current + (update.currentTime || 0));
          if (!update.didJustFinish) return;
          const nextIndex = partIndexRef.current + 1;
          const finishedPart = partsRef.current[partIndexRef.current];
          elapsedBeforePartRef.current += finishedPart?.durationSec || 0;
          if (nextIndex < partsRef.current.length) {
            playPart(nextIndex);
          } else {
            stopPlayback();
          }
        },
      );
      player.play();
      setPlaying(true);
    },
    [stopPlayback, teardown],
  );

  const handlePlay = useCallback(async () => {
    if (playing) {
      playerRef.current?.pause();
      setPlaying(false);
      return;
    }
    // Resuming mid-conversation keeps the existing player rather than
    // re-fetching links and starting the whole thing over.
    if (playerRef.current) {
      playerRef.current.play();
      setPlaying(true);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      // Recording leaves the audio session set up for capture, and iOS will
      // silently play nothing when the ringer switch is on unless this is set.
      // Without it a working player looks broken.
      await loadExpoAudio()
        ?.setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
        .catch(() => undefined);
      // Links are minted per press because they expire in minutes, so nothing
      // playable is ever left sitting in the app's memory.
      const playback = await fetchCheckInRecordingAudio(teamId, memberUserId, recordingId);
      if (!liveRef.current) return;
      partsRef.current = playback.parts;
      partIndexRef.current = 0;
      elapsedBeforePartRef.current = 0;
      if (playback.parts.length === 0) {
        setStatus("deleted");
        return;
      }
      playPart(0);
    } catch (e: unknown) {
      if (!liveRef.current) return;
      const message = e instanceof Error ? e.message : "We could not play that recording.";
      // The server is the authority on whether the audio still exists, so a
      // refusal flips the section to its deleted state instead of retrying.
      if (/deleted/i.test(message)) {
        setStatus("deleted");
      } else {
        setError(message);
      }
    } finally {
      if (liveRef.current) setLoading(false);
    }
  }, [memberUserId, playPart, playing, recordingId, teamId]);

  const runDelete = useCallback(async () => {
    stopPlayback();
    setError(null);
    setDeleting(true);
    try {
      await deleteCheckInRecordingAudio(teamId, memberUserId, recordingId);
      if (!liveRef.current) return;
      partsRef.current = [];
      setDeletedByHand(true);
      setStatus("deleted");
    } catch (e: unknown) {
      if (!liveRef.current) return;
      setError(
        e instanceof Error ? e.message : "We could not delete that recording.",
      );
    } finally {
      if (liveRef.current) setDeleting(false);
    }
  }, [memberUserId, recordingId, stopPlayback, teamId]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      "Delete original recording?",
      "The audio cannot be recovered. The transcript, summary, and saved check-in will remain.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void runDelete() },
      ],
    );
  }, [runDelete]);

  // A recording still being captured shows nothing at all, so there is never a
  // player for a conversation that has not finished uploading.
  if (status === "pending") return null;

  // A video check-in was transcribed live on the call, so there is no audio to
  // offer and nothing was ever deleted. The transcript speaks for itself.
  if (status === "none") return null;

  const gone =
    status === "deleted" || status === "deleting" || status === "deletion_failed";

  if (gone) {
    // A check-in from before audio was kept never had a replay to lose, so it
    // must not be described as having expired.
    const neverKept = !audioRetained && !deletedByHand;
    const reason = deletedByHand ? "manual" : audioDeleteReason;
    return (
      <View style={styles.card} testID="check-in-audio-deleted">
        <View style={styles.header}>
          <View style={styles.iconMuted}>
            <AudioLines size={14} color="#94A3B8" strokeWidth={2.3} />
          </View>
          <Text style={styles.titleMuted}>
            {neverKept ? "No original recording saved" : "Original recording deleted"}
          </Text>
        </View>
        <Text style={styles.note}>
          {neverKept
            ? "This check-in was recorded before Alenio kept audio for replay, so only the transcript and summary were saved."
            : reason === "published"
              ? "The audio was deleted when this check-in was published. The saved check-in and Seneca summary remain available."
              : reason === "manual"
                ? "You deleted the recording. The saved check-in and Seneca summary remain available."
                : "The audio was deleted after seven days. The saved check-in and Seneca summary remain available."}
        </Text>
      </View>
    );
  }

  // Someone else's live recording shows nothing: no player, and no hint that
  // audio exists.
  if (!canPlayAudio) return null;

  if (!isAudioPlaybackSupported()) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.icon}>
            <AudioLines size={14} color="#5B3FF0" strokeWidth={2.3} />
          </View>
          <Text style={styles.title}>Original recording</Text>
        </View>
        <Text style={styles.note}>
          Update the app to play this recording back.
        </Text>
      </View>
    );
  }

  const availableUntil = audioExpiresAt ? formatEventDateAndTime(audioExpiresAt) : null;

  return (
    <View style={styles.card} testID="check-in-audio-section">
      <View style={styles.header}>
        <View style={styles.icon}>
          <AudioLines size={14} color="#5B3FF0" strokeWidth={2.3} />
        </View>
        <Text style={styles.title}>Original recording</Text>
      </View>

      <Pressable
        onPress={() => void handlePlay()}
        disabled={loading || deleting}
        style={({ pressed }) => [styles.playButton, pressed && styles.playButtonPressed]}
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause recording" : "Play recording"}
        testID="check-in-audio-play"
      >
        {loading ? (
          <ActivityIndicator size="small" color="#4C33D4" />
        ) : playing ? (
          <Pause size={15} color="#4C33D4" strokeWidth={2.8} />
        ) : (
          <Play size={15} color="#4C33D4" strokeWidth={2.8} />
        )}
        <Text style={styles.playLabel}>
          {loading
            ? "Loading recording"
            : playing
              ? "Pause"
              : elapsedSec > 0
                ? "Resume recording"
                : "Play recording"}
        </Text>
        <Text style={styles.playClock}>
          {formatClock(elapsedSec)} / {formatClock(durationSec)}
        </Text>
      </Pressable>

      {/* "Deletes by" rather than "available until", because publishing the
          check-in removes the audio before this date. */}
      {availableUntil ? (
        <Text style={styles.until}>Deletes by {availableUntil}</Text>
      ) : null}

      <Text style={styles.note}>
        Only you can access this recording. Audio deletes when the check-in is
        published or after seven days—whichever happens first.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={confirmDelete}
        disabled={deleting}
        hitSlop={6}
        style={styles.deleteRow}
        accessibilityRole="button"
        accessibilityLabel="Delete recording now"
        testID="check-in-audio-delete"
      >
        {deleting ? (
          <ActivityIndicator size="small" color="#DC2626" />
        ) : (
          <Trash2 size={13} color="#DC2626" strokeWidth={2.3} />
        )}
        <Text style={styles.deleteText}>Delete recording now</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E7E9F2",
    backgroundColor: "#FBFAFF",
  },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  icon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0EBFF",
  },
  iconMuted: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  title: { fontSize: 13.5, fontWeight: "800", letterSpacing: -0.2, color: "#0F172A" },
  titleMuted: { fontSize: 13.5, fontWeight: "700", letterSpacing: -0.2, color: "#64748B" },
  playButton: {
    marginTop: 12,
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    // Dark content on a light fill, so the button stays readable even if the
    // fill does not paint. White-on-purple disappears entirely when it fails.
    backgroundColor: "#EFEBFF",
    borderWidth: 1,
    borderColor: "#C7BAFF",
  },
  playButtonPressed: { backgroundColor: "#E3DBFF" },
  playLabel: { flex: 1, fontSize: 13.5, fontWeight: "800", color: "#4C33D4" },
  playClock: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#6B5BB8",
    fontVariant: ["tabular-nums"],
  },
  until: { marginTop: 8, fontSize: 11.5, color: "#667085" },
  note: { marginTop: 10, fontSize: 11.5, lineHeight: 17, color: "#64748B" },
  error: { marginTop: 8, fontSize: 11.5, lineHeight: 17, color: "#DC2626" },
  deleteRow: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E7E9F2",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  deleteText: { fontSize: 12.5, fontWeight: "700", color: "#DC2626" },
});
