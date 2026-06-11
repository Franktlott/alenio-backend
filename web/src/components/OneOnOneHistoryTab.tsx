import { useCallback, useEffect, useState } from "react";
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
import { meetingNumberFor, saveOneOnOneMeetingPdf } from "../lib/one-on-one-print";
import {
  ASSOCIATE_FEEDBACK_FIELD_ID,
  ASSOCIATE_FEEDBACK_LABEL,
  formatAssociateResponseDisplay,
} from "../lib/one-on-one-feedback";
import { appendLeaderCommentsIfMissing } from "../lib/check-in-leader-comments";
import {
  getOneOnOneMeetingStatusFromMeeting,
  oneOnOneMeetingStatusClass,
  oneOnOneMeetingStatusLabel,
} from "../lib/one-on-one-status";

const FIELD_TYPE_LABELS: Record<string, string> = {
  section: "Section",
  short_text: "Short answer",
  long_text: "Long answer",
  rating: "Rating",
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
  return (
    <div key={field.id} className="enterprise-oneone-preview-question">
      <div className="enterprise-oneone-preview-question-label">{field.label}</div>
      <div className="enterprise-oneone-preview-question-answer">{formatAssociateResponseDisplay(answer)}</div>
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

function MeetingStatusBadge({ meeting }: { meeting: OneOnOneMeeting }) {
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
  const [savingPdf, setSavingPdf] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [followUpDrafts, setFollowUpDrafts] = useState<FollowUpDraft[]>([]);
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);

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
    setErr(null);
    setView("fill");
  };

  useEffect(() => {
    if (!menuMeetingId) return;
    const closeMenu = () => setMenuMeetingId(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [menuMeetingId]);

  const startEdit = (meeting: OneOnOneMeeting) => {
    setPreviewMeeting(null);
    setMenuMeetingId(null);
    setEditingMeeting(meeting);
    setSelectedTemplate(meetingToFillTemplate(meeting));
    setResponses({ ...meeting.responses });
    setFollowUpDrafts([]);
    setErr(null);
    setView("fill");
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
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
      const payload = { responses: normalized, followUpTasks, requestAssociateFeedback };
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save check-in.");
    } finally {
      setSaving(false);
    }
  };

  const onSaveClick = () => {
    if (!selectedTemplate || saving) return;
    setFeedbackPromptOpen(true);
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
            If yes, they&apos;ll receive a task to share their notes or select &ldquo;No feedback entered&rdquo;.
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

  const onPrint = async (meeting: OneOnOneMeeting) => {
    setSavingPdf(true);
    setMenuMeetingId(null);
    setErr(null);
    try {
      await saveOneOnOneMeetingPdf({
        meeting,
        memberName,
        managerName,
        meetingNumber: meetingNumberFor(meetings, meeting.id),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save PDF.");
    } finally {
      setSavingPdf(false);
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

    if (isLong) {
      return (
        <textarea
          className="auth-input enterprise-oneone-fill-textarea"
          rows={4}
          value={String(value)}
          onChange={(e) => setFieldValue(field.id, e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
        />
      );
    }

    return (
      <input
        type="text"
        className="auth-input enterprise-oneone-fill-input"
        value={String(value)}
        onChange={(e) => setFieldValue(field.id, e.target.value)}
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

  const renderFollowUpTaskList = (tasks: NonNullable<OneOnOneMeeting["followUpTasks"]>) => (
    <div className="enterprise-oneone-followup-list">
      <h4 className="enterprise-oneone-followup-list-title">Follow-up tasks</h4>
      <ul className="enterprise-oneone-followup-items">
        {tasks.map((task) => {
          const dueLabel = formatFollowUpDueDate(task.dueDate);
          return (
            <li key={task.id} className="enterprise-oneone-followup-item">
              <span className="enterprise-oneone-followup-item-title">{task.title}</span>
              <span className="enterprise-oneone-followup-item-meta">
                Assigned to {assigneeDisplayName(task.assignee?.id, memberUserId, memberName, leaderUserId, managerName)}
                {dueLabel ? ` · Due ${dueLabel}` : ""}
                {task.status !== "todo" ? ` · ${task.status.replace("_", " ")}` : ""}
              </span>
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
              <button
                type="button"
                className="enterprise-dev-plan-print-btn"
                disabled={savingPdf}
                onClick={() => void onPrint(previewMeeting)}
              >
                {savingPdf ? "Saving…" : "Save PDF"}
              </button>
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
    return (
      <div className="enterprise-oneone-history">
        <button
          type="button"
          className="enterprise-oneone-history-back"
          onClick={() => {
            setView("list");
            setErr(null);
          }}
        >
          ← Back to history
        </button>
        <div className="enterprise-oneone-history-panel-head enterprise-oneone-history-panel-head--compact">
          <div className="enterprise-oneone-history-panel-head-text">
            <p className="enterprise-oneone-templates-kicker">New check-in</p>
            <h3 className="enterprise-oneone-history-heading">Choose a template</h3>
            <p className="enterprise-oneone-history-sub">Select a template to fill out for {memberName}.</p>
          </div>
        </div>
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
          <div className="enterprise-dev-plan-empty">
            <p className="enterprise-dev-plan-empty-title">No templates available</p>
            <p className="enterprise-muted">
              Ask your workspace owner to create check-in templates from the Team page.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "fill" && selectedTemplate) {
    const sortedFields = [...selectedTemplate.fields].sort((a, b) => a.order - b.order);
    const existingFollowUps = editingMeeting?.followUpTasks ?? [];
    const leaderLabel = managerName ?? "Leader";
    return (
      <div className="enterprise-oneone-history">
        <button type="button" className="enterprise-oneone-history-back" onClick={exitFill}>
          ← {editingMeeting ? "Back to history" : "Choose another template"}
        </button>
        <h3 className="enterprise-oneone-history-heading">
          {editingMeeting ? "Edit check-in" : selectedTemplate.title}
        </h3>
        {!editingMeeting && selectedTemplate.description ? (
          <p className="enterprise-muted enterprise-oneone-history-sub">{selectedTemplate.description}</p>
        ) : null}
        {editingMeeting ? (
          <p className="enterprise-muted enterprise-oneone-history-sub">
            {selectedTemplate.title} · {formatMeetingDate(editingMeeting.createdAt)}
          </p>
        ) : null}
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
        <ul className="enterprise-oneone-fill-fields">
          {sortedFields.map((field) =>
            field.type === "associate_notes" ? null : field.type === "section" ? (
              <li key={field.id} className="enterprise-oneone-fill-section">
                <h4>{field.label}</h4>
              </li>
            ) : (
              <li key={field.id} className="enterprise-oneone-fill-field">
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
        <div className="enterprise-oneone-fill-actions">
          <button type="button" className="enterprise-profile-cancel-btn" disabled={saving} onClick={() => setView("list")}>
            Cancel
          </button>
          <button
            type="button"
            className="enterprise-oneone-templates-primary-btn enterprise-oneone-fill-save"
            disabled={saving}
            onClick={onSaveClick}
          >
            {saving ? "Saving…" : editingMeeting ? "Save changes" : "Save check-in"}
          </button>
        </div>
        {renderFeedbackPromptModal()}
      </div>
    );
  }

  return (
    <div className="enterprise-oneone-history">
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
      {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
      {loadingMeetings && meetings.length === 0 ? (
        <p className="enterprise-muted enterprise-oneone-history-loading">Loading check-ins…</p>
      ) : null}
      {!loadingMeetings && meetings.length === 0 ? (
        <div className="enterprise-dev-plan-empty">
          <p className="enterprise-dev-plan-empty-title">No check-ins recorded yet</p>
          <p className="enterprise-muted">
            {canCreate ? "Start a check-in using a workspace template." : "Check-ins will appear here once recorded."}
          </p>
        </div>
      ) : null}
      {meetings.length > 0 ? (
        <div className="enterprise-oneone-history-table-wrap">
          <div className="enterprise-oneone-history-table-head" aria-hidden>
            <span>Check-in</span>
            <span className="enterprise-oneone-history-table-actions-col">Actions</span>
          </div>
          <ul className="enterprise-oneone-history-list">
            {meetings.map((meeting) => (
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
                        <button
                          type="button"
                          role="menuitem"
                          disabled={savingPdf}
                          onClick={(e) => {
                            e.stopPropagation();
                            void onPrint(meeting);
                          }}
                        >
                          {savingPdf ? "Saving…" : "Save PDF"}
                        </button>
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
                              Edit
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
            ))}
          </ul>
        </div>
      ) : null}
      {renderMeetingPreviewModal()}
    </div>
  );
}
