import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  Plus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  createWebTeamEvent,
  deleteWebTeamEvent,
  fetchWebTeamEvents,
  type ApiCalendarEvent,
  type ApiTask,
} from "../../lib/api";
import { TODAY_ITEM_TONE } from "../../lib/home-today";
import { priorityLabel } from "../../lib/task-display";
import { getUSHolidays } from "../../lib/us-federal-holidays";
import "../../routes/discover/discover-categories-drawer.css";

const eventsKey = (teamId: string) => ["workspace", "events", teamId] as const;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DEFAULT_COLOR = "#6d5ef8";

type View = "month" | "week";

/* ---------- date helpers (local time) ---------- */

function startOfDay(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -day.getDay());
}

/** Weeks covering the month, starting on Sunday: 5 rows, or 6 when the month can't fit in 5. */
function monthGrid(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const daysInMonth = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
  const weeks = Math.max(5, Math.ceil((first.getDay() + daysInMonth) / 7));
  const start = startOfWeek(first);
  return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function toLocalInputDate(d: Date): string {
  return dayKey(d);
}

/** Every day an event touches, so multi-day events show on each. */
function eventDays(event: ApiCalendarEvent): string[] {
  const start = startOfDay(new Date(event.startDate));
  const endRaw = event.endDate ? new Date(event.endDate) : null;
  // An all-day event ending at midnight shouldn't spill onto the next day.
  const end = endRaw ? startOfDay(new Date(endRaw.getTime() - (event.allDay ? 1 : 0))) : start;
  const keys: string[] = [];
  for (let d = start, i = 0; d <= end && i < 60; d = addDays(d, 1), i += 1) keys.push(dayKey(d));
  return keys.length > 0 ? keys : [dayKey(start)];
}

function eventTimeLabel(event: ApiCalendarEvent): string {
  if (event.allDay) return "All day";
  const start = formatTime(event.startDate);
  return event.endDate ? `${start} – ${formatTime(event.endDate)}` : start;
}

/* ---------- calendar items: events, my tasks and reminders, holidays ---------- */

type ItemKind = "event" | "task" | "reminder" | "holiday";

type CalendarItem = {
  id: string;
  kind: ItemKind;
  title: string;
  days: string[];
  allDay: boolean;
  /** Sort key within a day. */
  at: string;
  timeLabel: string;
  color: string;
  done?: boolean;
  event?: ApiCalendarEvent;
  task?: ApiTask;
};

const KIND_LABEL: Record<ItemKind, string> = { event: "Event", task: "Task", reminder: "Reminder", holiday: "Holiday" };
const KIND_ORDER: Record<ItemKind, number> = { holiday: 0, event: 1, task: 2, reminder: 3 };
const KIND_COLOR: Record<ItemKind, string> = {
  event: DEFAULT_COLOR,
  task: TODAY_ITEM_TONE.task.color,
  reminder: TODAY_ITEM_TONE.reminder.color,
  holiday: "#0e8a7b",
};

/** Left column of an agenda row: a main line and a quieter second line. */
function timeParts(item: CalendarItem): { main: string; sub: string } {
  if (item.kind === "holiday" || item.allDay) return { main: "All day", sub: "" };
  if (item.event) return { main: formatTime(item.event.startDate), sub: item.event.endDate ? formatTime(item.event.endDate) : "" };
  if (item.done) return { main: "Done", sub: "" };
  const due = new Date(item.at);
  const dayOnly = due.getHours() === 23 && due.getMinutes() === 59;
  return dayOnly ? { main: "Any time", sub: "Due" } : { main: formatTime(item.at), sub: "Due" };
}

/** A due time of 11:59:59 PM means "that day", not a chosen clock time. */
function taskTimeLabel(due: Date): string {
  const dayOnly = due.getHours() === 23 && due.getMinutes() === 59;
  return dayOnly ? "Due today" : `Due ${due.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function isMine(task: ApiTask, meId: string): boolean {
  if (task.kind === "reminder") return task.creatorId === meId || task.creator?.id === meId || task.assignments.some((a) => a.user?.id === meId);
  return task.assignments.some((a) => a.user?.id === meId);
}

function taskItems(tasks: ApiTask[], meId: string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const task of tasks) {
    if (task.archivedAt || !task.dueDate || !isMine(task, meId)) continue;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    const kind: ItemKind = task.kind === "reminder" ? "reminder" : "task";
    out.push({
      id: `${kind}-${task.id}`,
      kind,
      title: task.title,
      days: [dayKey(due)],
      allDay: false,
      at: due.toISOString(),
      timeLabel: task.status === "done" ? "Completed" : taskTimeLabel(due),
      color: KIND_COLOR[kind],
      done: task.status === "done",
      task,
    });
  }
  return out;
}

function holidayItems(years: number[]): CalendarItem[] {
  return years.flatMap((year) =>
    getUSHolidays(year).map(({ name, date }) => ({
      id: `holiday-${dayKey(date)}`,
      kind: "holiday" as const,
      title: name,
      days: [dayKey(date)],
      allDay: true,
      at: date.toISOString(),
      timeLabel: "All day",
      color: KIND_COLOR.holiday,
    })),
  );
}

function eventItem(event: ApiCalendarEvent): CalendarItem {
  return {
    id: `event-${event.id}`,
    kind: "event",
    title: event.title,
    days: eventDays(event),
    allDay: Boolean(event.allDay),
    at: event.startDate,
    timeLabel: eventTimeLabel(event),
    color: event.color || DEFAULT_COLOR,
    event,
  };
}

function ChipIcon({ item }: { item: CalendarItem }) {
  if (item.kind === "holiday") return <Flag size={11} strokeWidth={2.4} />;
  if (item.kind === "reminder") return <Bell size={11} strokeWidth={2.4} />;
  if (item.kind === "task") return <span className={`ws-cal-chip-check${item.done ? " is-done" : ""}`}>{item.done ? <Check size={8} strokeWidth={3.5} /> : null}</span>;
  if (item.event?.isVideoMeeting) return <Video size={11} strokeWidth={2.4} />;
  return <i aria-hidden />;
}

/* ---------- component ---------- */

/**
 * Workspace calendar: month or week grid of team events with an agenda for
 * the selected day and a drawer to add new events.
 */
export function WorkspaceCalendar({
  teamId,
  meId,
  canManage,
  tasks = [],
}: {
  teamId: string;
  meId: string;
  /** Owners and team leaders can remove anyone's event. */
  canManage: boolean;
  /** Workspace tasks; the viewer's own tasks and reminders are shown on their due day. */
  tasks?: ApiTask[];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(today);
  const [selected, setSelected] = useState<Date>(today);
  const [composeOpen, setComposeOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const events = useQuery({
    queryKey: eventsKey(teamId),
    queryFn: () => fetchWebTeamEvents(teamId),
    staleTime: 30_000,
  });

  const year = anchor.getFullYear();
  const byDay = useMemo(() => {
    const items = [
      ...(events.data ?? []).filter((event) => !event.isHidden).map(eventItem),
      ...taskItems(tasks, meId),
      ...holidayItems([year - 1, year, year + 1]),
    ];
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) {
      for (const key of item.days) {
        const list = map.get(key) ?? [];
        list.push(item);
        map.set(key, list);
      }
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          Number(b.allDay) - Number(a.allDay) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          Number(Boolean(a.done)) - Number(Boolean(b.done)) ||
          a.at.localeCompare(b.at),
      );
    }
    return map;
  }, [events.data, tasks, meId, year]);

  const remove = useMutation({
    mutationFn: (eventId: string) => deleteWebTeamEvent(teamId, eventId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: eventsKey(teamId) }),
  });

  const days = view === "month" ? monthGrid(anchor) : Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
  const title =
    view === "month"
      ? anchor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
      : `${days[0]!.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6]!.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;

  const step = (dir: 1 | -1) => {
    setAnchor((cur) =>
      view === "month" ? new Date(cur.getFullYear(), cur.getMonth() + dir, 1) : addDays(cur, 7 * dir),
    );
  };
  const goToday = () => {
    setAnchor(today);
    setSelected(today);
  };
  const pick = (day: Date) => {
    setSelected(day);
    if (view === "month" && day.getMonth() !== anchor.getMonth()) setAnchor(day);
  };

  const selectedItems = byDay.get(dayKey(selected)) ?? [];
  const openItem = (item: CalendarItem) => {
    if (item.task) navigate(`/tasks/${encodeURIComponent(item.task.id)}?teamId=${encodeURIComponent(teamId)}`);
  };
  const maxChips = view === "month" ? 3 : 8;

  return (
    <section className="dm-card ws-cal" aria-label="Workspace calendar" data-testid="ws-calendar">
      <header className="ws-cal-head">
        <h2>
          <CalendarDays size={17} strokeWidth={2.2} />
          Calendar
        </h2>
        <div className="ws-cal-nav">
          <button type="button" className="nw-icon-btn" aria-label="Previous" onClick={() => step(-1)}>
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
          <span className="ws-cal-title" aria-live="polite">
            {title}
          </span>
          <button type="button" className="nw-icon-btn" aria-label="Next" onClick={() => step(1)}>
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
          <button type="button" className="nw-btn" onClick={goToday}>
            Today
          </button>
        </div>
        <div className="ws-cal-tools">
          <div className="ws-cal-seg" role="tablist" aria-label="Calendar view">
            {(["month", "week"] as View[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={view === v ? "is-on" : ""}
                onClick={() => setView(v)}
              >
                {v === "month" ? "Month" : "Week"}
              </button>
            ))}
          </div>
          <button type="button" className="nw-add ws-cal-add" onClick={() => setComposeOpen(true)} data-testid="ws-cal-new">
            <Plus size={16} strokeWidth={2.4} />
            New event
          </button>
        </div>
      </header>

      <ul className="ws-cal-legend" aria-label="Calendar key">
        {(["event", "task", "reminder", "holiday"] as ItemKind[]).map((kind) => (
          <li key={kind} style={{ ["--chip" as string]: KIND_COLOR[kind] }}>
            <i aria-hidden />
            {KIND_LABEL[kind]}s
          </li>
        ))}
      </ul>

      {notice ? (
        <p className="ws-cal-notice" role="status">
          {notice}
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X size={13} strokeWidth={2.4} />
          </button>
        </p>
      ) : null}
      {events.isError ? <p className="nw-error ws-cal-error">Couldn't load the calendar.</p> : null}

      <div className="ws-cal-body">
        <div className={`ws-cal-grid ws-cal-grid--${view}`} role="grid">
          {WEEKDAYS.map((name) => (
            <div key={name} className="ws-cal-dow" role="columnheader">
              {name}
            </div>
          ))}
          {days.map((day) => {
            const key = dayKey(day);
            const list = byDay.get(key) ?? [];
            const outside = view === "month" && day.getMonth() !== anchor.getMonth();
            const isToday = sameDay(day, today);
            const isSelected = sameDay(day, selected);
            return (
              <div
                key={key}
                role="gridcell"
                aria-selected={isSelected}
                className={[
                  "ws-cal-day",
                  outside ? "is-outside" : "",
                  isToday ? "is-today" : "",
                  isSelected ? "is-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => pick(day)}
                data-testid={`ws-cal-day-${key}`}
              >
                <span className="ws-cal-num">{day.getDate()}</span>
                <div className="ws-cal-chips">
                  {list.slice(0, maxChips).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={[
                        "ws-cal-chip",
                        `ws-cal-chip--${item.kind}`,
                        item.event?.approvalStatus === "pending" ? "is-pending" : "",
                        item.done ? "is-done" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={{ ["--chip" as string]: item.color }}
                      title={`${KIND_LABEL[item.kind]} · ${item.timeLabel} · ${item.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        pick(day);
                      }}
                    >
                      <ChipIcon item={item} />
                      {item.kind === "event" && !item.allDay && view === "week" ? (
                        <span className="ws-cal-chip-time">{formatTime(item.at)}</span>
                      ) : null}
                      <span className="ws-cal-chip-title">{item.title}</span>
                    </button>
                  ))}
                  {list.length > maxChips ? <span className="ws-cal-more">+{list.length - maxChips} more</span> : null}
                </div>
              </div>
            );
          })}
        </div>

        <aside className="ws-cal-agenda" aria-label="Selected day">
          <header className="ws-agenda-head">
            <div className="ws-agenda-heading">
              <span className={`ws-agenda-eyebrow${sameDay(selected, today) ? " is-today" : ""}`}>
                {sameDay(selected, today) ? "Today" : selected.toLocaleDateString(undefined, { weekday: "long" })}
              </span>
              <h3>{selected.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</h3>
            </div>
            <button type="button" className="ws-agenda-add" onClick={() => setComposeOpen(true)}>
              <Plus size={14} strokeWidth={2.4} />
              Add
            </button>
          </header>

          {selectedItems.length > 0 ? (
            <ul className="ws-agenda-summary" aria-label="Summary">
              {(["event", "task", "reminder", "holiday"] as ItemKind[]).map((kind) => {
                const n = selectedItems.filter((i) => i.kind === kind).length;
                if (n === 0) return null;
                return (
                  <li key={kind} style={{ ["--chip" as string]: KIND_COLOR[kind] }}>
                    <i aria-hidden />
                    {n} {KIND_LABEL[kind].toLowerCase()}
                    {n === 1 ? "" : "s"}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {events.isLoading ? <p className="ws-agenda-loading">Loading…</p> : null}
          {!events.isLoading && selectedItems.length === 0 ? (
            <div className="ws-agenda-empty">
              <span className="ws-agenda-empty-icon">
                <CalendarDays size={18} strokeWidth={2} />
              </span>
              <strong>Nothing scheduled</strong>
              <p>No events, tasks or reminders on this day.</p>
              <button type="button" className="ws-agenda-empty-btn" onClick={() => setComposeOpen(true)}>
                <CalendarPlus size={15} strokeWidth={2.2} />
                Add event
              </button>
            </div>
          ) : null}

          <ol className="ws-agenda-list">
            {selectedItems.map((item) => {
              const event = item.event;
              const canDelete = !!event && (canManage || event.createdById === meId || event.createdBy?.id === meId);
              const time = timeParts(item);
              const KindIcon = event?.isVideoMeeting ? Video : item.kind === "holiday" ? Flag : item.kind === "reminder" ? Bell : item.kind === "task" ? Check : Clock;
              const meta = [
                event?.approvalStatus === "pending" ? "Awaiting approval" : null,
                event?.createdBy?.name ? `Added by ${event.createdBy.name}` : null,
                item.task && !item.done ? `${priorityLabel(item.task.priority)} priority` : null,
                item.done ? "Completed" : null,
              ].filter(Boolean) as string[];
              const content = (
                <>
                  <span className="ws-agenda-time">
                    <span>{time.main}</span>
                    {time.sub ? <small>{time.sub}</small> : null}
                  </span>
                  <span className="ws-agenda-rail" aria-hidden />
                  <span className="ws-agenda-body">
                    <span className={`ws-agenda-title${item.done ? " is-done" : ""}`}>{item.title}</span>
                    <span className="ws-agenda-meta">
                      <span className="ws-agenda-kind">
                        <KindIcon size={11} strokeWidth={2.6} />
                        {KIND_LABEL[item.kind]}
                      </span>
                      {meta.map((m) => (
                        <span key={m} className={m === "Awaiting approval" ? "ws-agenda-pending" : undefined}>
                          {m}
                        </span>
                      ))}
                    </span>
                    {event?.description ? <span className="ws-agenda-desc">{event.description}</span> : null}
                  </span>
                </>
              );
              return (
                <li
                  key={item.id}
                  className={`ws-agenda-item ws-agenda-item--${item.kind}${item.done ? " is-done" : ""}`}
                  style={{ ["--chip" as string]: item.color }}
                  data-testid={event ? `ws-cal-event-${event.id}` : `ws-cal-item-${item.id}`}
                >
                  {item.task ? (
                    <button
                      type="button"
                      className="ws-agenda-row ws-cal-agenda-open"
                      onClick={() => openItem(item)}
                      aria-label={`Open ${KIND_LABEL[item.kind].toLowerCase()}: ${item.title}`}
                    >
                      {content}
                      <ChevronRight className="ws-agenda-chevron" size={16} strokeWidth={2.2} aria-hidden />
                    </button>
                  ) : (
                    <div className="ws-agenda-row">
                      {content}
                      {canDelete && event ? (
                        <button
                          type="button"
                          className="ws-agenda-delete"
                          aria-label={`Delete ${event.title}`}
                          title="Delete event"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete "${event.title}"?`)) remove.mutate(event.id);
                          }}
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>

      <NewEventDrawer
        open={composeOpen}
        teamId={teamId}
        initialDay={selected}
        onClose={() => setComposeOpen(false)}
        onCreated={(event) => {
          setComposeOpen(false);
          setSelected(startOfDay(new Date(event.startDate)));
          setAnchor(startOfDay(new Date(event.startDate)));
          setNotice(
            event.approvalStatus === "pending"
              ? "Sent to your workspace leaders for approval. It'll appear once approved."
              : `"${event.title}" added to the calendar.`,
          );
          void queryClient.invalidateQueries({ queryKey: eventsKey(teamId) });
        }}
      />
    </section>
  );
}

/* ---------- new event drawer ---------- */

function NewEventDrawer({
  open,
  teamId,
  initialDay,
  onClose,
  onCreated,
}: {
  open: boolean;
  teamId: string;
  initialDay: Date;
  onClose: () => void;
  onCreated: (event: ApiCalendarEvent) => void;
}) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(toLocalInputDate(initialDay));
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [video, setVideo] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDate(toLocalInputDate(initialDay));
    setAllDay(false);
    setStart("09:00");
    setEnd("10:00");
    setVideo(false);
    setDescription("");
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, initialDay, onClose]);

  const create = useMutation({
    mutationFn: () => {
      const startDate = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${start}:00`);
      const endDate = allDay ? addDays(startDate, 1) : new Date(`${date}T${end}:00`);
      if (!allDay && endDate <= startDate) throw new Error("End time must be after the start time.");
      return createWebTeamEvent(teamId, {
        title: title.trim(),
        description: description.trim() || null,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        allDay,
        isVideoMeeting: video,
        color: DEFAULT_COLOR,
      });
    },
    onSuccess: (event) => onCreated(event),
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save the event."),
  });

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !date) return;
    setError(null);
    create.mutate();
  };

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="dcat-drawer" role="dialog" aria-modal="true" aria-label="New event" data-testid="ws-cal-drawer">
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <CalendarPlus size={18} strokeWidth={2.2} />
          </span>
          <div className="dcat-head-copy">
            <h2>New event</h2>
            <p>Everyone in the workspace will see it on the calendar.</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <form className="dcat-form ws-cal-form" onSubmit={submit}>
          <label className="dcat-field">
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Team huddle, store walk, training…"
              maxLength={120}
              autoFocus
              required
            />
          </label>
          <label className="dcat-field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>
          <label className="dcat-toggle">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            All day
          </label>
          {!allDay ? (
            <div className="ws-cal-form-row">
              <label className="dcat-field">
                <span>Starts</span>
                <input type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
              </label>
              <label className="dcat-field">
                <span>Ends</span>
                <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
              </label>
            </div>
          ) : null}
          <label className="dcat-toggle">
            <input type="checkbox" checked={video} onChange={(e) => setVideo(e.target.checked)} />
            Video meeting
          </label>
          <label className="dcat-field">
            <span>Notes (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Agenda, location, what to bring…"
            />
          </label>
          {error ? <p className="nw-error ws-cal-form-error">{error}</p> : null}
          <div className="dcat-form-actions">
            <button type="button" className="dcat-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dcat-btn dcat-btn--primary" disabled={create.isPending || !title.trim()}>
              {create.isPending ? "Saving…" : "Add event"}
            </button>
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
