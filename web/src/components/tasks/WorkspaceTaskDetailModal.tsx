import { useEffect, useMemo, useState } from "react";
import { OneOnOneAssociateFeedbackForm } from "../OneOnOneAssociateFeedbackForm";
import { RecurringTaskScopeModal } from "../RecurringTaskScopeModal";
import { TaskPromptModal } from "./TaskPromptModal";
import {
  assignTeamTaskMembers,
  createTeamTaskSubtask,
  deleteTeamTaskSubtask,
  deleteWebTask,
  fetchWebTaskDetail,
  unassignTeamTaskMember,
  updateCoreTeamTask,
  updateTeamTaskSubtask,
  type ApiSubtask,
  type ApiTask,
  type OneOnOneAssociateFeedbackContext,
  type WebTeamDetail,
  type WebMeUser,
} from "../../lib/api";
import {
  ASSOCIATE_FEEDBACK_SECTION_TITLE,
  formatTaskDescriptionForDisplay,
  isFeedbackTaskDescription,
  parseFeedbackTaskDescription,
} from "../../lib/one-on-one-feedback";
import {
  isTaskOverdue,
  priorityClass,
  priorityLabel,
  statusClass,
  statusLabel,
  taskBadges,
} from "../../lib/task-display";
import { isRecurringTask, type RecurrenceScope } from "../../lib/recurring-task";
import { calendarDayFromInstant, resolveTimeZone } from "../../lib/timezone";
import { normalizeTaskStatus, STATUS_OPTIONS } from "../../lib/task-status";

function isImageAttachment(url: string): boolean {
  const clean = url.split("?")[0]?.toLowerCase() ?? "";
  return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"].some((ext) => clean.endsWith(ext));
}

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

type Props = {
  task: ApiTask;
  teamId: string;
  teamDetail: WebTeamDetail | null;
  me: WebMeUser | null;
  myRole: string;
  feedbackContext: OneOnOneAssociateFeedbackContext | null;
  feedbackContextLoading: boolean;
  feedbackCompletionActive: boolean;
  onFeedbackCompletionStarted: () => void;
  onFeedbackCompletionFailed: () => void;
  onFeedbackSubmitted: () => void;
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onDeleted: () => Promise<void>;
};

