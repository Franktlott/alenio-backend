import { BellRing, Check, ChevronDown, ChevronRight, Download, Search, UserRoundX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assignTeamTaskMembers,
  nudgeTeamTaskMember,
  unassignTeamTaskMember,
  type ApiTask,
  type WebTeamMemberRow,
} from "../../lib/api";
import { formatTaskDueDisplay, isTaskOverdue, priorityLabel } from "../../lib/task-display";
import { UserAvatar } from "../UserAvatar";
import { isPrivateReminder } from "../tasks/task-presentation";
import { sortMembers } from "./WorkspaceMembersPanel";
import { workspaceRoleLabel } from "./WorkspaceSubNav";

const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_MS = 3 * DAY_MS;
const PREVIEW_LIMIT = 5;
const UNASSIGNED = "__unassigned__";

type StatFilter = "all" | "overdue" | "week";

type PersonRow = {
  key: string;
  member: WebTeamMemberRow | null;
  open: ApiTask[];
  overdue: number;
  dueSoon: number;
  lastDoneAt: number | null;
};

function dueTime(task: ApiTask): number | null {
  if (!task.dueDate) return null;
  const t = Date.parse(task.dueDate);
  return Number.isNaN(t) ? null : t;
}

function isDueSoon(task: ApiTask, now: Date): boolean {
  const t = dueTime(task);
  return t !== null && !isTaskOverdue(task, now) && t - now.getTime() <= DUE_SOON_MS;
}

function isDueThisWeek(task: ApiTask, now: Date): boolean {
  const t = dueTime(task);
  return t !== null && !isTaskOverdue(task, now) && t - now.getTime() <= 7 * DAY_MS;
}

