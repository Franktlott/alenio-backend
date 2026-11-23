import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  FileAudio,
  Loader2,
  Mic,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  cancelCheckInRecording,
  createCheckIn,
  fetchCheckInRecording,
  fetchCheckIns,
  finishCheckInRecording,
  isLeaderFillableField,
  resumeCheckInRecording,
  saveCheckInRecordingDraft,
  startCheckInRecording,
  updateCheckIn,
  type ActiveCheckInRecording,
  type CheckIn,
  type CheckInField,
} from "../../lib/member-development-api";
import { findLeaderCommentsField } from "../../lib/check-in-leader-comments";
import { CheckInTranscriptDrawer } from "./CheckInTranscriptDrawer";
import { browserCanRecord, formatClock, MAX_RECORDING_SEC, WebCheckInRecorder } from "../../lib/web-check-in-recorder";
import {
  formatTranscriptClock,
  WebLiveTranscription,
  type LiveTranscriptLine,
  type LiveTranscriptionStatus,
} from "../../lib/web-live-transcription";
import "../../routes/discover/discover-categories-drawer.css";

export const checkInKeys = {
  checkIns: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "check-ins"] as const,
  active: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "recordings"] as const,
};

const OPEN_CHECK_IN_TITLE = "Check-in";
const OPEN_TITLE_MAX = 60;

/** Every new check-in is the same write-up: one recap plus optional leader notes. */
const RECAP_FIELD: CheckInField = { id: "open-recap", label: "What we talked about", type: "long_text", order: 0, required: false };
const NOTES_FIELD: CheckInField = {
  id: "open-leader-notes",
  label: "Leader notes",
  type: "manager_notes",
  order: 1,
  required: false,
  helpText: "Optional. What was agreed, coaching notes, and next steps.",
};
const NEW_CHECK_IN_FIELDS: CheckInField[] = [RECAP_FIELD, NOTES_FIELD];
const CAP_WARNING_SEC = 5 * 60;
const LEVEL_BARS = 24;

type View =
  | "capture"
  | "fill"
  | "consent"
  | "recording"
  | "processing"
  | "error";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function fillableFields(fields: CheckInField[]): CheckInField[] {
  return [...fields].sort((a, b) => a.order - b.order).filter((f) => f.type === "section" || isLeaderFillableField(f));
}

/**
 * Start a check-in the way the mobile app does: record with Seneca or type the
 * fixed write-up (title, what we talked about, leader notes). Recording hands
 * the audio to Seneca, which writes up a draft to review before publishing.
 */
