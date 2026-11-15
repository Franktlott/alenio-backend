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
import Svg, { Path } from "react-native-svg";
import {
  Check,
  ChevronLeft,
  CircleAlert,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react-native";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";
import { OPEN_CHECK_IN_TITLE } from "@/lib/open-check-in";

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
import {
  applyLiveTranscriptEvent,
  formatClockMs,
  type LiveTranscriptLine,
} from "@/lib/live-check-in-transcript";
import {
  LiveTranscriptionClient,
  type LiveTranscriptionStatus,
} from "@/lib/live-transcription-client";
import {
  LIVE_PCM_RECORDING_OPTIONS,
  LivePcmStreamer,
} from "@/lib/live-pcm-streamer";

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
  /** Offered on the consent step so a check-in can still be typed instead of recorded. */
  onWriteManually?: () => void;
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
      supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
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
  onWriteManually,
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
  const liveRecorder = audio.useAudioRecorder(LIVE_PCM_RECORDING_OPTIONS);
  const recorderState = audio.useAudioRecorderState(recorder, 250);
  const sessionRef = useRef<CheckInSegmentRecorder | null>(null);
  const liveClientRef = useRef<LiveTranscriptionClient | null>(null);
  const livePcmRef = useRef<LivePcmStreamer | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const transcriptScrollRef = useRef<ScrollView | null>(null);
  const stickToBottomRef = useRef(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef(0);
  const [showTranscript, setShowTranscript] = useState(true);
  const [transcriptLines, setTranscriptLines] = useState<LiveTranscriptLine[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveTranscriptionStatus>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);

  const firstName = memberName.trim().split(/\s+/)[0] || memberName;
  const level = meteringToLevel(recorderState.metering);

  const stopLiveTranscription = useCallback(async () => {
    liveClientRef.current?.stop();
    liveClientRef.current = null;
    await livePcmRef.current?.stop().catch(() => undefined);
    livePcmRef.current = null;
  }, []);

  const reset = useCallback(() => {
    void stopLiveTranscription();
    sessionRef.current = null;
    recordingIdRef.current = null;
    stickToBottomRef.current = true;
    setElapsedSec(0);
    setSegments([]);
    setPaused(false);
    setStarting(false);
    setError(null);
    setStage("uploading");
    setShowTranscript(true);
    setTranscriptLines([]);
    setLiveStatus("idle");
    setLiveError(null);
    setStep("consent");
  }, [stopLiveTranscription]);

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

      // Live STT is best-effort: retention recording already started above.
      const liveClient = new LiveTranscriptionClient(
        { teamId, memberUserId, recordingId: created.id },
        {
          onEvent: (event) => {
            setTranscriptLines((current) => applyLiveTranscriptEvent(current, event));
          },
          onStatus: (status, message) => {
            setLiveStatus(status);
            if (status === "error" && message) setLiveError(message);
            if (status === "active") setLiveError(null);
          },
        },
      );
      liveClientRef.current = liveClient;
      void liveClient.start().then(async () => {
        if (liveClient.getStatus() === "error") return;
        const streamer = new LivePcmStreamer(
          liveRecorder,
          (pcm) => liveClient.sendPcmBase64(pcm),
          (message) => {
            setLiveStatus("error");
            setLiveError(message);
          },
        );
        livePcmRef.current = streamer;
        const ok = await streamer.start();
        if (!ok) {
          setLiveStatus("error");
          setLiveError(
            "Live transcript could not share the microphone. Recording continues.",
          );
        }
      });

      setStep("recording");
    } catch (err) {
      setError(recordingErrorMessage(err));
      setStep("error");
    } finally {
      setStarting(false);
    }
  }, [starting, teamId, memberUserId, templateId, recorder, liveRecorder]);

  const stopAndProcess = useCallback(async () => {
    const session = sessionRef.current;
    const recordingId = recordingIdRef.current;
    if (!session || !recordingId) return;
    setStep("processing");
    setStage("uploading");
    const total = elapsedRef.current;
    try {
      liveClientRef.current?.commit();
      await stopLiveTranscription();
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
  }, [teamId, memberUserId, onProcessingStarted, stopLiveTranscription]);

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
      liveClientRef.current?.resume();
      livePcmRef.current?.resume();
      setPaused(false);
      return;
    }
    session.pause();
    liveClientRef.current?.pause();
    livePcmRef.current?.pause();
    setPaused(true);
  };

  const discard = useCallback(async () => {
    const session = sessionRef.current;
    const recordingId = recordingIdRef.current;
    sessionRef.current = null;
    recordingIdRef.current = null;
    await stopLiveTranscription();
    if (session) await session.abort().catch(() => undefined);
    await releaseAudioSession().catch(() => undefined);
    if (recordingId) {
      await cancelCheckInRecording(teamId, memberUserId, recordingId).catch(() => undefined);
    }
    onClose();
  }, [teamId, memberUserId, onClose, stopLiveTranscription]);

  const scrollTranscriptToEnd = useCallback((animated = true) => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => {
      transcriptScrollRef.current?.scrollToEnd({ animated });
    });
  }, []);

  useEffect(() => {
    if (!showTranscript) return;
    scrollTranscriptToEnd(true);
  }, [transcriptLines, showTranscript, scrollTranscriptToEnd]);

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
      supportedOrientations={[...MODAL_SUPPORTED_ORIENTATIONS]}
      onRequestClose={() => {
        // Closing mid-processing would cancel a write-up already handed over.
        if (step === "processing") return;
        confirmDiscard();
      }}
    >
      <View style={[styles.screen, screenFrame(insets, cluster)]}>
        <View style={styles.header}>
          {step === "consent" ? (
            <Pressable
              onPress={confirmDiscard}
              hitSlop={10}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={18} color="#172033" strokeWidth={2.3} />
            </Pressable>
          ) : null}
          <Text style={[styles.headerTitle, step === "consent" ? styles.headerTitleCentered : null]} numberOfLines={1}>
            {step === "recording" || step === "processing"
              ? `Check-in with ${firstName}`
              : step === "consent" && !templateId
                ? OPEN_CHECK_IN_TITLE
                : templateTitle}
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
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        {step === "consent" ? (
          <View style={styles.consentScreen}>
            <ScrollView
              style={styles.consentScroll}
              contentContainerStyle={styles.consentContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.intro}>
                <Text style={styles.introTitle}>Record this check-in</Text>
                <Text style={styles.introBody}>
                  {templateId
                    ? `Have a natural conversation with ${firstName}. Alenio will listen and fill in ${templateTitle} for you to review before saving.`
                    : `Have a natural conversation with ${firstName}. Alenio will listen and create a structured summary with key takeaways for you to review before saving.`}
                </Text>
              </View>

              <View style={styles.consentCard}>
                <View style={styles.consentHeader}>
                  <View style={styles.consentIcon}>
                    <ShieldCheck size={20} color="#0F9D6E" strokeWidth={2.2} />
                  </View>
                  <View style={styles.consentCopy}>
                    <Text style={styles.consentTitle}>Tell {firstName} first</Text>
                    <Text style={styles.consentBody}>
                      Let {firstName} know the conversation is being recorded and transcribed, and that they can ask you to stop at any time. Audio is kept for up to seven days or until you publish; the transcript stays with the check-in.
                    </Text>
                  </View>
                </View>
                <View style={styles.chips}>
                  {[
                    "Live transcription while you talk",
                    "Audio kept up to 7 days",
                    "Only you can see the write-up",
                    "Nothing is saved until you publish",
                  ].map((chip) => (
                    <View key={chip} style={styles.chip}>
                      <Check size={12} color="#0F9D6E" strokeWidth={2.6} />
                      <Text style={styles.chipText}>{chip}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <Pressable
              onPress={() => void begin()}
              disabled={starting}
              style={[styles.startButton, starting ? styles.primaryDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={`Start recording the check-in with ${firstName}`}
              testID="start-check-in-recording"
            >
              {starting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <View style={styles.startButtonRow}>
                  <Mic size={16} color="#FFFFFF" strokeWidth={2.4} />
                  <Text style={styles.primaryLabel}>{firstName} agreed, start recording</Text>
                </View>
              )}
            </Pressable>

            {onWriteManually ? (
              <Pressable
                onPress={onWriteManually}
                hitSlop={8}
                style={styles.manualLink}
                accessibilityRole="button"
                accessibilityLabel="Write the check-in yourself instead"
                testID="write-check-in-manually"
              >
                <Text style={styles.manualLinkLabel}>Write it up yourself instead</Text>
              </Pressable>
            ) : null}

            <View style={styles.senecaFooter}>
              <View style={styles.senecaRow}>
                <Sparkles size={18} color="#6D4AFF" strokeWidth={2.2} />
                <View style={styles.senecaRule} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.senecaTitle}>Seneca helps with both</Text>
                  <Text style={styles.senecaBody}>
                    Review and refine your check-in summary before saving.
                  </Text>
                </View>
              </View>
              <View style={styles.senecaWave} pointerEvents="none">
                <Svg width="100%" height="100%" viewBox="0 0 360 70" preserveAspectRatio="none">
                  <Path
                    d="M0 28 C80 10 150 18 210 32 C280 48 320 20 360 28 L360 70 L0 70 Z"
                    fill="#F4F0FF"
                  />
                  <Path
                    d="M0 46 C90 34 170 52 250 40 C310 32 340 42 360 40 L360 70 L0 70 Z"
                    fill="#E9E2FF"
                  />
                </Svg>
              </View>
            </View>
          </View>
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

            {showTranscript ? (
              <View style={styles.transcriptCard}>
                <View style={styles.transcriptHeader}>
                  <Text style={styles.transcriptTitle}>Live transcript</Text>
                  {liveStatus === "active" || liveStatus === "paused" ? (
                    <View style={styles.transcribingPill}>
                      <Text style={styles.transcribingPillText}>
                        {liveStatus === "paused" ? "Paused" : "Transcribing live"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                {liveError ? (
                  <Text style={styles.transcriptError}>{liveError}</Text>
                ) : null}
                <ScrollView
                  ref={transcriptScrollRef}
                  style={styles.transcriptScroll}
                  contentContainerStyle={styles.transcriptList}
                  showsVerticalScrollIndicator={false}
                  onContentSizeChange={() => scrollTranscriptToEnd(true)}
                  onLayout={() => scrollTranscriptToEnd(false)}
                  onScrollBeginDrag={() => {
                    stickToBottomRef.current = false;
                  }}
                  onScroll={(event) => {
                    const { layoutMeasurement, contentOffset, contentSize } =
                      event.nativeEvent;
                    const distance =
                      contentSize.height -
                      layoutMeasurement.height -
                      contentOffset.y;
                    if (distance < 48) stickToBottomRef.current = true;
                  }}
                  scrollEventThrottle={16}
                >
                  {transcriptLines.length === 0 ? (
                    <Text style={styles.transcriptEmpty}>
                      Recognized speech will appear here as you talk.
                    </Text>
                  ) : (
                    transcriptLines.map((line) => (
                      <View key={line.id} style={styles.transcriptRow}>
                        <Text style={styles.transcriptTime}>
                          {formatClockMs(line.startMs)}
                          {line.speakerLabel ? ` — ${line.speakerLabel}` : ""}
                        </Text>
                        <Text
                          style={[
                            styles.transcriptText,
                            line.interim ? styles.transcriptInterim : null,
                          ]}
                        >
                          {line.text}
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            ) : questions.length === 0 && !templateId ? (
              <View style={styles.questionsCard}>
                <Text style={styles.questionsTitle}>No set questions</Text>
                <Text style={styles.openHint}>
                  Talk through whatever matters. Alenio works out the questions
                  you covered once you finish.
                </Text>
              </View>
            ) : questions.length > 0 ? (
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

            <Pressable
              onPress={() => {
                setShowTranscript((value) => {
                  const next = !value;
                  if (next) stickToBottomRef.current = true;
                  return next;
                });
              }}
              style={styles.transcriptToggle}
              accessibilityRole="button"
              accessibilityLabel={
                showTranscript ? "Hide transcript" : "Show live transcript"
              }
            >
              <Text style={styles.transcriptToggleLabel}>
                {showTranscript ? "Hide Transcript" : "Show Live Transcript"}
              </Text>
            </Pressable>
            {!showTranscript &&
            (liveStatus === "active" ||
              liveStatus === "connecting" ||
              liveStatus === "paused") ? (
              <Text style={styles.transcriptBackgroundNote}>
                Transcribing in background
              </Text>
            ) : null}
            {!showTranscript && liveError ? (
              <Text style={styles.transcriptError}>{liveError}</Text>
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
                accessibilityLabel="End check-in and write it up"
                testID="stop-check-in-recording"
              >
                <Square size={16} color="#FFFFFF" strokeWidth={2.8} fill="#FFFFFF" />
                <Text style={styles.stopLabel}>End Check-In</Text>
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
  headerSide: { width: 30, height: 30 },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: -0.2,
    color: "#172033",
  },
  headerTitleCentered: { textAlign: "center" },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  body: { flex: 1, paddingTop: 14, gap: 14 },
  consentScreen: { flex: 1 },
  consentScroll: { flex: 1 },
  consentContent: { paddingTop: 10, paddingBottom: 12, gap: 14 },
  centered: { alignItems: "center", justifyContent: "center", gap: 10 },
  intro: { gap: 6 },
  introTitle: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#121826",
  },
  introBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#7B8794",
  },
  consentCard: {
    padding: 14,
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#D7F2E7",
    backgroundColor: "#FFFFFF",
  },
  consentHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  consentIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E7F8F1",
  },
  consentCopy: { flex: 1, minWidth: 0 },
  consentTitle: { fontSize: 16, lineHeight: 20, fontWeight: "800", color: "#121826" },
  consentBody: { marginTop: 3, fontSize: 13, lineHeight: 18, color: "#667085" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F3FBF8",
  },
  chipText: { fontSize: 12, fontWeight: "600", color: "#3F4658" },
  startButton: {
    minHeight: 50,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#1B2430",
  },
  startButtonRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  manualLink: { alignSelf: "center", paddingVertical: 10 },
  manualLinkLabel: { fontSize: 13, fontWeight: "700", color: "#5B3FF0" },
  senecaFooter: { marginTop: 8 },
  senecaRow: {
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  senecaRule: {
    width: 2,
    height: 38,
    borderRadius: 1,
    backgroundColor: "#DDD6FE",
  },
  senecaTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800", color: "#17142B" },
  senecaBody: { marginTop: 2, fontSize: 13, lineHeight: 18, color: "#667085" },
  senecaWave: { height: 64, marginHorizontal: -18 },
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
  transcriptCard: {
    flex: 1,
    minHeight: 120,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#EDE9FE",
    backgroundColor: "#FAFAFF",
    gap: 8,
  },
  transcriptHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  transcriptTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#172033",
  },
  transcribingPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "#EDE9FE",
  },
  transcribingPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5B3FF0",
  },
  transcriptScroll: { flex: 1 },
  transcriptList: { gap: 10, paddingBottom: 4 },
  transcriptRow: { gap: 2 },
  transcriptTime: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94A3B8",
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#172033",
  },
  transcriptInterim: {
    fontStyle: "italic",
    color: "#7C6BCF",
  },
  transcriptEmpty: {
    fontSize: 13,
    lineHeight: 18,
    color: "#94A3B8",
  },
  transcriptError: {
    fontSize: 12,
    lineHeight: 16,
    color: "#B45309",
    textAlign: "center",
  },
  transcriptToggle: {
    alignSelf: "center",
    paddingVertical: 4,
  },
  transcriptToggleLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5B3FF0",
  },
  transcriptBackgroundNote: {
    alignSelf: "center",
    marginTop: -8,
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
  },
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
