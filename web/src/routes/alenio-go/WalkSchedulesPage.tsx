import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { fetchWalkTemplates } from "../../lib/walks/api";
import {
  createWalkSchedule,
  deleteWalkSchedule,
  fetchWalkOccurrences,
  fetchWalkSchedules,
  updateWalkSchedule,
  type WalkOccurrenceRow,
  type WalkSchedule,
  type WalkScheduleWindow,
} from "../../lib/walks/library-api";
import type { WalkTemplate } from "../../lib/walks/types";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

type TabId = "all" | "active" | "paused";
type ModalMode = "create" | "edit";

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
  return `${minutesToLabel(w.startMinutes)} – ${minutesToLabel(w.dueMinutes)}`;
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
      return "All associates";
  }
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

function parseWindows(formWindows: WindowDraft[]) {
  return formWindows
    .map((w) => {
      const startMinutes = timeInputToMinutes(w.start);
      const dueMinutes = timeInputToMinutes(w.due);
      if (startMinutes == null || dueMinutes == null) return null;
      return { startMinutes, dueMinutes, graceMinutes: 30 };
    })
    .filter((w): w is { startMinutes: number; dueMinutes: number; graceMinutes: number } => !!w);
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
  const [modalMode, setModalMode] = useState<ModalMode | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

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
    setSelectedId((prev) => {
      if (prev && scheduleResult.s.some((row) => row.id === prev)) return prev;
      return scheduleResult.s.find((row) => row.isActive)?.id ?? scheduleResult.s[0]?.id ?? null;
    });

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

  useEffect(() => {
    if (!menuId) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuId]);

  const counts = useMemo(
    () => ({
      all: schedules.length,
      active: schedules.filter((s) => s.isActive).length,
      paused: schedules.filter((s) => !s.isActive).length,
    }),
    [schedules],
  );

  const filtered = useMemo(() => {
    if (tab === "all") return schedules;
    if (tab === "active") return schedules.filter((s) => s.isActive);
    return schedules.filter((s) => !s.isActive);
  }, [schedules, tab]);

  const selected = useMemo(
    () => filtered.find((s) => s.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const confirmDeleteSchedule = useMemo(
    () => schedules.find((s) => s.id === confirmDeleteId) ?? null,
    [schedules, confirmDeleteId],
  );

  if (!canManage || !teamId) {
    return <Navigate to="/go" replace />;
  }

  function resetFormDefaults() {
    setFormName("");
    setFormRecurrence("DAILY");
    setFormDays([1, 3, 5]);
    setFormWindows([
      { start: "06:00", due: "08:00" },
      { start: "13:00", due: "15:00" },
      { start: "20:00", due: "22:00" },
    ]);
    setFormTemplateId(templates[0]?.id ?? "");
  }

  function openCreate() {
    resetFormDefaults();
    setEditingId(null);
    setModalMode("create");
    setMenuId(null);
  }

  function openEdit(schedule: WalkSchedule) {
    setEditingId(schedule.id);
    setFormTemplateId(schedule.templateId);
    setFormName(schedule.name ?? "");
    setFormRecurrence(schedule.recurrence === "WEEKLY" ? "WEEKLY" : "DAILY");
    setFormDays(
      Array.isArray(schedule.daysOfWeek) && schedule.daysOfWeek.length
        ? schedule.daysOfWeek
        : [1, 3, 5],
    );
    setFormWindows(
      schedule.windows.length
        ? schedule.windows.map((w) => ({
            start: minutesToTimeInput(w.startMinutes),
            due: minutesToTimeInput(w.dueMinutes),
          }))
        : [{ start: "06:00", due: "08:00" }],
    );
    setModalMode("edit");
    setMenuId(null);
  }

  function closeModal() {
    setModalMode(null);
    setEditingId(null);
  }

  async function submitModal() {
    if (!teamId) return;
    const windows = parseWindows(formWindows);
    if (!windows.length) {
      setError("Add at least one valid time window.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (modalMode === "create") {
        if (!formTemplateId) {
          setError("Select a published walk.");
          return;
        }
        const created = await createWalkSchedule(teamId, {
          templateId: formTemplateId,
          name: formName.trim() || null,
          recurrence: formRecurrence,
          daysOfWeek: formRecurrence === "WEEKLY" ? formDays : null,
          windows,
        });
        closeModal();
        await load();
        setSelectedId(created.id);
        setTab("active");
        showToast("Schedule created");
        return;
      }

      if (!editingId) return;
      const updated = await updateWalkSchedule(teamId, editingId, {
        name: formName.trim() || null,
        recurrence: formRecurrence,
        daysOfWeek: formRecurrence === "WEEKLY" ? formDays : null,
        windows,
      });
      closeModal();
      await load();
      setSelectedId(updated.id);
      showToast("Schedule updated");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : modalMode === "edit"
            ? "Could not update schedule."
            : "Could not create schedule.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(schedule: WalkSchedule) {
    if (!teamId) return;
    setMenuId(null);
    setBusy(true);
    setError(null);
    try {
      await updateWalkSchedule(teamId, schedule.id, { isActive: !schedule.isActive });
      await load();
      showToast(schedule.isActive ? "Schedule paused" : "Schedule resumed");
      if (schedule.isActive) setTab("paused");
      else setTab("active");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update schedule.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!teamId || !confirmDeleteId) return;
    setBusy(true);
    setError(null);
    try {
      await deleteWalkSchedule(teamId, confirmDeleteId);
      setConfirmDeleteId(null);
      await load();
      showToast("Schedule deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete schedule.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wil-shell wsch-shell" data-testid="walk-schedules-page">
      <div className="wil-page">
        <header className="wil-header wsch-header">
          <div>
            <p className="wsch-kicker">Operations</p>
            <h1 className="wil-title">Walk schedules</h1>
            <p className="wil-subtitle">
              Define when published walks open for associates, and manage active windows.
            </p>
          </div>
          <div className="wil-header-actions">
            <button type="button" className="wil-btn wil-btn--primary" onClick={openCreate}>
              Create schedule
            </button>
          </div>
        </header>

        <div className="wsch-toolbar">
          <div className="wsch-tabs" role="tablist" aria-label="Schedule filters">
            {(
              [
                ["all", "All", counts.all],
                ["active", "Active", counts.active],
                ["paused", "Paused", counts.paused],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`wsch-tab${tab === id ? " is-active" : ""}`}
                onClick={() => setTab(id)}
              >
                {label}
                <span className="wsch-tab-count">{count}</span>
              </button>
            ))}
          </div>
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
                      <th>Time windows</th>
                      <th>Assigned to</th>
                      <th>Next run</th>
                      <th>Status</th>
                      <th className="wsch-actions-col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="wil-empty">
                          {tab === "paused"
                            ? "No paused schedules. Pause an active schedule to stop new windows."
                            : "No schedules yet. Create a schedule from a published walk."}
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
                              <div className="wsch-walk-cell">
                                <strong className="wsch-walk-name">{walkName}</strong>
                                {schedule.name?.trim() &&
                                schedule.name.trim() !== walkName ? (
                                  <span className="wsch-walk-alias">{schedule.name}</span>
                                ) : null}
                              </div>
                            </td>
                            <td>
                              <span className="wsch-meta">{frequencyLabel(schedule)}</span>
                            </td>
                            <td>
                              <div className="wsch-window-pills">
                                {schedule.windows.map((w) => (
                                  <span key={w.id} className="wsch-window-pill">
                                    {windowLabel(w)}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <span className="wsch-meta">{assignLabel(schedule)}</span>
                            </td>
                            <td>
                              <span className="wsch-meta">{nextRunLabel(schedule, occurrences)}</span>
                            </td>
                            <td>
                              <span
                                className={`wsch-status ${
                                  schedule.isActive ? "wsch-status--active" : "wsch-status--paused"
                                }`}
                              >
                                {schedule.isActive ? "Active" : "Paused"}
                              </span>
                            </td>
                            <td className="wsch-actions-col" onClick={(e) => e.stopPropagation()}>
                              <div
                                className="wsch-menu-wrap"
                                ref={menuId === schedule.id ? menuRef : undefined}
                              >
                                <button
                                  type="button"
                                  className="wil-row-menu"
                                  aria-label={`Actions for ${walkName}`}
                                  aria-expanded={menuId === schedule.id}
                                  disabled={busy}
                                  onClick={() =>
                                    setMenuId((prev) => (prev === schedule.id ? null : schedule.id))
                                  }
                                >
                                  <IconDots />
                                </button>
                                {menuId === schedule.id ? (
                                  <div className="wsch-row-menu" role="menu">
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => openEdit(schedule)}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      onClick={() => void toggleActive(schedule)}
                                    >
                                      {schedule.isActive ? "Pause" : "Resume"}
                                    </button>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="wsch-row-menu-danger"
                                      onClick={() => {
                                        setMenuId(null);
                                        setConfirmDeleteId(schedule.id);
                                      }}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : null}
                              </div>
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
                  <h2>Daily time windows</h2>
                  <p>Each window creates a separate required occurrence for associates.</p>
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

      {modalMode ? (
        <div className="wsch-modal-backdrop" role="presentation" onClick={closeModal}>
          <div
            className="wsch-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wsch-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="wsch-modal-title">
                {modalMode === "edit" ? "Edit schedule" : "Create schedule"}
              </h2>
              <button type="button" className="wil-row-menu" onClick={closeModal} aria-label="Close">
                ✕
              </button>
            </header>
            <p className="wil-subtitle">
              {modalMode === "edit"
                ? "Update frequency and time windows. Future open occurrences will be refreshed."
                : "Pick a published walk and the daily windows associates must complete."}
            </p>

            {templates.length === 0 && modalMode === "create" ? (
              <p className="wil-error">Publish a walk in Walk Builder before creating a schedule.</p>
            ) : (
              <div className="wsch-form">
                <label>
                  Walk
                  <select
                    value={formTemplateId}
                    disabled={modalMode === "edit"}
                    onChange={(e) => setFormTemplateId(e.target.value)}
                  >
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                    {modalMode === "edit" &&
                    formTemplateId &&
                    !templates.some((t) => t.id === formTemplateId) ? (
                      <option value={formTemplateId}>
                        {schedules.find((s) => s.id === editingId)?.template?.name ?? "Walk"}
                      </option>
                    ) : null}
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
                            prev.map((row, i) =>
                              i === index ? { ...row, start: e.target.value } : row,
                            ),
                          )
                        }
                      />
                      <span>to</span>
                      <input
                        type="time"
                        value={w.due}
                        onChange={(e) =>
                          setFormWindows((prev) =>
                            prev.map((row, i) =>
                              i === index ? { ...row, due: e.target.value } : row,
                            ),
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
                </div>
              </div>
            )}

            <footer className="wsch-modal-foot">
              <button type="button" className="wil-btn wil-btn--secondary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wil-btn--primary"
                disabled={busy || (modalMode === "create" && templates.length === 0)}
                onClick={() => void submitModal()}
              >
                {busy
                  ? modalMode === "edit"
                    ? "Saving…"
                    : "Creating…"
                  : modalMode === "edit"
                    ? "Save changes"
                    : "Create schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {confirmDeleteSchedule ? (
        <div
          className="wsch-modal-backdrop"
          role="presentation"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="wsch-modal wsch-modal--confirm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wsch-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="wsch-modal-head">
              <h2 id="wsch-delete-title">Delete schedule?</h2>
            </header>
            <p className="wil-subtitle">
              This removes{" "}
              <strong>
                {confirmDeleteSchedule.template?.name ??
                  confirmDeleteSchedule.name ??
                  "this schedule"}
              </strong>{" "}
              and its upcoming open occurrences. Completed history on past runs is kept.
            </p>
            <footer className="wsch-modal-foot">
              <button
                type="button"
                className="wil-btn wil-btn--secondary"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="wil-btn wsch-btn-danger"
                disabled={busy}
                onClick={() => void confirmDelete()}
              >
                {busy ? "Deleting…" : "Delete schedule"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