export function StartCheckInFlow({
  open,
  teamId,
  userId,
  memberName,
  resume,
  resumeCapture = null,
  onClose,
}: {
  open: boolean;
  teamId: string;
  userId: string;
  memberName: string;
  /** A draft meeting to pick back up, skipping straight to the form. */
  resume?: CheckIn | null;
  /** A transcript draft recording to continue capturing. */
  resumeCapture?: ActiveCheckInRecording | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const firstName = memberName.trim().split(/\s+/)[0] || memberName;
  const canRecord = useMemo(() => browserCanRecord(), []);

  const [view, setView] = useState<View>("capture");
  const [editing, setEditing] = useState<CheckIn | null>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [openTitle, setOpenTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  /* recording */
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploads, setUploads] = useState({ pending: 0, failed: 0 });
  const [stage, setStage] = useState<"saving" | "writing">("saving");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const recorderRef = useRef<WebCheckInRecorder | null>(null);
  const liveRef = useRef<WebLiveTranscription | null>(null);
  const elapsedRef = useRef(0);
  const finishingRef = useRef(false);
  const viewRef = useRef<View>("capture");
  const recordingIdRef = useRef<string | null>(null);
  const transcriptLinesRef = useRef<LiveTranscriptLine[]>([]);
  const [showTranscript, setShowTranscript] = useState(true);
  const [transcriptLines, setTranscriptLines] = useState<LiveTranscriptLine[]>([]);
  const [liveStatus, setLiveStatus] = useState<LiveTranscriptionStatus>("idle");
  const [liveError, setLiveError] = useState<string | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const stickTranscriptToBottomRef = useRef(true);

  const loadDraft = useCallback((meeting: CheckIn) => {
    setEditing(meeting);
    setResponses({ ...(meeting.responses ?? {}) });
    setOpenTitle(meeting.templateId ? "" : meeting.templateTitle);
    setError(null);
    setView("fill");
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTranscriptOpen(false);
    setRecordingId(null);
    recordingIdRef.current = null;
    finishingRef.current = false;
    setElapsed(0);
    elapsedRef.current = 0;
    setPaused(false);
    setUploads({ pending: 0, failed: 0 });
    setShowTranscript(true);
    stickTranscriptToBottomRef.current = true;
    setTranscriptLines([]);
    setLiveStatus("idle");
    setLiveError(null);
    liveRef.current?.stop();
    liveRef.current = null;
    if (resume) {
      loadDraft(resume);
    } else if (resumeCapture) {
      setEditing(null);
      setResponses({});
      setOpenTitle("");
      setView("recording");
    } else {
      setEditing(null);
      setResponses({});
      setOpenTitle("");
      setView(canRecord ? "capture" : "fill");
    }
  }, [open, resume, resumeCapture, canRecord, loadDraft]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    recordingIdRef.current = recordingId;
  }, [recordingId]);

  useEffect(() => {
    transcriptLinesRef.current = transcriptLines;
  }, [transcriptLines]);

  /* Clean up a live microphone if the drawer unmounts mid-recording. */
  useEffect(
    () => () => {
      liveRef.current?.stop();
      recorderRef.current?.discard();
    },
    [],
  );

  useEffect(() => {
    if (!showTranscript || !stickTranscriptToBottomRef.current) return;
    const node = transcriptScrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [transcriptLines, showTranscript]);

  /* Clock, level meter and the 90 minute cap while recording. */
  useEffect(() => {
    if (view !== "recording" || paused) return;
    const tick = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    const meter = setInterval(() => setLevel(recorderRef.current?.level() ?? 0), 120);
    return () => {
      clearInterval(tick);
      clearInterval(meter);
    };
  }, [view, paused]);

  /* Waits for Seneca's write-up, then opens the draft for review. */
  useEffect(() => {
    if (view !== "processing" || stage !== "writing" || !recordingId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const current = await fetchCheckInRecording(teamId, userId, recordingId);
        if (cancelled) return;
        if (current.status === "ready" && current.meetingId) {
          const meetings = await fetchCheckIns(teamId, userId);
          qc.setQueryData(checkInKeys.checkIns(teamId, userId), meetings);
          void qc.invalidateQueries({ queryKey: checkInKeys.active(teamId, userId) });
          const meeting = meetings.find((m) => m.id === current.meetingId);
          if (cancelled) return;
          if (meeting) loadDraft(meeting);
          else {
            setError("The write-up is ready, but we couldn't open it. Find it in the check-ins list.");
            setView("error");
          }
          return;
        }
        if (current.status === "failed") {
          void qc.invalidateQueries({ queryKey: checkInKeys.active(teamId, userId) });
          setError(current.error ?? "We couldn't turn that recording into a check-in.");
          setView("error");
          return;
        }
      } catch {
        /* a dropped poll is not fatal; try again */
      }
      if (!cancelled) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [view, stage, recordingId, teamId, userId, qc, loadDraft]);

  const beginRecording = async (options?: {
    recordingId: string;
    startIndex?: number;
    priorDurationSec?: number;
    priorTranscript?: string | null;
  }) => {
    if (starting) return;
    setStarting(true);
    setError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await WebCheckInRecorder.requestMicrophone();
      const recording =
        options ??
        (await startCheckInRecording(teamId, userId, null).then((created) => ({
          recordingId: created.id,
          startIndex: 0,
          priorDurationSec: 0,
          priorTranscript: null as string | null,
        })));
      setRecordingId(recording.recordingId);
      recordingIdRef.current = recording.recordingId;
      const recorder = new WebCheckInRecorder(
        { teamId, memberUserId: userId, recordingId: recording.recordingId },
        (pending, failed) => setUploads({ pending, failed }),
      );
      recorderRef.current = recorder;
      recorder.start(stream, { startIndex: recording.startIndex ?? 0 });
      const live = new WebLiveTranscription(
        { teamId, memberUserId: userId, recordingId: recording.recordingId },
        {
          onLines: setTranscriptLines,
          onStatus: (status, message) => {
            setLiveStatus(status);
            if (status === "error" && message) setLiveError(message);
            if (status === "active") setLiveError(null);
          },
        },
      );
      liveRef.current = live;
      void live.start(stream);
      const prior = recording.priorDurationSec ?? 0;
      elapsedRef.current = prior;
      setElapsed(prior);
      setPaused(false);
      setShowTranscript(true);
      stickTranscriptToBottomRef.current = true;
      setTranscriptLines(
        recording.priorTranscript?.trim()
          ? [
              {
                id: "prior-draft",
                text: recording.priorTranscript.trim(),
                interim: false,
                startMs: 0,
                endMs: null,
                speakerLabel: null,
              },
            ]
          : [],
      );
      setView("recording");
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(errorMessage(err, "We couldn't start recording."));
      setView("error");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!open || !resumeCapture || starting || recordingIdRef.current) return;
    void (async () => {
      try {
        const resumed = await resumeCheckInRecording(teamId, userId, resumeCapture.id);
        await beginRecording({
          recordingId: resumed.id,
          startIndex: resumed.nextSegmentIndex ?? 0,
          priorDurationSec: resumeCapture.durationSec,
          priorTranscript: resumeCapture.transcript,
        });
      } catch (err) {
        setError(errorMessage(err, "We couldn't resume that draft."));
        setView("error");
      }
    })();
    // Only kick off once when the sheet opens on a capture draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resumeCapture?.id]);

  const hasCapture = useCallback(() => {
    return (
      uploads.pending > 0 ||
      uploads.failed > 0 ||
      transcriptLinesRef.current.length > 0 ||
      elapsedRef.current > 0
    );
  }, [uploads.failed, uploads.pending]);

  const stopCapture = useCallback(async () => {
    liveRef.current?.commit();
    liveRef.current?.stop();
    liveRef.current = null;
    const recorder = recorderRef.current;
    if (recorder) {
      await recorder.stop();
      recorderRef.current = null;
    }
  }, []);

  /** Transcript draft only — no Seneca write-up. */
  const saveDraftRecording = useCallback(async () => {
    const id = recordingIdRef.current ?? recordingId;
    if (!id || finishingRef.current) return;
    finishingRef.current = true;
    setView("processing");
    setStage("saving");
    try {
      await stopCapture();
      await saveCheckInRecordingDraft(teamId, userId, id, elapsedRef.current);
      setRecordingId(null);
      recordingIdRef.current = null;
      void qc.invalidateQueries({ queryKey: checkInKeys.active(teamId, userId) });
      setStage("writing");
    } catch (err) {
      finishingRef.current = false;
      setError(errorMessage(err, "We couldn't save that recording."));
      setView("error");
    }
  }, [recordingId, teamId, userId, qc, stopCapture]);

  /** End Check-In — write up into a draft meeting. */
  const finishRecording = useCallback(async () => {
    const id = recordingIdRef.current ?? recordingId;
    if (!id || finishingRef.current) return;
    finishingRef.current = true;
    setView("processing");
    setStage("saving");
    try {
      await stopCapture();
      await finishCheckInRecording(teamId, userId, id, elapsedRef.current);
      setRecordingId(null);
      recordingIdRef.current = null;
      void qc.invalidateQueries({ queryKey: checkInKeys.active(teamId, userId) });
      void qc.invalidateQueries({ queryKey: checkInKeys.checkIns(teamId, userId) });
      setStage("writing");
    } catch (err) {
      finishingRef.current = false;
      setError(errorMessage(err, "We couldn't save that recording."));
      setView("error");
    }
  }, [recordingId, teamId, userId, qc, stopCapture]);

  useEffect(() => {
    if (view === "recording" && !paused && elapsed >= MAX_RECORDING_SEC) void finishRecording();
  }, [view, paused, elapsed, finishRecording]);

  /** Empty sessions only — anything captured becomes a draft instead. */
  const cancelEmptyRecording = useCallback(() => {
    liveRef.current?.stop();
    liveRef.current = null;
    recorderRef.current?.discard();
    recorderRef.current = null;
    const id = recordingIdRef.current ?? recordingId;
    if (id) void cancelCheckInRecording(teamId, userId, id).catch(() => undefined);
    setRecordingId(null);
    recordingIdRef.current = null;
  }, [recordingId, teamId, userId]);

  const requestClose = useCallback(() => {
    if (view === "processing" || finishingRef.current) return;
    if (view === "recording") {
      if (hasCapture()) {
        if (
          !window.confirm(
            `Save draft & leave? What you covered with ${firstName} will be saved as a transcript draft. You can write it up later.`,
          )
        ) {
          return;
        }
        void saveDraftRecording();
        return;
      }
      if (!window.confirm("Leave without recording? Nothing has been captured yet.")) return;
      cancelEmptyRecording();
    }
    onClose();
  }, [view, onClose, hasCapture, firstName, saveDraftRecording, cancelEmptyRecording]);

  /* Tab hide / minimize saves a transcript draft instead of abandoning the row. */
  useEffect(() => {
    if (!open) return;
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      if (viewRef.current !== "recording") return;
      if (!recordingIdRef.current || finishingRef.current) return;
      if (
        elapsedRef.current <= 0 &&
        transcriptLinesRef.current.length === 0
      ) {
        return;
      }
      void saveDraftRecording();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [open, saveDraftRecording]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !transcriptOpen) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose, transcriptOpen]);

  const fields = useMemo(
    () => (editing ? fillableFields(editing.templateFields ?? []) : NEW_CHECK_IN_FIELDS),
    [editing],
  );

  const save = useMutation({
    mutationFn: async (status: "draft" | "published") => {
      if (status === "published") {
        for (const f of fields) {
          if (!f.required || f.type === "section") continue;
          const v = responses[f.id];
          if (v === undefined || String(v).trim() === "") throw new Error(`${f.label} is required.`);
        }
      }
      const clean: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(responses)) {
        if (typeof v === "string" && v.trim() === "") continue;
        clean[k] = typeof v === "string" ? v.trim() : v;
      }
      if (editing) {
        const isOpen = !editing.templateId;
        return updateCheckIn(teamId, userId, editing.id, {
          responses: clean,
          status,
          ...(isOpen ? { templateTitle: openTitle.trim().slice(0, OPEN_TITLE_MAX) || OPEN_CHECK_IN_TITLE } : {}),
        });
      }
      const recap = clean[RECAP_FIELD.id];
      const notes = clean[NOTES_FIELD.id];
      if (status === "published" && !recap && !notes) throw new Error("Add what you talked about first.");
      const base: Record<string, string | number> = recap !== undefined ? { [RECAP_FIELD.id]: recap } : {};
      // Leader notes live in a field the server names, so save them in a second step.
      const created = await createCheckIn(teamId, userId, {
        responses: base,
        status: notes !== undefined ? "draft" : status,
        templateTitle: openTitle.trim().slice(0, OPEN_TITLE_MAX) || OPEN_CHECK_IN_TITLE,
      });
      if (notes === undefined) return created;
      const leaderField = findLeaderCommentsField(created.templateFields ?? []);
      if (!leaderField) return created;
      return updateCheckIn(teamId, userId, created.id, { responses: { ...base, [leaderField.id]: notes }, status });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: checkInKeys.checkIns(teamId, userId) });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, "Couldn't save the check-in.")),
  });

  if (!open) return null;

  const header = (() => {
    if (view === "fill") {
      return editing
        ? { title: editing.templateTitle, sub: `Check-in with ${firstName} · Review before publishing.` }
        : { title: OPEN_CHECK_IN_TITLE, sub: `Check-in with ${firstName} · Publishing shares it with them.` };
    }
    if (view === "consent" || view === "recording" || view === "processing") {
      return { title: OPEN_CHECK_IN_TITLE, sub: `With ${memberName}` };
    }
    return { title: "Start a check-in", sub: `With ${memberName}` };
  })();

  const secondsLeft = MAX_RECORDING_SEC - elapsed <= CAP_WARNING_SEC ? Math.max(0, MAX_RECORDING_SEC - elapsed) : null;

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && requestClose()}>
      <aside className="dcat-drawer wm-drawer ci-drawer" role="dialog" aria-modal="true" aria-label="Start a check-in" data-testid="wm-check-in-drawer">
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <ClipboardCheck size={18} strokeWidth={2.2} />
          </span>
          <div className="dcat-head-copy">
            <h2>{header.title}</h2>
            <p>{header.sub}</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={requestClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        {view === "capture" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <StepHead
                title="Select a capture method"
                sub={`Both methods produce the same write-up for ${firstName}.`}
              />
              <CaptureCard
                testId="capture-record-method"
                tone="purple"
                icon={<Mic size={20} strokeWidth={2.2} />}
                title="Record with Seneca"
                recommended
                description="Hold the conversation and let Seneca write it up."
                points={["Drafted from the transcript", "Review and approve everything before it is saved"]}
                action="Record with Seneca"
                onClick={() => setView("consent")}
              />
              <CaptureCard
                testId="capture-form-method"
                tone="blue"
                icon={<ClipboardList size={20} strokeWidth={2.2} />}
                title="Type it up"
                description="Write the title, what you talked about and your notes yourself."
                points={["Full control over the wording", "Suited to documenting as you go"]}
                action="Type it up"
                onClick={() => setView("fill")}
              />
            </div>
            <SenecaFooter />
          </div>
        ) : null}

        {view === "consent" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <StepHead
                title="Record this check-in"
                sub={`Have a natural conversation with ${firstName}. Alenio will listen and create a write-up with key takeaways for you to review before saving.`}
                onBack={() => setView("capture")}
              />
              <div className="ci-consent">
                <div className="ci-consent-head">
                  <span className="ci-consent-icon">
                    <ShieldCheck size={20} strokeWidth={2.2} />
                  </span>
                  <div>
                    <strong>Tell {firstName} first</strong>
                    <p>
                      Let {firstName} know the conversation is being recorded and that they can ask you to stop at any time.
                      The audio is deleted as soon as it is written up.
                    </p>
                  </div>
                </div>
                <div className="ci-chips ci-chips--green">
                  {["Audio deleted after write-up", "Only you can see the write-up", "Nothing is saved until you publish"].map((chip) => (
                    <span key={chip}>
                      <Check size={12} strokeWidth={2.6} />
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
              <button type="button" className="ci-start" onClick={() => void beginRecording()} disabled={starting} data-testid="start-check-in-recording">
                {starting ? <Loader2 size={16} className="ci-spin" /> : <Mic size={16} strokeWidth={2.4} />}
                {starting ? "Starting…" : `${firstName} agreed, start recording`}
              </button>
              <p className="ci-mic-note">Your browser will ask to use the microphone.</p>
            </div>
            <SenecaFooter />
          </div>
        ) : null}

        {view === "recording" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <div className="ci-live">
                <span className={`ci-live-badge${paused ? " is-paused" : ""}`}>
                  <i />
                  {paused ? "Paused" : "Recording"}
                </span>
                <span className="ci-clock" data-testid="ci-clock">
                  {formatClock(elapsed)}
                </span>
                {secondsLeft !== null ? <span className="ci-cap">{formatClock(secondsLeft)} left</span> : null}
                <p className="ci-live-hint">
                  {secondsLeft !== null
                    ? "Recording stops at 90 minutes. Wrap up, or finish and start a second recording."
                    : paused
                      ? "Press resume when you're ready to carry on."
                      : `Talking with ${firstName}. Keep this tab open.`}
                </p>
                <div className="ci-meter" aria-hidden>
                  {Array.from({ length: LEVEL_BARS }, (_, i) => {
                    const threshold = (i + 1) / LEVEL_BARS;
                    return (
                      <span
                        key={i}
                        className={!paused && level >= threshold * 0.9 ? "is-on" : ""}
                        style={{ height: 8 + Math.round(threshold * 26) }}
                      />
                    );
                  })}
                </div>
                {uploads.pending > 0 ? (
                  <p className="ci-upload-note">
                    Saving {uploads.pending} part{uploads.pending === 1 ? "" : "s"} in the background
                  </p>
                ) : null}
                {uploads.failed > 0 ? (
                  <p className="ci-upload-warn">
                    {uploads.failed} part{uploads.failed === 1 ? "" : "s"} could not be saved and will be missing from the write-up
                  </p>
                ) : null}
              </div>

              {showTranscript ? (
                <div className="ci-questions ci-live-transcript">
                  <div className="ci-live-transcript-head">
                    <h4>Live transcript</h4>
                    {liveStatus === "active" || liveStatus === "paused" ? (
                      <span className="ci-live-transcript-pill">
                        {liveStatus === "paused" ? "Paused" : "Transcribing live"}
                      </span>
                    ) : null}
                  </div>
                  {liveError ? <p className="ci-upload-warn">{liveError}</p> : null}
                  <div
                    ref={transcriptScrollRef}
                    className="ci-live-transcript-scroll"
                    onScroll={(event) => {
                      const node = event.currentTarget;
                      const distance =
                        node.scrollHeight - node.clientHeight - node.scrollTop;
                      stickTranscriptToBottomRef.current = distance < 48;
                    }}
                  >
                    {transcriptLines.length === 0 ? (
                      <p>Recognized speech will appear here as you talk.</p>
                    ) : (
                      transcriptLines.map((line) => (
                        <div key={line.id} className="ci-live-transcript-row">
                          <div className="ci-transcript-time">
                            {formatTranscriptClock(line.startMs)}
                            {line.speakerLabel ? ` — ${line.speakerLabel}` : ""}
                          </div>
                          <p className={line.interim ? "is-interim" : undefined}>{line.text}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="ci-questions">
                  <h4>Just talk</h4>
                  <p>Talk through whatever matters. Alenio writes up what you covered once you finish.</p>
                </div>
              )}
              <button
                type="button"
                className="ci-discard"
                onClick={() => {
                  setShowTranscript((value) => {
                    const next = !value;
                    if (next) stickTranscriptToBottomRef.current = true;
                    return next;
                  });
                }}
              >
                {showTranscript ? "Hide Transcript" : "Show Live Transcript"}
              </button>
              {!showTranscript &&
              (liveStatus === "active" || liveStatus === "connecting" || liveStatus === "paused") ? (
                <p className="ci-upload-note">Transcribing in background</p>
              ) : null}
              {!showTranscript && liveError ? <p className="ci-upload-warn">{liveError}</p> : null}
            </div>
            <div className="ci-controls">
              <button
                type="button"
                className="ci-control"
                onClick={() => {
                  if (paused) {
                    recorderRef.current?.resume();
                    liveRef.current?.resume();
                    setPaused(false);
                    return;
                  }
                  liveRef.current?.pause();
                  setPaused(true);
                  void recorderRef.current?.pause();
                }}
              >
                {paused ? <Play size={16} strokeWidth={2.4} /> : <Pause size={16} strokeWidth={2.4} />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="ci-control ci-control--stop"
                onClick={() => {
                  if (window.confirm("End this check-in and write it up?")) void finishRecording();
                }}
                data-testid="stop-check-in-recording"
              >
                <Square size={14} strokeWidth={2.8} fill="currentColor" />
                End Check-In
              </button>
            </div>
            <button
              type="button"
              className="ci-discard"
              onClick={() => {
                if (hasCapture()) {
                  if (
                    !window.confirm(
                      `Save draft & leave? What you covered with ${firstName} will be saved as a transcript draft. You can write it up later.`,
                    )
                  ) {
                    return;
                  }
                  void saveDraftRecording();
                  return;
                }
                if (!window.confirm("Leave without recording? Nothing has been captured yet.")) return;
                cancelEmptyRecording();
                setView("capture");
              }}
            >
              {hasCapture() ? "Save draft & leave" : "Cancel check-in"}
            </button>
          </div>
        ) : null}

        {view === "processing" ? (
          <div className="ci-body ci-centered" data-testid="ci-processing">
            <Loader2 size={30} className="ci-spin ci-spin--lg" />
            <h3>{stage === "saving" ? "Saving your recording" : "Seneca is writing it up"}</h3>
            <p>
              {stage === "saving"
                ? uploads.pending > 0
                  ? `Uploading ${uploads.pending} part${uploads.pending === 1 ? "" : "s"}…`
                  : "Uploading the audio…"
                : "Turning your conversation into a draft check-in. This usually takes under a minute."}
            </p>
            {stage === "writing" ? (
              <>
                <small>Saved as a transcript draft — write it up anytime from Check-ins.</small>
                <button type="button" className="nw-btn" onClick={onClose}>
                  Close
                </button>
              </>
            ) : null}
          </div>
        ) : null}

        {view === "error" ? (
          <div className="ci-body ci-centered">
            <span className="ci-error-icon">
              <CircleAlert size={22} strokeWidth={2.2} />
            </span>
            <h3>That didn't work</h3>
            <p>{error ?? "Something went wrong."}</p>
            <div className="ci-error-actions">
              <button
                type="button"
                className="nw-btn"
                onClick={() => {
                  setError(null);
                  setView(canRecord ? "capture" : "fill");
                }}
              >
                Start over
              </button>
              <button type="button" className="nw-btn nw-btn--primary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        {view === "fill" ? (
          <form
            className="dcat-form wm-form"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              setError(null);
              save.mutate("published");
            }}
          >
            {!editing && canRecord ? (
              <button type="button" className="ci-back-link" onClick={() => setView("capture")}>
                <ChevronLeft size={14} strokeWidth={2.4} />
                Capture method
              </button>
            ) : null}
            {editing?.captureMode === "recorded" ? (
              <div className="ci-recorded" data-testid="ci-recorded-banner">
                <span>
                  <Sparkles size={13} strokeWidth={2.4} />
                </span>
                <div>
                  <strong>Written up from your recording</strong>
                  <p>Seneca drafted these answers. Check each one and edit anything before you publish.</p>
                  <button type="button" className="wm-link-btn ci-recorded-link" onClick={() => setTranscriptOpen(true)} data-testid="ci-view-transcript">
                    <FileAudio size={12} strokeWidth={2.4} />
                    View transcript
                  </button>
                </div>
              </div>
            ) : null}
            {!editing || !editing.templateId ? (
              <label className="dcat-field">
                <span>Title</span>
                <input value={openTitle} onChange={(e) => setOpenTitle(e.target.value)} maxLength={OPEN_TITLE_MAX} placeholder={OPEN_CHECK_IN_TITLE} />
              </label>
            ) : null}

            {fields.map((f) => (
              <FieldInput key={f.id} field={f} value={responses[f.id]} onChange={(v) => setResponses((prev) => ({ ...prev, [f.id]: v }))} />
            ))}

            {error ? <p className="nw-error">{error}</p> : null}
            <div className="dcat-form-actions wm-form-actions">
              <button
                type="button"
                className="dcat-btn"
                onClick={() => {
                  setError(null);
                  save.mutate("draft");
                }}
                disabled={save.isPending}
              >
                Save draft
              </button>
              <button type="submit" className="dcat-btn dcat-btn--primary" disabled={save.isPending} data-testid="wm-publish">
                {save.isPending ? "Saving…" : "Publish check-in"}
              </button>
            </div>
          </form>
        ) : null}
      </aside>
      <CheckInTranscriptDrawer
        teamId={teamId}
        userId={userId}
        meetingId={transcriptOpen && editing ? editing.id : null}
        title={editing?.templateTitle}
        onClose={() => setTranscriptOpen(false)}
      />
    </div>,
    document.body,
  );
}

function StepHead({ step, title, sub, onBack }: { step?: number; title: string; sub: string; onBack?: () => void }) {
  return (
    <div className="ci-step">
      {onBack ? (
        <button type="button" className="ci-step-back" onClick={onBack} aria-label="Back">
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
      ) : null}
      {step ? <span className="ci-step-num">{step}</span> : null}
      <div>
        <h3>{title}</h3>
        <p>{sub}</p>
      </div>
    </div>
  );
}

function CaptureCard({
  testId,
  tone,
  icon,
  title,
  recommended,
  description,
  points,
  action,
  onClick,
}: {
  testId: string;
  tone: "purple" | "blue";
  icon: ReactNode;
  title: string;
  recommended?: boolean;
  description: string;
  points: string[];
  action: string;
  onClick: () => void;
}) {
  return (
    <div className={`ci-capture ci-choice--${tone}`} data-testid={testId}>
      <div className="ci-choice-top">
        <span className="ci-choice-icon">{icon}</span>
        <span className="ci-choice-copy">
          <span className="ci-choice-title">
            <strong>{title}</strong>
            {recommended ? <em>Recommended</em> : null}
          </span>
          <small>{description}</small>
        </span>
      </div>
      <ul className="ci-points">
        {points.map((p) => (
          <li key={p}>
            <Check size={13} strokeWidth={2.6} />
            {p}
          </li>
        ))}
      </ul>
      <button type="button" className="ci-capture-btn" onClick={onClick}>
        {action}
        <ChevronRight size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function SenecaFooter() {
  return (
    <footer className="ci-seneca">
      <div className="ci-seneca-row">
        <Sparkles size={18} strokeWidth={2.2} />
        <i aria-hidden />
        <div>
          <strong>Seneca helps with both</strong>
          <p>Review and refine your check-in summary before saving.</p>
        </div>
      </div>
      <svg className="ci-wave" viewBox="0 0 360 90" preserveAspectRatio="none" aria-hidden>
        <path d="M0 34 C80 12 150 22 210 38 C280 56 320 24 360 32 L360 90 L0 90 Z" fill="#F4F0FF" />
        <path d="M0 58 C90 44 170 66 250 52 C310 42 340 54 360 50 L360 90 L0 90 Z" fill="#E9E2FF" />
      </svg>
    </footer>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: CheckInField;
  value: string | number | undefined;
  onChange: (value: string | number) => void;
}) {
  if (field.type === "section") return <h3 className="wm-form-section">{field.label}</h3>;
  const label = (
    <span>
      {field.label}
      {field.required ? <em className="wm-req"> *</em> : null}
    </span>
  );
  const help = field.helpText ? <small className="wm-help">{field.helpText}</small> : null;

  if (field.type === "rating") {
    const max = field.ratingMax ?? 5;
    return (
      <div className="dcat-field">
        {label}
        {help}
        <div className="wm-rate-pick" role="radiogroup" aria-label={field.label}>
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={Number(value) === n}
              className={Number(value) === n ? "is-on" : ""}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (field.type === "yes_no") {
    return (
      <div className="dcat-field">
        {label}
        {help}
        <div className="wm-rate-pick wm-yesno" role="radiogroup" aria-label={field.label}>
          {["yes", "no"].map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={value === opt}
              className={value === opt ? "is-on" : ""}
              onClick={() => onChange(opt)}
            >
              {opt === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>
    );
  }
  const long = field.type !== "short_text";
  return (
    <label className="dcat-field">
      {label}
      {help}
      {long ? (
        <textarea rows={3} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={4000} />
      ) : (
        <input value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} maxLength={500} />
      )}
    </label>
  );
}
