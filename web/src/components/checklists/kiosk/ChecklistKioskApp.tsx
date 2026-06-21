import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlenioGoLogo } from "../../AlenioGoLogo";
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
  onUnsign?: (itemId: string) => void;
  onRestart?: () => void;
  backHref?: string;
  backLabel?: string;
};

function useKioskClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
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
  onUnsign,
  onRestart,
  backHref,
  backLabel = "All checklists",
}: Props) {
  const [tab, setTab] = useState<KioskTab>("today");
  const readOnly = mode === "preview";
  const now = useKioskClock();
  const progressPct = items.length > 0 ? Math.round((signedCount / items.length) * 100) : 0;

  const pendingItems = useMemo(() => items.filter((i) => !tasks[i.id]?.signed), [items, tasks]);
  const completedItems = useMemo(() => items.filter((i) => tasks[i.id]?.signed), [items, tasks]);

  const renderTaskList = (list: KioskTaskItem[], emptyMessage: string) => {
    if (list.length === 0) {
      return <p className="kiosk-app-empty">{emptyMessage}</p>;
    }
    return (
      <div className="kiosk-task-panel">
        <div className="kiosk-task-panel__head" aria-hidden>
          <span className="kiosk-task-panel__col-num">#</span>
          <span className="kiosk-task-panel__col-check" />
          <span className="kiosk-task-panel__col-task">Task</span>
          <span className="kiosk-task-panel__col-sign">Sign-off</span>
        </div>
        <ul className="kiosk-task-list">
        {list.map((item, idx) => {
          const state = tasks[item.id] ?? { signed: false, signerName: "", signedAt: null };
          return (
            <ChecklistKioskTaskRow
              key={item.id}
              index={idx + 1}
              item={item}
              locationName={locationName}
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
      </div>
    );
  };

  const clockLabel = `${now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })} · ${now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;

  return (
    <div className={`kiosk-app${mode === "preview" ? " kiosk-app--preview" : ""}`} data-testid="checklist-kiosk-app">
      <header className="kiosk-app-header kiosk-app-header--checklist">
        {backHref ? (
          <Link to={backHref} className="kiosk-app-header__back">
            ← {backLabel}
          </Link>
        ) : null}
        <div className="kiosk-app-header__brand-row">
          <AlenioGoLogo variant="page" className="kiosk-app-header__go-logo kiosk-app-header__go-logo--page" />
          <div className="kiosk-app-header__meta">
            <p className="kiosk-app-header__clock kiosk-app-header__clock--compact" aria-label="Current date and time">
              {clockLabel}
            </p>
            <div className="kiosk-app-header__workspace-pill">
              {teamImage ? (
                <img src={teamImage} alt="" className="kiosk-app-header__pill-avatar" />
              ) : (
                <span className="kiosk-app-header__pill-fallback" aria-hidden>
                  {(teamName || "W").charAt(0).toUpperCase()}
                </span>
              )}
              <span>{loading ? "…" : teamName || "Workspace"}</span>
            </div>
          </div>
        </div>
        <h1 className="kiosk-app-header__title">{loading ? "Loading…" : locationName || "Checklist"}</h1>
        <p className="kiosk-app-header__subtitle">Sign off each task below when complete.</p>
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
        ) : (
          <>
            {items.length > 0 ? (
              <section className="kiosk-app-progress-card" aria-label="Checklist progress">
                <div className="kiosk-app-progress-card__row">
                  <span className="kiosk-app-progress-card__label">Progress</span>
                  <span className="kiosk-app-progress-card__count">
                    {signedCount} of {items.length} complete
                  </span>
                </div>
                <div
                  className="kiosk-app-progress-card__bar"
                  role="progressbar"
                  aria-valuenow={progressPct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="kiosk-app-progress-card__fill" style={{ width: `${progressPct}%` }} />
                </div>
              </section>
            ) : null}

            {tab === "today" ? (
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
              renderTaskList(
                completedItems,
                "No completed tasks yet. Enter initials and sign off on the Today tab.",
              )
            ) : (
              <div className="kiosk-app-info">
                <section className="kiosk-app-info-card">
                  <h2>How it works</h2>
                  <ol>
                    <li>Enter your initials or name on the right of each task.</li>
                    <li>Tap Sign Off to mark the task complete.</li>
                    <li>Tap Undo to mark a task incomplete again.</li>
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
                <p className="kiosk-app-info-foot">No login required · Alenio Go</p>
              </div>
            )}
          </>
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
              ✓
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
              ☰
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
