import type { ApiTask } from "../../lib/api";
import {
  assigneeInitials,
  formatDoneDueDisplay,
  formatTaskDueDisplay,
  isTaskOverdue,
  priorityClass,
  priorityLabel,
} from "../../lib/task-display";
import { formatTaskOneOnOneSource } from "../../lib/task-one-on-one-source";
import { isRecurringTask } from "../../lib/recurring-task";

type Props = {
  task: ApiTask;
  now?: Date;
  memberNameByUserId?: Record<string, string>;
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
  memberNameByUserId,
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
  const oneOnOneSource = formatTaskOneOnOneSource(task, memberNameByUserId);
  const dueDisplay = isDone ? formatDoneDueDisplay(task) : formatTaskDueDisplay(task.dueDate, now);

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
          <div className="enterprise-workspace-task-title-stack">
            <span className="enterprise-task-title">{task.title}</span>
            {oneOnOneSource ? <span className="enterprise-workspace-task-source">{oneOnOneSource}</span> : null}
          </div>
        </div>
      </td>
      <td className="enterprise-workspace-task-td-trail">
        <div className="enterprise-workspace-task-trail">
          <div className="enterprise-workspace-task-trail-due">
            <div className="enterprise-workspace-task-due-stack">
              <span className="enterprise-workspace-task-due-date">{dueDisplay.date}</span>
              {dueDisplay.status ? (
                <span
                  className={`enterprise-workspace-task-due-status enterprise-workspace-task-due-status--${dueDisplay.tone}`}
                >
                  {dueDisplay.status}
                </span>
              ) : null}
            </div>
          </div>
          <span className={priorityClass(task.priority)}>{priorityLabel(task.priority)}</span>
          <div className="enterprise-assignees enterprise-workspace-task-trail-assignees">
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
