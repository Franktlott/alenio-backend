import { Check, CheckSquare, ExternalLink, Link2, Lock, Plus, Repeat, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { updateCoreTeamTask, type ApiTask, type WebTeamMemberRow } from "../../lib/api";
import { isFeedbackTaskDescription } from "../../lib/one-on-one-feedback";
import { isRecurringTask } from "../../lib/recurring-task";
import { incompleteSubtasks } from "../../lib/subtask-completion";
import { formatDoneDueDisplay, formatTaskDueDisplay, isTaskOverdue, priorityRank } from "../../lib/task-display";
import { TaskPromptModal } from "../tasks/TaskPromptModal";
import { canCreateWorkspaceTask, isPrivateReminder } from "../tasks/task-presentation";
import {
  AlenioList,
  AlenioListRow,
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  Panel,
  PanelHeader,
  PriorityIndicator,
  RowActions,
  RowMetadata,
  SegmentedControl,
  Select,
  Skeleton,
  type RowAction,
  useToast,
} from "../ui";
import { UserAvatar } from "../UserAvatar";
import { WorkspaceTeamTasksView } from "./WorkspaceTeamTasksView";

type Status = "open" | "done";
type Scope = "mine" | "everyone";
type SortKey = "date" | "priority" | "title";
type Prompt = { kind: "complete" | "recall" | "subtasks"; task: ApiTask };

const PAGE_SIZE = 25;

export function isOpenTask(task: ApiTask): boolean {
  return task.status !== "done" && !task.archivedAt;
}

export function isAssignedTo(task: ApiTask, userId: string): boolean {
  return task.assignments.some((a) => a.user?.id === userId);
}

function dueSortValue(task: ApiTask): number {
  const t = task.dueDate ? Date.parse(task.dueDate) : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
}

function taskUrl(task: ApiTask, teamId: string): string {
  return `/tasks/${encodeURIComponent(task.id)}?teamId=${encodeURIComponent(teamId)}`;
}

/** Workspace task list: open or completed, mine or everyone's. */
export function WorkspaceTasksPanel({
  teamId,
  teamName,
  meId,
  myRole,
  tasks,
  members,
  loading,
  error,
  onOpenMember,
  onChanged,
}: {
  teamId: string;
  teamName: string;
  meId: string;
  myRole: string;
  tasks: ApiTask[];
  members: WebTeamMemberRow[];
  loading: boolean;
  error: string | null;
  onOpenMember: (userId: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const isManager = canCreateWorkspaceTask(myRole);
  const [view, setView] = useState<"people" | "list">(isManager ? "people" : "list");
  const [status, setStatus] = useState<Status>("open");
  const [scope, setScope] = useState<Scope>(isManager ? "everyone" : "mine");
  const [sort, setSort] = useState<SortKey>("date");
  const [page, setPage] = useState(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const toast = useToast();
  const now = useMemo(() => new Date(), []);

  const live = useMemo(() => tasks.filter((t) => !t.archivedAt), [tasks]);
  const scoped = useMemo(
    () => (scope === "mine" ? live.filter((t) => isAssignedTo(t, meId)) : live),
    [live, scope, meId],
  );
  const openCount = scoped.filter((t) => t.status !== "done").length;
  const doneCount = scoped.length - openCount;

  const rows = useMemo(() => {
    const list = scoped.filter((t) => (status === "open" ? t.status !== "done" : t.status === "done"));
    const byDate =
      status === "open"
        ? (a: ApiTask, b: ApiTask) => dueSortValue(a) - dueSortValue(b)
        : (a: ApiTask, b: ApiTask) => Date.parse(b.completedAt ?? "") - Date.parse(a.completedAt ?? "") || 0;
    if (sort === "priority") return [...list].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || byDate(a, b));
    if (sort === "title") return [...list].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return [...list].sort(byDate);
  }, [scoped, status, sort]);

  useEffect(() => setPage(0), [status, scope, sort]);
  useEffect(() => {
    const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    if (page > last) setPage(last);
  }, [rows.length, page]);

  const open = (task: ApiTask) => navigate(taskUrl(task, teamId));

  const requestComplete = (task: ApiTask) => {
    setActionError(null);
    if (isFeedbackTaskDescription(task.description)) {
      open(task);
      return;
    }
    setPrompt({ kind: incompleteSubtasks(task.subtasks).length > 0 ? "subtasks" : "complete", task });
  };

  const applyStatus = async (task: ApiTask, next: "done" | "todo") => {
    setBusy(true);
    setActionError(null);
    try {
      await updateCoreTeamTask(teamId, task.id, { status: next });
      setPrompt(null);
      await onChanged();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Could not update task.";
      if (message.toLowerCase().includes("subtask")) setPrompt({ kind: "subtasks", task });
      else {
        setPrompt(null);
        setActionError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async (task: ApiTask) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${taskUrl(task, teamId)}`);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Panel className="al-ds ws-tasks-panel" aria-labelledby="ws-tasks-title" data-testid="ws-tasks">
      <PanelHeader
        title="Tasks"
        titleId="ws-tasks-title"
        subtitle={
          !isManager
            ? "What's on your plate in this workspace."
            : view === "people"
              ? "See who has what, and who needs a hand."
              : "Everything your team is working on."
        }
        actions={
          <>
            {isManager ? (
              <SegmentedControl
                label="Task view"
                value={view}
                onChange={setView}
                options={[
                  { value: "people", label: "By person", testId: "ws-tasks-view-people" },
                  { value: "list", label: "List", testId: "ws-tasks-view-list" },
                ]}
              />
            ) : null}
            <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />} onClick={() => navigate("/tasks/new")} data-testid="ws-tasks-new">
              {isManager ? "New task" : "New reminder"}
            </Button>
          </>
        }
      />

      {isManager && view === "people" && !error ? (
        loading && tasks.length === 0 ? (
          <div className="ws-tl-loading" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} width="100%" height={56} radius={8} />
            ))}
          </div>
        ) : (
          <WorkspaceTeamTasksView
            teamId={teamId}
            teamName={teamName}
            meId={meId}
            tasks={tasks}
            members={members}
            onOpenTask={open}
            onOpenMember={onOpenMember}
            onChanged={onChanged}
          />
        )
      ) : (
        <>
          <FilterBar
            end={
              <>
                <SegmentedControl
                  label="Whose tasks"
                  quiet
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: "mine", label: "Assigned to me" },
                    { value: "everyone", label: "Everyone" },
                  ]}
                />
                <Select
                  className="ws-tl-sort"
                  aria-label="Sort tasks"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  data-testid="ws-tasks-sort"
                >
                  <option value="date">{status === "open" ? "Sort: Due date" : "Sort: Completed date"}</option>
                  <option value="priority">Sort: Priority</option>
                  <option value="title">Sort: Title</option>
                </Select>
              </>
            }
          >
            <SegmentedControl
              label="Task status"
              value={status}
              onChange={setStatus}
              options={[
                { value: "open", label: "Open", count: openCount },
                { value: "done", label: "Completed", count: doneCount },
              ]}
            />
          </FilterBar>

          {actionError ? <ErrorState>{actionError}</ErrorState> : null}

          {error ? (
            <ErrorState>{error}</ErrorState>
          ) : (
            <AlenioList
              label={status === "open" ? "Open tasks" : "Completed tasks"}
              loading={loading && tasks.length === 0}
              testId="ws-tasks-list"
              pagination={{ page, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage, itemLabel: "tasks" }}
              empty={
                rows.length === 0 ? (
                  <EmptyState
                    icon={<CheckSquare size={20} strokeWidth={2} />}
                    title={status === "open" ? "Nothing open right now" : "No completed tasks yet"}
                    description={
                      status === "open"
                        ? scope === "mine"
                          ? "Tasks assigned to you will show up here."
                          : "New tasks for this workspace will show up here."
                        : "Finished tasks will show up here."
                    }
                  />
                ) : undefined
              }
            >
              {pageRows.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  canComplete={isAssignedTo(task, meId)}
                  onOpen={() => open(task)}
                  onComplete={() => requestComplete(task)}
                  onRecall={() => {
                    setActionError(null);
                    setPrompt({ kind: "recall", task });
                  }}
                  onCopyLink={() => void copyLink(task)}
                />
              ))}
            </AlenioList>
          )}
        </>
      )}

      <TaskPromptModal
        open={prompt?.kind === "complete"}
        title="Mark as done?"
        message="This will complete the task and lock it from further edits."
        confirmLabel="Complete"
        confirmTone="success"
        busy={busy}
        onClose={() => setPrompt(null)}
        onConfirm={() => prompt && void applyStatus(prompt.task, "done")}
      />
      <TaskPromptModal
        open={prompt?.kind === "recall"}
        title="Recall this task?"
        message={
          prompt?.task.dueDate && isTaskOverdue({ ...prompt.task, status: "todo" })
            ? "This task is past its due date and will be marked as overdue once recalled."
            : "This will move the task back to active and allow edits to be made."
        }
        confirmLabel="Recall"
        confirmTone="warning"
        busy={busy}
        onClose={() => setPrompt(null)}
        onConfirm={() => prompt && void applyStatus(prompt.task, "todo")}
      />
      <TaskPromptModal
        open={prompt?.kind === "subtasks"}
        title="Subtasks incomplete"
        message="Subtasks are incomplete. Finish them before marking this task as done."
        confirmLabel="Got it"
        cancelLabel=""
        onClose={() => setPrompt(null)}
        onConfirm={() => setPrompt(null)}
      />
    </Panel>
  );
}

function TaskRow({
  task,
  now,
  canComplete,
  onOpen,
  onComplete,
  onRecall,
  onCopyLink,
}: {
  task: ApiTask;
  now: Date;
  canComplete: boolean;
  onOpen: () => void;
  onComplete: () => void;
  onRecall: () => void;
  onCopyLink: () => void;
}) {
  const done = task.status === "done";
  const due = done ? formatDoneDueDisplay(task) : formatTaskDueDisplay(task.dueDate, now);
  const assignees = task.assignments.map((a) => a.user).filter(Boolean);
  const steps = task.subtasks ?? [];
  const checkable = canComplete && !done;

  const actions: RowAction[] = [
    { id: "open", label: "Open task", icon: <ExternalLink size={15} strokeWidth={2} />, onSelect: onOpen },
    ...(canComplete && !done ? [{ id: "complete", label: "Mark complete", icon: <Check size={15} strokeWidth={2} />, onSelect: onComplete }] : []),
    ...(canComplete && done ? [{ id: "recall", label: "Recall task", icon: <RotateCcw size={15} strokeWidth={2} />, onSelect: onRecall }] : []),
    { id: "copy", label: "Copy link", icon: <Link2 size={15} strokeWidth={2} />, onSelect: onCopyLink },
  ];

  const dueText = done
    ? due.date === "—"
      ? "Completed"
      : `Completed ${due.date}`
    : due.date === "—"
      ? "No due date"
      : due.status
        ? `${due.date} · ${due.status}`
        : `Due ${due.date}`;

  return (
    <AlenioListRow
      testId={`ws-task-${task.id}`}
      muted={done}
      onOpen={onOpen}
      openLabel={`Open task: ${task.title}`}
      leading={
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-disabled={!checkable}
          aria-label={done ? `${task.title} is completed` : `Complete ${task.title}`}
          title={done ? "Completed" : canComplete ? "Mark complete" : "Only assignees can complete this"}
          className={`ws-tl-check${done ? " is-done" : ""}${checkable ? "" : " is-locked"}`}
          onClick={() => {
            if (checkable) onComplete();
          }}
          data-testid={`ws-task-check-${task.id}`}
        >
          {done ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
        </button>
      }
      title={task.title}
      titleAddon={
        isPrivateReminder(task) || (isRecurringTask(task) && !done) || steps.length > 0 ? (
          <>
            {isPrivateReminder(task) ? (
              <span className="al-tag">
                <Lock size={11} strokeWidth={2.2} aria-hidden /> Private
              </span>
            ) : null}
            {isRecurringTask(task) && !done ? (
              <span className="al-tag">
                <Repeat size={11} strokeWidth={2.2} aria-hidden /> Repeats
              </span>
            ) : null}
            {steps.length > 0 ? (
              <span className="al-tag">
                {steps.filter((s) => s.completed).length}/{steps.length} steps
              </span>
            ) : null}
          </>
        ) : null
      }
      meta={
        <RowMetadata>
          <span className={`ws-tl-due ws-tl-due--${due.tone}`}>{dueText}</span>
          {assignees.length === 0 ? (
            <span className="ws-tl-muted">Unassigned</span>
          ) : assignees.length === 1 ? (
            <span className="ws-tl-person">
              <UserAvatar user={assignees[0]!} className="ws-tl-avatar" imgClassName="nw-avatar-img" alt="" />
              {assignees[0]!.name || assignees[0]!.email || "Member"}
            </span>
          ) : (
            <span className="ws-tl-person" title={assignees.map((u) => u.name || u.email || "Member").join(", ")}>
              <span className="ws-tl-people">
                {assignees.slice(0, 3).map((u) => (
                  <UserAvatar key={u.id} user={u} className="ws-tl-avatar" imgClassName="nw-avatar-img" alt="" />
                ))}
              </span>
              {assignees.length} people
            </span>
          )}
          <PriorityIndicator priority={task.priority} />
        </RowMetadata>
      }
      trailing={<RowActions actions={actions} label={`Actions for ${task.title}`} testId={`ws-task-menu-${task.id}`} />}
    />
  );
}
