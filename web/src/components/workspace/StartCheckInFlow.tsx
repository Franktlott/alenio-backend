import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  ClipboardList,
  FileAudio,
  Loader2,
  MessageCircle,
  Mic,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  addLibraryCheckInTemplate,
  cancelCheckInRecording,
  createCheckIn,
  createCheckInTemplate,
  fetchCheckInRecording,
  fetchCheckIns,
  fetchCheckInTemplateLibrary,
  fetchCheckInTemplates,
  finishCheckInRecording,
  isLeaderFillableField,
  startCheckInRecording,
  updateCheckIn,
  type CheckIn,
  type CheckInField,
  type CheckInTemplate,
} from "../../lib/member-development-api";
import { CheckInTranscriptDrawer } from "./CheckInTranscriptDrawer";
import { browserCanRecord, formatClock, MAX_RECORDING_SEC, WebCheckInRecorder } from "../../lib/web-check-in-recorder";
import "../../routes/discover/discover-categories-drawer.css";

export const checkInKeys = {
  checkIns: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "check-ins"] as const,
  active: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "recordings"] as const,
  templates: (teamId: string) => ["workspace", "check-in-templates", teamId] as const,
};

const OPEN_CHECK_IN_TITLE = "Open check-in";
const CAP_WARNING_SEC = 5 * 60;
const LEVEL_BARS = 24;

type View =
  | "mode"
  | "pick"
  | "setup"
  | "capture"
  | "fill"
  | "consent"
  | "recording"
  | "processing"
  | "error";

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function questionsFor(template: CheckInTemplate | null): string[] {
  if (!template) return [];
  return [...template.fields]
    .sort((a, b) => a.order - b.order)
    .filter((f) => f.type !== "section" && f.type !== "manager_notes" && isLeaderFillableField(f))
    .map((f) => f.label);
}

function fillableFields(fields: CheckInField[]): CheckInField[] {
  return [...fields].sort((a, b) => a.order - b.order).filter((f) => f.type === "section" || isLeaderFillableField(f));
}

/**
 * Start a check-in the way the mobile app does: pick a style (guided or open),
 * then for guided pick a template and how to capture it. Recording hands the
 * audio to Seneca, which writes up a draft to review before publishing.
 */
