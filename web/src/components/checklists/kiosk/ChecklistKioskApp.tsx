import { useMemo, useState } from "react";
import { KioskAppHeader } from "./KioskAppHeader";
import { ChecklistKioskTaskCard } from "./ChecklistKioskTaskCard";
import type { KioskTaskItem, KioskTaskState } from "./checklist-kiosk-types";

type Props = {
  mode?: "live" | "preview";
  locationName: string;
  teamName: string;
  teamImage: string | null;
  items: KioskTaskItem[];
  tasks: Record<string, KioskTaskState>;
  signedCount: number;
  loading?: boolean;
  error?: string | null;
  taskError?: string | null;
  taskErrorItemId?: string | null;
  submitting?: boolean;
  submitted?: boolean;
  onSignerChange?: (itemId: string, name: string) => void;
  onSignOff?: (itemId: string) => void;
  onUnsign?: (itemId: string) => void;
  onRestart?: () => void;
  backHref?: string;
  backLabel?: string;
};

export function ChecklistKioskApp({
  mode = "live",
  locationName,
  teamName,
  items,
  tasks,
  signedCount,
  loading = false,
  error = null,
  taskError = null,
  taskErrorItemId = null,
  submitting = false,
  submitted = false,
  onSignerChange,
  onSignOff,
  onUnsign,
  onRestart,
  backHref,
  backLabel = "All checklists",
}: Props) {
  const readOnly = mode === "preview";
  const [showCompleted, setShowCompleted] = useState(false);

  const pendingItems = useMemo(() => items.filter((i) => !tasks[i.id]?.signed), [items, tasks]);
  const completedItems = useMemo(() => items.filter((i) => tasks[i.id]?.signed), [items, tasks]);
  const visibleItems = showCompleted ? items : pendingItems;

  const renderTaskList = (list: KioskTaskItem[], emptyMessage: string) => {
    if (list.length === 0) {
      return <p className="kiosk-app-empty">{emptyMessage}</p>;
    }
    return (
      <ul className="kiosk-task-cards">
        {list.map((item, idx) => {
          const state = tasks[item.id] ?? { signed: false, signerName: "", signedAt: null };
          return (
            <ChecklistKioskTaskCard
              key={item.id}
              index={idx + 1}
              item={item}
              state={state}
              readOnly={readOnly}
              onSignerChange={(name) => onSignerChange?.(item.id, name)}
              onSignOff={() => onSignOff?.(item.id)}
              onUnsign={() => onUnsign?.(item.id)}
              error={!state.signed && taskError && taskErrorItemId === item.id ? taskError : null}
            />
          );
        })}
      </ul>
    );
  };

  return (
    <div className={`kiosk-app${mode === "preview" ? " kiosk-app--preview" : ""}`} data-testid="checklist-kiosk-app">
      <KioskAppHeader
        teamName={teamName}
        checklistName={locationName}
        signedCount={signedCount}
        totalCount={items.length}
        loading={loading}
        backHref={backHref}
        backLabel={backLabel}
      />

      <main className="kiosk-app-main">
        {loading ? (
          <p className="kiosk-app-loading">Loading checklist…</p>
        ) : error && items.length === 0 && !submitted ? (
          <p className="kiosk-app-error" role="alert">
            {error}
          </p>
        ) : submitted ? (
          <div className="kiosk-app-complete-panel">
            <div className="kiosk-app-complete-icon" aria-hidden>
              ✓
            </div>
            <h2 className="kiosk-app-complete-title">All tasks complete</h2>
            <p className="kiosk-app-complete-sub">
              {items.length} tasks signed off for {locationName}. Ready for the next associate.
            </p>
            {!readOnly && onRestart ? (
              <button type="button" className="kiosk-app-complete-btn" onClick={onRestart}>
                Back to all checklists
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {submitting ? <p className="kiosk-app-banner">Saving completed checklist…</p> : null}
            {error ? (
              <p className="kiosk-app-error kiosk-app-error--inline" role="alert">
                {error}
              </p>
            ) : null}

            {items.length === 0 ? (
              <div className="kiosk-app-empty-panel">
                <p className="kiosk-app-empty-panel__title">No tasks yet</p>
                <p className="kiosk-app-empty">Your manager hasn&apos;t added tasks to this checklist yet.</p>
              </div>
            ) : (
              <>
                {completedItems.length > 0 ? (
                  <button
                    type="button"
                    className="kiosk-app-completed-toggle"
                    onClick={() => setShowCompleted((v) => !v)}
                    aria-expanded={showCompleted}
                  >
                    {showCompleted
                      ? "Hide completed tasks"
                      : `Show completed tasks (${completedItems.length})`}
                  </button>
                ) : null}
                {renderTaskList(
                  visibleItems,
                  showCompleted
                    ? "No tasks in this view."
                    : pendingItems.length === 0
                      ? "All tasks are complete for today."
                      : "No tasks to show.",
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
