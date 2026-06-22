import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AutoResizeTextarea } from "./AutoResizeTextarea";
import {
  createOneOnOneMeeting,
  deleteOneOnOneMeeting,
  fetchOneOnOneMeetings,
  fetchOneOnOneTemplates,
  updateOneOnOneMeeting,
  type OneOnOneMeeting,
  type OneOnOneTemplate,
  type OneOnOneTemplateField,
  type OneOnOneFollowUpTaskInput,
} from "../lib/api";
import { meetingNumberFor, printOneOnOneMeeting } from "../lib/one-on-one-print";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  formatAssociateResponseDisplay,
  formatYesNoResponseDisplay,
} from "../lib/one-on-one-feedback";
import {
  appendLeaderCommentsIfMissing,
  findLeaderCommentsField,
  isLeaderCommentsEmpty,
  LEADER_COMMENTS_NUDGE_COPY,
  LEADER_COMMENTS_NUDGE_TITLE,
} from "../lib/check-in-leader-comments";
import {
  countOverdueFollowUpTasks,
  checkInEditMenuLabel,
  canPrintCheckIn,
  getOneOnOneMeetingStatusFromMeeting,
  oneOnOneMeetingStatusClass,
  oneOnOneMeetingStatusLabel,
} from "../lib/one-on-one-status";
import { SenecaPrepCard } from "./seneca/SenecaPrepCard";
import { SenecaCheckInPanel, type SenecaFollowUpSuggestion } from "./seneca/SenecaCheckInPanel";
import { SenecaSummaryModal } from "./seneca/SenecaSummaryModal";
import { DevelopmentPlanGenerator } from "./seneca/DevelopmentPlanGenerator";
import { fetchSenecaPrep, type SenecaDevelopmentGoalDraft, type SenecaPrep } from "../lib/seneca-api";

const FIELD_TYPE_LABELS: Record<string, string> = {
  section: "Section",
  short_text: "Short answer",
  long_text: "Long answer",
  rating: "Rating",
  yes_no: "Yes or No",
  manager_notes: "Leader comments",
  associate_notes: "Associate notes",
};

function fieldTypeLabel(type: string): string {
  return FIELD_TYPE_LABELS[type] ?? type;
}

type PreviewSectionGroup = {
  section: OneOnOneTemplateField;
  fields: OneOnOneTemplateField[];
};

function groupPreviewSections(fields: OneOnOneTemplateField[]): PreviewSectionGroup[] {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  const groups: PreviewSectionGroup[] = [];
  let current: PreviewSectionGroup | null = null;

  for (const field of sorted) {
    if (field.type === "section") {
      current = { section: field, fields: [] };
      groups.push(current);
    } else if (field.type === "associate_notes") {
      continue;
    } else if (current) {
      current.fields.push(field);
    } else {
      current = {
        section: {
          id: "__preview_general__",
          label: "Responses",
          type: "section",
          order: 0,
        },
        fields: [field],
      };
      groups.push(current);
    }
  }

  return groups;
}

function renderPreviewQuestion(field: OneOnOneTemplateField, answer: string | number | undefined) {
  if (answer === undefined || answer === "" || answer === 0) return null;
  const display =
    field.type === "yes_no" ? formatYesNoResponseDisplay(answer) : formatAssociateResponseDisplay(answer);
  return (
    <div key={field.id} className="enterprise-oneone-preview-question">
      <div className="enterprise-oneone-preview-question-label">{field.label}</div>
      <div className="enterprise-oneone-preview-question-answer">{display}</div>
    </div>
  );
}

function formatMeetingDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function meetingToFillTemplate(meeting: OneOnOneMeeting): OneOnOneTemplate {
  return {
    id: meeting.templateId ?? meeting.id,
    teamId: meeting.teamId,
    title: meeting.templateTitle,
    description: null,
    fields: meeting.templateFields,
    createdById: meeting.createdById,
    createdAt: meeting.createdAt,
    updatedAt: meeting.createdAt,
    createdBy: meeting.createdBy,
  };
}

type Props = {
  teamId: string;
  memberUserId: string;
  memberName: string;
  managerName: string | null;
  leaderUserId: string | null;
  canCreate: boolean;
  canModify: boolean;
};

type View = "list" | "pick" | "fill";

/** iPad and smaller: check-in opens full screen automatically. */
const CHECKIN_COMPACT_MAX_WIDTH = 1024;

function useCompactCheckInLayout() {
  const [compact, setCompact] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(max-width: ${CHECKIN_COMPACT_MAX_WIDTH}px)`).matches
      : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${CHECKIN_COMPACT_MAX_WIDTH}px)`);
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return compact;
}

type FollowUpDraft = {
  id: string;
  title: string;
  assigneeRole: "associate" | "leader";
  dueDate: string;
};

function newFollowUpDraft(): FollowUpDraft {
  return { id: crypto.randomUUID(), title: "", assigneeRole: "associate", dueDate: "" };
}

