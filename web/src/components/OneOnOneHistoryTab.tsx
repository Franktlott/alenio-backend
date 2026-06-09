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
} from "../lib/api";
import { meetingNumberFor, printOneOnOneMeeting } from "../lib/one-on-one-print";

const FIELD_TYPE_LABELS: Record<string, string> = {
  section: "Section",
  short_text: "Short answer",
  long_text: "Long answer",
  rating: "Rating",
  manager_notes: "Manager notes",
  associate_notes: "Associate notes",
};

function fieldTypeLabel(type: string): string {
  return FIELD_TYPE_LABELS[type] ?? type;
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
  canCreate: boolean;
  canModify: boolean;
  createTrigger?: number;
};

type View = "list" | "pick" | "fill";

export function OneOnOneHistoryTab({
  teamId,
  memberUserId,
  memberName,
  managerName,
  canCreate,
  canModify,
  createTrigger = 0,
}: Props) {
  const [view, setView] = useState<View>("list");
  const [meetings, setMeetings] = useState<OneOnOneMeeting[]>([]);
  const [templates, setTemplates] = useState<OneOnOneTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<OneOnOneTemplate | null>(null);
  const [editingMeeting, setEditingMeeting] = useState<OneOnOneMeeting | null>(null);
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loadingMeetings, setLoadingMeetings] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadMeetings = useCallback(async () => {
    if (!teamId || !memberUserId) return;
    setLoadingMeetings(true);
    setErr(null);
    try {
      const list = await fetchOneOnOneMeetings(teamId, memberUserId);
      setMeetings(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load 1:1 history.");
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
    setExpandedId(null);
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
        setErr("No 1:1 templates yet. The workspace owner can create templates from the Team page.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (createTrigger > 0 && canCreate) {
      void startCreate();
    }
  }, [createTrigger, canCreate, startCreate]);

  const pickTemplate = (template: OneOnOneTemplate) => {
    setSelectedTemplate(template);
    setEditingMeeting(null);
    const initial: Record<string, string | number> = {};
    for (const field of template.fields) {
      if (field.type === "section") continue;
      if (field.type === "rating") initial[field.id] = 0;
      else initial[field.id] = "";
    }
    setResponses(initial);
    setErr(null);
    setView("fill");
  };

  const startEdit = (meeting: OneOnOneMeeting) => {
    setEditingMeeting(meeting);
    setSelectedTemplate(meetingToFillTemplate(meeting));
    setResponses({ ...meeting.responses });
    setErr(null);
    setView("fill");
  };

  const setFieldValue = (fieldId: string, value: string | number) => {
    setResponses((prev) => ({ ...prev, [fieldId]: value }));
  };

  const normalizeResponses = (fields: OneOnOneTemplateField[]) => {
    const normalized: Record<string, string | number> = {};
    for (const field of fields) {
      if (field.type === "section") continue;
      const raw = responses[field.id];
      if (field.type === "rating") {
        normalized[field.id] = typeof raw === "number" ? raw : Number(raw) || 0;
      } else {
        normalized[field.id] = typeof raw === "string" ? raw : String(raw ?? "");
      }
    }
    return normalized;
  };

  const onSave = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    setErr(null);
    try {
      const normalized = normalizeResponses(selectedTemplate.fields);
      if (editingMeeting) {
        await updateOneOnOneMeeting(teamId, memberUserId, editingMeeting.id, { responses: normalized });
      } else {
        await createOneOnOneMeeting(teamId, memberUserId, {
          templateId: selectedTemplate.id,
          responses: normalized,
        });
      }
      await loadMeetings();
      setView("list");
      setSelectedTemplate(null);
      setEditingMeeting(null);
      setResponses({});
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save 1:1.");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (meeting: OneOnOneMeeting) => {
    if (!window.confirm(`Delete this 1:1 from ${formatMeetingDate(meeting.createdAt)}? This cannot be undone.`)) {
      return;
    }
    setErr(null);
    try {
      await deleteOneOnOneMeeting(teamId, memberUserId, meeting.id);
      if (expandedId === meeting.id) setExpandedId(null);
      if (editingMeeting?.id === meeting.id) {
        setEditingMeeting(null);
        setSelectedTemplate(null);
        setView("list");
      }
      await loadMeetings();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete 1:1.");
    }
  };

  const onPrint = (meeting: OneOnOneMeeting) => {
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
    const isLong =
      field.type === "long_text" || field.type === "manager_notes" || field.type === "associate_notes";

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
    setErr(null);
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
        <h3 className="enterprise-oneone-history-heading">Choose a template</h3>
        <p className="enterprise-muted enterprise-oneone-history-sub">
          Select a 1:1 template to fill out for {memberName}.
        </p>
        {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
        {loadingTemplates ? (
          <p className="enterprise-muted enterprise-oneone-history-loading">Loading templates…</p>
        ) : null}
        {!loadingTemplates && templates.length > 0 ? (
          <ul className="enterprise-oneone-template-pick-list">
            {templates.map((template) => (
              <li key={template.id}>
                <button type="button" className="enterprise-oneone-template-pick-card" onClick={() => pickTemplate(template)}>
                  <strong>{template.title}</strong>
                  {template.description ? <span className="enterprise-muted">{template.description}</span> : null}
                  <span className="enterprise-muted">
                    {template.fields.filter((f) => f.type !== "section").length} question
                    {template.fields.filter((f) => f.type !== "section").length !== 1 ? "s" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {!loadingTemplates && templates.length === 0 && !err ? (
          <div className="enterprise-oneone-history-empty-card">
            <p className="enterprise-oneone-history-empty-title">No templates available</p>
            <p className="enterprise-muted">
              Ask your workspace owner to create 1:1 templates from the Team page.
            </p>
          </div>
        ) : null}
      </div>
    );
  }

  if (view === "fill" && selectedTemplate) {
    const sortedFields = [...selectedTemplate.fields].sort((a, b) => a.order - b.order);
    return (
      <div className="enterprise-oneone-history">
        <button type="button" className="enterprise-oneone-history-back" onClick={exitFill}>
          ← {editingMeeting ? "Back to history" : "Choose another template"}
        </button>
        <h3 className="enterprise-oneone-history-heading">
          {editingMeeting ? "Edit 1:1" : selectedTemplate.title}
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
            field.type === "section" ? (
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
        <div className="enterprise-oneone-fill-actions">
          <button type="button" className="enterprise-profile-cancel-btn" disabled={saving} onClick={() => setView("list")}>
            Cancel
          </button>
          <button type="button" className="auth-submit enterprise-oneone-fill-save" disabled={saving} onClick={() => void onSave()}>
            {saving ? "Saving…" : editingMeeting ? "Save changes" : "Save 1:1"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="enterprise-oneone-history">
      <div className="enterprise-oneone-history-head">
        <h3 className="enterprise-oneone-history-heading">1:1 history</h3>
        {canCreate ? (
          <button
            type="button"
            className="auth-submit enterprise-oneone-history-new-btn"
            disabled={loadingTemplates}
            onClick={() => void startCreate()}
          >
            {loadingTemplates ? "Loading…" : "+ New 1:1"}
          </button>
        ) : null}
      </div>
      {err ? <p className="enterprise-form-error" role="alert">{err}</p> : null}
      {loadingMeetings && meetings.length === 0 ? (
        <p className="enterprise-muted enterprise-oneone-history-loading">Loading…</p>
      ) : null}
      {!loadingMeetings && meetings.length === 0 ? (
        <p className="enterprise-muted enterprise-oneone-history-empty">
          No 1:1s recorded yet.
          {canCreate ? " Start one with a template." : ""}
        </p>
      ) : null}
      {meetings.length > 0 ? (
        <ul className="enterprise-oneone-history-list">
          {meetings.map((meeting) => {
            const isOpen = expandedId === meeting.id;
            const fields = [...meeting.templateFields].sort((a, b) => a.order - b.order);
            return (
              <li key={meeting.id} className="enterprise-oneone-history-item">
                <button
                  type="button"
                  className="enterprise-oneone-history-item-head"
                  onClick={() => setExpandedId(isOpen ? null : meeting.id)}
                >
                  <span>
                    <strong>{meeting.templateTitle}</strong>
                    <span className="enterprise-muted">{formatMeetingDate(meeting.createdAt)}</span>
                  </span>
                  <span className="enterprise-oneone-history-item-chevron" aria-hidden>{isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen ? (
                  <>
                    <div className="enterprise-oneone-history-item-actions">
                      <button type="button" className="enterprise-oneone-history-action-btn" onClick={() => onPrint(meeting)}>
                        Print / PDF
                      </button>
                      {canModify ? (
                        <>
                          <button type="button" className="enterprise-oneone-history-action-btn" onClick={() => startEdit(meeting)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="enterprise-oneone-history-action-btn enterprise-oneone-history-action-btn--danger"
                            onClick={() => void onDelete(meeting)}
                          >
                            Delete
                          </button>
                        </>
                      ) : null}
                    </div>
                    <dl className="enterprise-oneone-history-responses">
                      {fields.map((field) => {
                        if (field.type === "section") {
                          return (
                            <div key={field.id} className="enterprise-oneone-history-section-label">
                              <dt>{field.label}</dt>
                            </div>
                          );
                        }
                        const answer = meeting.responses[field.id];
                        if (answer === undefined || answer === "" || answer === 0) return null;
                        return (
                          <div key={field.id}>
                            <dt>{field.label}</dt>
                            <dd>{String(answer)}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
