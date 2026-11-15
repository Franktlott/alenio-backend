import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { Button, Checkbox, ErrorState, Field, Input, PageHeader, SegmentedControl, Select, Textarea } from "../components/ui";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  createWebTask,
  fetchWebTeam,
} from "../lib/api";
import { queryKeys } from "../lib/query-keys";
import { resolveTimeZone } from "../lib/timezone";
import {
  canCreateWorkspaceTask,
  resolveCreateTaskKind,
  type TaskKind,
} from "../components/tasks/task-presentation";
import "./create-task.css";

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
  const selectedTeam = teams?.find((team) => team.id === selectedTeamId);
  const canChooseKind = canCreateWorkspaceTask(selectedTeam?.role);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>(() => resolveCreateTaskKind(selectedTeam?.role));
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
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [assigneeErr, setAssigneeErr] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    setKind(resolveCreateTaskKind(selectedTeam?.role));
  }, [selectedTeamId, selectedTeam?.role]);

  const isReminder = kind === "reminder";

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
    setTitleErr(null);
    setAssigneeErr(null);
    if (!title.trim()) {
      setTitleErr("Please enter a task title.");
      titleRef.current?.focus();
      return;
    }
    if (!isReminder && assigneeIds.length === 0) {
      setAssigneeErr("Assign the task to at least one teammate.");
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
        kind,
        description: description.trim() || null,
        priority,
        status,
        dueDate: dueIso,
        timeZone: userTimeZone,
        assigneeIds: isReminder && me?.id ? [me.id] : assigneeIds,
        isJoint: !isReminder && assigneeIds.length > 1 && isJoint,
        subtasks: subtasks.map((s) => s.trim()).filter(Boolean),
      });
      navigate("/workspace/tasks");
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Could not create task.");
    } finally {
      setSaving(false);
    }
  };

  if (me === undefined) {
    return <EnterprisePageLoading label="Preparing your task" />;
  }

  const noun = isReminder ? "reminder" : "task";

  return (
    <div className="enterprise-dashboard-inner create-task-page al-ds" data-testid="create-task-screen">
      <Link to="/workspace/tasks" className="ct-back">
        ← Back
      </Link>
      <PageHeader
        title={`Create ${noun}`}
        subtitle={
          isReminder
            ? "This reminder is private to you and does not affect workspace activity or Stars."
            : "Assign teammates, choose a priority and due date, and add subtasks."
        }
      />

      <form className="al-card ct-form" onSubmit={submit} noValidate>
        {formErr ? <ErrorState>{formErr}</ErrorState> : null}

        {canChooseKind ? (
          <SegmentedControl<TaskKind>
            label="Create type"
            value={kind}
            onChange={setKind}
            options={[
              { value: "workspace_task", label: "Workspace task", testId: "create-task-kind-task" },
              { value: "reminder", label: "Private reminder", testId: "create-task-kind-reminder" },
            ]}
          />
        ) : (
          <p className="ct-note">Private reminder · visible only to you</p>
        )}

        <Field label="Title" required error={titleErr}>
          <Input
            ref={titleRef}
            id="ct-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (titleErr) setTitleErr(null);
            }}
            placeholder="What needs to be done?"
            autoComplete="off"
            data-testid="create-task-title"
          />
        </Field>

        <Field label="Description" optional>
          <Textarea id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add details" rows={3} />
        </Field>

        <div className="ct-row">
          <Field label="Priority">
            <Select id="ct-priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select id="ct-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date">
            <Input id="ct-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        {!isReminder ? (
          <fieldset className="al-field ct-fieldset" aria-describedby={assigneeErr ? "ct-assignee-err" : undefined}>
            <legend className="al-field-label">
              Assign to
              <span className="al-field-req" aria-hidden>
                *
              </span>
            </legend>
            {!teamDetail?.members.length ? (
              <p className="ct-muted">Loading members…</p>
            ) : (
              <ul className={`ct-assignees${assigneeErr ? " is-invalid" : ""}`} data-testid="create-task-assignees">
                {teamDetail.members.map((m) => (
                  <li key={m.userId}>
                    <Checkbox
                      checked={assigneeIds.includes(m.user.id)}
                      onChange={() => {
                        toggleAssignee(m.user.id);
                        if (assigneeErr) setAssigneeErr(null);
                      }}
                      label={m.user.name ?? m.user.email ?? m.user.id}
                    />
                  </li>
                ))}
              </ul>
            )}
            {assigneeErr ? (
              <div className="al-field-foot">
                <span className="al-field-error" id="ct-assignee-err" role="alert">
                  {assigneeErr}
                </span>
              </div>
            ) : null}
          </fieldset>
        ) : null}

        {!isReminder && assigneeIds.length > 1 ? (
          <Checkbox
            checked={isJoint}
            onChange={(e) => setIsJoint(e.target.checked)}
            label="Shared task"
            description="One task everyone is assigned to together. If off, each person gets their own copy (like the app)."
          />
        ) : null}

        <div className="al-field">
          <span className="al-field-label" id="ct-subtasks-label">
            Subtasks
            <span className="al-field-optional">Optional</span>
          </span>
          {subtasks.length > 0 ? (
            <ul className="ct-subtasks" aria-labelledby="ct-subtasks-label">
              {subtasks.map((st, i) => (
                <li key={`${i}-${st}`} className="ct-subtask">
                  <span>{st}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    iconOnly
                    icon={<X size={16} strokeWidth={2} />}
                    aria-label={`Remove subtask: ${st}`}
                    onClick={() => removeSubtask(i)}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <div className="ct-subtask-add">
            <Input
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              placeholder="Add a subtask"
              aria-labelledby="ct-subtasks-label"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addSubtaskLine();
                }
              }}
              data-testid="create-task-subtask-input"
            />
            <Button variant="secondary" size="lg" icon={<Plus size={16} strokeWidth={2.2} />} onClick={addSubtaskLine} disabled={!newSubtask.trim()}>
              Add
            </Button>
          </div>
        </div>

        <div className="ct-actions">
          <Link to="/workspace/tasks" className="al-btn al-btn--secondary al-btn--lg">
            Cancel
          </Link>
          <Button type="submit" variant="primary" size="lg" loading={saving} data-testid="create-task-submit">
            {`Create ${noun}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
