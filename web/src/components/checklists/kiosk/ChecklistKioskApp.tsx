import { useMemo, useState } from "react";
import { ChecklistKioskTaskRow } from "./ChecklistKioskTaskRow";
import type { KioskTab, KioskTaskItem, KioskTaskState } from "./checklist-kiosk-types";

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
  onRestart?: () => void;
};

function todayLabel(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

export function ChecklistKioskApp({
  mode = "live",
  locationName,
  teamName,
  teamImage,
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
  onRestart,
}: Props) {
  const [tab, setTab] = useState<KioskTab>("today");
  const readOnly = mode === "preview";
  const progressPct = items.length > 0 ? Math.round((signedCount / items.length) * 100) : 0;

  const pendingItems = useMemo(() => items.filter((i) => !tasks[i.id]?.signed), [items, tasks]);
  const completedItems = useMemo(() => items.filter((i) => tasks[i.id]?.signed), [items, tasks]);

  const renderTaskList = (list: KioskTaskItem[], emptyMessage: string) => {
    if (list.length === 0) {
      return <p className="kiosk-app-empty">{emptyMessage}</p>;
    }
    return (
      <ul className="kiosk-task-list">
        {list.map((item) => {
          const idx = items.findIndex((i) => i.id === item.id);
          const state = tasks[item.id] ?? { signed: false, signerName: "", signedAt: null };
          return (
            <ChecklistKioskTaskRow
              key={item.id}
              item={item}
              index={idx}
              state={state}
              readOnly={readOnly}
              onSignerChange={(name) => onSignerChange?.(item.id, name)}
              onSignOff={() => onSignOff?.(item.id)}
              error={!state.signed && taskError && taskErrorItemId === item.id ? taskError : null}
            />
          );
        })}
      </ul>
    );
  };

  return (
    <div className={`kiosk-app${mode === "preview" ? " kiosk-app--preview" : ""}`} data-testid="checklist-kiosk-app">
      <header className="kiosk-app-header">
        <div className="kiosk-app-header__row">
          <img src="/alenio-logo-white.png" alt="Alenio" className="kiosk-app-header__logo" width={108} height={26} />
          <div className="kiosk-app-header__date">{todayLabel()}</div>
        </div>
        <div className="kiosk-app-header__workspace">
          {teamImage ? (
            <img src={teamImage} alt="" className="kiosk-app-header__avatar" />
          ) : (
            <div className="kiosk-app-header__avatar kiosk-app-header__avatar--fallback" aria-hidden>
              {(teamName || "W").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="kiosk-app-header__meta">
            <p className="kiosk-app-header__team">{loading ? "Loading…" : teamName}</p>
            <h1 className="kiosk-app-header__location">{loading ? "…" : locationName}</h1>
          </div>
        </div>
        <div className="kiosk-app-header__checklist-row">
          <div>
            <p className="kiosk-app-header__checklist-label">Today&apos;s Checklist</p>
            <p className="kiosk-app-header__checklist-count">
              {items.length === 0 ? "No tasks yet" : `${signedCount} of ${items.length} complete`}
            </p>
          </div>
          <div className="kiosk-app-header__pct">{progressPct}%</div>
        </div>
        <div
          className="kiosk-app-header__progress"
          role="progressbar"
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="kiosk-app-header__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </header>

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
                Start next checklist
              </button>
            ) : null}
          </div>
        ) : tab === "today" ? (
          <>
            {submitting ? <p className="kiosk-app-banner">Saving completed checklist…</p> : null}
            {error ? (
              <p className="kiosk-app-error kiosk-app-error--inline" role="alert">
                {error}
              </p>
            ) : null}
            {renderTaskList(
              items,
              items.length === 0
                ? "No tasks have been added to this checklist yet. Your manager can add them anytime."
                : "All tasks are complete for today.",
            )}
          </>
        ) : tab === "completed" ? (
          renderTaskList(completedItems, "No completed tasks yet. Enter initials and mark tasks complete on the Today tab.")
        ) : (
          <div className="kiosk-app-info">
            <section className="kiosk-app-info-card">
              <h2>How it works</h2>
              <ol>
                <li>Enter your initials in the box to the right of each task.</li>
                <li>Tap ✓ or press Enter to mark the task complete.</li>
                <li>Completed tasks turn gray and save automatically.</li>
                <li>The full checklist submits when every task is done.</li>
              </ol>
            </section>
            <section className="kiosk-app-info-card">
              <h2>Checklist</h2>
              <p>
                <strong>{locationName}</strong>
                <br />
                {teamName}
              </p>
            </section>
            <section className="kiosk-app-info-card kiosk-app-info-card--stats">
              <div>
                <span className="kiosk-app-stat-num">{pendingItems.length}</span>
                <span className="kiosk-app-stat-label">Pending</span>
              </div>
              <div>
                <span className="kiosk-app-stat-num">{completedItems.length}</span>
                <span className="kiosk-app-stat-label">Complete</span>
              </div>
              <div>
                <span className="kiosk-app-stat-num">{items.length}</span>
                <span className="kiosk-app-stat-label">Total</span>
              </div>
            </section>
            <p className="kiosk-app-info-foot">No login required · Alenio Enterprise</p>
          </div>
        )}
      </main>

      {!submitted && !loading && locationName ? (
        <nav className="kiosk-app-nav" aria-label="Checklist navigation">
          <button
            type="button"
            className={`kiosk-app-nav__btn${tab === "today" ? " kiosk-app-nav__btn--active" : ""}`}
            onClick={() => setTab("today")}
          >
            <span className="kiosk-app-nav__icon" aria-hidden>
              ☀
            </span>
            Today
            {pendingItems.length > 0 ? <span className="kiosk-app-nav__badge">{pendingItems.length}</span> : null}
          </button>
          <button
            type="button"
            className={`kiosk-app-nav__btn${tab === "completed" ? " kiosk-app-nav__btn--active" : ""}`}
            onClick={() => setTab("completed")}
          >
            <span className="kiosk-app-nav__icon" aria-hidden>
              ✓
            </span>
            Completed
            {completedItems.length > 0 ? (
              <span className="kiosk-app-nav__badge kiosk-app-nav__badge--green">{completedItems.length}</span>
            ) : null}
          </button>
          <button
            type="button"
            className={`kiosk-app-nav__btn${tab === "info" ? " kiosk-app-nav__btn--active" : ""}`}
            onClick={() => setTab("info")}
          >
            <span className="kiosk-app-nav__icon" aria-hidden>
              i
            </span>
            Info
          </button>
        </nav>
      ) : null}
    </div>
  );
}