export function WorkspaceTaskDetailModal({
  task: initialTask,
  teamId,
  teamDetail,
  me,
  myRole,
  feedbackContext,
  feedbackContextLoading,
  feedbackCompletionActive,
  onFeedbackCompletionStarted,
  onFeedbackCompletionFailed,
  onFeedbackSubmitted,
  onClose,
  onUpdated,
  onDeleted,
}: Props) {
  const userTimeZone = resolveTimeZone(me?.timezone);
  const [task, setTask] = useState<ApiTask>(initialTask);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState(initialTask.title);
  const [editDescription, setEditDescription] = useState(initialTask.description ?? "");
  const [editPriority, setEditPriority] = useState(initialTask.priority);
  const [editDueDate, setEditDueDate] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurringScopeMode, setRecurringScopeMode] = useState<"delete" | "edit" | null>(null);
  const [prompt, setPrompt] = useState<"complete" | "recall" | "subtasks" | null>(null);

  const meId = me?.id;
  const creatorId = task.creatorId ?? task.creator?.id;
  const isCreator = !!meId && creatorId === meId;
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader" || myRole === "admin";
  const isCompleted = task.status === "done";
  const canEdit = (isCreator || isOwnerOrLeader) && !isCompleted;
  const canDelete = isCreator || myRole === "owner" || myRole === "admin";
  const assignedIds = new Set(task.assignments.map((a) => a.user.id));
  const isAssignee = !!meId && assignedIds.has(meId);

  const feedbackMeta = useMemo(
    () => (task.description ? parseFeedbackTaskDescription(task.description) : null),
    [task.description],
  );
  const isFeedbackTask = isFeedbackTaskDescription(task.description);
  const isFeedbackAssignee = !!feedbackMeta && isAssignee;
  const showFocusedFeedbackTask = isFeedbackTask && isFeedbackAssignee;
  const showFeedbackFormLoading =
    !!feedbackMeta && isFeedbackAssignee && !isCompleted && !feedbackCompletionActive && feedbackContextLoading && !feedbackContext;

  useEffect(() => {
    setTask(initialTask);
    setEditTitle(initialTask.title);
    setEditDescription(initialTask.description ?? "");
    setEditPriority(initialTask.priority);
    setEditDueDate(initialTask.dueDate ? calendarDayFromInstant(initialTask.dueDate, userTimeZone) : "");
    setEditMode(false);
    setError(null);
  }, [initialTask.id, userTimeZone]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const detail = await fetchWebTaskDetail(initialTask.id, teamId);
        if (cancelled) return;
        setTask(detail);
        await onUpdated();
      } catch {
        /* keep list snapshot */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialTask.id, teamId]);

  const refreshTask = async () => {
    const detail = await fetchWebTaskDetail(task.id, teamId);
    setTask(detail);
    setEditTitle(detail.title);
    setEditDescription(detail.description ?? "");
    setEditPriority(detail.priority);
    setEditDueDate(detail.dueDate ? calendarDayFromInstant(detail.dueDate, userTimeZone) : "");
    await onUpdated();
  };

  const seriesFieldsChanged = () =>
    editTitle.trim() !== task.title.trim() ||
    (editDescription.trim() || "") !== (task.description?.trim() || "") ||
    editPriority !== task.priority;

  const saveEdit = async (scope: RecurrenceScope = "task") => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCoreTeamTask(teamId, task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        priority: editPriority,
        dueDate: editDueDate || null,
        timeZone: userTimeZone,
        ...(scope === "series" ? { scope: "series" } : {}),
      });
      setTask(updated);
      setEditMode(false);
      setRecurringScopeMode(null);
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save task.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (scope: RecurrenceScope) => {
    setBusy(true);
    setError(null);
    try {
      await deleteWebTask(task.id, teamId, scope);
      setRecurringScopeMode(null);
      await onDeleted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete task.");
    } finally {
      setBusy(false);
    }
  };

  const incompleteSubtasks = (task.subtasks ?? []).filter((s) => !s.completed).length;

  const performStatusUpdate = async (nextStatus: string) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCoreTeamTask(teamId, task.id, { status: nextStatus });
      setTask(updated);
      setPrompt(null);
      if (nextStatus === "done") onClose();
      else await onUpdated();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update task.";
      if (message.toLowerCase().includes("subtask")) setPrompt("subtasks");
      else setError(message);
      setPrompt(null);
    } finally {
      setBusy(false);
    }
  };

  const toggleSubtask = async (subtask: ApiSubtask) => {
    if (isCompleted || !isAssignee) return;
    setBusy(true);
    try {
      await updateTeamTaskSubtask(teamId, task.id, subtask.id, !subtask.completed);
      await refreshTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update subtask.");
    } finally {
      setBusy(false);
    }
  };

  const addSubtask = async () => {
    const trimmed = newSubtask.trim();
    if (!trimmed || !canEdit) return;
    setBusy(true);
    try {
      await createTeamTaskSubtask(teamId, task.id, trimmed);
      setNewSubtask("");
      await refreshTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add subtask.");
    } finally {
      setBusy(false);
    }
  };

  const removeSubtask = async (subtaskId: string) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await deleteTeamTaskSubtask(teamId, task.id, subtaskId);
      await refreshTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove subtask.");
    } finally {
      setBusy(false);
    }
  };

  const toggleAssignee = async (userId: string) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      if (assignedIds.has(userId)) await unassignTeamTaskMember(teamId, task.id, userId);
      else await assignTeamTaskMembers(teamId, task.id, [userId]);
      await refreshTask();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update assignees.");
    } finally {
      setBusy(false);
    }
  };

  const members = teamDetail?.members ?? [];
  const badges = taskBadges(task);
  const now = new Date();

  return (
    <>
      <div
        className="enterprise-task-modal-backdrop"
        role="presentation"
        onClick={() => {
          if (feedbackCompletionActive) return;
          onClose();
        }}
      >
        <div
          className={`enterprise-task-modal enterprise-workspace-detail-modal${showFocusedFeedbackTask ? " enterprise-task-modal--feedback-focused" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Task details"
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" className="enterprise-task-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>

          <header className="enterprise-task-modal-head enterprise-workspace-detail-head">
            <div className="enterprise-workspace-detail-head-main">
              {editMode ? (
                <input className="auth-input enterprise-task-modal-title-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              ) : (
                <h3 className="enterprise-task-modal-title">
                  {task.isJoint ? "🤝 " : ""}
                  {task.title}
                </h3>
              )}
              {!showFocusedFeedbackTask ? (
                <div className="enterprise-task-modal-meta enterprise-workspace-detail-meta">
                  <span className={priorityClass(task.priority)}>{priorityLabel(task.priority)}</span>
                  <span className={statusClass(task, now)}>{statusLabel(task, now)}</span>
                  {isRecurringTask(task) ? <span className="enterprise-workspace-task-badge">Repeating ↺</span> : null}
                  {badges.map((badge) => (
                    <span key={badge} className="enterprise-workspace-task-badge">
                      {badge}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            {!showFocusedFeedbackTask ? (
              <div className="enterprise-workspace-detail-head-actions">
                {canEdit && !editMode ? (
                  <button type="button" className="enterprise-dashboard-btn-outline" onClick={() => setEditMode(true)}>
                    Edit
                  </button>
                ) : null}
                {canDelete ? (
                  <button
                    type="button"
                    className="enterprise-dashboard-btn-outline enterprise-workspace-detail-delete"
                    disabled={busy}
                    onClick={() =>
                      isRecurringTask(task) ? setRecurringScopeMode("delete") : void handleDelete("task")
                    }
                  >
                    Delete
                  </button>
                ) : null}
              </div>
            ) : null}
          </header>

          <div className={`enterprise-task-modal-body${showFocusedFeedbackTask ? " enterprise-task-modal-body--feedback-focused" : ""}`}>
            <section className="enterprise-task-modal-left">
              {task.attachmentUrl ? (
                <section className="enterprise-task-modal-section">
                  <h4>Attachment</h4>
                  {isImageAttachment(task.attachmentUrl) ? (
                    <img src={task.attachmentUrl} alt="Task attachment" className="enterprise-task-modal-image" />
                  ) : (
                    <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="enterprise-inline-link">
                      Open attachment
                    </a>
                  )}
                </section>
              ) : null}

              {feedbackContext && feedbackMeta ? (
                <section className="enterprise-task-modal-section enterprise-oneone-feedback-task-section">
                  <h4>{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h4>
                  <OneOnOneAssociateFeedbackForm
                    teamId={feedbackMeta.teamId}
                    memberUserId={feedbackMeta.memberUserId}
                    meetingId={feedbackMeta.meetingId}
                    context={feedbackContext}
                    onCompletionStarted={onFeedbackCompletionStarted}
                    onCompletionFailed={onFeedbackCompletionFailed}
                    onSubmitted={onFeedbackSubmitted}
                  />
                </section>
              ) : null}

              {showFeedbackFormLoading ? (
                <section className="enterprise-task-modal-section enterprise-oneone-feedback-task-section">
                  <h4>{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h4>
                  <p className="enterprise-muted" aria-live="polite">
                    Loading your check-in…
                  </p>
                </section>
              ) : null}

              {!feedbackContext && !showFeedbackFormLoading ? (
                <section className="enterprise-task-modal-section">
                  <h4>Description</h4>
                  {editMode && !isFeedbackTask ? (
                    <textarea className="auth-input create-task-textarea" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={4} />
                  ) : (
                    <div className="enterprise-task-modal-description-box">
                      {formatTaskDescriptionForDisplay(task.description) || "Add a description..."}
                    </div>
                  )}
                </section>
              ) : null}

              {!showFocusedFeedbackTask ? (
                <section className="enterprise-task-modal-section">
                  <div className="enterprise-workspace-detail-section-head">
                    <h4>Subtasks</h4>
                    {(task.subtasks?.length ?? 0) > 0 ? (
                      <span className="enterprise-workspace-detail-count">{task.subtasks!.length}</span>
                    ) : null}
                  </div>
                  {(task.subtasks?.length ?? 0) > 0 ? (
                    <ul className="enterprise-task-modal-subtasks enterprise-workspace-subtasks">
                      {task.subtasks!.map((s) => (
                        <li key={s.id} className={s.completed ? "done" : ""}>
                          <button
                            type="button"
                            className={`enterprise-workspace-subtask-toggle${s.completed ? " enterprise-workspace-subtask-toggle--done" : ""}`}
                            disabled={busy || isCompleted || !isAssignee}
                            onClick={() => void toggleSubtask(s)}
                          >
                            {s.completed ? "✓" : ""}
                          </button>
                          <span>{s.title}</span>
                          {editMode ? (
                            <button type="button" className="enterprise-workspace-subtask-remove" disabled={busy} onClick={() => void removeSubtask(s.id)}>
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="enterprise-muted">No subtasks</p>
                  )}
                  {editMode ? (
                    <div className="create-task-subtask-add">
                      <input
                        className="auth-input"
                        value={newSubtask}
                        placeholder="Add subtask"
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addSubtask();
                          }
                        }}
                      />
                      <button type="button" className="auth-btn-secondary create-task-add-btn" disabled={busy} onClick={() => void addSubtask()}>
                        Add
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </section>

            {!showFocusedFeedbackTask ? (
              <aside className="enterprise-task-modal-right">
                <div className="enterprise-task-side-card">
                  <h4>Status</h4>
                  <select
                    className="auth-input enterprise-task-status-select"
                    value={normalizeTaskStatus(task.status)}
                    disabled={busy || isCompleted || !canEdit}
                    aria-label="Task status"
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === normalizeTaskStatus(task.status)) return;
                      if (next === "done") {
                        setPrompt("complete");
                        return;
                      }
                      if (task.status === "done" && next === "todo") {
                        setPrompt("recall");
                        return;
                      }
                      void performStatusUpdate(next);
                    }}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {isTaskOverdue(task, now) && task.status !== "done" ? (
                    <p className="enterprise-task-status-overdue-note">This task is overdue.</p>
                  ) : null}
                  {normalizeTaskStatus(task.status) === "reviewed" ? (
                    <p className="enterprise-muted enterprise-task-status-hint">Someone opened this task.</p>
                  ) : null}
                </div>

                <div className="enterprise-task-side-card">
                  <div className="enterprise-task-side-row">
                    <span>Priority</span>
                    <strong>
                      {editMode ? (
                        <select className="auth-input enterprise-task-inline-select" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                          {PRIORITIES.map((p) => (
                            <option key={p.value} value={p.value}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        priorityLabel(task.priority)
                      )}
                    </strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Due date</span>
                    <strong>
                      {editMode ? (
                        <input type="date" className="auth-input enterprise-task-inline-select" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                      ) : (
                        formatModalDate(task.dueDate)
                      )}
                    </strong>
                  </div>
                  <div className="enterprise-task-side-row">
                    <span>Created by</span>
                    <strong>{task.creator?.name ?? "Unknown"}</strong>
                  </div>
                </div>

                <div className="enterprise-task-side-card">
                  <div className="enterprise-workspace-detail-section-head">
                    <h4>Assignees</h4>
                    {canEdit ? (
                      <button type="button" className="enterprise-inline-link-btn" onClick={() => setAssignOpen((open) => !open)}>
                        {assignOpen ? "Done" : "Manage"}
                      </button>
                    ) : null}
                  </div>
                  {assignOpen && canEdit ? (
                    <ul className="create-task-assignees">
                      {members.map((m) => (
                        <li key={m.userId}>
                          <label className="create-task-assignee-label">
                            <input type="checkbox" checked={assignedIds.has(m.userId)} disabled={busy} onChange={() => void toggleAssignee(m.userId)} />
                            {m.user.name ?? m.user.email ?? m.userId}
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="enterprise-workspace-assignee-list">
                      {task.assignments.map((a) => a.user.name ?? a.user.email ?? a.user.id).join(", ") || "—"}
                    </p>
                  )}
                  {!isAssignee && meId && canEdit ? (
                    <button type="button" className="enterprise-dashboard-btn-outline" disabled={busy} onClick={() => void toggleAssignee(meId)}>
                      Assign to me
                    </button>
                  ) : null}
                </div>

                <div className="enterprise-task-side-card">
                  <h4>Task details</h4>
                  <dl className="enterprise-task-modal-dl">
                    <dt>Created</dt>
                    <dd>{formatModalDate(task.createdAt)}</dd>
                    <dt>Last updated</dt>
                    <dd>{formatModalDate(task.updatedAt)}</dd>
                    {task.completedAt ? (
                      <>
                        <dt>Completed</dt>
                        <dd>{formatModalDate(task.completedAt)}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>
              </aside>
            ) : null}
          </div>

          {error ? <p className="auth-error enterprise-workspace-detail-error">{error}</p> : null}

          {!showFocusedFeedbackTask ? (
            <footer className="enterprise-task-modal-footer">
              {editMode ? (
                <>
                  <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={busy} onClick={() => setEditMode(false)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                    disabled={busy}
                    onClick={() => {
                      if (isRecurringTask(task) && seriesFieldsChanged()) {
                        setRecurringScopeMode("edit");
                        return;
                      }
                      void saveEdit("task");
                    }}
                  >
                    {busy ? "Saving…" : "Save changes"}
                  </button>
                </>
              ) : isCompleted ? (
                canEdit || isAssignee ? (
                  <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary" disabled={busy} onClick={() => setPrompt("recall")}>
                    Recall task
                  </button>
                ) : null
              ) : isAssignee || canEdit ? (
                <button type="button" className="enterprise-task-modal-btn enterprise-task-modal-btn-primary" disabled={busy} onClick={() => setPrompt("complete")}>
                  Mark as complete
                </button>
              ) : null}
            </footer>
          ) : null}
        </div>
      </div>

      <RecurringTaskScopeModal
        open={recurringScopeMode !== null}
        mode={recurringScopeMode ?? "delete"}
        busy={busy}
        onClose={() => setRecurringScopeMode(null)}
        onChoose={(scope) => {
          if (recurringScopeMode === "delete") void handleDelete(scope);
          else void saveEdit(scope);
        }}
      />

      <TaskPromptModal
        open={prompt === "complete"}
        title="Mark as done?"
        message="This will complete the task and lock it from further edits."
        confirmLabel="Complete"
        confirmTone="success"
        busy={busy}
        onClose={() => setPrompt(null)}
        onConfirm={() => void performStatusUpdate("done")}
      />
      <TaskPromptModal
        open={prompt === "recall"}
        title="Recall this task?"
        message={
          task.dueDate && new Date(task.dueDate) < new Date()
            ? "This task is past its due date and will be marked as overdue once recalled."
            : "This will move the task back to active and allow edits to be made."
        }
        confirmLabel="Recall"
        confirmTone="warning"
        busy={busy}
        onClose={() => setPrompt(null)}
        onConfirm={() => void performStatusUpdate("todo")}
      />
      <TaskPromptModal
        open={prompt === "subtasks"}
        title="Subtasks incomplete"
        message={`Complete all subtasks before marking this task as done.${incompleteSubtasks ? ` ${incompleteSubtasks} remaining.` : ""}`}
        confirmLabel="Got it"
        confirmTone="primary"
        cancelLabel=""
        onClose={() => setPrompt(null)}
        onConfirm={() => setPrompt(null)}
      />
    </>
  );
}

function formatModalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}
