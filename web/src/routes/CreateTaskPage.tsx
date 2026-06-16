import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  createWebTask,
  fetchWebTeam,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { resolveTimeZone } from "../lib/timezone";

const PRIORITIES = [
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
] as const;

const STATUSES = [
  { label: "Open", value: "todo" },
  { label: "Completed", value: "done" },
] as const;

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function CreateTaskPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const teamIdFromUrl = params.get("teamId")?.trim() ?? "";

  const { me, teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<string>("medium");
  const [status, setStatus] = useState<string>("todo");
  const [dueDate, setDueDate] = useState(() => toDateInputValue(new Date()));
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isJoint, setIsJoint] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtask, setNewSubtask] = useState("");

  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const teamDetailQuery = useQuery({
    queryKey: queryKeys.teamDetail(selectedTeamId),
    queryFn: () => fetchWebTeam(selectedTeamId),
    enabled: !!selectedTeamId,
  });
  const teamDetail = teamDetailQuery.data ?? null;

  useEffect(() => {
    if (!teams?.length) return;
    if (teamIdFromUrl && teams.some((x) => x.id === teamIdFromUrl) && teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teams, teamIdFromUrl, selectedTeamId, setSelectedTeamId]);

  useEffect(() => {
    if (!me?.id || !teamDetail?.members?.length) return;
    setAssigneeIds((prev) => {
      if (prev.length > 0) {
        const valid = new Set(teamDetail.members.map((m) => m.user.id));
        const filtered = prev.filter((id) => valid.has(id));
        if (filtered.length > 0) return filtered;
      }
      return [me.id];
    });
  }, [me?.id, teamDetail?.members]);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const addSubtaskLine = () => {
    const t = newSubtask.trim();
    if (!t) return;
    setSubtasks((s) => [...s, t]);
    setNewSubtask("");
  };

  const removeSubtask = (index: number) => {
    setSubtasks((s) => s.filter((_, i) => i !== index));
  };

  const dueIso = useMemo(() => (dueDate ? dueDate : null), [dueDate]);
  const userTimeZone = resolveTimeZone(me?.timezone);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (!title.trim()) {
      setFormErr("Please enter a task title.");
      return;
    }
    if (assigneeIds.length === 0) {
      setFormErr("Assign the task to at least one teammate.");
      return;
    }
    if (!selectedTeamId) {
      setFormErr("Pick a workspace.");
      return;
    }
    setSaving(true);
    try {
      await createWebTask({
        teamId: selectedTeamId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        status,
        dueDate: dueIso,
        timeZone: userTimeZone,
        assigneeIds,
        isJoint: assigneeIds.length > 1 && isJoint,
        subtasks: subtasks.map((s) => s.trim()).filter(Boolean),
      });
      navigate("/dashboard");
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Could not create task.");
    } finally {
      setSaving(false);
    }
  };

  if (me === undefined) {
    return (
      <div className="enterprise-dashboard-inner">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      <div className="enterprise-dashboard-inner create-task-page" data-testid="create-task-screen">
        <div className="create-task-head">
          <Link to="/dashboard" className="create-task-back">
            ← Back to dashboard
          </Link>
          <h1 className="create-task-title">Create task</h1>
          <p className="enterprise-muted create-task-sub">Same core fields as the Alenio app: assign teammates, priority, due date, and subtasks.</p>
        </div>

        <form className="enterprise-card create-task-form" onSubmit={submit}>
          {formErr ? (
            <p className="auth-error" role="alert">
              {formErr}
            </p>
          ) : null}

          <label className="auth-label" htmlFor="ct-title">
            Title
          </label>
          <input
            id="ct-title"
            className="auth-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            autoComplete="off"
            data-testid="create-task-title"
          />

          <label className="auth-label" htmlFor="ct-desc">
            Description
          </label>
          <textarea
            id="ct-desc"
            className="auth-input create-task-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional details"
            rows={3}
          />

          <div className="create-task-row">
            <div className="create-task-field">
              <label className="auth-label" htmlFor="ct-priority">
                Priority
              </label>
              <select id="ct-priority" className="auth-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="create-task-field">
              <label className="auth-label" htmlFor="ct-status">
                Status
              </label>
              <select id="ct-status" className="auth-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="create-task-field">
              <label className="auth-label" htmlFor="ct-due">
                Due date
              </label>
              <input id="ct-due" className="auth-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <fieldset className="create-task-fieldset">
            <legend className="auth-label">Assign to</legend>
            {!teamDetail?.members.length ? (
              <p className="enterprise-muted">Loading members…</p>
            ) : (
              <ul className="create-task-assignees">
                {teamDetail.members.map((m) => (
                  <li key={m.userId}>
                    <label className="create-task-assignee-label">
                      <input
                        type="checkbox"
                        checked={assigneeIds.includes(m.user.id)}
                        onChange={() => toggleAssignee(m.user.id)}
                      />
                      <span>{m.user.name ?? m.user.email ?? m.user.id}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {assigneeIds.length > 1 ? (
            <label className="create-task-checkbox-row">
              <input type="checkbox" checked={isJoint} onChange={(e) => setIsJoint(e.target.checked)} />
              <span>
                <strong>Shared task</strong> — one task everyone is assigned to together. If off, each person gets their own copy (like the app).
              </span>
            </label>
          ) : null}

          <div className="create-task-subtasks">
            <span className="auth-label">Subtasks</span>
            <ul className="create-task-subtask-list">
              {subtasks.map((st, i) => (
                <li key={`${i}-${st}`} className="create-task-subtask-item">
                  <span>{st}</span>
                  <button type="button" className="create-task-subtask-remove" onClick={() => removeSubtask(i)} aria-label="Remove subtask">
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="create-task-subtask-add">
              <input
                className="auth-input"
                value={newSubtask}
                onChange={(e) => setNewSubtask(e.target.value)}
                placeholder="Add a subtask"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubtaskLine();
                  }
                }}
              />
              <button type="button" className="auth-btn-secondary create-task-add-btn" onClick={addSubtaskLine}>
                Add
              </button>
            </div>
          </div>

          <div className="create-task-actions">
            <button type="submit" className="auth-btn-primary" disabled={saving} data-testid="create-task-submit">
              {saving ? "Creating…" : "Create task"}
            </button>
            <Link to="/dashboard" className="create-task-cancel">
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
