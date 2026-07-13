import type { TaskListView } from "./WorkspaceTaskViewMenu";

type Props = {
  view: TaskListView;
  onViewChange: (view: TaskListView) => void;
  openCount: number;
  completedCount: number;
};

const TABS: Array<{ id: TaskListView; label: string }> = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "archived", label: "Archive" },
];

export function WorkspaceTaskListViewTabs({ view, onViewChange, openCount, completedCount }: Props) {
  return (
    <div className="enterprise-workspace-task-view-tabs" role="tablist" aria-label="Task list view">
      {TABS.map((tab) => {
        const active = view === tab.id;
        const count =
          tab.id === "active" ? openCount : tab.id === "completed" ? completedCount : null;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`enterprise-workspace-task-view-tab${active ? " enterprise-workspace-task-view-tab-on" : ""}`}
            onClick={() => onViewChange(tab.id)}
          >
            {tab.label}
            {count !== null ? (
              <span className="enterprise-workspace-task-view-tab-count">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
