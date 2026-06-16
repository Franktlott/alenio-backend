import type { ApiTask } from "../../lib/api";
import {
  assigneeInitials,
  formatDoneLabel,
  formatTaskDue,
  isTaskOverdue,
  priorityClass,
  priorityLabel,
  statusClass,
  statusLabel,
  taskBadges,
} from "../../lib/task-display";
import { isRecurringTask } from "../../lib/recurring-task";

type Props = {
  task: ApiTask;
  now?: Date;
  menuOpen: boolean;
  completeBusy?: boolean;
  deleteBusy?: boolean;
  canDelete: boolean;
  canComplete: boolean;
  canEdit: boolean;
  onOpen: () => void;
  onToggleComplete: (e: React.MouseEvent) => void;
  onEdit: () => void;
  onDelete: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
};

export function WorkspaceTaskRow({
  task,
  now = new Date(),
  menuOpen,
  completeBusy,
  deleteBusy,
  canDelete,
  canComplete,
  canEdit,
  onOpen,
  onToggleComplete,
  onEdit,
  onDelete,
  onMenuToggle,
}: Props) {
  const isDone = task.status === "done";
  const assignees = task.assignments.map((a) => a.user).filter(Boolean);
  const firstAssignee = assignees[0];
  const badges = taskBadges(task);
  const overdue = isTaskOverdue(task, now);

  return (
    <article
      className={`enterprise-workspace-task-row${isDone ? " enterprise-workspace-task-row--done" : ""}${overdue ? " enterprise-workspace-task-row--overdue" : ""}`}
      data-testid={`workspace-task-${task.id}`}
    >
      <button
        type="button"
        className={`enterprise-workspace-task-check${isDone ? " enterprise-workspace-task-check--done" : ""}`}
        aria-label={isDone ? "Completed task" : "Mark task complete"}
        disabled={!canComplete || completeBusy || isDone}
        onClick={onToggleComplete}
      >
        {isDone || completeBusy ? "✓" : ""}
      </button>

      <button type="button" className="enterprise-workspace-task-main" onClick={onOpen}>
        <div className="enterprise-workspace-task-title-row">
          {task.isJoint ? <span className="enterprise-workspace-task-emoji" aria-hidden>🤝</span> : null}
          <span className="enterprise-workspace-task-title">{task.title}</span>
          {isRecurringTask(task) && !isDone ? (
            <span className="enterprise-workspace-task-repeat" aria-label="Repeating task">
              ↺
            </span>
          ) : null}
        </div>
        {firstAssignee ? (
          <p className="enterprise-workspace-task-assignee">
            Assigned to {firstAssignee.name ?? firstAssignee.email ?? "Member"}
          </p>
        ) : null}
        <div className="enterprise-workspace-task-meta">
          <span className={priorityClass(task.priority)}>{priorityLabel(task.priority)}</span>
          <span className={statusClass(task, now)}>{statusLabel(task, now)}</span>
          <span className={`enterprise-workspace-task-due${overdue ? " enterprise-workspace-task-due--overdue" : ""}`}>
            {isDone ? formatDoneLabel(task) : formatTaskDue(task.dueDate, now)}
          </span>
          {badges.map((badge) => (
            <span key={badge} className="enterprise-workspace-task-badge">
              {badge}
            </span>
          ))}
        </div>
      </button>

      <div className="enterprise-workspace-task-side">
        <div className="enterprise-assignees enterprise-workspace-task-avatars">
          {assignees.slice(0, 3).map((u) =>
            u.image ? (
              <img key={u.id} src={u.image} alt={u.name ?? u.email ?? "Assignee"} className="enterprise-assignee-img" />
            ) : (
              <span key={u.id} className="enterprise-assignee-initials" title={u.name ?? u.email ?? ""}>
                {assigneeInitials(u.name, u.email)}
              </span>
            ),
          )}
        </div>
        <div className="enterprise-task-row-actions">
          <button
            type="button"
            className="enterprise-row-more"
            aria-label={`Actions for ${task.title}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            onClick={onMenuToggle}
          >
            ⋮
          </button>
          {menuOpen ? (
            <div className="enterprise-task-row-menu" role="menu">
              {canEdit ? (
                <button type="button" role="menuitem" onClick={onEdit}>
                  Edit
                </button>
              ) : null}
              {canComplete && !isDone ? (
                <button type="button" role="menuitem" onClick={onToggleComplete} disabled={completeBusy}>
                  {completeBusy ? "Completing…" : "Mark complete"}
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  className="enterprise-task-row-menu-danger"
                  role="menuitem"
                  disabled={deleteBusy}
                  onClick={onDelete}
                >
                  {deleteBusy ? "Deleting…" : "Delete"}
                </button>
              ) : null}
              {!canEdit && !canComplete && !canDelete ? (
                <p className="enterprise-task-row-menu-muted" role="presentation">
                  No actions available
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
