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
import { AssigneeMultiSelect } from "./AssigneeMultiSelect";

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
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
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isJoint, setIsJoint] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [subtasksOpen, setSubtasksOpen] = useState(false);
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
  const membersLoading = open && !teamDetail;

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setPriority("medium");
    setDueDate(initialDueDate ?? new Date().toISOString().slice(0, 10));
    setAssigneeIds(me?.id ? [me.id] : []);
    setIsJoint(false);
    setSubtasks([]);
    setNewSubtask("");
    setSubtasksOpen(false);
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

  useEffect(() => {
    if (assigneeIds.length < 2) setIsJoint(false);
  }, [assigneeIds.length]);

  const applyTemplate = (template: TaskTemplate) => {
    setTitle(template.title);
    setDescription(template.description ?? "");
    setPriority(template.priority || "medium");
    setIsJoint(template.isJoint);
    setSubtasks(template.subtasks.map((s) => s.title));
    setSubtasksOpen(template.subtasks.length > 0);
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
      await createWebTask({
        teamId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: "todo",
        dueDate: dueDate || null,
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

  const addSubtask = () => {
    const trimmed = newSubtask.trim();
    if (!trimmed) return;
    setSubtasks((s) => [...s, trimmed]);
    setNewSubtask("");
    setSubtasksOpen(true);
  };

  const canSaveTemplate = useMemo(() => title.trim().length > 0, [title]);

  if (!open) return null;

  return (
    <>
      <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="enterprise-task-modal enterprise-workspace-create-modal enterprise-workspace-create-modal--v2"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-heading"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>

          <header className="enterprise-workspace-create-head enterprise-workspace-create-head--v2">
            <div>
              <h3 id="create-task-heading" className="enterprise-workspace-create-heading">
                New task
              </h3>
              <p className="enterprise-muted enterprise-workspace-create-sub">
                Capture the work, assign teammates, and set when it is due.
              </p>
            </div>
            <button type="button" className="enterprise-inline-link-btn" onClick={() => setTemplatesOpen(true)}>
              Use template
            </button>
          </header>

          <form className="enterprise-workspace-create-form" onSubmit={handleSubmit}>
            <div className="enterprise-workspace-create-layout">
              <div className="enterprise-workspace-create-main">
                <label className="sr-only" htmlFor="create-task-title">
                  Task title
                </label>
                <input
                  id="create-task-title"
                  className="enterprise-create-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What needs to get done?"
                  required
                  autoFocus
                />

                <label className="enterprise-create-field-label" htmlFor="create-task-desc">
                  Description
                </label>
                <textarea
                  id="create-task-desc"
                  className="auth-input enterprise-create-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add context, links, or acceptance criteria…"
                  rows={4}
                />

                <section className="enterprise-create-collapsible">
                  <button
                    type="button"
                    className="enterprise-create-collapsible-trigger"
                    aria-expanded={subtasksOpen}
                    onClick={() => setSubtasksOpen((v) => !v)}
                  >
                    <span>Subtasks</span>
                    {subtasks.length > 0 ? (
                      <span className="enterprise-create-collapsible-badge">{subtasks.length}</span>
                    ) : null}
                    <span className="enterprise-create-collapsible-chevron" aria-hidden>
                      {subtasksOpen ? "▴" : "▾"}
                    </span>
                  </button>
                  {subtasksOpen ? (
                    <div className="enterprise-create-collapsible-body">
                      {subtasks.length > 0 ? (
                        <ul className="enterprise-create-subtask-list">
                          {subtasks.map((st, i) => (
                            <li key={`${i}-${st}`}>
                              <span>{st}</span>
                              <button
                                type="button"
                                className="enterprise-create-subtask-remove"
                                onClick={() => setSubtasks((s) => s.filter((_, idx) => idx !== i))}
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="enterprise-muted enterprise-create-subtask-empty">Break the work into smaller steps.</p>
                      )}
                      <div className="enterprise-create-subtask-add">
                        <input
                          className="auth-input"
                          value={newSubtask}
                          placeholder="Add a subtask"
                          onChange={(e) => setNewSubtask(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addSubtask();
                            }
                          }}
                        />
                        <button type="button" className="auth-btn-secondary" onClick={addSubtask}>
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}
                </section>
              </div>

              <aside className="enterprise-workspace-create-sidebar">
                <div className="enterprise-task-side-card enterprise-create-side-card">
                  <h4>Assignment</h4>
                  <div className="enterprise-create-card-body">
                    <AssigneeMultiSelect
                      members={members}
                      selectedIds={assigneeIds}
                      onChange={setAssigneeIds}
                      loading={membersLoading}
                      disabled={saving}
                    />
                    {assigneeIds.length >= 2 ? (
                      <label className="enterprise-create-toggle-row">
                        <input type="checkbox" checked={isJoint} onChange={(e) => setIsJoint(e.target.checked)} />
                        <span>
                          <strong>Shared joint task</strong>
                          <span className="enterprise-muted">One task for everyone with shared subtasks</span>
                        </span>
                      </label>
                    ) : null}
                  </div>
                </div>

                <div className="enterprise-task-side-card enterprise-create-side-card">
                  <h4>Details</h4>
                  <div className="enterprise-create-side-rows">
                    <label className="enterprise-create-side-row">
                      <span>Due date</span>
                      <input
                        type="date"
                        className="auth-input enterprise-task-inline-select"
                        value={dueDate}
                        min={isRegularMember ? today : undefined}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                    <label className="enterprise-create-side-row">
                      <span>Priority</span>
                      <select
                        className="auth-input enterprise-task-inline-select"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value)}
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>

                <div className="enterprise-task-side-card enterprise-create-side-card">
                  <h4>Schedule</h4>
                  <div className="enterprise-create-card-body">
                    <label className="enterprise-create-toggle-row enterprise-create-toggle-row--compact">
                      <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} />
                      <span>
                        <strong>Repeating task</strong>
                      </span>
                    </label>
                    {isRecurring ? (
                      <div className="enterprise-create-recurrence">
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
                        <label className="enterprise-create-recurrence-count">
                          <span>Repeat for</span>
                          <input
                            className="auth-input enterprise-workspace-recurrence-interval"
                            type="number"
                            min={1}
                            max={52}
                            value={recurrenceCount}
                            onChange={(e) => setRecurrenceCount(e.target.value)}
                          />
                          <span>{recurrenceDurationUnit(recurrenceType)}</span>
                        </label>
                        <p className="enterprise-muted enterprise-workspace-recurrence-hint">{recurrenceCountHint(recurrenceType)}</p>
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
                          <label className="enterprise-create-recurrence-count">
                            <span>Day of month</span>
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
                  </div>
                </div>

                <div className="enterprise-task-side-card enterprise-create-side-card">
                  <h4>Attachment</h4>
                  <div className="enterprise-create-card-body enterprise-create-attachment-body">
                    <button type="button" className="enterprise-dashboard-btn-outline" disabled={photoBusy} onClick={handlePickPhoto}>
                      {photoBusy ? "Uploading…" : attachmentUrl ? "Change photo" : "Add photo"}
                    </button>
                    {attachmentUrl ? (
                      <img src={attachmentUrl} alt="Task attachment preview" className="enterprise-workspace-create-attachment-preview" />
                    ) : (
                      <p className="enterprise-muted enterprise-create-attachment-hint">Optional reference image for assignees.</p>
                    )}
                  </div>
                </div>
              </aside>
            </div>

            {error ? (
              <p className="enterprise-form-error enterprise-workspace-create-error" role="alert">
                {error}
              </p>
            ) : null}

            <footer className="enterprise-task-modal-footer enterprise-workspace-create-footer enterprise-workspace-create-footer--v2">
              <div className="enterprise-workspace-create-footer-left">
                {canSaveTemplate ? (
                  <button
                    type="button"
                    className="enterprise-inline-link-btn"
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
              </div>
              <div className="enterprise-workspace-create-footer-actions">
                <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={saving}>
                  {saving ? "Creating…" : "Create task"}
                </button>
              </div>
            </footer>
          </form>
        </div>
      </div>

      {splitConfirmOpen ? (
        <div className="enterprise-task-modal-backdrop enterprise-task-prompt-backdrop" role="presentation" onClick={() => setSplitConfirmOpen(false)}>
          <div className="enterprise-task-prompt-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="enterprise-task-prompt-title">Multiple assignees</h3>
            <p className="enterprise-task-prompt-copy">Create one shared joint task for everyone, or separate tasks for each assignee?</p>
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
