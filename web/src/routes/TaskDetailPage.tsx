import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./create-task.css";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { OneOnOneAssociateFeedbackForm } from "../components/OneOnOneAssociateFeedbackForm";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import {
  fetchOneOnOneAssociateFeedbackContext,
  fetchCoreTeamTasks,
  fetchWebTaskDetail,
  fetchWebTeam,
  fetchWebTeams,
  fetchWebTeamTasks,
  type ApiTask,
  type ApiTaskDetail,
  type OneOnOneAssociateFeedbackContext,
} from "../lib/api";
import { ASSOCIATE_FEEDBACK_SECTION_TITLE, parseFeedbackTaskDescription } from "../lib/one-on-one-feedback";
import { normalizeTaskStatus } from "../lib/task-status";
import { isTaskPhotoUrl } from "../lib/task-attachment";
import { formatTaskDueDateLabel } from "../lib/timezone";
import { Badge, ErrorState, PriorityBadge, StatusBadge } from "../components/ui";

function formatWhen(iso: string | null, due = false): string {
  if (!iso) return "—";
  if (due) return formatTaskDueDateLabel(iso);
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function taskStatusKind(status: string): "done" | "open" {
  return normalizeTaskStatus(status) === "done" ? "done" : "open";
}

export function TaskDetailPage() {
  const { taskId = "" } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();
  const teamIdFromQuery = searchParams.get("teamId")?.trim() ?? "";
  const navigate = useNavigate();
  const { me, teams } = useEnterpriseShell();
  const [task, setTask] = useState<ApiTaskDetail | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [feedbackContextLoading, setFeedbackContextLoading] = useState(false);
  const [feedbackCompletionActive, setFeedbackCompletionActive] = useState(false);
  const feedbackCompletionActiveRef = useRef(false);
  feedbackCompletionActiveRef.current = feedbackCompletionActive;

  useEffect(() => {
    if (!taskId) {
      navigate("/", { replace: true });
    }
  }, [taskId, navigate]);

  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchWebTaskDetail(taskId, teamIdFromQuery || undefined);
        if (cancelled) return;
        setTask(d);
        setWorkspaceId(d.team.id);
        setErr(null);
      } catch (e) {
        if (cancelled) return;
        // Fallback for environments where detail routes can be stale:
        // search tasks by id across candidate teams and reconstruct detail.
        const candidateTeamIds: string[] = [];
        if (teamIdFromQuery) candidateTeamIds.push(teamIdFromQuery);
        try {
          const allTeams = await fetchWebTeams();
          for (const t of allTeams ?? []) {
            if (!candidateTeamIds.includes(t.id)) candidateTeamIds.push(t.id);
          }
        } catch {
          // ignore; we'll try any existing candidate ids
        }
        for (const teamId of candidateTeamIds) {
          try {
            const [team, webTasks, coreTasks] = await Promise.all([
              fetchWebTeam(teamId),
              fetchWebTeamTasks(teamId),
              fetchCoreTeamTasks(teamId).catch(() => []),
            ]);
            if (cancelled) return;
            const webHit = webTasks.find((t) => t.id === taskId) ?? null;
            const coreHit = coreTasks.find((t) => t.id === taskId) ?? null;
            const hit = coreHit ?? webHit;
            if (hit) {
              setTask(buildFallbackTaskDetail(hit, team));
              setWorkspaceId(team.id);
              setErr(null);
              return;
            }
          } catch {
            // continue to next team candidate
          }
        }
        setTask(null);
        setErr(e instanceof Error ? e.message : "Could not load task.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId, teamIdFromQuery]);

  const feedbackMeta = task?.description ? parseFeedbackTaskDescription(task.description) : null;
  const isFeedbackAssignee = !!me?.id && !!feedbackMeta && task?.assignments.some((assignment) => assignment.user.id === me.id) === true;
  const showFeedbackFormLoading =
    !!feedbackMeta &&
    isFeedbackAssignee &&
    task?.status !== "done" &&
    !feedbackCompletionActive &&
    feedbackContextLoading &&
    !feedbackContext;
  const showFocusedFeedbackTask = !!feedbackMeta && isFeedbackAssignee;

  useEffect(() => {
    if (feedbackCompletionActive) return;

    if (!feedbackMeta || !isFeedbackAssignee) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      return;
    }
    if (task?.status === "done" && !feedbackCompletionActive) {
      setFeedbackContext(null);
      setFeedbackContextLoading(false);
      return;
    }
    let cancelled = false;
    setFeedbackContextLoading(true);
    (async () => {
      try {
        const context = await fetchOneOnOneAssociateFeedbackContext(
          feedbackMeta.teamId,
          feedbackMeta.memberUserId,
          feedbackMeta.meetingId,
          feedbackMeta.fieldId,
        );
        if (cancelled || feedbackCompletionActiveRef.current) return;
        setFeedbackContext(context.submitted ? null : context);
      } catch {
        if (cancelled) return;
        setFeedbackContext(null);
      } finally {
        if (!cancelled) setFeedbackContextLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    feedbackMeta?.teamId,
    feedbackMeta?.memberUserId,
    feedbackMeta?.meetingId,
    feedbackMeta?.fieldId,
    isFeedbackAssignee,
    task?.status,
    feedbackCompletionActive,
  ]);

  /** Task routes are team-gated; leave if this workspace is on Free once teams are known. */
  useEffect(() => {
    if (teams === null || !workspaceId || !task) return;
    const has = teams.find((t) => t.id === workspaceId)?.hasTeamFeatures === true;
    if (has) return;
    navigate("/go", { replace: true });
  }, [teams, workspaceId, task, navigate]);

  if (err && !task) {
    return (
      <div className="enterprise-dashboard-inner task-detail-page al-ds">
        <Link to="/workspace/tasks" className="ct-back">
          ← Back
        </Link>
        <ErrorState>{err}</ErrorState>
      </div>
    );
  }

  if (me === undefined || !task) {
    return <EnterprisePageLoading label="Loading task details" />;
  }

  return (
    <div className="enterprise-dashboard-inner task-detail-page al-ds" data-testid="task-detail-screen">
      <div className="task-detail-head">
        <Link to="/workspace/tasks" className="ct-back">
          ← Back
        </Link>
      </div>

      <article className={`enterprise-card task-detail-card${showFocusedFeedbackTask ? " task-detail-card--feedback-focused" : ""}`}>
        <header className="task-detail-header">
          <h1 className="task-detail-title">{task.title}</h1>
          {!showFocusedFeedbackTask ? (
            <div className="task-detail-meta-row">
              <PriorityBadge priority={task.priority} />
              <StatusBadge status={taskStatusKind(task.status)} />
              {task.isJoint ? <Badge tone="accent">Shared</Badge> : null}
            </div>
          ) : null}
        </header>

        {!showFocusedFeedbackTask ? (
          <dl className="task-detail-dl">
            <dt>Team</dt>
            <dd>{task.team.name}</dd>
            <dt>Due</dt>
            <dd>{formatWhen(task.dueDate, true)}</dd>
            <dt>Created</dt>
            <dd>{formatWhen(task.createdAt)}</dd>
            {task.completedAt ? (
              <>
                <dt>Completed</dt>
                <dd>{formatWhen(task.completedAt)}</dd>
              </>
            ) : null}
            <dt>Created by</dt>
            <dd>{task.creator.name ?? task.creator.email ?? task.creator.id}</dd>
          </dl>
        ) : null}

        {feedbackContext && feedbackMeta ? (
          <section className="task-detail-section enterprise-oneone-feedback-task-section">
            <h2 className="task-detail-section-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h2>
            <OneOnOneAssociateFeedbackForm
              teamId={feedbackMeta.teamId}
              memberUserId={feedbackMeta.memberUserId}
              meetingId={feedbackMeta.meetingId}
              context={feedbackContext}
              onCompletionStarted={() => setFeedbackCompletionActive(true)}
              onCompletionFailed={() => setFeedbackCompletionActive(false)}
              onSubmitted={() => {
                setFeedbackCompletionActive(false);
                navigate("/go");
              }}
            />
          </section>
        ) : null}

        {showFeedbackFormLoading ? (
          <section className="task-detail-section enterprise-oneone-feedback-task-section">
            <h2 className="task-detail-section-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h2>
            <p className="enterprise-muted" aria-live="polite">
              Loading your check-in…
            </p>
          </section>
        ) : null}

        {task.description && !feedbackMeta ? (
          <section className="task-detail-section">
            <h2 className="task-detail-section-title">Description</h2>
            <p className="task-detail-description">{task.description}</p>
          </section>
        ) : null}

        {task.attachmentUrl && isTaskPhotoUrl(task.attachmentUrl) ? (
          <section className="task-detail-section">
            <img
              src={task.attachmentUrl}
              alt="Task reference photo"
              className="task-detail-attachment-image"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </section>
        ) : null}

        {!showFocusedFeedbackTask ? (
          <section className="task-detail-section">
            <h2 className="task-detail-section-title">Assignees</h2>
            {task.assignments.length === 0 ? (
              <p className="enterprise-muted">No assignees</p>
            ) : (
              <ul className="task-detail-assignees">
                {task.assignments.map((a) => (
                  <li key={a.user.id} className="task-detail-assignee">
                    {a.user.image ? (
                      <img
                        src={a.user.image}
                        alt={a.user.name ?? a.user.email ?? "Assignee"}
                        className="task-detail-assignee-avatar"
                        width={36}
                        height={36}
                      />
                    ) : (
                      <div className="task-detail-assignee-placeholder" aria-hidden>
                        {(a.user.name ?? a.user.email ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <span>{a.user.name ?? a.user.email ?? a.user.id}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}

        {!showFocusedFeedbackTask && task.subtasks.length > 0 ? (
          <section className="task-detail-section">
            <h2 className="task-detail-section-title">Subtasks</h2>
            <ul className="task-detail-subtasks">
              {task.subtasks.map((s) => (
                <li key={s.id} className={s.completed ? "task-detail-subtask done" : "task-detail-subtask"}>
                  <span className={`td-subtask-check${s.completed ? " is-done" : ""}`} aria-hidden>
                    {s.completed ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span className="al-sr-only">{s.completed ? "Completed: " : "Open: "}</span>
                  {s.title}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!showFocusedFeedbackTask ? (
          <p className="task-detail-edit-hint enterprise-muted">To edit this task or change assignees, use the Alenio mobile app.</p>
        ) : null}
      </article>
    </div>
  );
}

function buildFallbackTaskDetail(task: ApiTask, team: { id: string; name: string }): ApiTaskDetail {
  const creatorName = task.creator?.name ?? null;
  const creatorId = task.creator?.id ?? task.creatorId ?? "unknown";
  const createdAt = task.createdAt ?? task.dueDate ?? new Date().toISOString();
  const updatedAt = task.updatedAt ?? createdAt;
  return {
    ...task,
    teamId: task.teamId ?? team.id,
    creatorId,
    attachmentUrl: task.attachmentUrl ?? null,
    incognito: task.incognito ?? false,
    isJoint: task.isJoint ?? task.assignments.length > 1,
    createdAt,
    updatedAt,
    team,
    creator: {
      id: creatorId,
      name: creatorName,
      email: null,
      image: null,
    },
    subtasks: task.subtasks ?? [],
  };
}
