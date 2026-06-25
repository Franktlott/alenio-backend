import { useEffect, useRef } from "react";

export type TaskListView = "active" | "completed" | "archived";
export type TaskPriorityFilter = "all" | "urgent" | "high" | "medium" | "low";
export type TaskStatusFilter = "all" | "open" | "overdue";

type MemberOption = { userId: string; label: string };

type Props = {
  open: boolean;
  onClose: () => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (userId: string) => void;
  members: MemberOption[];
  showAssigneeFilter: boolean;
  priorityFilter: TaskPriorityFilter;
  onPriorityFilterChange: (value: TaskPriorityFilter) => void;
  statusFilter: TaskStatusFilter;
  onStatusFilterChange: (value: TaskStatusFilter) => void;
  statusFilterEnabled: boolean;
};


function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

const PRIORITY_OPTIONS: Array<{ value: TaskPriorityFilter; label: string }> = [
  { value: "all", label: "All priorities" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const STATUS_OPTIONS: Array<{ value: TaskStatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "overdue", label: "Overdue" },
];

export function WorkspaceTaskViewMenu({
  open,
  onClose,
  assigneeFilter,
  onAssigneeFilterChange,
  members,
  showAssigneeFilter,
  priorityFilter,
  onPriorityFilterChange,
  statusFilter,
  onStatusFilterChange,
  statusFilterEnabled,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open, onClose]);

  if (!open) return null;

  const renderSubmenuOptions = (
    options: Array<{ value: string; label: string }>,
    current: string,
    onPick: (value: string) => void,
  ) => (
    <div className="enterprise-workspace-task-view-submenu" role="menu">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="menuitemradio"
          aria-checked={current === option.value}
          className={`enterprise-workspace-task-view-submenu-item${current === option.value ? " enterprise-workspace-task-view-submenu-item-on" : ""}`}
          onClick={() => {
            onPick(option.value);
            onClose();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="enterprise-workspace-task-view-menu-wrap" ref={wrapRef}>
      <div className="enterprise-workspace-task-view-menu" role="menu" onClick={(e) => e.stopPropagation()}>
        <p className="enterprise-workspace-task-view-section">Filters</p>

        {showAssigneeFilter ? (
          <div className="enterprise-workspace-task-view-item-wrap">
            <button
              type="button"
              className="enterprise-workspace-task-view-item enterprise-workspace-task-view-item--submenu"
              aria-haspopup="menu"
            >
              Assigned person
              <ChevronLeft />
            </button>
            {renderSubmenuOptions(
              [{ value: "all", label: "All members" }, ...members.map((m) => ({ value: m.userId, label: m.label }))],
              assigneeFilter,
              onAssigneeFilterChange,
            )}
          </div>
        ) : null}

        <div className="enterprise-workspace-task-view-item-wrap">
          <button
            type="button"
            className="enterprise-workspace-task-view-item enterprise-workspace-task-view-item--submenu"
            aria-haspopup="menu"
          >
            Priority
            <ChevronLeft />
          </button>
          {renderSubmenuOptions(
            PRIORITY_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
            priorityFilter,
            (value) => onPriorityFilterChange(value as TaskPriorityFilter),
          )}
        </div>

        {statusFilterEnabled ? (
          <div className="enterprise-workspace-task-view-item-wrap">
            <button
              type="button"
              className="enterprise-workspace-task-view-item enterprise-workspace-task-view-item--submenu"
              aria-haspopup="menu"
            >
              Status
              <ChevronLeft />
            </button>
            {renderSubmenuOptions(
              STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
              statusFilter,
              (value) => onStatusFilterChange(value as TaskStatusFilter),
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
