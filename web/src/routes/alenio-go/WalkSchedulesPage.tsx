import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchWalkTemplates } from "../../lib/walks/api";
import {
  createWalkSchedule,
  fetchWalkOccurrences,
  fetchWalkSchedules,
  type WalkOccurrenceRow,
  type WalkSchedule,
  type WalkScheduleWindow,
} from "../../lib/walks/library-api";
import type { WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type TabId = "all" | "active" | "draft" | "paused";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function minutesToLabel(minutes: number) {
  const normalized = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h24 = Math.floor(normalized / 60);
  const m = normalized % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function windowLabel(w: Pick<WalkScheduleWindow, "startMinutes" | "dueMinutes">) {
  return `${minutesToLabel(w.startMinutes)} - ${minutesToLabel(w.dueMinutes)}`;
}

function frequencyLabel(schedule: WalkSchedule) {
  if (schedule.recurrence === "DAILY") return "Daily";
  if (schedule.recurrence === "ONCE") return "Once";
  const days = Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
  if (!days.length) return "Weekly";
  if (days.length === 1) return DAY_LABELS[days[0]] ?? "Weekly";
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DAY_LABELS[d])
    .join(", ");
}

function assignLabel(schedule: WalkSchedule) {
  if (schedule.assignRole?.trim()) return schedule.assignRole.trim();
  switch (schedule.assignScope) {
    case "ROLE":
      return "Role assignees";
    case "MEMBER":
      return "Selected members";
    case "TEAM":
      return "Team";
    case "ANY":
      return "Anyone";
    default:
      return "All Associates";
  }
}

function statusLabel(schedule: WalkSchedule): "Active" | "Paused" {
  return schedule.isActive ? "Active" : "Paused";
}

function nextRunLabel(schedule: WalkSchedule, occurrences: WalkOccurrenceRow[]) {
  const next = occurrences
    .filter(
      (o) =>
        o.scheduleId === schedule.id &&
        (o.status === "UPCOMING" || o.status === "AVAILABLE" || o.status === "IN_PROGRESS"),
    )
    .sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())[0];
  if (!next) return "—";

  const start = new Date(next.windowStart);
  const now = new Date();
  const startDay = new Date(start);
  startDay.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((startDay.getTime() - today.getTime()) / 86_400_000);
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays > 1 && diffDays < 7) {
    return `${start.toLocaleDateString([], { weekday: "short" })} ${time}`;
  }
  return `${start.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

function IconDots() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function DayTimeline({ windows }: { windows: WalkScheduleWindow[] }) {
  return (
    <div className="wsch-timeline" aria-label="Time windows per day">
      <div className="wsch-timeline-track">
        {windows.map((w) => {
          const start = w.startMinutes;
          let end = w.dueMinutes;
          // Overnight windows: draw to end of day for the day chart.
          if (end <= start) end = 24 * 60;
          const left = (start / (24 * 60)) * 100;
          const width = Math.max(2.5, ((end - start) / (24 * 60)) * 100);
          return (
            <div
              key={w.id}
              className="wsch-timeline-block"
              style={{ left: `${left}%`, width: `${width}%` }}
              title={windowLabel(w)}
            >
              <span>{windowLabel(w)}</span>
            </div>
          );
        })}
      </div>
      <div className="wsch-timeline-labels">
        <span>12 AM</span>
        <span>6 AM</span>
        <span>12 PM</span>
        <span>6 PM</span>
        <span>12 AM</span>
      </div>
    </div>
  );
}

type WindowDraft = { start: string; due: string };

function timeInputToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTimeInput(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function WalkSchedulesPage() {
  const { canManage, teamId } = useAlenioGoShell();
  const [tab, setTab] = useState<TabId>("active");
  const [schedules, setSchedules] = useState<WalkSchedule[]>([]);
  const [occurrences, setOccurrences] = useState<WalkOccurrenceRow[]>([]);
  const [templates, setTemplates] = useState<WalkTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [formTemplateId, setFormTemplateId] = useState("");
  const [formName, setFormName] = useState("");
  const [formRecurrence, setFormRecurrence] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [formDays, setFormDays] = useState<number[]>([1, 3, 5]);
  const [formWindows, setFormWindows] = useState<WindowDraft[]>([
    { start: "06:00", due: "08:00" },
    { start: "13:00", due: "15:00" },
    { start: "20:00", due: "22:00" },
  ]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2800);
  }, []);

  const load = useCallback(async () => {
    if (!teamId) return;
    setError(null);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setDate(to.getDate() + 14);
    to.setHours(23, 59, 59, 999);

    // Schedules are required; occurrences/templates are best-effort for next-run + create form.
    const scheduleResult = await fetchWalkSchedules(teamId).then(
      (s) => ({ ok: true as const, s }),
      (err) => ({ ok: false as const, err }),
    );
    if (!scheduleResult.ok) {
      setSchedules([]);
      setOccurrences([]);
      setTemplates([]);
      throw scheduleResult.err instanceof Error
        ? scheduleResult.err
        : new Error("Could not load schedules.");
    }
    setSchedules(scheduleResult.s);
    setSelectedId(
      (prev) =>
        prev ??
        scheduleResult.s.find((row) => row.isActive)?.id ??
        scheduleResult.s[0]?.id ??
        null,
    );

    const [occResult, templateResult] = await Promise.allSettled([
      fetchWalkOccurrences(teamId, { from: from.toISOString(), to: to.toISOString() }),
      fetchWalkTemplates(teamId),
    ]);
    setOccurrences(occResult.status === "fulfilled" ? occResult.value : []);
    setTemplates(
      templateResult.status === "fulfilled"
        ? templateResult.value.filter((x) => x.status === "PUBLISHED")
        : [],
    );
    if (occResult.status === "rejected" || templateResult.status === "rejected") {
      const detail =
        (occResult.status === "rejected" && occResult.reason instanceof Error
          ? occResult.reason.message
          : null) ||
        (templateResult.status === "rejected" && templateResult.reason instanceof Error
          ? templateResult.reason.message
          : null);
      if (detail) setError(detail);
    }
  }, [teamId]);

  useEffect(() => {
    if (!canManage || !teamId) return;
    let cancelled = false;
    setLoading(true);
    void load()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load schedules.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, load]);

  const filtered = useMemo(() => {
    if (tab === "all") return schedules;
    if (tab === "active") return schedules.filter((s) => s.isActive);
    if (tab === "paused") return schedules.filter((s) => !s.isActive);
    // Draft not modeled yet — keep tab for mock parity.
    return [];
  }, [schedules, tab]);

  const selected = useMemo(
    () => filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  async function submitCreate() {
    if (!teamId || !formTemplateId) {
      setError("Select a published walk.");
      return;
    }
    const windows = formWindows
      .map((w) => {
        const startMinutes = timeInputToMinutes(w.start);
        const dueMinutes = timeInputToMinutes(w.due);
        if (startMinutes == null || dueMinutes == null) return null;
        return { startMinutes, dueMinutes, graceMinutes: 30 };
      })
      .filter((w): w is { startMinutes: number; dueMinutes: number; graceMinutes: number } => !!w);

    if (!windows.length) {
      setError("Add at least one valid time window.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const created = await createWalkSchedule(teamId, {
        templateId: formTemplateId,
        name: formName.trim() || null,
        recurrence: formRecurrence,
        daysOfWeek: formRecurrence === "WEEKLY" ? formDays : null,
        windows,
      });
      setCreateOpen(false);
      setFormName("");
      await load();
      setSelectedId(created.id);
      setTab("active");
      showToast("Schedule created");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wil-shell wsch-shell" data-testid="walk-schedules-page">
      <div className="wil-page">
        <header className="wil-header">
          <div>
            <h1 className="wil-title">Walk Schedules</h1>
            <p className="wil-subtitle">Schedule when walks should be completed.</p>
          </div>
          <div className="wil-header-actions">
            <button
              type="button"
              className="wil-btn wil-btn--primary"
              onClick={() => {
                setCreateOpen(true);
                setFormTemplateId(templates[0]?.id ?? "");
              }}
            >
              + Create Schedule
            </button>
          </div>
        </header>

        <div className="wsch-tabs" role="tablist" aria-label="Schedule filters">
          {(
            [
              ["all", "All Schedules"],
              ["active", "Active"],
              ["draft", "Draft"],
              ["paused", "Paused"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`wsch-tab${tab === id ? " is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {toast ? <p className="wil-toast">{toast}</p> : null}
        {error ? <p className="wil-error">{error}</p> : null}

        {loading ? (
          <EnterprisePageLoading label="Loading schedules…" />
        ) : (
          <>
            <section className="wil-table-card wsch-table-card" aria-label="Walk schedules">
              <div className="wil-table-wrap">
                <table className="wil-table wsch-table">
                  <thead>
                    <tr>
                      <th>Walk</th>
                      <th>Frequency</th>
                      <th>Time Windows</th>
                      <th>Assigned To</th>
                      <th>Next Run</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="wil-empty">
                          {tab === "draft"
                            ? "Draft schedules are not used yet — create an active schedule from a published walk."
                            : "No schedules in this view. Create a schedule to open windows for associates."}
                        </td>
                      </tr>
                    ) : (
                      filtered.map((schedule) => {
                        const walkName =
                          schedule.template?.name ?? schedule.name ?? "Untitled walk";
                        const active = selected?.id === schedule.id;
                        return (
                          <tr
                            key={schedule.id}
                            className={active ? "is-selected" : undefined}
                            onClick={() => setSelectedId(schedule.id)}
                          >
                            <td>
                              <strong className="wsch-walk-name">{walkName}</strong>
                            </td>
                            <td>{frequencyLabel(schedule)}</td>
                            <td>
                              <div className="wsch-window-pills">
                                {schedule.windows.map((w) => (
                                  <span key={w.id} className="wsch-window-pill">
                                    {windowLabel(w)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>{assignLabel(schedule)}</td>
                            <td>{nextRunLabel(schedule, occurrences)}</td>
                            <td>
                              <span
                                className={`wsch-status ${
                                  schedule.isActive ? "wsch-status--active" : "wsch-status--paused"
                                }`}
                              >
                                {statusLabel(schedule)}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="wil-row-menu"
                                aria-label={`Actions for ${walkName}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  showToast("Schedule actions — next");
                                }}
                              >
                                <IconDots />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="wsch-day-card">
              <header className="wsch-day-head">
                <div>
                  <h2>Time Windows per Day</h2>
                  <p>Each time window creates a separate required occurrence.</p>
                </div>
                {selected ? (
                  <span className="wsch-day-walk">
                    {selected.template?.name ?? selected.name ?? "Selected schedule"}
                  </span>
                ) : null}
              </header>
              {selected && selected.windows.length > 0 ? (
                <DayTimeline windows={selected.windows} />
              ) : (
                <p className="wil-muted">Select a schedule to preview its daily windows.</p>
              )}
            </section>
          </>
        )}
      </div>

      {createOpen ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div
            className="wsch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wsch-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="wsch-create-title">Create Schedule</h2>
              <button type="button" className="wil-row-menu" onClick={() => setCreateOpen(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <p className="wil-subtitle">Pick a published walk and the daily windows associates must complete.</p>

            {templates.length === 0 ? (
              <p className="wil-error">Publish a walk in Walk Builder before creating a schedule.</p>
            ) : (
              <div className="wsch-form">
                <label>
                  Walk
                  <select value={formTemplateId} onChange={(e) => setFormTemplateId(e.target.value)}>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Schedule name (optional)
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Daily cooler checks"
                  />
                </label>
                <label>
                  Frequency
                  <select
                    value={formRecurrence}
                    onChange={(e) => setFormRecurrence(e.target.value as "DAILY" | "WEEKLY")}
                  >
                    <option value="DAILY">Daily</option>
                    <option value="WEEKLY">Weekly</option>
                  </select>
                </label>
                {formRecurrence === "WEEKLY" ? (
                  <div className="wsch-days">
                    {DAY_LABELS.map((label, index) => {
                      const on = formDays.includes(index);
                      return (
                        <button
                          key={label}
                          type="button"
                          className={`wsch-day${on ? " is-on" : ""}`}
                          onClick={() =>
                            setFormDays((prev) =>
                              on ? prev.filter((d) => d !== index) : [...prev, index].sort(),
                            )
                          }
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="wsch-windows-edit">
                  <div className="wsch-windows-edit-head">
                    <strong>Time windows</strong>
                    <button
                      type="button"
                      className="wb-linkish"
                      onClick={() =>
                        setFormWindows((prev) => [...prev, { start: "09:00", due: "11:00" }])
                      }
                    >
                      + Add window
                    </button>
                  </div>
                  {formWindows.map((w, index) => (
                    <div key={index} className="wsch-window-row">
                      <input
                        type="time"
                        value={w.start}
                        onChange={(e) =>
                          setFormWindows((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, start: e.target.value } : row)),
                          )
                        }
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={w.due}
                        onChange={(e) =>
                          setFormWindows((prev) =>
                            prev.map((row, i) => (i === index ? { ...row, due: e.target.value } : row)),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="wil-row-menu"
                        disabled={formWindows.length <= 1}
                        onClick={() => setFormWindows((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Remove window"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="wb-linkish"
                    onClick={() =>
                      setFormWindows([
                        { start: minutesToTimeInput(6 * 60), due: minutesToTimeInput(8 * 60) },
                        { start: minutesToTimeInput(13 * 60), due: minutesToTimeInput(15 * 60) },
                        { start: minutesToTimeInput(20 * 60), due: minutesToTimeInput(22 * 60) },
                      ])
                    }
                  >
                    Use 6–8am, 1–3pm, 8–10pm
                  </button>
                </div>
              </div>
            )}

            <footer className="wsch-modal-foot">
              <button type="button" className="wil-btn wil-btn--secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wil-btn--primary"
                disabled={busy || templates.length === 0}
                onClick={() => void submitCreate()}
              >
                {busy ? "Creating…" : "Create Schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
