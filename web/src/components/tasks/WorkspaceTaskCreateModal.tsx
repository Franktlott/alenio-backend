import { useEffect, useState } from "react";
import {
  createWebTask,
  fetchTaskTemplates,
  uploadChatMedia,
  type ApiTask,
  type TaskTemplate,
  type WebTeamDetail,
  type WebMeUser,
} from "../../lib/api";
import { formatRecurrenceRuleSummary } from "../../lib/recurring-task";
import { resolveTimeZone } from "../../lib/timezone";
import { AssigneeMultiSelect } from "./AssigneeMultiSelect";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskRecurrenceSetupModal, type RecurrenceSetupValues } from "./TaskRecurrenceSetupModal";

type ChecklistItem = { id: string; title: string };

function newChecklistItem(title: string): ChecklistItem {
  return { id: crypto.randomUUID(), title };
}

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

const DEFAULT_RECURRENCE: RecurrenceSetupValues = {
  type: "weekly",
  occurrenceCount: 3,
  dayOfWeek: 1,
  dayOfMonth: 1,
};

const MAX_SUBTASKS = 10;

type Props = {
  open: boolean;
  teamId: string;
  teamDetail: WebTeamDetail | null;
  me: WebMeUser | null;
  myRole: string;
  initialDueDate?: string;
  onClose: () => void;
  onCreated: (created: ApiTask[]) => void | Promise<void>;
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
  const [subtasks, setSubtasks] = useState<ChecklistItem[]>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState<RecurrenceSetupValues>(DEFAULT_RECURRENCE);
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false);
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
    setIsRecurring(false);
    setRecurrence(DEFAULT_RECURRENCE);
    setRecurrenceModalOpen(false);
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
    setSubtasks(template.subtasks.slice(0, MAX_SUBTASKS).map((s) => newChecklistItem(s.title)));
    setAttachmentUrl(template.attachmentUrl);
    setIsRecurring(template.isRecurring);
    if (template.isRecurring) {
      setRecurrence({
        type: template.recurrenceType ?? DEFAULT_RECURRENCE.type,
        occurrenceCount: template.recurrenceInterval ?? DEFAULT_RECURRENCE.occurrenceCount,
        dayOfWeek: template.recurrenceDaysOfWeek != null ? parseInt(template.recurrenceDaysOfWeek, 10) || 1 : DEFAULT_RECURRENCE.dayOfWeek,
        dayOfMonth: template.recurrenceDayOfMonth ?? DEFAULT_RECURRENCE.dayOfMonth,
      });
    }
    setTemplatesOpen(false);
  };

  const collectSubtaskTitles = () => {
    const titles = subtasks.map((s) => s.title.trim()).filter(Boolean).slice(0, MAX_SUBTASKS);
    const pending = newSubtask.trim();
    if (pending && titles.length < MAX_SUBTASKS) titles.push(pending);
    return titles;
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
      const created = await createWebTask({
        teamId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status: "todo",
        dueDate: dueDate || null,
        timeZone: userTimeZone,
        assigneeIds,
        isJoint: forceJoint ?? isJoint,
        subtasks: collectSubtaskTitles(),
        attachmentUrl,
        recurrence: isRecurring
          ? {
              type: recurrence.type,
              occurrenceCount: recurrence.occurrenceCount,
              daysOfWeek: recurrence.type === "weekly" ? String(recurrence.dayOfWeek) : undefined,
              dayOfMonth: recurrence.type === "monthly" ? recurrence.dayOfMonth : undefined,
            }
          : undefined,
      });
      await onCreated(created);
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

  const handlePickFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.pdf,application/pdf";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      setError(null);
      try {
        const up = await uploadChatMedia(file);
        setAttachmentUrl(up.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setPhotoBusy(false);
      }
    };
    input.click();
  };

  const addSubtask = () => {
    const trimmed = newSubtask.trim();
    if (!trimmed || subtasks.length >= MAX_SUBTASKS) return;
    setSubtasks((s) => [...s, newChecklistItem(trimmed)]);
    setNewSubtask("");
  };

  const atSubtaskLimit = subtasks.length >= MAX_SUBTASKS;

  const removeSubtask = (id: string) => {
    setSubtasks((s) => s.filter((item) => item.id !== id));
  };

  const recurrenceSummary = formatRecurrenceRuleSummary({
    type: recurrence.type,
    occurrenceCount: recurrence.occurrenceCount,
    dayOfWeek: recurrence.type === "weekly" ? recurrence.dayOfWeek : undefined,
    dayOfMonth: recurrence.type === "monthly" ? recurrence.dayOfMonth : undefined,
  });

  const handleRecurringToggle = (checked: boolean) => {
    if (checked) {
      setRecurrenceModalOpen(true);
      return;
    }
    setIsRecurring(false);
  };

  const handleRecurrenceSave = (values: RecurrenceSetupValues) => {
    setRecurrence(values);
    setIsRecurring(true);
    setRecurrenceModalOpen(false);
  };

  const handleRecurrenceCancel = () => {
    setRecurrenceModalOpen(false);
  };

  if (!open) return null;

  return (
    <>
      <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
        <div
          className="enterprise-task-modal enterprise-workspace-create-modal enterprise-workspace-create-modal--v3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-task-heading"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="create-v3-head">
            <div className="create-v3-head-main">
              <h2 id="create-task-heading" className="create-v3-heading">
                New task
              </h2>
              <p className="create-v3-sub">Capture the work, assign teammates, and set when it is due.</p>
            </div>
            <div className="create-v3-head-actions">
              <button type="button" className="create-v3-link-btn" onClick={() => setTemplatesOpen(true)}>
                Use template
              </button>
              <button type="button" className="create-v3-icon-btn" onClick={onClose} aria-label="Close">
                ×
              </button>
            </div>
          </header>

          <form className="enterprise-workspace-create-form" onSubmit={handleSubmit}>
            <div className="create-v3-body">
              <div className="enterprise-workspace-create-layout">
                <div className="enterprise-workspace-create-main create-v3-main">
                  <div className="create-v3-title-wrap">
                    <span className="create-v3-title-accent" aria-hidden />
                    <label className="sr-only" htmlFor="create-task-title">
                      Task title
                    </label>
                    <input
                      id="create-task-title"
                      className="create-v3-title-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="What needs to get done?"
                      required
                      autoFocus
                    />
                  </div>

                  <section className="create-v3-block">
                    <h3 className="create-v3-block-title">Description</h3>
                    <TaskDescriptionField
                      id="create-task-desc"
                      value={description}
                      onChange={setDescription}
                      placeholder="Add context, links, or acceptance criteria…"
                    />
                  </section>

                  <section className="create-v3-block create-v3-block--subtasks">
                    <div className="create-v3-block-head">
                      <h3 className="create-v3-block-title">Subtasks</h3>
                      <span className="create-v3-checklist-count">
                        {subtasks.length}/{MAX_SUBTASKS}
                      </span>
                    </div>
                    {subtasks.length > 0 ? (
                      <ul className="create-v3-checklist create-v3-checklist--scroll" aria-label="Subtasks">
                        {subtasks.map((item) => (
                          <li key={item.id}>
                            <span className="create-v3-checklist-check" aria-hidden />
                            <span className="create-v3-checklist-label">{item.title}</span>
                            <button
                              type="button"
                              className="create-v3-checklist-remove"
                              aria-label={`Remove ${item.title}`}
                              onClick={() => removeSubtask(item.id)}
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="create-v3-subtask-add">
                      <input
                        className="auth-input create-v3-checklist-input"
                        value={newSubtask}
                        placeholder={atSubtaskLimit ? "Maximum 10 subtasks" : "Add a subtask"}
                        disabled={atSubtaskLimit || saving}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSubtask();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="create-v3-subtask-add-btn"
                        disabled={!newSubtask.trim() || atSubtaskLimit || saving}
                        onClick={addSubtask}
                      >
                        Add
                      </button>
                    </div>
                  </section>

                  <section className="create-v3-block create-v3-block--attachments">
                    <h3 className="create-v3-block-title create-v3-block-title--attachments">
                      <span aria-hidden>📎</span> Attachment
                    </h3>
                    {attachmentUrl ? (
                      <div className="create-v3-attachment-row">
                        {attachmentUrl.toLowerCase().includes(".pdf") || attachmentUrl.includes("pdf") ? (
                          <span className="create-v3-attachment-file-label">PDF attached</span>
                        ) : (
                          <img src={attachmentUrl} alt="Attachment preview" className="create-v3-attachment-thumb" />
                        )}
                        <button type="button" className="create-v3-link-btn" onClick={() => setAttachmentUrl(null)}>
                          Remove
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="create-v3-upload-compact"
                        disabled={photoBusy}
                        onClick={handlePickFile}
                      >
                        <span className="create-v3-upload-icon" aria-hidden>
                          🖼
                        </span>
                        <span className="create-v3-upload-compact-text">
                          <span className="create-v3-upload-title">{photoBusy ? "Uploading…" : "Add a photo or file"}</span>
                          <span className="create-v3-upload-hint">PNG, JPG, PDF up to 10MB</span>
                        </span>
                      </button>
                    )}
                  </section>
                </div>

                <aside className="enterprise-workspace-create-sidebar create-v3-sidebar">
                <section className="create-v3-side-section">
                  <h4 className="create-v3-side-label">Assignees</h4>
                  <AssigneeMultiSelect
                    members={members}
                    selectedIds={assigneeIds}
                    onChange={setAssigneeIds}
                    loading={membersLoading}
                    disabled={saving}
                  />
                  {assigneeIds.length >= 2 ? (
                    <label className="create-v3-joint-row">
                      <input type="checkbox" checked={isJoint} onChange={(e) => setIsJoint(e.target.checked)} />
                      <span>Shared joint task</span>
                    </label>
                  ) : null}
                </section>

                <section className="create-v3-side-section">
                  <h4 className="create-v3-side-label">Details</h4>
                  <div className="create-v3-detail-rows">
                    <label className="create-v3-detail-row">
                      <span className="create-v3-detail-key">
                        <span className="create-v3-detail-icon" aria-hidden>
                          📅
                        </span>
                        Due date
                      </span>
                      <input
                        type="date"
                        className="auth-input create-v3-detail-input"
                        value={dueDate}
                        min={isRegularMember ? today : undefined}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </label>
                    <label className="create-v3-detail-row">
                      <span className="create-v3-detail-key">
                        <span className="create-v3-detail-icon" aria-hidden>
                          ●
                        </span>
                        Priority
                      </span>
                      <div className="create-v3-priority-wrap">
                        <span className={`create-v3-priority-dot create-v3-priority-dot--${priority}`} aria-hidden />
                        <select
                          className="auth-input create-v3-detail-input create-v3-priority-select"
                          value={priority}
                          onChange={(e) => setPriority(e.target.value)}
                        >
                          {PRIORITIES.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>
                </section>

                <section className="create-v3-side-section">
                  <h4 className="create-v3-side-label">Schedule</h4>
                  <label className="create-v3-repeat-row">
                    <input
                      type="checkbox"
                      checked={isRecurring || recurrenceModalOpen}
                      onChange={(e) => handleRecurringToggle(e.target.checked)}
                    />
                    <span>Repeating task</span>
                  </label>
                  {isRecurring ? (
                    <div className="create-v3-recurrence-summary">
                      <p className="create-v3-recurrence-summary-text">{recurrenceSummary}</p>
                      <button type="button" className="create-v3-link-btn" onClick={() => setRecurrenceModalOpen(true)}>
                        Edit rule
                      </button>
                    </div>
                  ) : null}
                </section>
              </aside>
            </div>

            {error ? (
              <p className="auth-error create-v3-error" role="alert">
                {error}
              </p>
            ) : null}
            </div>

            <footer className="create-v3-footer">
              <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="task-detail-v2-btn task-detail-v2-btn--primary" disabled={saving}>
                {saving ? "Creating…" : "Create task"}
              </button>
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

      <TaskRecurrenceSetupModal
        open={recurrenceModalOpen}
        initial={recurrence}
        onCancel={handleRecurrenceCancel}
        onSave={handleRecurrenceSave}
      />

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
