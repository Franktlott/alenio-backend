import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  Check,
  CircleAlert,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Square,
  X,
} from "lucide-react-native";
import { useStatusClusterInset } from "@/lib/adaptive-layout";

import {
  CHECK_IN_RECORDING_OPTIONS,
  CheckInSegmentRecorder,
  ensureMicrophoneAccess,
  MAX_RECORDING_MS,
  prepareAudioSession,
  releaseAudioSession,
  type SegmentUploadState,
} from "@/lib/check-in-recorder";
import {
  formatRecordingClock,
  meteringToLevel,
  processingLabel,
  recordingErrorMessage,
  type RecordingProcessingStage,
} from "@/lib/check-in-recording-format";
import { loadExpoAudio, type ExpoAudioApi } from "@/lib/expo-audio-module";
import {
  cancelCheckInRecording,
  finishCheckInRecording,
  startCheckInRecording,
} from "@/lib/check-in-recordings-api";

type Step = "consent" | "recording" | "processing" | "error";

const LEVEL_BARS = 24;
const KEEP_AWAKE_TAG = "check-in-recording";
/** How long before the hard cap the remaining time starts being shown. */
const CAP_WARNING_SEC = 5 * 60;

function screenFrame(
  insets: { top: number; bottom: number },
  cluster: { left: number; right: number },
) {
  return {
    paddingTop: insets.top + 12,
    paddingBottom: insets.bottom + 14,
    paddingLeft: 18 + cluster.left,
    paddingRight: 18 + cluster.right,
  };
}

type SheetProps = {
  visible: boolean;
  teamId: string;
  memberUserId: string;
  memberName: string;
  /** Null for an open check-in, where Seneca decides the questions afterwards. */
  templateId: string | null;
  templateTitle: string;
  /** Questions on the template, shown while talking so the leader can cover them. */
  questions: string[];
  onClose: () => void;
  /**
   * Called once the audio is safely uploaded and the write-up has been kicked
   * off. The check-ins list takes it from here so the leader is not left
   * watching a spinner.
   */
  onProcessingStarted: (recordingId: string) => void;
};

export function CheckInRecordingSheet(props: SheetProps) {
  const audio = loadExpoAudio();
  if (!audio) return <RecordingUnavailable {...props} />;
  return <RecordingFlow {...props} audio={audio} />;
}

