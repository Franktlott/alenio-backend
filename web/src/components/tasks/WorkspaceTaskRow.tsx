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
  const overdue = isTaskOverdue(task, now);

  return (
    <tr
      className={`enterprise-workspace-task-row enterprise-table-row-clickable${isDone ? " enterprise-workspace-task-row--done" : ""}${overdue ? " enterprise-workspace-task-row--overdue" : ""}`}
      data-testid={`workspace-task-${task.id}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="link"
      aria-label={`Open task: ${task.title}`}
    >
      <td className="enterprise-workspace-task-td-check" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`enterprise-workspace-task-check${isDone ? " enterprise-workspace-task-check--done" : ""}`}
          aria-label={isDone ? "Completed task" : "Mark task complete"}
          disabled={!canComplete || completeBusy || isDone}
          onClick={onToggleComplete}
        >
          {isDone || completeBusy ? "✓" : ""}
        </button>
      </td>
      <td className="enterprise-workspace-task-td-title">
        <div className="enterprise-workspace-task-title-cell">
          {isRecurringTask(task) && !isDone ? (
            <span className="enterprise-workspace-task-repeat" aria-label="Repeating task" title="Repeating">
              ↺
            </span>
          ) : null}
          {task.isJoint ? (
            <span className="enterprise-workspace-task-repeat" aria-hidden title="Shared task">
              🤝
            </span>
          ) : null}
          <span className="enterprise-task-title">{task.title}</span>
        </div>
      </td>
      <td className="enterprise-workspace-task-td-due">
        <span className={`enterprise-workspace-task-due${overdue ? " enterprise-workspace-task-due--overdue" : ""}`}>
          {isDone ? formatDoneLabel(task) : formatTaskDue(task.dueDate, now)}
        </span>
      </td>
      <td className="enterprise-workspace-task-td-priority">
        <span className={priorityClass(task.priority)}>{priorityLabel(task.priority)}</span>
      </td>
      <td className="enterprise-workspace-task-td-status">
        <span className={statusClass(task, now)}>{statusLabel(task, now)}</span>
      </td>
      <td className="enterprise-workspace-task-td-assignee">
        <div className="enterprise-assignees">
          {assignees.length === 0 ? (
            <span className="enterprise-muted">—</span>
          ) : (
            assignees.slice(0, 3).map((u) =>
              u.image ? (
                <img key={u.id} src={u.image} alt={u.name ?? u.email ?? "Assignee"} className="enterprise-assignee-img" />
              ) : (
                <span key={u.id} className="enterprise-assignee-initials" title={u.name ?? u.email ?? ""}>
                  {assigneeInitials(u.name, u.email)}
                </span>
              ),
            )
          )}
        </div>
      </td>
      <td className="enterprise-table-td-actions" onClick={(e) => e.stopPropagation()}>
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
      </td>
    </tr>
  );
}
