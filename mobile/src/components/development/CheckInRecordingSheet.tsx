import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import {
  AudioLines,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileText,
  Lock,
  Mic,
  Pause,
  Pencil,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  Target,
  X,
  type LucideIcon,
} from "lucide-react-native";
import {
  useStatusClusterInset,
} from "@/lib/adaptive-layout";
import { MODAL_SUPPORTED_ORIENTATIONS } from "@/lib/modal-supported-orientations";
import { OPEN_CHECK_IN_TITLE } from "@/lib/open-check-in";

const CONSENT_HERO = require("@/assets/alenio-auth-dusk-mountain.jpg");

/** Product-true reminders — not soft coaching tips from the mock. */
const BEFORE_YOU_START: { Icon: LucideIcon; label: string }[] = [
  { Icon: Mic, label: "Live transcription while you talk" },
  { Icon: Clock3, label: "Audio kept up to 7 days" },
  { Icon: Lock, label: "Nothing is saved until you publish" },
];

const BETTER_CHECK_IN_TIPS: {
  Icon: LucideIcon;
  title: string;
  body: string;
}[] = [
  {
    Icon: Mic,
    title: "Speak naturally",
    body: "Have a real conversation.",
  },
  {
    Icon: Target,
    title: "Stay focused",
    body: "Cover key updates, wins, and next steps.",
  },
  {
    Icon: ShieldCheck,
    title: "Be comfortable",
    body: "Only share what you’re okay with recording.",
  },
];

