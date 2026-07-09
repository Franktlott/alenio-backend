import { useEffect, useMemo, useRef, useState } from "react";
import { OneOnOneAssociateFeedbackForm } from "../OneOnOneAssociateFeedbackForm";
import { RecurringTaskScopeModal } from "../RecurringTaskScopeModal";
import { TaskPromptModal } from "./TaskPromptModal";
import { AssigneeMultiSelect } from "./AssigneeMultiSelect";
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
  ASSOCIATE_FEEDBACK_INTRO,
  ASSOCIATE_FEEDBACK_SECTION_TITLE,
  formatTaskDescriptionForDisplay,
  isAssociateFeedbackRecipient,
  isFeedbackTaskDescription,
  resolveFeedbackTaskMeta,
} from "../../lib/one-on-one-feedback";
import {
  priorityLabel,
  statusClass,
  statusLabel,
  taskBadges,
  assigneeInitials,
  isTaskOverdue,
} from "../../lib/task-display";
import { isRecurringTask, type RecurrenceScope } from "../../lib/recurring-task";
import { isTaskPhotoUrl } from "../../lib/task-attachment";
import { TaskDescriptionContent } from "./TaskDescriptionField";
import { calendarDayFromInstant, calendarDuePayload, resolveTimeZone } from "../../lib/timezone";

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
  feedbackContextSubmitted: boolean;
  feedbackContextError: string | null;
  onFeedbackRetry: () => void;
  feedbackCompletionActive: boolean;
  onFeedbackCompletionStarted: () => void;
  onFeedbackCompletionFailed: () => void;
  onFeedbackSubmitted: () => void;
  onClose: () => void;
  onUpdated: (updated?: ApiTask) => Promise<void>;
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
  feedbackContextSubmitted,
  feedbackContextError,
  onFeedbackRetry,
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
  const [editPriority, setEditPriority] = useState(initialTask.priority);
  const [editDueDate, setEditDueDate] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recurringScopeMode, setRecurringScopeMode] = useState<"delete" | "edit" | null>(null);
  const [prompt, setPrompt] = useState<"complete" | "recall" | "subtasks" | null>(null);
  const [headMenuOpen, setHeadMenuOpen] = useState(false);
  const headMenuRef = useRef<HTMLDivElement>(null);

  const meId = me?.id;
  const creatorId = task.creatorId ?? task.creator?.id;
  const isCreator = !!meId && creatorId === meId;
  const isOwnerOrLeader = myRole === "owner" || myRole === "team_leader" || myRole === "admin";
  const isCompleted = task.status === "done";
  const canEdit = (isCreator || isOwnerOrLeader) && !isCompleted;
  const canDelete = isCreator || myRole === "owner" || myRole === "admin";
  const assignedIds = new Set(task.assignments.map((a) => a.user.id));
  const isAssignee = !!meId && assignedIds.has(meId);

  const feedbackMeta = useMemo(() => resolveFeedbackTaskMeta(task, teamId), [task, teamId]);
  const isFeedbackTask = isFeedbackTaskDescription(task.description);
  const isFeedbackAssignee = isAssociateFeedbackRecipient(meId, feedbackMeta);
  const showFocusedFeedbackTask = isFeedbackTask && isFeedbackAssignee;
  const showFeedbackFormLoading =
    !!feedbackMeta && isFeedbackAssignee && !isCompleted && !feedbackCompletionActive && feedbackContextLoading && !feedbackContext;
  const showFeedbackAlreadySubmitted =
    showFocusedFeedbackTask && !feedbackContext && !showFeedbackFormLoading && feedbackContextSubmitted;
  const showFeedbackLoadError =
    showFocusedFeedbackTask && !feedbackContext && !showFeedbackFormLoading && !!feedbackContextError;

  useEffect(() => {
    if (!headMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (headMenuRef.current?.contains(e.target as Node)) return;
      setHeadMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [headMenuOpen]);

  useEffect(() => {
    setTask(initialTask);
    setEditTitle(initialTask.title);
    setEditPriority(initialTask.priority);
    setEditDueDate(initialTask.dueDate ? calendarDayFromInstant(initialTask.dueDate, userTimeZone) : "");
    setEditMode(false);
    setError(null);
  }, [initialTask.id, userTimeZone]);

  const refreshTask = async () => {
    const detail = await fetchWebTaskDetail(task.id, teamId);
    setTask(detail);
    setEditTitle(detail.title);
    setEditPriority(detail.priority);
    setEditDueDate(detail.dueDate ? calendarDayFromInstant(detail.dueDate, userTimeZone) : "");
    await onUpdated();
  };

  const seriesFieldsChanged = () =>
    editTitle.trim() !== task.title.trim() || editPriority !== task.priority;

  const saveEdit = async (scope: RecurrenceScope = "task") => {
    setBusy(true);
    setError(null);
    try {
      const updated = await updateCoreTeamTask(teamId, task.id, {
        title: editTitle.trim(),
        priority: editPriority,
        dueDate: editDueDate ? calendarDuePayload(editDueDate, userTimeZone) : null,
        timeZone: userTimeZone,
        ...(scope === "series" ? { scope: "series" } : {}),
      });
      setTask(updated);
      setEditMode(false);
      setRecurringScopeMode(null);
      await onUpdated(updated);
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
      await onUpdated(updated);
      if (nextStatus === "done") onClose();
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
    if (!trimmed || !canEdit || !editMode) return;
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
    if (!canEdit || !editMode) return;
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

  const toggleAssignee = async (userId: string, selected: boolean) => {
    if (!canEdit || !editMode) return;
    setBusy(true);
    try {
      if (selected) await assignTeamTaskMembers(teamId, task.id, [userId]);
      else await unassignTeamTaskMember(teamId, task.id, userId);
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
  const subtasks = task.subtasks ?? [];
  const completedSubtasks = subtasks.filter((s) => s.completed).length;
  const recurrenceLabel = task.recurrenceRule?.type
    ? task.recurrenceRule.type.charAt(0).toUpperCase() + task.recurrenceRule.type.slice(1)
    : isRecurringTask(task)
      ? "Repeating"
      : null;
  const creatorName = task.creator?.name ?? task.creator?.email ?? "Unknown";
  const descriptionText =
    task.description && !isFeedbackTask ? formatTaskDescriptionForDisplay(task.description) : null;
  const assigneeLabel =
    task.assignments[0]?.user.name?.trim() ||
    task.assignments[0]?.user.email?.trim() ||
    members.find((member) => member.userId === feedbackMeta?.memberUserId)?.user.name?.trim() ||
    members.find((member) => member.userId === feedbackMeta?.memberUserId)?.user.email?.trim() ||
    "the assignee";
  const photoUrl = task.attachmentUrl && isTaskPhotoUrl(task.attachmentUrl) ? task.attachmentUrl : null;

  const cancelEdit = () => {
    setEditMode(false);
    setNewSubtask("");
    setEditTitle(task.title);
    setEditPriority(task.priority);
    setEditDueDate(task.dueDate ? calendarDayFromInstant(task.dueDate, userTimeZone) : "");
  };

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
          className={`enterprise-task-modal enterprise-workspace-detail-modal enterprise-workspace-detail-modal--v2${showFocusedFeedbackTask ? " enterprise-task-modal--feedback-focused" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Task details"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="task-detail-v2-head">
            <div className="task-detail-v2-head-main">
              {editMode ? (
                <input className="auth-input task-detail-v2-title-input" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              ) : (
                <h2 className="task-detail-v2-title">
                  {task.isJoint ? <span className="task-detail-v2-joint" aria-hidden>🤝 </span> : null}
                  {task.title}
                </h2>
              )}
              {!showFocusedFeedbackTask ? (
                <>
                  <div className="task-detail-v2-badges">
                    <span className={`task-detail-v2-badge task-detail-v2-badge-priority task-detail-v2-badge-priority-${task.priority}`}>
                      {priorityLabel(task.priority)}
                    </span>
                    <span className={`task-detail-v2-badge task-detail-v2-badge-status ${statusClass(task, now)}`}>
                      {statusLabel(task, now)}
                    </span>
                    {badges.map((badge) => (
                      <span key={badge} className="task-detail-v2-badge task-detail-v2-badge-repeat">
                        ↻ {badge}
                      </span>
                    ))}
                  </div>
                  <div className="task-detail-v2-creator">
                    <span className="task-detail-v2-avatar" aria-hidden>
                      {assigneeInitials(task.creator?.name ?? null, task.creator?.email ?? null)}
                    </span>
                    <span className="task-detail-v2-creator-text">
                      Created by {creatorName} · {formatShortDate(task.createdAt)}
                    </span>
                  </div>
                </>
              ) : null}
            </div>
            {!showFocusedFeedbackTask ? (
              <div className="task-detail-v2-head-actions">
                {canEdit && !editMode ? (
                  <button type="button" className="task-detail-v2-icon-btn" onClick={() => setEditMode(true)}>
                    <span className="task-detail-v2-icon" aria-hidden>✎</span>
                    Edit
                  </button>
                ) : null}
                {canDelete && editMode ? (
                  <div className="task-detail-v2-menu-wrap" ref={headMenuRef}>
                    <button
                      type="button"
                      className="task-detail-v2-icon-btn task-detail-v2-icon-btn--icon"
                      aria-label="More actions"
                      aria-expanded={headMenuOpen}
                      onClick={() => setHeadMenuOpen((v) => !v)}
                    >
                      ⋯
                    </button>
                    {headMenuOpen ? (
                      <div className="task-detail-v2-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          className="task-detail-v2-menu-item task-detail-v2-menu-item--danger"
                          disabled={busy}
                          onClick={() => {
                            setHeadMenuOpen(false);
                            if (isRecurringTask(task)) setRecurringScopeMode("delete");
                            else void handleDelete("task");
                          }}
                        >
                          Delete task
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <button type="button" className="task-detail-v2-icon-btn task-detail-v2-icon-btn--icon" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>
            ) : (
              <div className="task-detail-v2-head-actions">
                <button type="button" className="task-detail-v2-icon-btn task-detail-v2-icon-btn--icon" onClick={onClose} aria-label="Close">
                  ×
                </button>
              </div>
            )}
          </header>

          <div className={`task-detail-v2-body${showFocusedFeedbackTask ? " task-detail-v2-body--focused" : ""}`}>
            <section className="task-detail-v2-main">
              {feedbackContext && feedbackMeta ? (
                <section className="task-detail-v2-block enterprise-oneone-feedback-task-section">
                  <h3 className="task-detail-v2-block-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h3>
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
                <section className="task-detail-v2-block enterprise-oneone-feedback-task-section">
                  <h3 className="task-detail-v2-block-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h3>
                  <p className="enterprise-muted" aria-live="polite">
                    Loading your check-in…
                  </p>
                </section>
              ) : null}

              {showFeedbackAlreadySubmitted ? (
                <section className="task-detail-v2-block enterprise-oneone-feedback-task-section">
                  <h3 className="task-detail-v2-block-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h3>
                  <p className="enterprise-muted">
                    Your notes are saved. Mark this task complete when you are finished.
                  </p>
                </section>
              ) : null}

              {showFeedbackLoadError ? (
                <section className="task-detail-v2-block enterprise-oneone-feedback-task-section">
                  <h3 className="task-detail-v2-block-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h3>
                  <p className="auth-error" role="alert">
                    {feedbackContextError === "Check-in not found"
                      ? "This check-in is no longer available. If you already added your notes, you can mark this task complete."
                      : feedbackContextError}
                  </p>
                  <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" onClick={onFeedbackRetry}>
                    Try again
                  </button>
                </section>
              ) : null}

              {isFeedbackTask && !showFocusedFeedbackTask ? (
                <section className="task-detail-v2-block">
                  <h3 className="task-detail-v2-block-title">Check-in follow-up</h3>
                  <p className="task-detail-v2-description">{ASSOCIATE_FEEDBACK_INTRO}</p>
                  <p className="enterprise-muted">
                    Assigned to {assigneeLabel}. They will add their notes here when ready.
                  </p>
                </section>
              ) : null}

              {!feedbackContext && !showFeedbackFormLoading && descriptionText ? (
                <section className="task-detail-v2-block">
                  <h3 className="task-detail-v2-block-title">Description</h3>
                  <div className="task-detail-v2-description">
                    <TaskDescriptionContent text={descriptionText} />
                  </div>
                </section>
              ) : null}

              {!showFocusedFeedbackTask ? (
                <section className="task-detail-v2-block">
                  <div className="task-detail-v2-block-head">
                    <h3 className="task-detail-v2-block-title">Subtasks</h3>
                    {subtasks.length > 0 ? (
                      <span className="task-detail-v2-checklist-count">
                        {completedSubtasks} / {subtasks.length} completed
                      </span>
                    ) : null}
                  </div>
                  {subtasks.length > 0 ? (
                    <ul className="task-detail-v2-checklist">
                      {subtasks.map((s) => (
                        <li key={s.id} className={s.completed ? "task-detail-v2-checklist-item--done" : ""}>
                          <span className="task-detail-v2-checklist-drag" aria-hidden>
                            ⋮⋮
                          </span>
                          <button
                            type="button"
                            className={`task-detail-v2-checklist-check${s.completed ? " task-detail-v2-checklist-check--done" : ""}`}
                            disabled={busy || isCompleted || (!isAssignee && !canEdit)}
                            aria-label={s.completed ? `Mark "${s.title}" incomplete` : `Mark "${s.title}" complete`}
                            onClick={() => void toggleSubtask(s)}
                          >
                            {s.completed ? "✓" : ""}
                          </button>
                          <span className="task-detail-v2-checklist-label">{s.title}</span>
                          {editMode ? (
                            <button
                              type="button"
                              className="task-detail-v2-checklist-remove"
                              disabled={busy}
                              onClick={() => void removeSubtask(s.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="enterprise-muted task-detail-v2-checklist-empty">No subtasks yet.</p>
                  )}
                  {canEdit && editMode && !isCompleted ? (
                    <div className="task-detail-v2-subtask-add">
                      <input
                        className="auth-input task-detail-v2-checklist-input"
                        value={newSubtask}
                        placeholder="Add a subtask"
                        disabled={busy}
                        onChange={(e) => setNewSubtask(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void addSubtask();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="create-v3-subtask-add-btn"
                        disabled={busy || !newSubtask.trim()}
                        onClick={() => void addSubtask()}
                      >
                        Add
                      </button>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </section>

            {!showFocusedFeedbackTask ? (
              <aside className="task-detail-v2-sidebar">
                <div className="task-detail-v2-side-card">
                  <h3 className="task-detail-v2-side-title">Task info</h3>
                  <dl className="task-detail-v2-info-rows">
                    <div className="task-detail-v2-info-row">
                      <dt>
                        <span className="task-detail-v2-info-icon" aria-hidden>●</span> Priority
                      </dt>
                      <dd>
                        {editMode ? (
                          <select className="auth-input task-detail-v2-inline-input" value={editPriority} onChange={(e) => setEditPriority(e.target.value)}>
                            {PRIORITIES.map((p) => (
                              <option key={p.value} value={p.value}>
                                {p.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <>
                            <span className={`task-detail-v2-priority-dot task-detail-v2-priority-dot--${task.priority}`} aria-hidden />
                            {priorityLabel(task.priority)}
                          </>
                        )}
                      </dd>
                    </div>
                    <div className="task-detail-v2-info-row">
                      <dt>
                        <span className="task-detail-v2-info-icon" aria-hidden>📅</span> Due date
                      </dt>
                      <dd>
                        {editMode ? (
                          <input type="date" className="auth-input task-detail-v2-inline-input" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} />
                        ) : (
                          formatModalDate(task.dueDate)
                        )}
                      </dd>
                    </div>
                    {recurrenceLabel ? (
                      <div className="task-detail-v2-info-row">
                        <dt>
                          <span className="task-detail-v2-info-icon" aria-hidden>↻</span> Repeats
                        </dt>
                        <dd>{recurrenceLabel}</dd>
                      </div>
                    ) : null}
                    <div className="task-detail-v2-info-row">
                      <dt>
                        <span className="task-detail-v2-info-icon" aria-hidden>👤</span> Owner
                      </dt>
                      <dd className="task-detail-v2-owner">
                        <span className="task-detail-v2-avatar task-detail-v2-avatar--sm" aria-hidden>
                          {assigneeInitials(task.creator?.name ?? null, task.creator?.email ?? null)}
                        </span>
                        {creatorName}
                      </dd>
                    </div>
                  </dl>

                  <h3 className="task-detail-v2-side-title task-detail-v2-side-title--spaced">Assignees</h3>
                  <AssigneeMultiSelect
                    members={members}
                    selectedIds={[...assignedIds]}
                    readOnly={!canEdit || !editMode}
                    disabled={busy}
                    loading={!teamDetail}
                    compact
                    onToggle={canEdit && editMode ? toggleAssignee : undefined}
                  />
                  {!isAssignee && meId && canEdit && editMode ? (
                    <button
                      type="button"
                      className="task-detail-v2-add-link task-detail-v2-assign-me"
                      disabled={busy}
                      onClick={() => void toggleAssignee(meId, true)}
                    >
                      Assign to me
                    </button>
                  ) : null}

                  <h3 className="task-detail-v2-side-title task-detail-v2-side-title--spaced">Activity</h3>
                  <dl className="task-detail-v2-info-rows task-detail-v2-activity">
                    <div className="task-detail-v2-info-row">
                      <dt>
                        <span className="task-detail-v2-info-icon" aria-hidden>📅</span> Created
                      </dt>
                      <dd>{formatModalDate(task.createdAt)}</dd>
                    </div>
                    <div className="task-detail-v2-info-row">
                      <dt>
                        <span className="task-detail-v2-info-icon" aria-hidden>✎</span> Last updated
                      </dt>
                      <dd>{formatModalDate(task.updatedAt)}</dd>
                    </div>
                    {task.completedAt ? (
                      <div className="task-detail-v2-info-row">
                        <dt>
                          <span className="task-detail-v2-info-icon" aria-hidden>✓</span> Completed
                        </dt>
                        <dd>{formatModalDate(task.completedAt)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {photoUrl ? (
                    <div className="task-detail-v2-photo-block task-detail-v2-photo-block--sidebar">
                      <img
                        src={photoUrl}
                        alt="Task reference photo"
                        className="task-detail-v2-photo"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  ) : null}
                </div>
              </aside>
            ) : null}
          </div>

          {error ? <p className="auth-error task-detail-v2-error">{error}</p> : null}

          {!showFocusedFeedbackTask ? (
            <footer className="task-detail-v2-footer">
              {editMode ? (
                <>
                  <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" disabled={busy} onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="task-detail-v2-btn task-detail-v2-btn--primary"
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
              ) : (
                <>
                  <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" onClick={onClose}>
                    Cancel
                  </button>
                  {isCompleted ? (
                    canEdit || isAssignee ? (
                      <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" disabled={busy} onClick={() => setPrompt("recall")}>
                        Recall task
                      </button>
                    ) : null
                  ) : isAssignee || canEdit ? (
                    <button type="button" className="task-detail-v2-btn task-detail-v2-btn--primary" disabled={busy} onClick={() => setPrompt("complete")}>
                      <span aria-hidden>✓</span> Complete task
                    </button>
                  ) : null}
                </>
              )}
            </footer>
          ) : showFeedbackAlreadySubmitted && !isCompleted ? (
            <footer className="task-detail-v2-footer">
              <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" onClick={onClose}>
                Close
              </button>
              <button type="button" className="task-detail-v2-btn task-detail-v2-btn--primary" disabled={busy} onClick={() => setPrompt("complete")}>
                <span aria-hidden>✓</span> Complete task
              </button>
            </footer>
          ) : showFocusedFeedbackTask ? (
            <footer className="task-detail-v2-footer">
              <button type="button" className="task-detail-v2-btn task-detail-v2-btn--ghost" onClick={onClose}>
                Close
              </button>
              {!isCompleted && (showFeedbackLoadError || showFeedbackAlreadySubmitted) ? (
                <button type="button" className="task-detail-v2-btn task-detail-v2-btn--primary" disabled={busy} onClick={() => setPrompt("complete")}>
                  <span aria-hidden>✓</span> Complete task
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
          task.dueDate && isTaskOverdue(task)
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

function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatModalDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", weekday: "short" });
}