function agoLabel(ms: number, now: Date): string {
  const days = Math.floor((now.getTime() - ms) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

function byDue(a: ApiTask, b: ApiTask): number {
  return (dueTime(a) ?? Number.MAX_SAFE_INTEGER) - (dueTime(b) ?? Number.MAX_SAFE_INTEGER);
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function statusLabel(task: ApiTask, now: Date): string {
  if (task.status === "done") return "Done";
  if (isTaskOverdue(task, now)) return "Overdue";
  if (task.status === "in_progress") return "In progress";
  return "Open";
}

/** One row per person per task, so a shared task shows under each assignee. */
function buildTasksCsv(rows: PersonRow[], now: Date): string {
  const header = ["Team member", "Role", "Email", "Task", "Status", "Priority", "Due date", "Shared task"];
  const lines = [header.join(",")];
  for (const row of rows) {
    for (const task of row.open) {
      const due = dueTime(task);
      lines.push(
        [
          row.member ? row.member.user.name ?? row.member.user.email ?? "Member" : "Not assigned",
          row.member ? workspaceRoleLabel(row.member.role) : "",
          row.member?.user.email ?? "",
          task.title,
          statusLabel(task, now),
          priorityLabel(task.priority),
          due === null ? "" : new Date(due).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }),
          task.assignments.length > 1 ? "Yes" : "No",
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return lines.join("\r\n");
}

function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fileSafe(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "workspace";
}

/** Leader view: every member's open workspace tasks, people who need a hand first. */
export function WorkspaceTeamTasksView({
  teamId,
  teamName,
  meId,
  tasks,
  members,
  onOpenTask,
  onOpenMember,
  onChanged,
}: {
  teamId: string;
  teamName: string;
  meId: string;
  tasks: ApiTask[];
  members: WebTeamMemberRow[];
  onOpenTask: (task: ApiTask) => void;
  onOpenMember: (userId: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const now = useMemo(() => new Date(), []);
  const [filter, setFilter] = useState<StatFilter>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [reassign, setReassign] = useState<{ taskId: string; fromUserId: string | null } | null>(null);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [nudges, setNudges] = useState<Record<string, "busy" | "sent">>({});

  const workspaceTasks = useMemo(() => tasks.filter((t) => !t.archivedAt && !isPrivateReminder(t)), [tasks]);
  const openTasks = useMemo(() => workspaceTasks.filter((t) => t.status !== "done"), [workspaceTasks]);

  const stats = useMemo(() => {
    const weekAgo = now.getTime() - 7 * DAY_MS;
    return {
      open: openTasks.length,
      overdue: openTasks.filter((t) => isTaskOverdue(t, now)).length,
      week: openTasks.filter((t) => isDueThisWeek(t, now)).length,
      doneWeek: workspaceTasks.filter((t) => t.status === "done" && t.completedAt && Date.parse(t.completedAt) >= weekAgo)
        .length,
    };
  }, [openTasks, workspaceTasks, now]);

  const rows = useMemo(() => {
    const matches = (t: ApiTask) =>
      filter === "overdue" ? isTaskOverdue(t, now) : filter === "week" ? isDueThisWeek(t, now) : true;
    const build = (key: string, member: WebTeamMemberRow | null, mine: ApiTask[], done: ApiTask[]): PersonRow => {
      const open = mine.filter(matches).sort(byDue);
      const doneTimes = done.map((t) => (t.completedAt ? Date.parse(t.completedAt) : NaN)).filter((n) => !Number.isNaN(n));
      return {
        key,
        member,
        open,
        overdue: open.filter((t) => isTaskOverdue(t, now)).length,
        dueSoon: open.filter((t) => isDueSoon(t, now)).length,
        lastDoneAt: doneTimes.length ? Math.max(...doneTimes) : null,
      };
    };
    const people = sortMembers(members).map((m) =>
      build(
        m.userId,
        m,
        openTasks.filter((t) => t.assignments.some((a) => a.user?.id === m.userId)),
        workspaceTasks.filter((t) => t.status === "done" && t.assignments.some((a) => a.user?.id === m.userId)),
      ),
    );
    const unassigned = build(UNASSIGNED, null, openTasks.filter((t) => t.assignments.length === 0), []);
    const q = query.trim().toLowerCase();
    const list = people
      .filter((r) => !q || `${r.member?.user.name ?? ""} ${r.member?.user.email ?? ""}`.toLowerCase().includes(q))
      .filter((r) => filter === "all" || r.open.length > 0)
      .sort((a, b) => b.overdue - a.overdue || b.dueSoon - a.dueSoon || b.open.length - a.open.length);
    if (unassigned.open.length > 0 && !q) list.push(unassigned);
    return list;
  }, [members, openTasks, workspaceTasks, filter, query, now]);

  const maxOpen = Math.max(1, ...rows.map((r) => r.open.length));

  const doReassign = async (task: ApiTask, fromUserId: string | null, toUserId: string) => {
    setReassign(null);
    setBusyTaskId(task.id);
    setError(null);
    try {
      await assignTeamTaskMembers(teamId, task.id, [toUserId]);
      if (fromUserId && fromUserId !== toUserId) await unassignTeamTaskMember(teamId, task.id, fromUserId);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reassign that task.");
    } finally {
      setBusyTaskId(null);
    }
  };

  const doNudge = async (task: ApiTask, userId: string, name: string) => {
    const key = `${task.id}:${userId}`;
    setNudges((n) => ({ ...n, [key]: "busy" }));
    setError(null);
    setInfo(null);
    try {
      const res = await nudgeTeamTaskMember(teamId, task.id, userId);
      setNudges((n) => ({ ...n, [key]: "sent" }));
      setInfo(
        res.delivered
          ? `Nudge sent to ${firstName(name)}.`
          : `${firstName(name)} has notifications turned off, so the nudge couldn't reach their phone.`,
      );
    } catch (e) {
      setNudges((n) => {
        const next = { ...n };
        delete next[key];
        return next;
      });
      setError(e instanceof Error ? e.message : "Could not send that nudge.");
    }
  };

  const exportCsv = () => {
    const date = now.toISOString().slice(0, 10);
    downloadCsv(`${fileSafe(teamName)}-tasks-${date}.csv`, buildTasksCsv(rows, now));
  };

  const statCard = (id: StatFilter | "done", label: string, value: number, tone = "") => {
    const clickable = id !== "done";
    const on = clickable && filter === id && id !== "all";
    return (
      <button
        type="button"
        className={`ws-tt-stat${tone ? ` ws-tt-stat--${tone}` : ""}${on ? " ws-tt-stat--on" : ""}`}
        onClick={clickable ? () => setFilter(filter === id ? "all" : (id as StatFilter)) : undefined}
        disabled={!clickable}
        aria-pressed={clickable ? on : undefined}
      >
        <span>{label}</span>
        <strong>{value}</strong>
      </button>
    );
  };

  return (
    <div className="ws-tt" data-testid="ws-team-tasks">
      <div className="ws-tt-stats">
        {statCard("all", "Open tasks", stats.open)}
        {statCard("overdue", "Overdue", stats.overdue, "red")}
        {statCard("week", "Due this week", stats.week, "amber")}
        {statCard("done", "Done this week", stats.doneWeek)}
      </div>

      <div className="ws-tt-toolbar">
        <div className="ws-tt-chips">
          <button type="button" className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>
            Everyone
          </button>
          <button type="button" className={filter === "overdue" ? "on" : ""} onClick={() => setFilter("overdue")}>
            Overdue only
          </button>
          <button type="button" className={filter === "week" ? "on" : ""} onClick={() => setFilter("week")}>
            Due this week
          </button>
        </div>
        <div className="ws-tt-toolbar-right">
          <label className="ws-panel-search">
            <Search size={15} strokeWidth={2.2} aria-hidden />
            <input type="search" placeholder="Search people" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <button
            type="button"
            className="ws-tt-export"
            onClick={exportCsv}
            disabled={rows.every((r) => r.open.length === 0)}
            title="Download these tasks as a spreadsheet (CSV)"
            data-testid="ws-tt-export"
          >
            <Download size={15} strokeWidth={2.2} />
            Export
          </button>
        </div>
      </div>

      {error ? (
        <p className="ws-tt-error" role="alert">
          {error}
        </p>
      ) : info ? (
        <p className="ws-tt-info" role="status">
          {info}
        </p>
      ) : null}

      <div className="ws-tt-row ws-tt-row--head" aria-hidden>
        <span>Team member</span>
        <span>Workload</span>
        <span>Open</span>
        <span>Due soon</span>
        <span>Overdue</span>
        <span />
      </div>

      {rows.length === 0 ? (
        <p className="ws-panel-empty">
          {filter === "overdue" ? "Nothing overdue. Nice work, team." : "No one matches right now."}
        </p>
      ) : (
        rows.map((row) => {
          const isOpen = expanded === row.key;
          const name = row.member ? row.member.user.name ?? row.member.user.email ?? "Member" : "Not assigned yet";
          const onTrack = row.open.length - row.overdue - row.dueSoon;
          const width = (n: number) => `${(n / maxOpen) * 100}%`;
          const sub = row.member
            ? [workspaceRoleLabel(row.member.role), row.lastDoneAt ? `last finished ${agoLabel(row.lastDoneAt, now)}` : null]
                .filter(Boolean)
                .join(" · ")
            : "Tasks with no one on them";
          return (
            <div key={row.key} className={`ws-tt-person${isOpen ? " ws-tt-person--open" : ""}`}>
              <button
                type="button"
                className="ws-tt-row"
                onClick={() => setExpanded(isOpen ? null : row.key)}
                aria-expanded={isOpen}
                data-testid={`ws-tt-person-${row.key}`}
              >
                <span className="ws-tt-who">
                  {row.member ? (
                    <UserAvatar user={row.member.user} className="ws-tt-avatar" imgClassName="nw-avatar-img" alt="" />
                  ) : (
                    <span className="ws-tt-avatar ws-tt-avatar--none">
                      <UserRoundX size={16} strokeWidth={2.2} />
                    </span>
                  )}
                  <span className="ws-tt-who-copy">
                    <span className="ws-tt-name">
                      {name}
                      {row.overdue >= 2 ? <span className="ws-tt-flag">Needs a hand</span> : null}
                    </span>
                    <span className="ws-tt-sub">{sub}</span>
                  </span>
                </span>
                <span className="ws-tt-load" aria-label={`${row.open.length} open`}>
                  {onTrack > 0 ? <span className="g" style={{ width: width(onTrack) }} /> : null}
                  {row.dueSoon > 0 ? <span className="y" style={{ width: width(row.dueSoon) }} /> : null}
                  {row.overdue > 0 ? <span className="r" style={{ width: width(row.overdue) }} /> : null}
                </span>
                <span className={`ws-tt-n${row.open.length ? "" : " z"}`}>{row.open.length}</span>
                <span className={`ws-tt-n${row.dueSoon ? " y" : " z"}`}>{row.dueSoon}</span>
                <span className={`ws-tt-n${row.overdue ? " r" : " z"}`}>{row.overdue}</span>
                <span className="ws-tt-chev">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
              </button>

              {isOpen ? (
                <div className="ws-tt-tasks">
                  {row.open.length === 0 ? (
                    <p className="ws-tt-none">No open tasks.</p>
                  ) : (
                    row.open.slice(0, PREVIEW_LIMIT).map((task) => {
                      const due = formatTaskDueDisplay(task.dueDate, now);
                      const fromUserId = row.member ? row.member.userId : null;
                      const menuOpen = reassign?.taskId === task.id && reassign.fromUserId === fromUserId;
                      return (
                        <div key={task.id} className="ws-tt-task">
                          <button type="button" className="ws-tt-task-main" onClick={() => onOpenTask(task)}>
                            <span className="ws-task-check" aria-hidden />
                            <span className="ws-tt-task-title">{task.title}</span>
                            <span className={`ws-task-due ws-task-due--${due.tone}`}>
                              <span>{due.date}</span>
                              {due.status ? <small>{due.status}</small> : null}
                            </span>
                            <span className={`ws-task-priority ws-task-priority--${task.priority}`}>
                              {priorityLabel(task.priority)}
                            </span>
                          </button>
                          <div className="ws-tt-task-actions">
                            {fromUserId && fromUserId !== meId ? (
                              <NudgeButton
                                state={nudges[`${task.id}:${fromUserId}`]}
                                onClick={() => void doNudge(task, fromUserId, name)}
                              />
                            ) : null}
                            <button
                              type="button"
                              className="ws-tt-action"
                              disabled={busyTaskId === task.id}
                              onClick={() => setReassign(menuOpen ? null : { taskId: task.id, fromUserId })}
                              aria-expanded={menuOpen}
                            >
                              {busyTaskId === task.id ? "Moving…" : fromUserId ? "Reassign" : "Assign"}
                            </button>
                            {menuOpen ? (
                              <ReassignMenu
                                members={members}
                                exclude={task.assignments.map((a) => a.user?.id).filter(Boolean) as string[]}
                                onPick={(userId) => void doReassign(task, fromUserId, userId)}
                                onClose={() => setReassign(null)}
                              />
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  )}
                  {row.open.length > PREVIEW_LIMIT || row.member ? (
                    <div className="ws-tt-more">
                      {row.open.length > PREVIEW_LIMIT ? <span>+ {row.open.length - PREVIEW_LIMIT} more tasks</span> : null}
                      {row.member ? (
                        <button type="button" onClick={() => onOpenMember(row.member!.userId)}>
                          Open {firstName(name)}'s profile
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })
      )}

      <div className="ws-tt-legend">
        <span>
          <i className="g" /> On track
        </span>
        <span>
          <i className="y" /> Due soon
        </span>
        <span>
          <i className="r" /> Overdue
        </span>
        <span className="ws-tt-legend-note">Only owners and team leaders see this view. Private reminders never show here.</span>
      </div>
    </div>
  );
}

function NudgeButton({ state, onClick }: { state: "busy" | "sent" | undefined; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`ws-tt-action${state === "sent" ? " ws-tt-action--done" : ""}`}
      onClick={onClick}
      disabled={state !== undefined}
      title="Send a reminder to their phone"
    >
      {state === "sent" ? <Check size={13} strokeWidth={2.6} /> : <BellRing size={13} strokeWidth={2.4} />}
      {state === "busy" ? "Sending…" : state === "sent" ? "Nudged" : "Nudge"}
    </button>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function ReassignMenu({
  members,
  exclude,
  onPick,
  onClose,
}: {
  members: WebTeamMemberRow[];
  exclude: string[];
  onPick: (userId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const options = sortMembers(members)
    .filter((m) => !exclude.includes(m.userId))
    .filter((m) => `${m.user.name ?? ""} ${m.user.email ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="ws-tt-menu" ref={ref} role="menu" aria-label="Reassign to">
      <input
        autoFocus
        className="ws-tt-menu-search"
        placeholder="Move to…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="ws-tt-menu-list">
        {options.length === 0 ? <p className="ws-tt-none">No one else to pick.</p> : null}
        {options.map((m) => (
          <button key={m.userId} type="button" role="menuitem" onClick={() => onPick(m.userId)}>
            <UserAvatar user={m.user} className="ws-task-avatar" imgClassName="nw-avatar-img" alt="" />
            <span>{m.user.name ?? m.user.email ?? "Member"}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