/** Shown on builds that predate the audio module, so nothing looks broken. */
function RecordingUnavailable({
  visible,
  templateTitle,
  onClose,
}: SheetProps) {
  const insets = useSafeAreaInsets();
  const cluster = useStatusClusterInset({ fullScreen: true });
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.screen,
          screenFrame(insets, cluster),
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {templateTitle}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={10}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <X size={17} color="#475569" strokeWidth={2.4} />
          </Pressable>
        </View>
        <View style={[styles.body, styles.centered]}>
          <View style={styles.errorIcon}>
            <Mic size={22} color="#5B3FF0" strokeWidth={2.2} />
          </View>
          <Text style={styles.processingTitle}>Update Alenio to record check-ins</Text>
          <Text style={styles.processingBody}>
            Recording needs a newer version of the app than the one you are running. You can still
            fill this check-in in yourself.
          </Text>
          <Pressable
            onPress={onClose}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.primaryLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RecordingFlow({
  visible,
  teamId,
  memberUserId,
  memberName,
  templateId,
  templateTitle,
  questions,
  onClose,
  onProcessingStarted,
  audio,
}: SheetProps & { audio: ExpoAudioApi }) {
  const insets = useSafeAreaInsets();
  const cluster = useStatusClusterInset({ fullScreen: true });
  const [step, setStep] = useState<Step>("consent");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [segments, setSegments] = useState<SegmentUploadState[]>([]);
  const [stage, setStage] = useState<RecordingProcessingStage>("uploading");

  const recorder = audio.useAudioRecorder(CHECK_IN_RECORDING_OPTIONS);
  const recorderState = audio.useAudioRecorderState(recorder, 250);
  const sessionRef = useRef<CheckInSegmentRecorder | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef(0);

  const firstName = memberName.trim().split(/\s+/)[0] || memberName;
  const level = meteringToLevel(recorderState.metering);

  const reset = useCallback(() => {
    sessionRef.current = null;
    recordingIdRef.current = null;
    setElapsedSec(0);
    setSegments([]);
    setPaused(false);
    setStarting(false);
    setError(null);
    setStage("uploading");
    setStep("consent");
  }, []);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  useEffect(() => {
    elapsedRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    if (step !== "recording" || paused) return;
    const timer = setInterval(() => setElapsedSec((seconds) => seconds + 1), 1000);
    return () => clearInterval(timer);
  }, [step, paused]);

  useEffect(() => {
    if (step !== "recording") return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    return () => {
      try {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      } catch {
        /* nothing was holding the lock */
      }
    };
  }, [step]);

  const begin = useCallback(async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const granted = await ensureMicrophoneAccess();
      if (!granted) {
        setError(
          "Alenio needs microphone access to record this check-in. You can turn it on in Settings.",
        );
        setStep("error");
        return;
      }
      const created = await startCheckInRecording(teamId, memberUserId, templateId);
      recordingIdRef.current = created.id;
      await prepareAudioSession();
      const session = new CheckInSegmentRecorder(
        recorder,
        { teamId, memberUserId, recordingId: created.id },
        {
          onSegmentsChange: setSegments,
          onError: (message) => setError(recordingErrorMessage(message)),
        },
      );
      sessionRef.current = session;
      await session.start();
      setStep("recording");
    } catch (err) {
      setError(recordingErrorMessage(err));
      setStep("error");
    } finally {
      setStarting(false);
    }
  }, [starting, teamId, memberUserId, templateId, recorder]);

  const stopAndProcess = useCallback(async () => {
    const session = sessionRef.current;
    const recordingId = recordingIdRef.current;
    if (!session || !recordingId) return;
    setStep("processing");
    setStage("uploading");
    const total = elapsedRef.current;
    try {
      // Uploading the final segment is the only part worth waiting on; the
      // transcript and draft are built server-side.
      await session.stop();
      await releaseAudioSession();
      setStage("transcribing");
      await finishCheckInRecording(teamId, memberUserId, recordingId, total);
      sessionRef.current = null;
      recordingIdRef.current = null;
      onProcessingStarted(recordingId);
    } catch (err) {
      setError(recordingErrorMessage(err));
      setStep("error");
    }
  }, [teamId, memberUserId, onProcessingStarted]);

  // Stop automatically rather than letting a forgotten recording run all day.
  useEffect(() => {
    if (step !== "recording" || paused) return;
    if (elapsedSec * 1000 < MAX_RECORDING_MS) return;
    void stopAndProcess();
  }, [step, paused, elapsedSec, stopAndProcess]);

  /** Seconds until the cap stops the recording, or null while that is far off. */
  const maxSec = Math.floor(MAX_RECORDING_MS / 1000);
  const remainingSec = Math.max(0, maxSec - elapsedSec);
  const secondsLeft =
    step === "recording" && remainingSec <= CAP_WARNING_SEC ? remainingSec : null;

  const togglePause = () => {
    const session = sessionRef.current;
    if (!session) return;
    if (paused) {
      session.resume();
      setPaused(false);
      return;
    }
    session.pause();
    setPaused(true);
  };

  const discard = useCallback(async () => {
    const session = sessionRef.current;
    const recordingId = recordingIdRef.current;
    sessionRef.current = null;
    recordingIdRef.current = null;
    if (session) await session.abort().catch(() => undefined);
    await releaseAudioSession().catch(() => undefined);
    if (recordingId) {
      await cancelCheckInRecording(teamId, memberUserId, recordingId).catch(() => undefined);
    }
    onClose();
  }, [teamId, memberUserId, onClose]);

  /**
   * Asks before throwing away a conversation, but stays out of the way when
   * nothing has been captured yet, so closing the intro screen is still one tap.
   */
  const confirmDiscard = useCallback(() => {
    if (!recordingIdRef.current) {
      void discard();
      return;
    }
    Alert.alert(
      "Discard this recording?",
      `Nothing from this conversation with ${firstName} will be saved, and the audio is deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Discard",
          style: "destructive",
          onPress: () => void discard(),
        },
      ],
    );
  }, [discard, firstName]);

  const confirmFinish = useCallback(() => {
    Alert.alert(
      "Finish this check-in?",
      templateId
        ? `Alenio will write up what was said and fill in ${templateTitle} for you to review before anything is saved.`
        : "Alenio will write up the questions covered, what was said, and a summary for you to review before anything is saved.",
      [
        { text: "Keep talking", style: "cancel" },
        { text: "Finish", onPress: () => void stopAndProcess() },
      ],
    );
  }, [stopAndProcess, templateId, templateTitle]);

  const pendingUploads = segments.filter((segment) => segment.status !== "uploaded").length;
  const failedUploads = segments.filter((segment) => segment.status === "failed").length;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        // Closing mid-processing would cancel a write-up already handed over.
        if (step === "processing") return;
        confirmDiscard();
      }}
    >
      <View style={[styles.screen, screenFrame(insets, cluster)]}>
        <View style={styles.header}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {templateTitle}
          </Text>
          {step !== "recording" && step !== "processing" ? (
            <Pressable
              onPress={confirmDiscard}
              hitSlop={10}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={17} color="#475569" strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>

        {step === "consent" ? (
          <>
            <ScrollView
              style={styles.consentScroll}
              contentContainerStyle={styles.consentBody}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.intro}>
                <View style={styles.introIcon}>
                  <Mic size={20} color="#5B3FF0" strokeWidth={2.3} />
                </View>
                <Text style={styles.introTitle}>Record this check-in</Text>
                <Text style={styles.introBody}>
                  {templateId
                    ? `Alenio listens, writes up what was said, and fills in ${templateTitle} for you to review before anything is saved.`
                    : "Talk about whatever matters. Alenio listens, then writes up the questions you covered, what was said, and a summary for you to review before anything is saved."}
                </Text>
              </View>

              <View style={styles.consentCard}>
                <View style={styles.consentIcon}>
                  <ShieldCheck size={17} color="#0F9D6E" strokeWidth={2.3} />
                </View>
                <View style={styles.consentCopy}>
                  <Text style={styles.consentTitle}>Tell {firstName} first</Text>
                  <Text style={styles.consentBody}>
                    Let {firstName} know this conversation is being recorded and that they can ask you
                    to stop at any point. The audio is deleted as soon as it is written up.
                  </Text>
                </View>
              </View>

              <View style={styles.facts}>
                {[
                  "Audio is deleted after it is written up",
                  "Only you can see the write-up",
                  "Nothing is saved until you publish",
                ].map((fact) => (
                  <View key={fact} style={styles.factLine}>
                    <Check size={14} color="#0F9D6E" strokeWidth={2.6} />
                    <Text style={styles.fact}>{fact}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
            <Pressable
              onPress={() => void begin()}
              disabled={starting}
              style={[styles.primary, starting ? styles.primaryDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Start recording the check-in with ${firstName}`}
              testID="start-check-in-recording"
            >
              {starting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Mic size={16} color="#FFFFFF" strokeWidth={2.6} />
                  <Text style={styles.primaryLabel}>{firstName} agreed, start recording</Text>
                </>
              )}
            </Pressable>
          </>
        ) : null}

        {step === "recording" ? (
          <View style={styles.body}>
            <View style={styles.liveWrap}>
              <View style={styles.liveBadge}>
                <View style={[styles.liveDot, paused ? styles.liveDotPaused : null]} />
                <Text style={styles.liveLabel}>{paused ? "Paused" : "Recording"}</Text>
              </View>
              <Text style={styles.clock}>{formatRecordingClock(elapsedSec)}</Text>
              {/* The cap stops the recording on its own, so it is worth
                  saying out loud before it happens rather than cutting a
                  conversation off without warning. */}
              {secondsLeft !== null ? (
                <View style={styles.capWarning}>
                  <Text style={styles.capWarningText}>
                    {formatRecordingClock(secondsLeft)} left
                  </Text>
                </View>
              ) : null}
              <Text style={styles.liveHint}>
                {secondsLeft !== null
                  ? "Recording stops at 90 minutes. Wrap up, or stop and start a second recording."
                  : paused
                    ? "Tap resume when you are ready to carry on."
                    : `Talking with ${firstName}. Keep the phone nearby.`}
              </Text>

              <View style={styles.meter}>
                {Array.from({ length: LEVEL_BARS }).map((_, index) => {
                  const threshold = (index + 1) / LEVEL_BARS;
                  const active = !paused && level >= threshold * 0.9;
                  return (
                    <View
                      key={index}
                      style={[
                        styles.meterBar,
                        { height: 8 + Math.round(threshold * 26) },
                        active ? styles.meterBarActive : null,
                      ]}
                    />
                  );
                })}
              </View>

              {pendingUploads > 0 ? (
                <Text style={styles.uploadNote}>
                  {`Saving ${pendingUploads} part${pendingUploads === 1 ? "" : "s"} in the background`}
                </Text>
              ) : null}
              {failedUploads > 0 ? (
                <Text style={styles.uploadWarn}>
                  {`${failedUploads} part${failedUploads === 1 ? "" : "s"} could not be saved and will be missing from the write-up`}
                </Text>
              ) : null}
            </View>

            {questions.length === 0 && !templateId ? (
              <View style={styles.questionsCard}>
                <Text style={styles.questionsTitle}>No set questions</Text>
                <Text style={styles.openHint}>
                  Talk through whatever matters. Alenio works out the questions
                  you covered once you finish.
                </Text>
              </View>
            ) : null}

            {questions.length > 0 ? (
              <View style={styles.questionsCard}>
                <Text style={styles.questionsTitle}>What to cover</Text>
                <ScrollView
                  contentContainerStyle={styles.questionsList}
                  showsVerticalScrollIndicator={false}
                >
                  {questions.map((question, index) => (
                    <View key={`${index}-${question}`} style={styles.questionRow}>
                      <Text style={styles.questionNumber}>{index + 1}</Text>
                      <Text style={styles.questionText}>{question}</Text>
                    </View>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.controls}>
              <Pressable
                onPress={togglePause}
                style={styles.secondaryControl}
                accessibilityRole="button"
                accessibilityLabel={paused ? "Resume recording" : "Pause recording"}
              >
                {paused ? (
                  <Play size={18} color="#0F172A" strokeWidth={2.4} />
                ) : (
                  <Pause size={18} color="#0F172A" strokeWidth={2.4} />
                )}
                <Text style={styles.secondaryControlLabel}>{paused ? "Resume" : "Pause"}</Text>
              </Pressable>

              <Pressable
                onPress={confirmFinish}
                style={styles.stopControl}
                accessibilityRole="button"
                accessibilityLabel="Finish recording and write up the check-in"
                testID="stop-check-in-recording"
              >
                <Square size={16} color="#FFFFFF" strokeWidth={2.8} fill="#FFFFFF" />
                <Text style={styles.stopLabel}>Finish</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={confirmDiscard}
              style={styles.discard}
              accessibilityRole="button"
              accessibilityLabel="Discard this recording"
            >
              <Text style={styles.discardLabel}>Discard recording</Text>
            </Pressable>
          </View>
        ) : null}

        {step === "processing" ? (
          <View style={[styles.body, styles.centered]}>
            <ActivityIndicator color="#5B3FF0" size="large" />
            <Text style={styles.processingTitle}>Saving your recording</Text>
            <Text style={styles.processingBody}>{processingLabel(stage, pendingUploads)}</Text>
            <Text style={styles.processingHint}>
              You can carry on as soon as this is stored — the write-up finishes in the
              background.
            </Text>
          </View>
        ) : null}

        {step === "error" ? (
          <View style={[styles.body, styles.centered]}>
            <View style={styles.errorIcon}>
              <CircleAlert size={22} color="#DC2626" strokeWidth={2.2} />
            </View>
            <Text style={styles.processingTitle}>That did not work</Text>
            <Text style={styles.processingBody}>
              {error ?? "Something went wrong while recording."}
            </Text>
            <Pressable
              onPress={confirmDiscard}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Text style={styles.primaryLabel}>Close</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#FFFFFF" },
  header: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 6,
  },
  headerTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#0F172A",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  body: { flex: 1, paddingTop: 14, gap: 14 },
  consentScroll: { flex: 1 },
  consentBody: { paddingTop: 8, paddingBottom: 16, gap: 16 },
  centered: { alignItems: "center", justifyContent: "center", gap: 10 },
  intro: { gap: 8 },
  introIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F0FF",
  },
  introTitle: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#0F172A",
  },
  introBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
  },
  consentCard: {
    flexDirection: "row",
    gap: 11,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D7F2E7",
    backgroundColor: "#F3FBF8",
  },
  consentIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E4F7EF",
  },
  consentCopy: { flex: 1, minWidth: 0 },
  consentTitle: { fontSize: 15, fontWeight: "800", color: "#0F172A" },
  consentBody: { marginTop: 4, fontSize: 13.5, lineHeight: 19, color: "#4B5563" },
  factLine: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  facts: {
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
  },
  fact: { flex: 1, fontSize: 13, lineHeight: 18, color: "#475569" },
  primary: {
    minHeight: 50,
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
    backgroundColor: "#5B3FF0",
  },
  primaryDisabled: { opacity: 0.7 },
  primaryLabel: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  // Sized to its content rather than flex:1 so the question list gets the
  // leftover height instead of the clock being centred in an empty screen.
  liveWrap: { alignItems: "center", justifyContent: "center", gap: 8, paddingTop: 6 },
  questionsCard: {
    flex: 1,
    minHeight: 90,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EEF0F4",
    backgroundColor: "#FAFAFC",
  },
  questionsTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#94A3B8",
    marginBottom: 8,
  },
  openHint: { fontSize: 12, lineHeight: 17, color: "#64748B" },
  questionsList: { gap: 9, paddingBottom: 2 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  questionNumber: {
    minWidth: 16,
    fontSize: 11,
    fontWeight: "800",
    color: "#5B3FF0",
    lineHeight: 17,
  },
  questionText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: "#334155" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#DC2626" },
  liveDotPaused: { backgroundColor: "#94A3B8" },
  liveLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: "#B91C1C" },
  capWarning: {
    marginTop: 6,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#FEF3C7",
  },
  capWarningText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
    fontVariant: ["tabular-nums"],
  },
  clock: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.5,
    color: "#0F172A",
    fontVariant: ["tabular-nums"],
  },
  liveHint: {
    maxWidth: 260,
    fontSize: 12,
    lineHeight: 17,
    color: "#64748B",
    textAlign: "center",
  },
  meter: {
    marginTop: 8,
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  meterBar: { width: 3, borderRadius: 2, backgroundColor: "#E2E8F0" },
  meterBarActive: { backgroundColor: "#5B3FF0" },
  uploadNote: { fontSize: 11, color: "#64748B" },
  uploadWarn: {
    maxWidth: 280,
    fontSize: 11,
    lineHeight: 15,
    color: "#B45309",
    textAlign: "center",
  },
  controls: { flexDirection: "row", alignItems: "center", gap: 10 },
  secondaryControl: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    backgroundColor: "#FFFFFF",
  },
  secondaryControlLabel: { fontSize: 13.5, fontWeight: "800", color: "#0F172A" },
  stopControl: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 15,
    backgroundColor: "#0F172A",
  },
  stopLabel: { fontSize: 13.5, fontWeight: "800", color: "#FFFFFF" },
  discard: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  discardLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  processingTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#0F172A",
    textAlign: "center",
  },
  processingBody: {
    maxWidth: 280,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#64748B",
    textAlign: "center",
  },
  processingHint: { fontSize: 11, color: "#94A3B8", textAlign: "center" },
  errorIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEF2F2",
  },
});