function ConsentWave({
  mirror,
  level = 0.35,
  active = true,
}: {
  mirror?: boolean;
  level?: number;
  active?: boolean;
}) {
  const bars = [10, 18, 28, 16, 24, 12, 20, 14, 22, 12];
  const order = mirror ? [...bars].reverse() : bars;
  const amp = active ? 0.45 + level * 0.9 : 0.35;
  return (
    <View style={styles.consentWaveRow}>
      {order.map((height, index) => (
        <View
          key={`${mirror ? "r" : "l"}-${index}`}
          style={[
            styles.consentWaveBar,
            {
              height: Math.max(8, Math.round(height * amp)),
              opacity: active ? 1 : 0.45,
            },
          ]}
        />
      ))}
    </View>
  );
}

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
  saveCheckInRecordingDraft,
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
  const { width: windowW, height: windowH } = useWindowDimensions();
  const cluster = useStatusClusterInset({ fullScreen: true });
  const [step, setStep] = useState<Step>("consent");
  /** Top band holds the dusk mountain so white hero copy stays readable. */
  const consentHeroHeight = Math.round(Math.min(windowH * 0.48, windowW * 1.05));
  /** Shorter band on the live recording stage — transcript is the focus. */
  const recordingHeroHeight = Math.round(
    Math.min(windowH * 0.34, Math.max(168, windowW * 0.42)),
  );
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
  const finishingRef = useRef(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const elapsedRef = useRef(0);
  const segmentsRef = useRef<SegmentUploadState[]>([]);
  const transcriptLinesRef = useRef<LiveTranscriptLine[]>([]);
  const stepRef = useRef<Step>("consent");
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
    finishingRef.current = false;
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
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    transcriptLinesRef.current = transcriptLines;
  }, [transcriptLines]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

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

  /** If the mic session drops mid-check-in, reopen the retention recorder. */
  useEffect(() => {
    if (step !== "recording" || paused || starting) return;
    if (recorderState.isRecording) return;
    const timer = setTimeout(() => {
      void sessionRef.current?.ensureRecording().then((ok) => {
        if (!ok) {
          setError(
            "The microphone stopped mid check-in. End and try recording again.",
          );
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [step, paused, starting, recorderState.isRecording]);

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

      /**
       * A second file recorder for live STT steals the mic from the retention
       * recording on iOS/Android every time it rolls a clip. Keep the long-form
       * check-in audio first; live teeing stays on web where the stream can be shared.
       */
      const canTeeLivePcm = Platform.OS === "web";
      if (canTeeLivePcm) {
        const liveClient = new LiveTranscriptionClient(
          { teamId, memberUserId, recordingId: created.id },
          {
            onEvent: (event) => {
              setTranscriptLines((current) =>
                applyLiveTranscriptEvent(current, event),
              );
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
      } else {
        setLiveStatus("idle");
        setLiveError(null);
      }

      setStep("recording");
    } catch (err) {
      setError(recordingErrorMessage(err));
      setStep("error");
    } finally {
      setStarting(false);
    }
  }, [starting, teamId, memberUserId, templateId, recorder, liveRecorder]);

  const hasCapture = useCallback(() => {
    return (
      segmentsRef.current.length > 0 ||
      transcriptLinesRef.current.length > 0 ||
      elapsedRef.current > 0
    );
  }, []);

  const stopCapture = useCallback(async () => {
    const session = sessionRef.current;
    liveClientRef.current?.commit();
    await stopLiveTranscription();
    if (session) await session.stop();
    await releaseAudioSession();
    sessionRef.current = null;
  }, [stopLiveTranscription]);

  /** Keep audio + raw transcript only — no Seneca write-up yet. */
  const stopAndSaveDraft = useCallback(async () => {
    const recordingId = recordingIdRef.current;
    if (!recordingId || finishingRef.current) return;
    finishingRef.current = true;
    setStep("processing");
    setStage("uploading");
    const total = elapsedRef.current;
    try {
      await stopCapture();
      setStage("transcribing");
      await saveCheckInRecordingDraft(teamId, memberUserId, recordingId, total);
      recordingIdRef.current = null;
      onProcessingStarted(recordingId);
    } catch (err) {
      finishingRef.current = false;
      setError(recordingErrorMessage(err));
      setStep("error");
    }
  }, [teamId, memberUserId, onProcessingStarted, stopCapture]);

  /** End Check-In: assemble transcript and run the AI write-up into a draft meeting. */
  const stopAndWriteUp = useCallback(async () => {
    const recordingId = recordingIdRef.current;
    if (!recordingId || finishingRef.current) return;
    finishingRef.current = true;
    setStep("processing");
    setStage("uploading");
    const total = elapsedRef.current;
    try {
      await stopCapture();
      setStage("transcribing");
      await finishCheckInRecording(teamId, memberUserId, recordingId, total);
      recordingIdRef.current = null;
      onProcessingStarted(recordingId);
    } catch (err) {
      finishingRef.current = false;
      setError(recordingErrorMessage(err));
      setStep("error");
    }
  }, [teamId, memberUserId, onProcessingStarted, stopCapture]);

  // Stop automatically rather than letting a forgotten recording run all day.
  useEffect(() => {
    if (step !== "recording" || paused) return;
    if (elapsedSec * 1000 < MAX_RECORDING_MS) return;
    void stopAndWriteUp();
  }, [step, paused, elapsedSec, stopAndWriteUp]);

  /**
   * Leaving the app mid-check-in saves a transcript draft instead of relying on
   * the hourly abandoned sweep (and instead of losing an unflushed open segment).
   */
  useEffect(() => {
    if (!visible) return;
    const onChange = (next: AppStateStatus) => {
      // `inactive` alone is too noisy (Control Center / permission sheets).
      if (next !== "background") return;
      if (stepRef.current !== "recording") return;
      if (!recordingIdRef.current || !hasCapture()) return;
      void stopAndSaveDraft();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [visible, hasCapture, stopAndSaveDraft]);

  /** Seconds until the cap stops the recording, or null while that is far off. */
  const maxSec = Math.floor(MAX_RECORDING_MS / 1000);
  const remainingSec = Math.max(0, maxSec - elapsedSec);
  const secondsLeft =
    step === "recording" && remainingSec <= CAP_WARNING_SEC ? remainingSec : null;

  const togglePause = () => {
    const session = sessionRef.current;
    if (!session || finishingRef.current) return;
    if (paused) {
      void session.resume().then(() => {
        liveClientRef.current?.resume();
        livePcmRef.current?.resume();
        setPaused(false);
      });
      return;
    }
    liveClientRef.current?.pause();
    livePcmRef.current?.pause();
    setPaused(true);
    void session.pause();
  };

  /** Empty sessions only — anything captured becomes a draft instead. */
  const cancelEmpty = useCallback(async () => {
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
   * Safe leave: transcript draft when anything was captured; cancel only empty rows.
   * Closing the consent screen stays one tap.
   */
  const requestSafeExit = useCallback(() => {
    if (stepRef.current === "processing" || finishingRef.current) return;
    if (!recordingIdRef.current) {
      void cancelEmpty();
      return;
    }
    if (hasCapture()) {
      Alert.alert(
        "Save draft & leave?",
        `What you covered with ${firstName} will be saved as a transcript draft. You can write it up later.`,
        [
          { text: "Keep talking", style: "cancel" },
          {
            text: "Save draft & leave",
            onPress: () => void stopAndSaveDraft(),
          },
        ],
      );
      return;
    }
    Alert.alert(
      "Leave without recording?",
      "Nothing has been captured yet, so this check-in will be cancelled.",
      [
        { text: "Stay", style: "cancel" },
        {
          text: "Cancel check-in",
          style: "destructive",
          onPress: () => void cancelEmpty(),
        },
      ],
    );
  }, [cancelEmpty, firstName, hasCapture, stopAndSaveDraft]);

  const confirmFinish = useCallback(() => {
    Alert.alert(
      "Finish this check-in?",
      templateId
        ? `Alenio will write up what was said and fill in ${templateTitle} for you to review before anything is saved.`
        : "Alenio will write up the questions covered, what was said, and a summary for you to review before anything is saved.",
      [
        { text: "Keep talking", style: "cancel" },
        { text: "Finish", onPress: () => void stopAndWriteUp() },
      ],
    );
  }, [stopAndWriteUp, templateId, templateTitle]);

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
        requestSafeExit();
      }}
    >
      {step === "consent" ? (
        <View
          style={[
            styles.consentRoot,
            {
              paddingLeft: cluster.left,
              paddingRight: cluster.right,
            },
          ]}
        >
          <View style={styles.consentBackdrop} pointerEvents="none">
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: "#F8F7FC" }]} />
            <Image
              source={CONSENT_HERO}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: windowW,
                height: consentHeroHeight,
              }}
              resizeMode="cover"
            />
            {/* Soften the photo’s hard bottom edge so it doesn’t cut a line through the card. */}
            <LinearGradient
              colors={[
                "transparent",
                "rgba(248,247,252,0.35)",
                "rgba(248,247,252,0.82)",
                "#F8F7FC",
              ]}
              locations={[0.42, 0.68, 0.88, 1]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: windowW,
                height: consentHeroHeight + 2,
              }}
            />
            <LinearGradient
              colors={[
                "rgba(13,7,38,0.52)",
                "rgba(26,11,69,0.22)",
                "transparent",
              ]}
              locations={[0, 0.45, 1]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: windowW,
                height: Math.round(consentHeroHeight * 0.72),
              }}
            />
          </View>

          <View
            style={[
              styles.consentFrame,
              {
                paddingTop: insets.top + 8,
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.consentHeaderBar}>
              <Pressable
                onPress={requestSafeExit}
                hitSlop={10}
                style={styles.consentNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <ChevronLeft size={18} color="#FFFFFF" strokeWidth={2.3} />
              </Pressable>
              <Text style={styles.consentNavTitle} numberOfLines={1}>
                Check-In
              </Text>
              <Pressable
                onPress={requestSafeExit}
                hitSlop={10}
                style={styles.consentNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <X size={17} color="#FFFFFF" strokeWidth={2.4} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.consentScroll}
              contentContainerStyle={styles.consentContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.consentHero}>
                <View style={styles.consentHeroIcon}>
                  <AudioLines size={18} color="#FFFFFF" strokeWidth={2.3} />
                </View>
                <Text style={styles.consentHeroTitle}>
                  Let’s Record Your Check-In
                </Text>
                <Text style={styles.consentHeroBody}>
                  {templateId
                    ? `Have a natural conversation with ${firstName}. Alenio will listen and fill in ${templateTitle} for you to review before saving.`
                    : `Have a natural conversation with ${firstName}. Alenio will listen, create a summary, and highlight the key takeaways for you to review before saving.`}
                </Text>
              </View>

              <View style={styles.consentCard}>
                <View style={styles.consentCardHeader}>
                  <View style={styles.consentShield}>
                    <ShieldCheck size={15} color="#5B3FF0" strokeWidth={2.2} />
                  </View>
                  <View style={styles.consentCardCopy}>
                    <Text style={styles.consentCardTitle}>Before You Start</Text>
                    <Text style={styles.consentCardBody}>
                      Tell {firstName} you’re recording first. A few Alenio reminders for a great check-in.
                    </Text>
                  </View>
                </View>
                <View style={styles.consentTips}>
                  {BEFORE_YOU_START.map(({ Icon, label }) => (
                    <View key={label} style={styles.consentTip}>
                      <View style={styles.consentTipIcon}>
                        <Icon size={12} color="#5B3FF0" strokeWidth={2.3} />
                      </View>
                      <Text style={styles.consentTipText}>{label}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <View style={styles.consentActions}>
              <View style={styles.consentMicBlock}>
                <ConsentWave />
                <Pressable
                  onPress={() => void begin()}
                  disabled={starting}
                  style={[
                    styles.consentMicButton,
                    starting ? styles.primaryDisabled : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Start recording the check-in with ${firstName}`}
                >
                  {starting ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Mic size={26} color="#FFFFFF" strokeWidth={2.2} />
                  )}
                </Pressable>
                <ConsentWave mirror />
              </View>

              <Pressable
                onPress={() => void begin()}
                disabled={starting}
                style={[
                  styles.consentStartButton,
                  starting ? styles.primaryDisabled : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Start recording the check-in with ${firstName}`}
                testID="start-check-in-recording"
              >
                {starting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.consentStartLabel}>Start Recording</Text>
                )}
              </Pressable>
            </View>

            {onWriteManually ? (
              <Pressable
                onPress={onWriteManually}
                hitSlop={8}
                style={styles.manualLink}
                accessibilityRole="button"
                accessibilityLabel="Write the check-in yourself instead"
                testID="write-check-in-manually"
              >
                <Pencil size={14} color="#5B3FF0" strokeWidth={2.3} />
                <Text style={styles.manualLinkLabel}>Write It Up Yourself Instead</Text>
              </Pressable>
            ) : null}

            <View style={styles.senecaFooterCard}>
              <Sparkles size={18} color="#5B3FF0" strokeWidth={2.2} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.senecaTitle}>Powered by Seneca</Text>
                <Text style={styles.senecaBody}>
                  Review and refine your check-in summary before saving.
                </Text>
              </View>
              <ChevronRight size={16} color="#A78BFA" strokeWidth={2.2} />
            </View>
          </View>
        </View>
      ) : step === "recording" ? (
        <View
          style={[
            styles.recordingRoot,
            {
              paddingLeft: cluster.left,
              paddingRight: cluster.right,
              paddingBottom: Math.max(insets.bottom, 10),
            },
          ]}
        >
          <View style={styles.recordingBackdrop} pointerEvents="none">
            <View
              style={[StyleSheet.absoluteFillObject, { backgroundColor: "#F4F1FC" }]}
            />
            <Image
              source={CONSENT_HERO}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: windowW,
                height: recordingHeroHeight,
              }}
              resizeMode="cover"
            />
            <LinearGradient
              colors={[
                "transparent",
                "rgba(244,241,252,0.35)",
                "rgba(244,241,252,0.88)",
                "#F4F1FC",
              ]}
              locations={[0.35, 0.62, 0.86, 1]}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: windowW,
                height: recordingHeroHeight + 2,
              }}
            />
          </View>

          <View
            style={[
              styles.recordingFrame,
              { paddingTop: Math.max(insets.top, 10) },
            ]}
          >
            <View style={styles.recordingHeaderBar}>
              <Pressable
                onPress={requestSafeExit}
                hitSlop={10}
                style={styles.recordingNavBtn}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <ChevronLeft size={18} color="#FFFFFF" strokeWidth={2.3} />
              </Pressable>
              <Text style={styles.recordingNavTitle} numberOfLines={1}>
                Check-In with {firstName}
              </Text>
              <View style={styles.headerSide} />
            </View>

            <View style={styles.liveHero}>
              <View style={styles.liveBadge}>
                <View
                  style={[styles.liveDot, paused ? styles.liveDotPaused : null]}
                />
                <Text
                  style={[
                    styles.liveLabel,
                    paused ? styles.liveLabelPaused : null,
                  ]}
                >
                  {paused ? "Paused" : "Recording"}
                </Text>
              </View>
              <Text style={styles.clock}>
                {formatRecordingClock(elapsedSec)}
              </Text>
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
                    : "Keep the phone nearby."}
              </Text>

              <View style={styles.liveMicStage}>
                <View style={styles.liveMicBlock}>
                  <ConsentWave level={level} active={!paused} />
                  <View
                    style={[
                      styles.liveMicButton,
                      paused ? styles.liveMicButtonPaused : null,
                    ]}
                  >
                    <Mic size={20} color="#FFFFFF" strokeWidth={2.2} />
                  </View>
                  <ConsentWave mirror level={level} active={!paused} />
                </View>
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

            <View style={styles.tipsStrip}>
              {BETTER_CHECK_IN_TIPS.map(({ Icon, title }) => (
                <View key={title} style={styles.tipsStripChip}>
                  <Icon size={12} color="#5B3FF0" strokeWidth={2.2} />
                  <Text style={styles.tipsStripText}>{title}</Text>
                </View>
              ))}
            </View>

            <View style={styles.sessionCard}>
              <View style={styles.sessionPrimary}>
                {showTranscript ? (
                  <>
                    <View style={styles.transcriptHeader}>
                      <View style={styles.transcriptTitleBlock}>
                        <View style={styles.transcriptTitleRow}>
                          <View style={styles.transcriptDocIcon}>
                            <FileText
                              size={14}
                              color="#5B3FF0"
                              strokeWidth={2.2}
                            />
                          </View>
                          <Text style={styles.transcriptTitle}>
                            Live Transcript
                          </Text>
                        </View>
                      </View>
                      <View style={styles.transcriptHeaderActions}>
                        {liveStatus === "active" || liveStatus === "paused" ? (
                          <View style={styles.transcribingPill}>
                            <View
                              style={[
                                styles.transcribingDot,
                                liveStatus === "paused"
                                  ? styles.transcribingDotPaused
                                  : null,
                              ]}
                            />
                            <Text style={styles.transcribingPillText}>
                              {liveStatus === "paused"
                                ? "Paused"
                                : "Transcribing"}
                            </Text>
                          </View>
                        ) : null}
                        <Pressable
                          onPress={() => setShowTranscript(false)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel="Hide transcript"
                        >
                          <Text style={styles.transcriptToggleLabel}>Hide</Text>
                        </Pressable>
                      </View>
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
                        const {
                          layoutMeasurement,
                          contentOffset,
                          contentSize,
                        } = event.nativeEvent;
                        const distance =
                          contentSize.height -
                          layoutMeasurement.height -
                          contentOffset.y;
                        if (distance < 48) stickToBottomRef.current = true;
                      }}
                      scrollEventThrottle={16}
                    >
                      {transcriptLines.length === 0 ? (
                        <View style={styles.transcriptEmptyCard}>
                          <Sparkles
                            size={18}
                            color="#5B3FF0"
                            strokeWidth={2.2}
                          />
                          <Text style={styles.transcriptEmptyTitle}>
                            Listening…
                          </Text>
                          <Text style={styles.transcriptEmpty}>
                            {Platform.OS === "web"
                              ? "Recognized speech will appear here as you talk."
                              : "Lines show up as you talk. Seneca drafts the write-up when you end."}
                          </Text>
                        </View>
                      ) : (
                        transcriptLines.map((line) => (
                          <View key={line.id} style={styles.transcriptRow}>
                            <Text style={styles.transcriptTime}>
                              {line.speakerLabel
                                ? `${line.speakerLabel}`
                                : formatClockMs(line.startMs)}
                            </Text>
                            <Text
                              style={[
                                styles.transcriptText,
                                line.interim
                                  ? styles.transcriptInterim
                                  : null,
                              ]}
                            >
                              {line.text}
                            </Text>
                          </View>
                        ))
                      )}
                    </ScrollView>
                  </>
                ) : questions.length === 0 && !templateId ? (
                  <View style={styles.questionsInner}>
                    <Text style={styles.questionsTitle}>No set questions</Text>
                    <Text style={styles.openHint}>
                      Talk through whatever matters. Alenio works out the
                      questions you covered once you finish.
                    </Text>
                    <Pressable
                      onPress={() => {
                        stickToBottomRef.current = true;
                        setShowTranscript(true);
                      }}
                      style={styles.transcriptToggle}
                    >
                      <Text style={styles.transcriptToggleLabel}>
                        Show Live Transcript
                      </Text>
                    </Pressable>
                  </View>
                ) : questions.length > 0 ? (
                  <View style={styles.questionsInner}>
                    <Text style={styles.questionsTitle}>What to cover</Text>
                    <ScrollView
                      contentContainerStyle={styles.questionsList}
                      showsVerticalScrollIndicator={false}
                    >
                      {questions.map((question, index) => (
                        <View
                          key={`${index}-${question}`}
                          style={styles.questionRow}
                        >
                          <Text style={styles.questionNumber}>{index + 1}</Text>
                          <Text style={styles.questionText}>{question}</Text>
                        </View>
                      ))}
                    </ScrollView>
                    <Pressable
                      onPress={() => {
                        stickToBottomRef.current = true;
                        setShowTranscript(true);
                      }}
                      style={styles.transcriptToggle}
                    >
                      <Text style={styles.transcriptToggleLabel}>
                        Show Live Transcript
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.questionsInner}>
                    <Text style={styles.transcriptEmpty}>
                      Transcript hidden — still capturing in the background.
                    </Text>
                    <Pressable
                      onPress={() => {
                        stickToBottomRef.current = true;
                        setShowTranscript(true);
                      }}
                      style={styles.transcriptToggle}
                    >
                      <Text style={styles.transcriptToggleLabel}>
                        Show Live Transcript
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.recordingDock}>
              <Pressable
                onPress={togglePause}
                style={styles.secondaryControl}
                accessibilityRole="button"
                accessibilityLabel={
                  paused ? "Resume recording" : "Pause recording"
                }
              >
                {paused ? (
                  <Play size={17} color="#5B3FF0" strokeWidth={2.4} />
                ) : (
                  <Pause size={17} color="#5B3FF0" strokeWidth={2.4} />
                )}
                <Text style={styles.secondaryControlLabel}>
                  {paused ? "Resume" : "Pause"}
                </Text>
              </Pressable>

              <Pressable
                onPress={confirmFinish}
                style={styles.stopControl}
                accessibilityRole="button"
                accessibilityLabel="End check-in and write it up"
                testID="stop-check-in-recording"
              >
                <Square
                  size={15}
                  color="#FFFFFF"
                  strokeWidth={2.8}
                  fill="#FFFFFF"
                />
                <Text style={styles.stopLabel}>End Check-In</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={requestSafeExit}
              style={styles.discard}
              accessibilityRole="button"
              accessibilityLabel={
                hasCapture()
                  ? "Save draft and leave"
                  : "Cancel this check-in"
              }
            >
              <Text style={styles.discardLabel}>
                {hasCapture() ? "Save draft & leave" : "Cancel check-in"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={[styles.screen, screenFrame(insets, cluster)]}>
          <View style={styles.header}>
            <Pressable
              onPress={requestSafeExit}
              hitSlop={10}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={18} color="#5B3FF0" strokeWidth={2.3} />
            </Pressable>
            <Text
              style={[styles.headerTitle, styles.headerTitleCentered]}
              numberOfLines={1}
            >
              {!templateId ? OPEN_CHECK_IN_TITLE : templateTitle}
            </Text>
            <View style={styles.headerSide} />
          </View>

          {step === "processing" ? (
            <View style={[styles.body, styles.centered]}>
              <ActivityIndicator color="#5B3FF0" size="large" />
              <Text style={styles.processingTitle}>Saving your recording</Text>
              <Text style={styles.processingBody}>
                {processingLabel(stage, pendingUploads)}
              </Text>
              <Text style={styles.processingHint}>
                Saved as a transcript draft — write it up anytime from Check-ins.
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
                onPress={requestSafeExit}
                style={styles.primary}
                accessibilityRole="button"
                accessibilityLabel="Close"
              >
                <Text style={styles.primaryLabel}>Close</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#F8F7FC" },
  header: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  headerSide: { width: 34, height: 34 },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.25,
    color: "#17142B",
  },
  headerTitleCentered: { textAlign: "center" },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEE9FF",
  },
  body: { flex: 1, paddingTop: 10, gap: 12 },
  recordingRoot: {
    flex: 1,
    backgroundColor: "#F4F1FC",
    overflow: "hidden",
  },
  recordingBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  recordingFrame: {
    flex: 1,
    paddingHorizontal: 16,
    gap: 10,
  },
  recordingHeaderBar: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recordingNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  recordingNavTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  liveHero: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 2,
    paddingBottom: 2,
  },
  liveMicStage: {
    marginTop: 4,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 320,
    paddingVertical: 2,
  },
  liveMicBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  liveMicButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5B3FF0",
    shadowColor: "#5B3FF0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 7,
  },
  liveMicButtonPaused: {
    backgroundColor: "#94A3B8",
    shadowOpacity: 0.12,
  },
  sessionCard: {
    flex: 1,
    minHeight: 160,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.96)",
    overflow: "hidden",
    shadowColor: "#2A1A6E",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 22,
    elevation: 6,
  },
  sessionPrimary: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: 14,
    gap: 8,
  },
  sessionTips: {
    width: 248,
    minHeight: 0,
    alignSelf: "stretch",
    backgroundColor: "#F7F4FF",
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(91, 63, 240, 0.1)",
  },
  sessionTipsContent: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    gap: 10,
  },
  tipsSidebarIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEE9FF",
  },
  tipsSidebarTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#17142B",
    letterSpacing: -0.25,
  },
  tipsSidebarBody: {
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
    marginBottom: 2,
  },
  tipsSidebarList: { gap: 12, marginTop: 2 },
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  tipCopy: { flex: 1, minWidth: 0, gap: 2 },
  tipTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#17142B",
  },
  tipBody: {
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  tipsStrip: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  tipsStripChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.88)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(91,63,240,0.12)",
  },
  tipsStripText: {
    fontSize: 11.5,
    fontWeight: "700",
    color: "#5B3FF0",
  },
  questionsInner: {
    flex: 1,
    gap: 10,
  },
  recordingDock: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 420,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 8,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(16,24,40,0.08)",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  transcriptHeaderActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  consentRoot: { flex: 1, backgroundColor: "#F8F7FC", overflow: "hidden" },
  consentBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  consentFrame: { flex: 1, paddingHorizontal: 18 },
  consentHeaderBar: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  consentNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  consentNavTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
    color: "#FFFFFF",
  },
  consentScroll: { flex: 1 },
  consentContent: {
    paddingTop: 6,
    paddingBottom: 16,
    gap: 16,
    alignItems: "center",
  },
  consentHero: { alignItems: "center", gap: 10, paddingHorizontal: 8, width: "100%" },
  consentHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  consentHeroTitle: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#FFFFFF",
    textAlign: "center",
  },
  consentHeroBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
    maxWidth: 340,
  },
  consentCard: {
    width: "100%",
    maxWidth: 400,
    padding: 12,
    gap: 8,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    shadowColor: "#2A1A6E",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 5,
  },
  consentCardHeader: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  consentShield: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEE9FF",
  },
  consentCardCopy: { flex: 1, minWidth: 0 },
  consentCardTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#121826",
  },
  consentCardBody: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
  },
  consentTips: { gap: 4 },
  consentTip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 7,
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: "#F4F0FF",
  },
  consentTipIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
  },
  consentTipText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    color: "#3F4658",
  },
  consentActions: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: 10,
    paddingTop: 4,
  },
  consentMicBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  consentWaveRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  consentWaveBar: {
    width: 4,
    borderRadius: 999,
    backgroundColor: "#A78BFA",
  },
  consentMicButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#5B3FF0",
    shadowColor: "#5B3FF0",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 8,
  },
  consentStartButton: {
    minHeight: 50,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#5B3FF0",
  },
  consentStartLabel: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: -0.2,
  },
  manualLink: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
  },
  manualLinkLabel: { fontSize: 13, fontWeight: "700", color: "#5B3FF0" },
  senecaFooterCard: {
    marginTop: 2,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: "#EEE9FF",
  },
  senecaTitle: { fontSize: 14, lineHeight: 18, fontWeight: "800", color: "#17142B" },
  senecaBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: "#667085" },
  centered: { alignItems: "center", justifyContent: "center", gap: 10 },
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
  transcriptHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  transcriptTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  transcriptTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  transcriptDocIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEE9FF",
  },
  transcriptTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#17142B",
  },
  transcriptSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: "#667085",
    paddingLeft: 36,
  },
  transcribingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#EEE9FF",
  },
  transcribingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#5B3FF0",
  },
  transcribingDotPaused: {
    backgroundColor: "#94A3B8",
  },
  transcribingPillText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#5B3FF0",
  },
  transcriptScroll: { flex: 1 },
  transcriptList: { gap: 12, paddingBottom: 4 },
  transcriptRow: { gap: 3 },
  transcriptTime: {
    fontSize: 12,
    fontWeight: "800",
    color: "#5B3FF0",
  },
  transcriptText: {
    fontSize: 14,
    lineHeight: 20,
    color: "#17142B",
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
  questionsTitle: {
    fontSize: 10.5,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#94A3B8",
    marginBottom: 8,
  },
  openHint: { fontSize: 12, lineHeight: 17, color: "#667085" },
  questionsList: { gap: 9, paddingBottom: 2 },
  questionRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  questionNumber: {
    minWidth: 16,
    fontSize: 11,
    fontWeight: "800",
    color: "#5B3FF0",
    lineHeight: 17,
  },
  questionText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: "#3F4658" },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    minHeight: 28,
    borderRadius: 14,
    backgroundColor: "rgba(254,226,226,0.92)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#DC2626" },
  liveDotPaused: { backgroundColor: "#94A3B8" },
  liveLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: "#B91C1C" },
  liveLabelPaused: { color: "#64748B" },
  capWarning: {
    marginTop: 4,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(254,243,199,0.95)",
  },
  capWarningText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#92400E",
    fontVariant: ["tabular-nums"],
  },
  clock: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
    color: "#FFFFFF",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(15,10,40,0.35)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  liveHint: {
    maxWidth: 300,
    fontSize: 12.5,
    lineHeight: 17,
    color: "rgba(255,255,255,0.9)",
    textAlign: "center",
  },
  uploadNote: { fontSize: 11, color: "rgba(255,255,255,0.85)" },
  uploadWarn: {
    maxWidth: 280,
    fontSize: 11,
    lineHeight: 15,
    color: "#FDE68A",
    textAlign: "center",
  },
  secondaryControl: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 999,
    backgroundColor: "#EEE9FF",
  },
  secondaryControlLabel: { fontSize: 14, fontWeight: "800", color: "#5B3FF0" },
  stopControl: {
    flex: 1.15,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 999,
    backgroundColor: "#5B3FF0",
  },
  stopLabel: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  discard: {
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  discardLabel: { fontSize: 12, fontWeight: "700", color: "#94A3B8" },
  transcriptEmptyCard: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 20,
    borderRadius: 16,
    backgroundColor: "#F7F4FF",
  },
  transcriptEmptyTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#17142B",
  },
  processingTitle: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: "#17142B",
    textAlign: "center",
  },
  processingBody: {
    maxWidth: 280,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#667085",
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
