import { useEffect, useMemo, useState } from "react";
import {
  createWebTask,
  fetchTaskTemplates,
  saveTaskTemplate,
  uploadChatMedia,
  type TaskTemplate,
  type WebTeamDetail,
  type WebMeUser,
} from "../../lib/api";
import { recurrenceCountHint, recurrenceDurationUnit } from "../../lib/recurring-task";
import { resolveTimeZone } from "../../lib/timezone";

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

const STATUSES = [
  { label: "Open", value: "todo" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "done" },
] as const;

const RECURRENCE_TYPES = [
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Monthly", value: "monthly" },
] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Props = {
  open: boolean;
  teamId: string;
  teamDetail: WebTeamDetail | null;
  me: WebMeUser | null;
  myRole: string;
  initialDueDate?: string;
  onClose: () => void;
  onCreated: () => Promise<void>;
};

export function WorkspaceTaskCreateModal({
  open,
  teamId,
  teamDetail,
  me,
  myRole,
  initialDueDate,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isJoint, setIsJoint] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState("weekly");
  const [recurrenceCount, setRecurrenceCount] = useState("3");
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState(1);
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState(1);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitConfirmOpen, setSplitConfirmOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const isRegularMember = myRole === "member" || !myRole;
  const today = new Date().toISOString().slice(0, 10);

  const members = teamDetail?.members ?? [];

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("medium");
    setStatus("todo");
    setDueDate(initialDueDate ?? new Date().toISOString().slice(0, 10));
    setAssigneeIds(me?.id ? [me.id] : []);
    setIsJoint(false);
    setSubtasks([]);
    setNewSubtask("");
    setIsRecurring(false);
    setRecurrenceType("weekly");
    setRecurrenceCount("3");
    setRecurrenceDayOfWeek(1);
    setRecurrenceDayOfMonth(1);
    setAttachmentUrl(null);
    setError(null);
    setSplitConfirmOpen(false);
    setTemplatesOpen(false);
  }, [open, initialDueDate, me?.id]);

  useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    setTemplatesLoading(true);
    void fetchTaskTemplates(teamId)
      .then((list) => {
        if (!cancelled) setTemplates(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, teamId]);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) => {
      const next = prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId];
      if (next.length < 2) setIsJoint(false);
      return next;
    });
  };

  const applyTemplate = (template: TaskTemplate) => {
    setTitle(template.title);
    setDescription(template.description ?? "");
    setPriority(template.priority || "medium");
    setIsJoint(template.isJoint);
    setSubtasks(template.subtasks.map((s) => s.title));
    setAttachmentUrl(template.attachmentUrl);
    setIsRecurring(template.isRecurring);
    if (template.recurrenceType) setRecurrenceType(template.recurrenceType);
    if (template.recurrenceInterval) setRecurrenceCount(String(template.recurrenceInterval));
    if (template.recurrenceDaysOfWeek != null) setRecurrenceDayOfWeek(parseInt(template.recurrenceDaysOfWeek, 10) || 1);
    if (template.recurrenceDayOfMonth != null) setRecurrenceDayOfMonth(template.recurrenceDayOfMonth);
    setTemplatesOpen(false);
  };

  const submitCreate = async (forceJoint?: boolean) => {
    if (!title.trim()) {
      setError("Please enter a task title.");
      return;
    }
    if (assigneeIds.length === 0) {
      setError("Assign at least one teammate.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const userTimeZone = resolveTimeZone(me?.timezone);
      const dueIso = dueDate ? dueDate : null;
      await createWebTask({
        teamId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        dueDate: dueIso,
        timeZone: userTimeZone,
        assigneeIds,
        isJoint: forceJoint ?? isJoint,
        subtasks,
        attachmentUrl,
        recurrence: isRecurring
          ? {
              type: recurrenceType,
              occurrenceCount: parseInt(recurrenceCount, 10) || 1,
              daysOfWeek: recurrenceType === "weekly" ? String(recurrenceDayOfWeek) : undefined,
              dayOfMonth: recurrenceType === "monthly" ? recurrenceDayOfMonth : undefined,
            }
          : undefined,
      });
      await onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create task.");
    } finally {
      setSaving(false);
      setSplitConfirmOpen(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (assigneeIds.length >= 2 && !isJoint) {
      setSplitConfirmOpen(true);
      return;
    }
    void submitCreate();
  };

  const handlePickPhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      setError(null);
      try {
        const up = await uploadChatMedia(file);
        setAttachmentUrl(up.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Photo upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  const canSaveTemplate = useMemo(() => title.trim().length > 0, [title]);

  if (!open) return null;

  return (
    <>
      <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
        <div className="enterprise-task-modal enterprise-task-create-modal enterprise-workspace-create-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
          <header className="enterprise-task-modal-head enterprise-workspace-create-head">
            <div>
              <h3 className="enterprise-task-modal-title">Create task</h3>
              <p className="enterprise-muted">Assign work, set a due date, and optionally repeat it.</p>
            </div>
            <div className="enterprise-workspace-create-head-actions">
              <button type="button" className="enterprise-dashboard-btn-outline" onClick={() => setTemplatesOpen(true)}>
                Templates
              </button>
            </div>
          </header>

          <form className="create-task-form enterprise-workspace-create-form" onSubmit={handleSubmit}>
            <div className="enterprise-workspace-create-body">
            <label className="enterprise-muted enterprise-profile-label" htmlFor="create-task-title">
              Title
            </label>
            <input id="create-task-title" className="auth-input" value={title} onChange={(e) => setTitle(e.target.value)} required />

            <label className="enterprise-muted enterprise-profile-label" htmlFor="create-task-desc">
              Description
            </label>
            <textarea
              id="create-task-desc"
              className="auth-input create-task-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <div className="create-task-row">
              <div className="create-task-field">
                <label className="enterprise-muted enterprise-profile-label" htmlFor="create-task-due">
                  Due date
                </label>
                <input
                  id="create-task-due"
                  type="date"
                  className="auth-input"
                  value={dueDate}
                  min={isRegularMember ? today : undefined}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
              <div className="create-task-field">
                <label className="enterprise-muted enterprise-profile-label" htmlFor="create-task-priority">
                  Priority
                </label>
                <select id="create-task-priority" className="auth-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="create-task-field">
                <label className="enterprise-muted enterprise-profile-label" htmlFor="create-task-status">
                  Status
                </label>
                <select id="create-task-status" className="auth-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset className="create-task-fieldset">
              <legend className="enterprise-muted">Assignees</legend>
              {members.length === 0 ? (
                <p className="enterprise-muted">Loading team members…</p>
              ) : (
                <ul className="create-task-assignees">
                  {members.map((m) => (
                    <li key={m.userId}>
                      <label className="create-task-assignee-label">
                        <input type="checkbox" checked={assigneeIds.includes(m.userId)} onChange={() => toggleAssignee(m.userId)} />
                        {m.user.name ?? m.user.email ?? m.userId}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </fieldset>

            {assigneeIds.length >= 2 ? (
              <label className="create-task-checkbox-row">
                <input type="checkbox" checked={isJoint} onChange={(e) => setIsJoint(e.target.checked)} />
                Shared task for all assignees (joint subtasks)
              </label>
            ) : null}

            <section className="enterprise-workspace-recurrence-panel">
              <label className="create-task-checkbox-row">
                <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                Repeating task
              </label>
              {isRecurring ? (
                <div className="enterprise-workspace-recurrence-fields">
                  <div className="enterprise-workspace-recurrence-types">
                    {RECURRENCE_TYPES.map((r) => (
                      <button
                        key={r.value}
                        type="button"
                        className={`enterprise-workspace-recurrence-type${recurrenceType === r.value ? " enterprise-workspace-recurrence-type--active" : ""}`}
                        onClick={() => setRecurrenceType(r.value)}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <label className="enterprise-muted enterprise-profile-label">
                    Repeat for
                    <input
                      className="auth-input enterprise-workspace-recurrence-interval"
                      type="number"
                      min={1}
                      max={52}
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(e.target.value)}
                    />
                    {recurrenceDurationUnit(recurrenceType)}
                  </label>
                  <p className="enterprise-muted enterprise-workspace-recurrence-hint">
                    {recurrenceCountHint(recurrenceType)}
                  </p>
                  {recurrenceType === "weekly" ? (
                    <p className="enterprise-muted enterprise-workspace-recurrence-hint">On</p>
                  ) : null}
                  {recurrenceType === "weekly" ? (
                    <div className="enterprise-workspace-recurrence-weekdays">
                      {WEEKDAYS.map((label, index) => (
                        <button
                          key={label}
                          type="button"
                          className={`enterprise-workspace-recurrence-weekday${recurrenceDayOfWeek === index ? " enterprise-workspace-recurrence-weekday--active" : ""}`}
                          onClick={() => setRecurrenceDayOfWeek(index)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {recurrenceType === "monthly" ? (
                    <label className="enterprise-muted enterprise-profile-label">
                      Day of month
                      <input
                        className="auth-input enterprise-workspace-recurrence-interval"
                        type="number"
                        min={1}
                        max={31}
                        value={recurrenceDayOfMonth}
                        onChange={(e) => setRecurrenceDayOfMonth(parseInt(e.target.value, 10) || 1)}
                      />
                    </label>
                  ) : null}
                </div>
              ) : null}
            </section>

            <div className="create-task-subtasks">
              <h4 className="enterprise-card-title enterprise-card-title-spaced">Subtasks</h4>
              <ul className="create-task-subtask-list">
                {subtasks.map((st, i) => (
                  <li key={`${i}-${st}`} className="create-task-subtask-item">
                    <span>{st}</span>
                    <button type="button" className="create-task-subtask-remove" onClick={() => setSubtasks((s) => s.filter((_, idx) => idx !== i))}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <div className="create-task-subtask-add">
                <input
                  className="auth-input"
                  value={newSubtask}
                  placeholder="Add subtask"
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const trimmed = newSubtask.trim();
                      if (!trimmed) return;
                      setSubtasks((s) => [...s, trimmed]);
                      setNewSubtask("");
                    }
                  }}
                />
                <button
                  type="button"
                  className="auth-btn-secondary create-task-add-btn"
                  onClick={() => {
                    const trimmed = newSubtask.trim();
                    if (!trimmed) return;
                    setSubtasks((s) => [...s, trimmed]);
                    setNewSubtask("");
                  }}
                >
                  Add
                </button>
              </div>
            </div>

            <div className="enterprise-workspace-create-attachment">
              <button type="button" className="enterprise-dashboard-btn-outline" disabled={photoBusy} onClick={handlePickPhoto}>
                {photoBusy ? "Uploading…" : attachmentUrl ? "Change photo" : "Add photo"}
              </button>
              {attachmentUrl ? (
                <img src={attachmentUrl} alt="Task attachment preview" className="enterprise-workspace-create-attachment-preview" />
              ) : null}
            </div>

            {error ? (
              <p className="enterprise-form-error" role="alert">
                {error}
              </p>
            ) : null}
            </div>

            <div className="enterprise-task-modal-footer enterprise-workspace-create-footer">
              {canSaveTemplate ? (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                  disabled={saving}
                  onClick={() => {
                    void saveTaskTemplate(teamId, {
                      title: title.trim(),
                      description: description.trim() || null,
                      priority,
                      attachmentUrl,
                      subtasks: subtasks.map((st, order) => ({ title: st, order })),
                      isRecurring,
                      recurrenceType: isRecurring ? recurrenceType : null,
                      recurrenceInterval: isRecurring ? parseInt(recurrenceCount, 10) || 1 : null,
                      recurrenceDaysOfWeek: isRecurring && recurrenceType === "weekly" ? String(recurrenceDayOfWeek) : null,
                      recurrenceDayOfMonth: isRecurring && recurrenceType === "monthly" ? recurrenceDayOfMonth : null,
                      isJoint,
                    }).catch(() => undefined);
                  }}
                >
                  Save as template
                </button>
              ) : null}
              <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={saving}>
                {saving ? "Creating…" : "Create task"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {splitConfirmOpen ? (
        <div className="enterprise-task-modal-backdrop enterprise-task-prompt-backdrop" role="presentation" onClick={() => setSplitConfirmOpen(false)}>
          <div className="enterprise-task-prompt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="enterprise-task-prompt-title">Multiple assignees</h3>
            <p className="enterprise-task-prompt-copy">
              Create one shared joint task for everyone, or separate tasks for each assignee?
            </p>
            <div className="enterprise-task-prompt-actions enterprise-task-prompt-actions--stack">
              <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={saving} onClick={() => void submitCreate(true)}>
                Enable joint task
              </button>
              <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={saving} onClick={() => void submitCreate(false)}>
                Create {assigneeIds.length} separate tasks
              </button>
              <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={saving} onClick={() => setSplitConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {templatesOpen ? (
        <div className="enterprise-task-modal-backdrop enterprise-task-prompt-backdrop" role="presentation" onClick={() => setTemplatesOpen(false)}>
          <div className="enterprise-task-prompt-modal enterprise-workspace-templates-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="enterprise-task-prompt-title">Task templates</h3>
            {templatesLoading ? <p className="enterprise-muted">Loading…</p> : null}
            {!templatesLoading && templates.length === 0 ? <p className="enterprise-muted">No saved templates yet.</p> : null}
            <ul className="enterprise-workspace-template-list">
              {templates.map((template) => (
                <li key={template.id}>
                  <button type="button" className="enterprise-workspace-template-item" onClick={() => applyTemplate(template)}>
                    <strong>{template.title}</strong>
                    {template.description ? <span>{template.description}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={() => setTemplatesOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