function dueDateInputToIso(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = new Date(`${trimmed}T23:59:59`);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function formatFollowUpDueDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

function assigneeDisplayName(
  userId: string | undefined,
  memberUserId: string,
  memberName: string,
  leaderUserId: string | null,
  leaderName: string | null,
): string {
  if (!userId || userId === memberUserId) return memberName;
  return leaderName ?? "Leader";
}

function CheckInIllustration() {
  return (
    <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="24" cy="24" r="24" fill="#ede9fe" />
      <rect x="14" y="17" width="20" height="17" rx="3" stroke="#7c3aed" strokeWidth="2" />
      <path d="M14 22h20" stroke="#7c3aed" strokeWidth="2" />
      <path d="M19 13v5M29 13v5" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19" cy="28" r="1.25" fill="#c4b5fd" />
      <circle cx="24" cy="28" r="1.25" fill="#c4b5fd" />
      <circle cx="29" cy="28" r="1.25" fill="#c4b5fd" />
    </svg>
  );
}

type CheckInGrowCardProps = {
  canCreate: boolean;
  onCreate?: () => void;
  loading?: boolean;
  title?: string;
  copy?: string;
  buttonLabel?: string;
};

function CheckInGrowCard({
  canCreate,
  onCreate,
  loading = false,
  title = "Keep checking in",
  copy,
  buttonLabel = "New check-in",
}: CheckInGrowCardProps) {
  const defaultCopy = canCreate
    ? "Regular check-ins help track progress, share feedback, and follow up on goals."
    : "Check-ins will appear here once your manager records them.";

  return (
    <div className="enterprise-dev-plan-grow">
      <CheckInIllustration />
      <p className="enterprise-dev-plan-grow-title">{title}</p>
      <p className="enterprise-dev-plan-grow-copy">{copy ?? defaultCopy}</p>
      {canCreate && onCreate ? (
        <button
          type="button"
          className="enterprise-dev-plan-grow-btn"
          disabled={loading}
          onClick={onCreate}
        >
          {loading ? "Loading…" : buttonLabel}
        </button>
      ) : null}
    </div>
  );
}

function MeetingStatusBadge({ meeting }: { meeting: OneOnOneMeeting }) {
  if (meeting.status === "draft") {
    return (
      <span className="enterprise-oneone-status enterprise-oneone-status--draft" title="Draft">
        Draft
      </span>
    );
  }
  const status = getOneOnOneMeetingStatusFromMeeting(meeting);
  return (
    <span className={oneOnOneMeetingStatusClass(status)} title={oneOnOneMeetingStatusLabel(status)}>
      {oneOnOneMeetingStatusLabel(status)}
    </span>
  );
}

export function OneOnOneHistoryTab({
  teamId,
  memberUserId,
  memberName,
  managerName,
  leaderUserId,
  canCreate,
  canModify,
}: Props) {
  const [view, setView] = useState<View>("list");
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<OneOnOneTemplate | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<OneOnOneMeeting | null>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [previewMeeting, setPreviewMeeting] = useState<OneOnOneMeeting | null>(null);
  const [menuMeetingId, setMenuMeetingId] = useState<string | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<FollowUpDraft[]>([]);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [leaderCommentsNudgeOpen, setLeaderCommentsNudgeOpen] = useState(false);
  const [highlightLeaderFieldId, setHighlightLeaderFieldId] = useState<string | null>(null);
  const [userExpandedFullscreen, setUserExpandedFullscreen] = useState(false);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [prepAcknowledged, setPrepAcknowledged] = useState(false);
  const [senecaSummaryOpen, setSenecaSummaryOpen] = useState(false);
  const [senecaSummaryPayload, setSenecaSummaryPayload] = useState<{
    templateTitle: string;
    templateFields: OneOnOneTemplate["fields"];
    responses: Record<string, string | number>;
    followUpTasks: SenecaFollowUpSuggestion[];
  } | null>(null);
  const [senecaDevPlanOpen, setSenecaDevPlanOpen] = useState(false);
  const [senecaDevPlanDraft, setSenecaDevPlanDraft] = useState<SenecaDevelopmentGoalDraft | null>(null);
  const [senecaFocusedFieldId, setSenecaFocusedFieldId] = useState<string | null>(null);
  const [senecaPrep, setSenecaPrep] = useState<SenecaPrep | null>(null);
  const [senecaPrepLoading, setSenecaPrepLoading] = useState(false);
  const [senecaPrepErr, setSenecaPrepErr] = useState<string | null>(null);
  const compactCheckInLayout = useCompactCheckInLayout();
  const checkInFullscreen = compactCheckInLayout || userExpandedFullscreen;
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const resolveLeaderUserId = (meeting?: OneOnOneMeeting | null) =>
    leaderUserId ?? meeting?.createdById ?? null;

  const buildFollowUpPayload = (meeting?: OneOnOneMeeting | null): OneOnOneFollowUpTaskInput[] => {
    const leaderId = resolveLeaderUserId(meeting);
    return followUpDrafts
      .map((draft) => ({
        draft,
        title: draft.title.trim(),
      }))
      .filter((item) => item.title.length > 0)
      .map(({ draft, title }) => {
        const dueDate = dueDateInputToIso(draft.dueDate);
        return {
          title,
          assigneeUserId: draft.assigneeRole === "associate" ? memberUserId : leaderId ?? memberUserId,
          ...(dueDate ? { dueDate } : {}),
        };
      });
  };

  const loadMeetings = useCallback(async () => {
    if (!teamId || !memberUserId) return;
    setLoadingMeetings(true);
    setErr(null);
    try {
      const list = await fetchOneOnOneMeetings(teamId, memberUserId);
      setMeetings(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load check-in history.");
    } finally {
      setLoadingMeetings(false);
    }
  }, [memberUserId, teamId]);

  useEffect(() => {
    void loadMeetings();
  }, [loadMeetings]);

  useEffect(() => {
    setView("list");
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setErr(null);
    setTemplates([]);
  }, [memberUserId, teamId]);

  const startCreate = useCallback(async () => {
    if (!teamId) {
      setErr("No workspace selected.");
      return;
    }
    setErr(null);
    setEditingMeeting(null);
    setLoadingTemplates(true);
    setView("pick");
    try {
      const list = await fetchOneOnOneTemplates(teamId);
      setTemplates(list);
      if (list.length === 0) {
        setErr("No check-in templates yet. The workspace owner can create templates from the Team page.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [teamId]);

  const pickTemplate = (template: OneOnOneTemplate) => {
    const fields = appendLeaderCommentsIfMissing(template.fields);
    const withLeaderComments = { ...template, fields };
    setSelectedTemplate(withLeaderComments);
    setEditingMeeting(null);
    const initial: Record<string, string | number> = {};
    for (const field of fields) {
      if (field.type === "section") continue;
      if (field.type === "rating") initial[field.id] = 0;
      else initial[field.id] = "";
    }
    setResponses(initial);
    setFollowUpDrafts([newFollowUpDraft()]);
    setPrepAcknowledged(false);
    setSenecaPrep(null);
    setSenecaPrepErr(null);
    setSenecaPrepLoading(false);
    setErr(null);
    setView("fill");
  };

  useEffect(() => {
    if (view !== "fill" || !selectedTemplate || !canCreate || editingMeeting) return;

    let cancelled = false;
    setSenecaPrepLoading(true);
    setSenecaPrepErr(null);
    void fetchSenecaPrep(teamId, memberUserId, {
      templateId: selectedTemplate.id,
      memberName,
      managerName,
    })
      .then((res) => {
        if (!cancelled) setSenecaPrep(res.prep);
      })
      .catch((e) => {
        if (!cancelled) {
          setSenecaPrepErr(e instanceof Error ? e.message : "Could not load Seneca prep.");
          setSenecaPrep(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSenecaPrepLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [view, selectedTemplate?.id, teamId, memberUserId, memberName, managerName, canCreate, editingMeeting]);

  useEffect(() => {
    if (!menuMeetingId) return;
    const closeMenu = () => setMenuMeetingId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuMeetingId]);

  useEffect(() => {
    if (view === "list") setUserExpandedFullscreen(false);
  }, [view]);

  useEffect(() => {
    if (!checkInFullscreen || (view !== "fill" && view !== "pick")) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [checkInFullscreen, view]);

  type CheckInShellConfig = {
    title: string;
    subtitle?: string;
    onBack: () => void;
    backLabel: string;
    footer?: ReactNode;
    headerAside?: ReactNode;
  };

  const renderCheckInShell = (content: ReactNode, config: CheckInShellConfig) => {
    const { title, subtitle, onBack, backLabel, footer, headerAside } = config;
    const footerNode = footer ?? null;

    if (checkInFullscreen) {
      return createPortal(
        <div className="enterprise-oneone-fill-overlay enterprise-oneone-checkin-open" role="dialog" aria-modal="true" aria-label={title}>
          <header className="enterprise-oneone-fill-header">
            <div className="enterprise-oneone-fill-header-toolbar">
              <button type="button" className="enterprise-oneone-fill-header-back" onClick={onBack}>
                ← {backLabel}
              </button>
              {!compactCheckInLayout ? (
                <button
                  type="button"
                  className="enterprise-oneone-fill-expand-btn"
                  onClick={() => setUserExpandedFullscreen(false)}
                >
                  Exit full screen
                </button>
              ) : null}
            </div>
            <div className="enterprise-oneone-fill-header-main">
              <div className="enterprise-oneone-fill-header-text">
                <h2 className="enterprise-oneone-fill-header-title">{title}</h2>
                {subtitle ? <p className="enterprise-muted enterprise-oneone-fill-header-sub">{subtitle}</p> : null}
              </div>
              {headerAside ? <div className="enterprise-oneone-fill-header-aside">{headerAside}</div> : null}
            </div>
          </header>
          <div className="enterprise-oneone-fill-body">{content}</div>
          {footerNode ? <footer className="enterprise-oneone-fill-footer">{footerNode}</footer> : null}
        </div>,
        document.body,
      );
    }

    return (
      <div className="enterprise-oneone-history enterprise-oneone-checkin-open">
        <div className="enterprise-oneone-fill-inline-head">
          <button type="button" className="enterprise-oneone-history-back" onClick={onBack}>
            ← {backLabel}
          </button>
          <div className="enterprise-oneone-fill-inline-head-row">
            <div className="enterprise-oneone-fill-inline-head-text">
              <h3 className="enterprise-oneone-history-heading">{title}</h3>
              {subtitle ? <p className="enterprise-muted enterprise-oneone-history-sub">{subtitle}</p> : null}
            </div>
            <div className="enterprise-oneone-fill-inline-head-actions">
              {headerAside}
              <button
                type="button"
                className="enterprise-oneone-fill-expand-btn"
                onClick={() => setUserExpandedFullscreen(true)}
              >
                Full screen
              </button>
            </div>
          </div>
        </div>
        {content}
        {footerNode}
      </div>
    );
  };

  const startEdit = (meeting: OneOnOneMeeting) => {
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setEditingMeeting(meeting);
    setSelectedTemplate(meetingToFillTemplate(meeting));
    setResponses({ ...meeting.responses });
    setFollowUpDrafts([]);
    setPrepAcknowledged(true);
    setErr(null);
    setView("fill");
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
    if (highlightLeaderFieldId === fieldId && String(value).trim()) {
      setHighlightLeaderFieldId(null);
    }
  };

  const normalizeResponses = (fields: OneOnOneTemplateField[]) => {
    const normalized: Record<string, string | number> = {};
    for (const field of fields) {
      if (field.type === "section" || field.type === "associate_notes") continue;
      const raw = responses[field.id];
      if (field.type === "rating") {
        normalized[field.id] = typeof raw === "number" ? raw : Number(raw) || 0;
      } else {
        normalized[field.id] = typeof raw === "string" ? raw : String(raw ?? "");
      }
    }
    return normalized;
  };

  const performSave = async (requestAssociateFeedback: boolean) => {
    if (!selectedTemplate) return;
    setFeedbackPromptOpen(false);
    setSaving(true);
    setErr(null);
    try {
      const normalized = normalizeResponses(selectedTemplate.fields);
      const followUpTasks = buildFollowUpPayload(editingMeeting);
      const payload = {
        responses: normalized,
        followUpTasks,
        requestAssociateFeedback,
        status: "published" as const,
      };
      if (editingMeeting) {
        await updateOneOnOneMeeting(teamId, memberUserId, editingMeeting.id, payload);
      } else {
        await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          ...payload,
        });
      }
      await loadMeetings();
      if (canCreate) {
        setSenecaSummaryPayload({
          templateTitle: selectedTemplate.title,
          templateFields: selectedTemplate.fields,
          responses: normalized,
          followUpTasks: followUpTasks.map((t) => ({
            title: t.title,
            assigneeRole: t.assigneeUserId === memberUserId ? "associate" : "leader",
          })),
        });
        setSenecaSummaryOpen(true);
        setSelectedTemplate(null);
        setEditingMeeting(null);
        setResponses({});
        setFollowUpDrafts([]);
        setListNotice(null);
      } else {
        finishCheckInToList();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  };

  const performSaveDraft = async () => {
    if (!selectedTemplate || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const normalized = normalizeResponses(selectedTemplate.fields);
      const payload = { responses: normalized, status: "draft" as const };
      if (editingMeeting) {
        await updateOneOnOneMeeting(teamId, memberUserId, editingMeeting.id, payload);
      } else {
        await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          ...payload,
        });
      }
      await loadMeetings();
      setView("list");
      setSelectedTemplate(null);
      setEditingMeeting(null);
      setResponses({});
      setFollowUpDrafts([]);
      setListNotice("Draft saved. Reopen it from the list when you're ready to publish.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save draft.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveClick = () => {
    if (!selectedTemplate || saving) return;
    if (canCreate && isLeaderCommentsEmpty(selectedTemplate.fields, responses)) {
      setLeaderCommentsNudgeOpen(true);
      return;
    }
    setFeedbackPromptOpen(true);
  };

  const onAddLeaderNotesFromNudge = () => {
    if (!selectedTemplate) return;
    const leaderField = findLeaderCommentsField(selectedTemplate.fields);
    setLeaderCommentsNudgeOpen(false);
    if (!leaderField) return;
    setHighlightLeaderFieldId(leaderField.id);
    window.setTimeout(() => {
      document.getElementById(`check-in-field-${leaderField.id}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 50);
  };

  const onContinueWithoutLeaderNotes = () => {
    setLeaderCommentsNudgeOpen(false);
    setFeedbackPromptOpen(true);
  };

  const onSaveDraftClick = () => {
    void performSaveDraft();
  };

  const renderLeaderCommentsNudgeModal = () => {
    if (!leaderCommentsNudgeOpen) return null;
    return (
      <div
        className="enterprise-modal-backdrop enterprise-oneone-feedback-prompt-backdrop"
        role="presentation"
        onClick={() => setLeaderCommentsNudgeOpen(false)}
      >
        <div
          className="enterprise-modal-sheet enterprise-oneone-feedback-prompt-modal"
          role="dialog"
          aria-labelledby="oneone-leader-notes-nudge-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="oneone-leader-notes-nudge-title" className="enterprise-oneone-feedback-prompt-title">
            {LEADER_COMMENTS_NUDGE_TITLE}
          </h2>
          <p className="enterprise-oneone-feedback-prompt-copy">{LEADER_COMMENTS_NUDGE_COPY}</p>
          <div className="enterprise-oneone-feedback-prompt-actions">
            <button
              type="button"
              className="enterprise-profile-cancel-btn"
              disabled={saving}
              onClick={onContinueWithoutLeaderNotes}
            >
              Continue without notes
            </button>
            <button
              type="button"
              className="enterprise-oneone-templates-primary-btn"
              disabled={saving}
              onClick={onAddLeaderNotesFromNudge}
            >
              Add leader notes
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderFeedbackPromptModal = () => {
    if (!feedbackPromptOpen) return null;
    return (
      <div
        className="enterprise-modal-backdrop enterprise-oneone-feedback-prompt-backdrop"
        role="presentation"
        onClick={() => setFeedbackPromptOpen(false)}
      >
        <div
          className="enterprise-modal-sheet enterprise-oneone-feedback-prompt-modal"
          role="dialog"
          aria-labelledby="oneone-feedback-prompt-title"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="oneone-feedback-prompt-title" className="enterprise-oneone-feedback-prompt-title">
            Request feedback?
          </h2>
          <p className="enterprise-oneone-feedback-prompt-copy">
            Request associate feedback and commitments from <strong>{memberName}</strong>?
          </p>
          <p className="enterprise-muted enterprise-oneone-feedback-prompt-sub">
            If yes, they&apos;ll get a gentle nudge to add their takeaways or skip for now.
          </p>
          <div className="enterprise-oneone-feedback-prompt-actions">
            <button
              type="button"
              className="enterprise-profile-cancel-btn"
              disabled={saving}
              onClick={() => void performSave(false)}
            >
              No
            </button>
            <button
              type="button"
              className="enterprise-oneone-templates-primary-btn"
              disabled={saving}
              onClick={() => void performSave(true)}
            >
              {saving ? "Saving…" : "Yes"}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const onDelete = async (meeting: OneOnOneMeeting) => {
    if (!window.confirm(`Delete this check-in from ${formatMeetingDate(meeting.createdAt)}? This cannot be undone.`)) {
      return;
    }
    setErr(null);
    try {
      await deleteOneOnOneMeeting(teamId, memberUserId, meeting.id);
      if (previewMeeting?.id === meeting.id) setPreviewMeeting(null);
      if (menuMeetingId === meeting.id) setMenuMeetingId(null);
      if (editingMeeting?.id === meeting.id) {
        setEditingMeeting(null);
        setSelectedTemplate(null);
        setView("list");
      }
      await loadMeetings();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete check-in.");
    }
  };

  const onPrint = (meeting: OneOnOneMeeting) => {
    if (!canPrintCheckIn(meeting)) {
      setErr("Publish this check-in before printing.");
      return;
    }
    try {
      printOneOnOneMeeting({
        meeting,
        memberName,
        managerName,
        meetingNumber: meetingNumberFor(meetings, meeting.id),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open print view.");
    }
  };

  const renderFieldInput = (field: OneOnOneTemplateField) => {
    const value = responses[field.id] ?? "";
    const isLong = field.type === "long_text" || field.type === "manager_notes";

    if (field.type === "rating") {
      const max = field.ratingMax ?? 5;
      const current = typeof value === "number" ? value : Number(value) || 0;
      return (
        <div className="enterprise-oneone-rating-row">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={`enterprise-oneone-rating-btn${current === n ? " enterprise-oneone-rating-btn--active" : ""}`}
              onClick={() => setFieldValue(field.id, n)}
            >
              {n}
            </button>
          ))}
        </div>
      );
    }

    if (field.type === "yes_no") {
      const current = String(value).toLowerCase();
      return (
        <div className="enterprise-oneone-yesno-row">
          {(["yes", "no"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`enterprise-oneone-yesno-btn${current === option ? " enterprise-oneone-yesno-btn--active" : ""}`}
              onClick={() => setFieldValue(field.id, option)}
            >
              {option === "yes" ? "Yes" : "No"}
            </button>
          ))}
        </div>
      );
    }

    if (isLong) {
      return (
        <AutoResizeTextarea
          className="auth-input enterprise-oneone-fill-textarea enterprise-oneone-fill-textarea--long"
          minRows={3}
          value={String(value)}
          onChange={(e) => setFieldValue(field.id, e.target.value)}
          onFocus={() => setSenecaFocusedFieldId(field.id)}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
        />
      );
    }

    return (
      <AutoResizeTextarea
        className="auth-input enterprise-oneone-fill-textarea enterprise-oneone-fill-textarea--short"
        minRows={1}
        value={String(value)}
        onChange={(e) => setFieldValue(field.id, e.target.value)}
        onFocus={() => setSenecaFocusedFieldId(field.id)}
        placeholder={`Enter ${field.label.toLowerCase()}…`}
      />
    );
  };

  const exitFill = () => {
    if (editingMeeting) {
      setView("list");
      setEditingMeeting(null);
      setSelectedTemplate(null);
    } else {
      setView("pick");
      setSelectedTemplate(null);
    }
    setFollowUpDrafts([]);
    setPrepAcknowledged(false);
    setSenecaPrep(null);
    setSenecaPrepErr(null);
    setSenecaPrepLoading(false);
    setErr(null);
  };

  const addFollowUpDraft = () => {
    setFollowUpDrafts((prev) => [...prev, newFollowUpDraft()]);
  };

  const updateFollowUpDraft = (id: string, patch: Partial<FollowUpDraft>) => {
    setFollowUpDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const removeFollowUpDraft = (id: string) => {
    setFollowUpDrafts((prev) => prev.filter((draft) => draft.id !== id));
  };

  const addSenecaFollowUpTasks = (tasks: SenecaFollowUpSuggestion[]) => {
    setFollowUpDrafts((prev) => [
      ...prev,
      ...tasks.map((t) => ({
        id: crypto.randomUUID(),
        title: t.title,
        assigneeRole: t.assigneeRole,
        dueDate: t.dueDate?.slice(0, 10) ?? "",
      })),
    ]);
  };

  const openSenecaDevPlan = (draft: SenecaDevelopmentGoalDraft) => {
    setSenecaDevPlanDraft(draft);
    setSenecaDevPlanOpen(true);
  };

  const finishCheckInToList = () => {
    setView("list");
    setSelectedTemplate(null);
    setEditingMeeting(null);
    setResponses({});
    setFollowUpDrafts([]);
    setListNotice(null);
    setSenecaSummaryOpen(false);
    setSenecaSummaryPayload(null);
  };

  const renderFollowUpTaskList = (tasks: NonNullable<OneOnOneMeeting["followUpTasks"]>) => (
    <div className="enterprise-oneone-followup-list">
      <h4 className="enterprise-oneone-followup-list-title">Follow-up tasks</h4>
      <ul className="enterprise-oneone-followup-items">
        {tasks.map((task) => {
          const dueLabel = formatFollowUpDueDate(task.dueDate);
          const isDone = task.status === "done";
          const statusLabel =
            task.status !== "todo" && !isDone ? ` · ${task.status.replace("_", " ")}` : "";
          return (
            <li key={task.id} className="enterprise-oneone-followup-item">
              <div className="enterprise-oneone-followup-item-body">
                <span className="enterprise-oneone-followup-item-title">{task.title}</span>
                <span className="enterprise-oneone-followup-item-meta">
                  Assigned to {assigneeDisplayName(task.assignee?.id, memberUserId, memberName, leaderUserId, managerName)}
                  {dueLabel ? ` · Due ${dueLabel}` : ""}
                  {statusLabel}
                </span>
              </div>
              <span
                className={`enterprise-oneone-followup-check${
                  isDone ? " enterprise-oneone-followup-check--done" : " enterprise-oneone-followup-check--open"
                }`}
                aria-label={isDone ? "Complete" : "Incomplete"}
                role="img"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );

  const renderMeetingPreviewBody = (meeting: OneOnOneMeeting) => {
    const groups = groupPreviewSections(meeting.templateFields);
    const associateAnswer = meeting.responses[ASSOCIATE_FEEDBACK_FIELD_ID];
    const showAssociateFeedback =
      (associateAnswer !== undefined && associateAnswer !== "" && associateAnswer !== 0) ||
      meeting.associateFeedbackPending;

    return (
      <>
        <div className="enterprise-oneone-preview-sections">
          {groups.map((group) => {
            const questions = group.fields
              .map((field) => renderPreviewQuestion(field, meeting.responses[field.id]))
              .filter(Boolean);
            if (questions.length === 0) return null;
            return (
              <section key={group.section.id} className="enterprise-oneone-preview-section-block">
                <h3 className="enterprise-oneone-preview-section-heading">{group.section.label}</h3>
                <div className="enterprise-oneone-preview-section-content">{questions}</div>
              </section>
            );
          })}
          {showAssociateFeedback ? (
            <section className="enterprise-oneone-preview-section-block">
              <h3 className="enterprise-oneone-preview-section-heading">{ASSOCIATE_FEEDBACK_LABEL}</h3>
              <div className="enterprise-oneone-preview-section-content">
                {associateAnswer !== undefined && associateAnswer !== "" && associateAnswer !== 0 ? (
                  <div className="enterprise-oneone-preview-question">
                    <div className="enterprise-oneone-preview-question-answer">
                      {formatAssociateResponseDisplay(associateAnswer)}
                    </div>
                  </div>
                ) : (
                  <div className="enterprise-oneone-preview-question">
                    <div className="enterprise-oneone-preview-question-answer enterprise-muted">
                      Awaiting associate feedback
                    </div>
                  </div>
                )}
              </div>
            </section>
          ) : null}
        </div>
        {meeting.followUpTasks?.length ? renderFollowUpTaskList(meeting.followUpTasks) : null}
      </>
    );
  };

  const renderMeetingPreviewModal = () => {
    if (!previewMeeting) return null;
    const meetingNum = meetingNumberFor(meetings, previewMeeting.id);
    return (
      <div
        className="enterprise-modal-backdrop enterprise-oneone-preview-backdrop"
        role="presentation"
        onClick={() => setPreviewMeeting(null)}
      >
        <div
          className="enterprise-modal-sheet enterprise-oneone-preview-modal"
          role="dialog"
          aria-label={`${previewMeeting.templateTitle} check-in`}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="enterprise-oneone-preview-header">
            <div className="enterprise-oneone-preview-header-text">
              <p className="enterprise-oneone-templates-kicker">Check-in</p>
              <h2 className="enterprise-oneone-preview-title">{previewMeeting.templateTitle}</h2>
              <p className="enterprise-oneone-preview-meta">
                {formatMeetingDate(previewMeeting.createdAt)} · Check-in #{meetingNum}
                {managerName ? ` · Manager: ${managerName}` : ""}
              </p>
              <div className="enterprise-oneone-preview-status">
                <MeetingStatusBadge meeting={previewMeeting} />
              </div>
            </div>
            <div className="enterprise-oneone-preview-header-actions">
              {canPrintCheckIn(previewMeeting) ? (
                <button
                  type="button"
                  className="enterprise-dev-plan-print-btn"
                  onClick={() => onPrint(previewMeeting)}
                >
                  Print
                </button>
              ) : null}
              <button
                type="button"
                className="enterprise-oneone-templates-close"
                aria-label="Close preview"
                onClick={() => setPreviewMeeting(null)}
              >
                ×
              </button>
            </div>
          </header>
          <div className="enterprise-oneone-preview-body">{renderMeetingPreviewBody(previewMeeting)}</div>
        </div>
      </div>
    );
  };

  if (view === "pick") {
    return renderCheckInShell(
      <>
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
        {loadingTemplates ? (
          <p className="enterprise-muted enterprise-oneone-history-loading">Loading templates…</p>
        ) : null}
        {!loadingTemplates && templates.length > 0 ? (
          <div className="enterprise-oneone-history-table-wrap">
            <div className="enterprise-oneone-history-table-head" aria-hidden>
              <span>Template</span>
              <span>Questions</span>
              <span />
            </div>
            <ul className="enterprise-oneone-template-pick-list">
              {templates.map((template) => {
                const questionCount = template.fields.filter((f) => f.type !== "section").length;
                return (
                  <li key={template.id}>
                    <button type="button" className="enterprise-oneone-template-pick-row" onClick={() => pickTemplate(template)}>
                      <span className="enterprise-oneone-template-pick-name">{template.title}</span>
                      <span className="enterprise-oneone-template-pick-meta">
                        {questionCount} question{questionCount !== 1 ? "s" : ""}
                      </span>
                      <span className="enterprise-oneone-template-pick-chevron" aria-hidden>▸</span>
                    </button>
                    {template.description ? (
                      <p className="enterprise-oneone-template-pick-desc">{template.description}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {!loadingTemplates && templates.length === 0 && !err ? (
          <CheckInGrowCard
            canCreate={false}
            title="No templates yet"
            copy="Ask your workspace owner to create check-in templates from the Team page."
          />
        ) : null}
      </>,
      {
        title: "Choose a template",
        subtitle: `Select a template to fill out for ${memberName}.`,
        backLabel: "Back to history",
        onBack: () => {
          setView("list");
          setErr(null);
        },
      },
    );
  }

  if (view === "fill" && selectedTemplate) {
    const sortedFields = [...selectedTemplate.fields].sort((a, b) => a.order - b.order);
    const existingFollowUps = editingMeeting?.followUpTasks ?? [];
    const leaderLabel = managerName ?? "Leader";
    const leaderPrepItems = (selectedTemplate.leaderPrep ?? []).map((item) => item.trim()).filter(Boolean);
    const showPrepGate = !editingMeeting && !prepAcknowledged && canCreate && leaderPrepItems.length > 0;

    if (showPrepGate) {
      return renderCheckInShell(
        <div className="seneca-checkin-layout seneca-checkin-layout--prep">
          <SenecaPrepCard
            teamId={teamId}
            memberUserId={memberUserId}
            memberName={memberName}
            managerName={managerName}
            templateId={selectedTemplate.id}
            templateLeaderPrep={leaderPrepItems}
            prep={senecaPrep}
            loading={senecaPrepLoading}
            err={senecaPrepErr}
          />
        </div>,
        {
          title: selectedTemplate.title,
          subtitle: `Before your check-in with ${memberName}${leaderPrepItems.length ? " · review Seneca prep below" : ""}`,
          backLabel: "Choose another template",
          onBack: exitFill,
          footer: (
            <div className="enterprise-oneone-fill-actions">
              <button
                type="button"
                className="enterprise-oneone-templates-primary-btn enterprise-oneone-fill-save"
                onClick={() => setPrepAcknowledged(true)}
                disabled={senecaPrepLoading}
              >
                Start check-in
              </button>
            </div>
          ),
        },
      );
    }

    const fillTitle = editingMeeting
      ? editingMeeting.status === "draft"
        ? "Resume editing"
        : "Edit check-in"
      : selectedTemplate.title;
    const fillSubtitle = editingMeeting
      ? `${selectedTemplate.title} · ${formatMeetingDate(editingMeeting.createdAt)}`
      : selectedTemplate.description ?? undefined;
    const showSaveDraft = !editingMeeting || editingMeeting.status === "draft";
    const publishLabel = editingMeeting?.status === "draft" ? "Publish check-in" : editingMeeting ? "Save changes" : "Save check-in";

    const senecaPanel = canCreate ? (
      <SenecaCheckInPanel
        teamId={teamId}
        memberUserId={memberUserId}
        memberName={memberName}
        managerName={managerName}
        template={selectedTemplate}
        responses={responses}
        focusFieldId={senecaFocusedFieldId}
        placement="header"
        onApplyText={(fieldId, text) => {
          setFieldValue(fieldId, text);
          setSenecaFocusedFieldId(fieldId);
          requestAnimationFrame(() => {
            document.getElementById(`check-in-field-${fieldId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
          });
        }}
        onAddFollowUpTasks={addSenecaFollowUpTasks}
        onSuggestDevelopmentGoal={openSenecaDevPlan}
      />
    ) : null;

    return renderCheckInShell(
      <>
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
        <div className="seneca-checkin-layout seneca-checkin-layout--wide">
          {canCreate && !editingMeeting ? (
            <SenecaPrepCard
              teamId={teamId}
              memberUserId={memberUserId}
              memberName={memberName}
              managerName={managerName}
              templateId={selectedTemplate.id}
              templateLeaderPrep={leaderPrepItems}
              prep={senecaPrep}
              loading={senecaPrepLoading}
              err={senecaPrepErr}
              compact
            />
          ) : null}
          <ul className="enterprise-oneone-fill-fields">
              {sortedFields.map((field) =>
                field.type === "associate_notes" ? null : field.type === "section" ? (
                  <li key={field.id} className="enterprise-oneone-fill-section">
                    <h4>{field.label}</h4>
                  </li>
                ) : (
                  <li
                    key={field.id}
                    id={`check-in-field-${field.id}`}
                    className={`enterprise-oneone-fill-field${
                      highlightLeaderFieldId === field.id ? " enterprise-oneone-fill-field--nudge" : ""
                    }`}
                  >
                    <label className="enterprise-oneone-fill-label">
                      {field.label}
                      {field.required ? <span className="enterprise-oneone-fill-required">Required</span> : null}
                      <span className="enterprise-oneone-fill-type">{fieldTypeLabel(field.type)}</span>
                    </label>
                    {field.helpText ? <p className="enterprise-muted enterprise-oneone-fill-help">{field.helpText}</p> : null}
                    {renderFieldInput(field)}
                  </li>
                ),
              )}
            </ul>
            <section className="enterprise-oneone-followup">
              <div className="enterprise-oneone-followup-head">
                <div>
                  <h4 className="enterprise-oneone-followup-title">Follow-up tasks</h4>
                  <p className="enterprise-muted enterprise-oneone-followup-sub">
                    Optional. Creates real workspace tasks assigned to the leader or associate.
                  </p>
                </div>
                <button type="button" className="enterprise-oneone-templates-pane-btn" onClick={addFollowUpDraft}>
                  Add task
                </button>
              </div>
              {existingFollowUps.length > 0 ? renderFollowUpTaskList(existingFollowUps) : null}
              {followUpDrafts.length > 0 ? (
                <ul className="enterprise-oneone-followup-drafts">
                  {followUpDrafts.map((draft) => (
                    <li key={draft.id} className="enterprise-oneone-followup-draft">
                      <input
                        type="text"
                        className="auth-input enterprise-oneone-followup-input"
                        value={draft.title}
                        onChange={(e) => updateFollowUpDraft(draft.id, { title: e.target.value })}
                        placeholder="Task title"
                        aria-label="Follow-up task title"
                      />
                      <select
                        className="auth-input enterprise-oneone-followup-select"
                        value={draft.assigneeRole}
                        onChange={(e) =>
                          updateFollowUpDraft(draft.id, {
                            assigneeRole: e.target.value as FollowUpDraft["assigneeRole"],
                          })
                        }
                        aria-label="Assign follow-up task to"
                      >
                        <option value="associate">Associate · {memberName}</option>
                        <option value="leader">Leader · {leaderLabel}</option>
                      </select>
                      <input
                        type="date"
                        className="auth-input enterprise-oneone-followup-date"
                        value={draft.dueDate}
                        onChange={(e) => updateFollowUpDraft(draft.id, { dueDate: e.target.value })}
                        aria-label="Follow-up task due date"
                      />
                      <button
                        type="button"
                        className="enterprise-oneone-templates-table-action enterprise-oneone-templates-table-action--danger"
                        onClick={() => removeFollowUpDraft(draft.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : existingFollowUps.length === 0 && followUpDrafts.length === 0 ? (
                <p className="enterprise-muted enterprise-oneone-followup-empty">No follow-up tasks yet.</p>
              ) : null}
            </section>
        </div>
        {renderLeaderCommentsNudgeModal()}
        {renderFeedbackPromptModal()}
      </>,
      {
        title: fillTitle,
        subtitle: fillSubtitle,
        backLabel: editingMeeting ? "Back to history" : "Choose another template",
        onBack: exitFill,
        headerAside: senecaPanel,
        footer: (
          <div className="enterprise-oneone-fill-actions enterprise-oneone-fill-actions--multi">
            <button type="button" className="enterprise-profile-cancel-btn" disabled={saving} onClick={() => setView("list")}>
              Cancel
            </button>
            {showSaveDraft ? (
              <button
                type="button"
                className="enterprise-oneone-fill-draft-btn"
                disabled={saving}
                onClick={onSaveDraftClick}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
            ) : null}
            <button
              type="button"
              className="enterprise-oneone-templates-primary-btn enterprise-oneone-fill-save"
              disabled={saving}
              onClick={onSaveClick}
            >
              {saving ? "Saving…" : publishLabel}
            </button>
          </div>
        ),
      },
    );
  }

  return (
    <div className="enterprise-oneone-history enterprise-oneone-history--scrollable">
      <div className="enterprise-dev-plan-head">
        <div>
          <h3 className="enterprise-team-profile-section-title">Check-in history</h3>
          <p className="enterprise-muted enterprise-dev-plan-sub">
            Recorded manager check-ins for this team member.
          </p>
        </div>
        {canCreate ? (
          <div className="enterprise-dev-plan-head-actions">
            <button
              type="button"
              className="enterprise-dev-plan-new-btn"
              disabled={loadingTemplates}
              onClick={() => void startCreate()}
            >
              {loadingTemplates ? "Loading…" : "New check-in"}
            </button>
          </div>
        ) : null}
      </div>
      {listNotice ? (
        <p className="enterprise-oneone-history-notice" role="status">
          {listNotice}
        </p>
      ) : null}
      {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
      {loadingMeetings && meetings.length === 0 ? (
        <p className="enterprise-muted enterprise-oneone-history-loading">Loading check-ins…</p>
      ) : null}
      {!loadingMeetings && meetings.length === 0 ? (
        <CheckInGrowCard
          canCreate={canCreate}
          loading={loadingTemplates}
          onCreate={() => void startCreate()}
        />
      ) : null}
      {meetings.length > 0 ? (
        <div className="enterprise-oneone-history-table-wrap">
          <div className="enterprise-oneone-history-table-head" aria-hidden>
            <span>Check-in</span>
            <span className="enterprise-oneone-history-table-actions-col">Actions</span>
          </div>
          <ul className="enterprise-oneone-history-list">
            {meetings.map((meeting) => {
              const overdueCount = countOverdueFollowUpTasks(meeting.followUpTasks, todayStart);
              return (
              <li
                key={meeting.id}
                className={`enterprise-oneone-history-item${
                  menuMeetingId === meeting.id ? " enterprise-oneone-history-item--menu-open" : ""
                }`}
              >
                <div className="enterprise-oneone-history-row">
                  <button
                    type="button"
                    className="enterprise-oneone-history-row-main"
                    onClick={() => {
                      setMenuMeetingId(null);
                      setPreviewMeeting(meeting);
                    }}
                  >
                    <span className="enterprise-oneone-history-item-title">{meeting.templateTitle}</span>
                    {overdueCount > 0 ? (
                      <span
                        className="enterprise-team-roster-overdue enterprise-oneone-history-overdue"
                        title={`${overdueCount} overdue task${overdueCount !== 1 ? "s" : ""}`}
                      >
                        {overdueCount} overdue
                      </span>
                    ) : null}
                    <span className="enterprise-oneone-history-item-date">{formatMeetingDate(meeting.createdAt)}</span>
                    <MeetingStatusBadge meeting={meeting} />
                  </button>
                  <div className="enterprise-oneone-history-row-menu-wrap">
                    <button
                      type="button"
                      className="enterprise-oneone-history-row-menu-btn"
                      aria-label={`Actions for ${meeting.templateTitle}`}
                      aria-expanded={menuMeetingId === meeting.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuMeetingId((current) => (current === meeting.id ? null : meeting.id));
                      }}
                    >
                      Actions ▾
                    </button>
                    {menuMeetingId === meeting.id ? (
                      <div className="enterprise-oneone-history-row-menu" role="menu">
                        {canPrintCheckIn(meeting) ? (
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMenuMeetingId(null);
                              onPrint(meeting);
                            }}
                          >
                            Print
                          </button>
                        ) : null}
                        {canModify ? (
                          <>
                            <button
                              type="button"
                              role="menuitem"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEdit(meeting);
                              }}
                            >
                              {checkInEditMenuLabel(meeting)}
                            </button>
                            <button
                              type="button"
                              role="menuitem"
                              className="enterprise-oneone-history-row-menu-danger"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuMeetingId(null);
                                void onDelete(meeting);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {!loadingMeetings && meetings.length > 0 && canCreate ? (
        <CheckInGrowCard
          canCreate
          loading={loadingTemplates}
          onCreate={() => void startCreate()}
        />
      ) : null}
      {renderMeetingPreviewModal()}
      {senecaSummaryOpen && senecaSummaryPayload ? (
        <SenecaSummaryModal
          open={senecaSummaryOpen}
          teamId={teamId}
          memberUserId={memberUserId}
          memberName={memberName}
          managerName={managerName}
          templateTitle={senecaSummaryPayload.templateTitle}
          templateFields={senecaSummaryPayload.templateFields}
          responses={senecaSummaryPayload.responses}
          followUpTasks={senecaSummaryPayload.followUpTasks}
          onClose={finishCheckInToList}
          onAddFollowUpTasks={() => {
            /* saved check-in already published; suggestions are for manager reference */
          }}
          onCreateDevelopmentGoal={openSenecaDevPlan}
        />
      ) : null}
      {senecaDevPlanOpen ? (
        <DevelopmentPlanGenerator
          teamId={teamId}
          memberUserId={memberUserId}
          memberName={memberName}
          managerName={managerName}
          initialDraft={senecaDevPlanDraft}
          onCreated={() => void loadMeetings()}
          onClose={() => {
            setSenecaDevPlanOpen(false);
            setSenecaDevPlanDraft(null);
          }}
        />
      ) : null}
    </div>
  );
}