export function StartCheckInFlow({
  open,
  teamId,
  userId,
  memberName,
  resume,
  onClose,
}: {
  open: boolean;
  teamId: string;
  userId: string;
  memberName: string;
  /** A draft to pick back up, skipping straight to the form. */
  resume?: CheckIn | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const firstName = memberName.trim().split(/\s+/)[0] || memberName;
  const canRecord = useMemo(() => browserCanRecord(), []);

  const [view, setView] = useState<View>("mode");
  const [template, setTemplate] = useState<CheckInTemplate | null>(null);
  const [editing, setEditing] = useState<CheckIn | null>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [openTitle, setOpenTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [setupBack, setSetupBack] = useState<View>("pick");
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  /* recording */
  const [recordTemplate, setRecordTemplate] = useState<CheckInTemplate | null>(null);
  const [starting, setStarting] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploads, setUploads] = useState({ pending: 0, failed: 0 });
  const [stage, setStage] = useState<"saving" | "writing">("saving");
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const recorderRef = useRef<WebCheckInRecorder | null>(null);
  const elapsedRef = useRef(0);

  const templates = useQuery({
    queryKey: checkInKeys.templates(teamId),
    queryFn: () => fetchCheckInTemplates(teamId),
    enabled: open && Boolean(teamId),
    staleTime: 60_000,
  });
  const list = templates.data ?? [];

  const loadDraft = useCallback((meeting: CheckIn) => {
    setEditing(meeting);
    setTemplate(null);
    setResponses({ ...(meeting.responses ?? {}) });
    setOpenTitle(meeting.templateId ? "" : meeting.templateTitle);
    setError(null);
    setView("fill");
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setTranscriptOpen(false);
    setTemplate(null);
    setRecordTemplate(null);
    setRecordingId(null);
    setElapsed(0);
    elapsedRef.current = 0;
    setPaused(false);
    setUploads({ pending: 0, failed: 0 });
    if (resume) {
      loadDraft(resume);
    } else {
      setEditing(null);
      setResponses({});
      setOpenTitle("");
      setView(canRecord ? "mode" : "pick");
    }
  }, [open, resume, canRecord, loadDraft]);

  /* Clean up a live microphone if the drawer unmounts mid-recording. */
  useEffect(() => () => recorderRef.current?.discard(), []);

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

  const beginRecording = async () => {
    if (starting) return;
    setStarting(true);
    setError(null);
    let stream: MediaStream | null = null;
    try {
      stream = await WebCheckInRecorder.requestMicrophone();
      const created = await startCheckInRecording(teamId, userId, recordTemplate?.id ?? null);
      setRecordingId(created.id);
      const recorder = new WebCheckInRecorder({ teamId, memberUserId: userId, recordingId: created.id }, (pending, failed) =>
        setUploads({ pending, failed }),
      );
      recorderRef.current = recorder;
      recorder.start(stream);
      elapsedRef.current = 0;
      setElapsed(0);
      setPaused(false);
      setView("recording");
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      setError(errorMessage(err, "We couldn't start recording."));
      setView("error");
    } finally {
      setStarting(false);
    }
  };

  const finishRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || !recordingId) return;
    setView("processing");
    setStage("saving");
    try {
      await recorder.stop();
      recorderRef.current = null;
      await finishCheckInRecording(teamId, userId, recordingId, elapsedRef.current);
      void qc.invalidateQueries({ queryKey: checkInKeys.active(teamId, userId) });
      setStage("writing");
    } catch (err) {
      setError(errorMessage(err, "We couldn't save that recording."));
      setView("error");
    }
  }, [recordingId, teamId, userId, qc]);

  useEffect(() => {
    if (view === "recording" && !paused && elapsed >= MAX_RECORDING_SEC) void finishRecording();
  }, [view, paused, elapsed, finishRecording]);

  const discardRecording = () => {
    recorderRef.current?.discard();
    recorderRef.current = null;
    if (recordingId) void cancelCheckInRecording(teamId, userId, recordingId).catch(() => undefined);
    setRecordingId(null);
  };

  const requestClose = useCallback(() => {
    if (view === "recording") {
      if (!window.confirm("Discard this recording? Nothing will be saved.")) return;
      discardRecording();
    }
    onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, onClose, recordingId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !transcriptOpen) requestClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose, transcriptOpen]);

  const fields = useMemo(
    () => fillableFields(editing?.templateFields ?? template?.fields ?? []),
    [editing, template],
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
          ...(isOpen ? { templateTitle: openTitle.trim().slice(0, 60) || OPEN_CHECK_IN_TITLE } : {}),
        });
      }
      if (!template) throw new Error("Pick a template first.");
      return createCheckIn(teamId, userId, { templateId: template.id, responses: clean, status });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: checkInKeys.checkIns(teamId, userId) });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, "Couldn't save the check-in.")),
  });

  if (!open) return null;

  const chooseTemplate = (t: CheckInTemplate) => {
    setTemplate(t);
    setResponses({});
    setError(null);
    setView(canRecord ? "capture" : "fill");
  };

  const onTemplateReady = (created: CheckInTemplate) => {
    qc.setQueryData<CheckInTemplate[]>(checkInKeys.templates(teamId), (prev) => [
      created,
      ...(prev ?? []).filter((t) => t.id !== created.id),
    ]);
    void qc.invalidateQueries({ queryKey: checkInKeys.templates(teamId) });
    chooseTemplate(created);
  };

  const header = (() => {
    if (view === "setup") return { title: "New check-in template", sub: "Pick a ready-made template or build your own." };
    if (view === "fill") {
      return editing
        ? { title: editing.templateTitle, sub: `Check-in with ${firstName} · Review before publishing.` }
        : { title: template?.title ?? "Check-in", sub: `Check-in with ${firstName} · Publishing shares it with them.` };
    }
    if (view === "consent" || view === "recording" || view === "processing") {
      return { title: recordTemplate ? recordTemplate.title : OPEN_CHECK_IN_TITLE, sub: `With ${memberName}` };
    }
    return { title: "Start a check-in", sub: `With ${memberName}` };
  })();

  const secondsLeft = MAX_RECORDING_SEC - elapsed <= CAP_WARNING_SEC ? Math.max(0, MAX_RECORDING_SEC - elapsed) : null;
  const recordQuestions = questionsFor(recordTemplate);

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

        {view === "mode" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <div className="ci-intro">
                <h3>Choose a check-in style</h3>
                <p>Either way, Alenio writes it up for you to review.</p>
              </div>
              <StyleChoice
                testId="guided-check-in-mode"
                tone="purple"
                icon={<ClipboardList size={20} strokeWidth={2.2} />}
                title="Guided check-in"
                recommended
                description="Use a template to guide a focused, structured conversation."
                chips={["Consistent questions", "Track progress"]}
                onClick={() => setView("pick")}
              />
              <StyleChoice
                testId="open-check-in-mode"
                tone="blue"
                icon={<MessageCircle size={20} strokeWidth={2.2} />}
                title="Open check-in"
                description="Have a flexible conversation without a predefined template."
                chips={["Flexible format", "Capture takeaways"]}
                onClick={() => {
                  setRecordTemplate(null);
                  setView("consent");
                }}
              />
            </div>
            <SenecaFooter />
          </div>
        ) : null}

        {view === "pick" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <StepHead
                step={1}
                title="Choose check-in template"
                sub="Select the type of conversation you'd like to have."
                onBack={canRecord ? () => setView("mode") : undefined}
              />
              {templates.isLoading ? (
                <p className="wm-muted">Loading templates…</p>
              ) : list.length === 0 ? (
                <div className="dm-empty ci-empty">
                  <ClipboardList size={28} />
                  <h3>No check-in templates yet</h3>
                  <p>Create one to guide your conversations. Your whole workspace can use it.</p>
                  <button
                    type="button"
                    className="nw-btn nw-btn--primary wm-empty-cta"
                    onClick={() => {
                      setSetupBack("pick");
                      setView("setup");
                    }}
                    data-testid="wm-new-template"
                  >
                    <Plus size={15} strokeWidth={2.4} />
                    Create a template
                  </button>
                </div>
              ) : (
                <>
                  <ul className="ci-templates" data-testid="ci-templates">
                    {list.map((t) => {
                      const count = questionsFor(t).length;
                      return (
                        <li key={t.id}>
                          <button type="button" className="ci-template" onClick={() => chooseTemplate(t)} data-testid={`ci-template-${t.id}`}>
                            <span className="ci-template-icon">
                              <ClipboardList size={16} strokeWidth={2.2} />
                            </span>
                            <span className="ci-template-copy">
                              <strong>{t.title}</strong>
                              {t.description ? <small>{t.description}</small> : null}
                              <em>
                                {count} question{count === 1 ? "" : "s"}
                              </em>
                            </span>
                            <ChevronRight size={16} strokeWidth={2.3} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className="nw-btn ci-new-template"
                    onClick={() => {
                      setSetupBack("pick");
                      setView("setup");
                    }}
                    data-testid="wm-new-template"
                  >
                    <Plus size={14} strokeWidth={2.4} />
                    New template
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}

        {view === "setup" ? (
          <TemplateSetup teamId={teamId} existing={list} onReady={onTemplateReady} onCancel={() => setView(setupBack)} />
        ) : null}

        {view === "capture" && template ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <StepHead
                step={2}
                title="Select a capture method"
                sub={`${template.title} · Both methods produce the same structured record for ${firstName}.`}
                onBack={() => {
                  setTemplate(null);
                  setView("pick");
                }}
              />
              <CaptureCard
                testId="capture-record-method"
                tone="purple"
                icon={<Mic size={20} strokeWidth={2.2} />}
                title="Record with Seneca"
                recommended
                description="Hold the conversation and let Seneca complete the form."
                points={["Responses drafted from the transcript", "Review and approve every answer before it is saved"]}
                action="Record with Seneca"
                onClick={() => {
                  setRecordTemplate(template);
                  setView("consent");
                }}
              />
              <CaptureCard
                testId="capture-form-method"
                tone="blue"
                icon={<ClipboardList size={20} strokeWidth={2.2} />}
                title="Complete the form"
                description="Enter each response yourself as the conversation happens."
                points={["Full control over the wording of every answer", "Suited to documenting as you go"]}
                action="Complete the form"
                onClick={() => setView("fill")}
              />
            </div>
          </div>
        ) : null}

        {view === "consent" ? (
          <div className="ci-body">
            <div className="ci-scroll">
              <StepHead
                title="Record this check-in"
                sub={
                  recordTemplate
                    ? `Have a natural conversation with ${firstName}. Alenio will listen and fill in ${recordTemplate.title} for you to review before saving.`
                    : `Have a natural conversation with ${firstName}. Alenio will listen and create a structured summary with key takeaways for you to review before saving.`
                }
                onBack={() => setView(recordTemplate ? "capture" : "mode")}
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

              <div className="ci-questions">
                {recordQuestions.length === 0 ? (
                  <>
                    <h4>No set questions</h4>
                    <p>Talk through whatever matters. Alenio works out the questions you covered once you finish.</p>
                  </>
                ) : (
                  <>
                    <h4>What to cover</h4>
                    <ol>
                      {recordQuestions.map((q, i) => (
                        <li key={`${i}-${q}`}>
                          <b>{i + 1}</b>
                          <span>{q}</span>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </div>
            </div>
            <div className="ci-controls">
              <button
                type="button"
                className="ci-control"
                onClick={() => {
                  if (paused) recorderRef.current?.resume();
                  else recorderRef.current?.pause();
                  setPaused(!paused);
                }}
              >
                {paused ? <Play size={16} strokeWidth={2.4} /> : <Pause size={16} strokeWidth={2.4} />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                className="ci-control ci-control--stop"
                onClick={() => {
                  if (window.confirm("Finish and write up this check-in?")) void finishRecording();
                }}
                data-testid="stop-check-in-recording"
              >
                <Square size={14} strokeWidth={2.8} fill="currentColor" />
                Finish
              </button>
            </div>
            <button
              type="button"
              className="ci-discard"
              onClick={() => {
                if (!window.confirm("Discard this recording? Nothing will be saved.")) return;
                discardRecording();
                setView(recordTemplate ? "capture" : "mode");
              }}
            >
              Discard recording
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
                <small>You can close this. The draft will appear in Check-ins when it's ready.</small>
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
                  setView(canRecord ? "mode" : "pick");
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
            {!editing ? (
              <button type="button" className="ci-back-link" onClick={() => setView(canRecord ? "capture" : "pick")}>
                <ChevronLeft size={14} strokeWidth={2.4} />
                {canRecord ? "Capture method" : "Templates"}
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
            {editing && !editing.templateId ? (
              <label className="dcat-field">
                <span>Title</span>
                <input value={openTitle} onChange={(e) => setOpenTitle(e.target.value)} maxLength={60} placeholder={OPEN_CHECK_IN_TITLE} />
              </label>
            ) : null}
            {!editing && template?.description ? <p className="wm-muted">{template.description}</p> : null}

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

function StyleChoice({
  testId,
  tone,
  icon,
  title,
  recommended,
  description,
  chips,
  onClick,
}: {
  testId: string;
  tone: "purple" | "blue";
  icon: ReactNode;
  title: string;
  recommended?: boolean;
  description: string;
  chips: string[];
  onClick: () => void;
}) {
  return (
    <button type="button" className={`ci-choice ci-choice--${tone}`} onClick={onClick} data-testid={testId}>
      <span className="ci-choice-top">
        <span className="ci-choice-icon">{icon}</span>
        <span className="ci-choice-copy">
          <span className="ci-choice-title">
            <strong>{title}</strong>
            {recommended ? <em>Recommended</em> : null}
          </span>
          <small>{description}</small>
        </span>
        <ChevronRight size={18} strokeWidth={2.3} className="ci-choice-chev" />
      </span>
      <span className="ci-chips">
        {chips.map((chip) => (
          <span key={chip}>
            <Check size={12} strokeWidth={2.6} />
            {chip}
          </span>
        ))}
      </span>
    </button>
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

type DraftQuestion = { key: string; label: string; type: "short_text" | "long_text" | "rating" | "yes_no"; required: boolean };

const QUESTION_TYPES: { id: DraftQuestion["type"]; label: string }[] = [
  { id: "long_text", label: "Written answer" },
  { id: "short_text", label: "Short answer" },
  { id: "rating", label: "Rating 1–5" },
  { id: "yes_no", label: "Yes / No" },
];

function newQuestion(label = ""): DraftQuestion {
  return { key: crypto.randomUUID(), label, type: "long_text", required: false };
}

/** Add a ready-made template from the Alenio library, or build a custom one. */
function TemplateSetup({
  teamId,
  existing,
  onReady,
  onCancel,
}: {
  teamId: string;
  existing: CheckInTemplate[];
  onReady: (template: CheckInTemplate) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<"library" | "custom">("library");
  const [error, setError] = useState<string | null>(null);
  const library = useQuery({
    queryKey: ["check-in-template-library"],
    queryFn: fetchCheckInTemplateLibrary,
    staleTime: 10 * 60_000,
  });
  const addLibrary = useMutation({
    mutationFn: (key: string) => addLibraryCheckInTemplate(teamId, key),
    onSuccess: onReady,
    onError: (err) => setError(errorMessage(err, "Couldn't add that template.")),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>(() => [
    newQuestion("What's going well?"),
    newQuestion("What's getting in the way?"),
  ]);
  const createCustom = useMutation({
    mutationFn: () => {
      const filled = questions.filter((q) => q.label.trim());
      if (filled.length === 0) throw new Error("Add at least one question.");
      const fields: CheckInField[] = [
        { id: crypto.randomUUID(), label: "Check-in", type: "section", order: 0, required: false },
        ...filled.map((q, i) => ({
          id: crypto.randomUUID(),
          label: q.label.trim(),
          type: q.type,
          order: i + 1,
          required: q.required,
          ...(q.type === "rating" ? { ratingMax: 5 } : {}),
        })),
      ];
      return createCheckInTemplate(teamId, { title: title.trim(), description: description.trim() || null, fields });
    },
    onSuccess: onReady,
    onError: (err) => setError(errorMessage(err, "Couldn't save the template.")),
  });

  const added = new Set(existing.map((t) => t.libraryKey).filter(Boolean));
  const update = (key: string, patch: Partial<DraftQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.key === key ? { ...q, ...patch } : q)));

  return (
    <div className="dcat-form wm-form" data-testid="wm-template-setup">
      <div className="wm-rate-pick wm-mode" role="tablist" aria-label="Template source">
        <button type="button" role="tab" aria-selected={mode === "library"} className={mode === "library" ? "is-on" : ""} onClick={() => setMode("library")} data-testid="wm-tpl-library">
          Ready-made
        </button>
        <button type="button" role="tab" aria-selected={mode === "custom"} className={mode === "custom" ? "is-on" : ""} onClick={() => setMode("custom")} data-testid="wm-tpl-custom">
          Build your own
        </button>
      </div>

      {mode === "library" ? (
        library.isLoading ? (
          <p className="wm-muted">Loading templates…</p>
        ) : library.isError ? (
          <p className="nw-error">Couldn't load the template library.</p>
        ) : (
          <ul className="wm-lib">
            {(library.data ?? []).map((t) => {
              const questionCount = t.fields.filter((f) => f.type !== "section" && f.type !== "manager_notes").length;
              const isAdded = added.has(t.key);
              return (
                <li key={t.key} className="wm-lib-item" data-testid={`wm-lib-${t.key}`}>
                  <div>
                    <strong>{t.title}</strong>
                    {t.description ? <p>{t.description}</p> : null}
                    <small>
                      {questionCount} question{questionCount === 1 ? "" : "s"}
                    </small>
                  </div>
                  {isAdded ? (
                    <span className="wm-pill">Added</span>
                  ) : (
                    <button
                      type="button"
                      className="nw-btn nw-btn--soft"
                      disabled={addLibrary.isPending}
                      onClick={() => {
                        setError(null);
                        addLibrary.mutate(t.key);
                      }}
                    >
                      {addLibrary.isPending && addLibrary.variables === t.key ? "Adding…" : "Use"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )
      ) : (
        <form
          className="wm-tpl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            setError(null);
            createCustom.mutate();
          }}
        >
          <label className="dcat-field">
            <span>Template name</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Weekly check-in" maxLength={120} required data-testid="wm-tpl-title" />
          </label>
          <label className="dcat-field">
            <span>Description (optional)</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this check-in is for" maxLength={500} />
          </label>
          <div className="dcat-field">
            <span>Questions</span>
            <ol className="wm-questions">
              {questions.map((q, i) => (
                <li key={q.key} className="wm-question" data-testid={`wm-tpl-q-${i}`}>
                  <div className="wm-question-top">
                    <b>{i + 1}</b>
                    <input value={q.label} onChange={(e) => update(q.key, { label: e.target.value })} placeholder="Ask a question" maxLength={200} />
                    {questions.length > 1 ? (
                      <button type="button" className="nw-icon-btn" aria-label="Remove question" onClick={() => setQuestions((prev) => prev.filter((x) => x.key !== q.key))}>
                        <X size={14} strokeWidth={2.2} />
                      </button>
                    ) : null}
                  </div>
                  <div className="wm-question-opts">
                    <select value={q.type} onChange={(e) => update(q.key, { type: e.target.value as DraftQuestion["type"] })} aria-label="Answer type">
                      {QUESTION_TYPES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                    <label className="wm-required">
                      <input type="checkbox" checked={q.required} onChange={(e) => update(q.key, { required: e.target.checked })} />
                      Required
                    </label>
                  </div>
                </li>
              ))}
            </ol>
            {questions.length < 30 ? (
              <button type="button" className="nw-btn wm-add-step" onClick={() => setQuestions((prev) => [...prev, newQuestion()])}>
                <Plus size={14} strokeWidth={2.4} />
                Add question
              </button>
            ) : null}
            <small className="wm-help">A "Leader comments" section is added at the end automatically.</small>
          </div>
          {error ? <p className="nw-error">{error}</p> : null}
          <div className="dcat-form-actions wm-form-actions">
            {onCancel ? (
              <button type="button" className="dcat-btn" onClick={onCancel}>
                Back
              </button>
            ) : null}
            <button type="submit" className="dcat-btn dcat-btn--primary" disabled={createCustom.isPending || !title.trim()} data-testid="wm-tpl-save">
              {createCustom.isPending ? "Saving…" : "Save template"}
            </button>
          </div>
        </form>
      )}

      {mode === "library" && error ? <p className="nw-error">{error}</p> : null}
      {mode === "library" && onCancel ? (
        <div className="dcat-form-actions">
          <button type="button" className="dcat-btn" onClick={onCancel}>
            Back
          </button>
        </div>
      ) : null}
    </div>
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
