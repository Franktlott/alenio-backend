import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import { OneOnOneAssociateFeedbackForm } from "../components/OneOnOneAssociateFeedbackForm";
import {
  fetchOneOnOneAssociateFeedbackContext,
  fetchWebMe,
  fetchCoreTeamTasks,
  fetchWebTaskDetail,
  fetchWebTeam,
  fetchWebTeams,
  fetchWebTeamTasks,
  type ApiTask,
  type ApiTaskDetail,
  type OneOnOneAssociateFeedbackContext,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";
import { ASSOCIATE_FEEDBACK_SECTION_TITLE, parseFeedbackTaskDescription } from "../lib/one-on-one-feedback";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}

function priorityLabel(p: string): string {
  if (p === "high") return "High";
  if (p === "medium") return "Medium";
  if (p === "low") return "Low";
  if (p === "urgent") return "Urgent";
  return p;
}

function statusLabel(status: string): string {
  if (status === "done") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Open";
}

function priorityClass(p: string): string {
  if (p === "high" || p === "urgent") return "enterprise-priority enterprise-priority-high";
  if (p === "medium") return "enterprise-priority enterprise-priority-medium";
  if (p === "low") return "enterprise-priority enterprise-priority-low";
  return "enterprise-priority enterprise-priority-none";
}

function statusClass(status: string): string {
  if (status === "done") return "enterprise-status enterprise-status-done";
  if (status === "in_progress") return "enterprise-status enterprise-status-progress";
  return "enterprise-status enterprise-status-pending";
}

function isImageAttachment(url: string): boolean {
  try {
    const clean = url.split("?")[0]?.toLowerCase() ?? "";
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".heic", ".heif"].some((ext) =>
      clean.endsWith(ext),
    );
  } catch {
    return false;
  }
}

export function TaskDetailPage() {
  const { taskId = "" } = useParams<{ taskId: string }>();
  const [searchParams] = useSearchParams();
  const teamIdFromQuery = searchParams.get("teamId")?.trim() ?? "";
  const navigate = useNavigate();
  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [task, setTask] = useState<ApiTaskDetail | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<OneOnOneAssociateFeedbackContext | null>(null);
  const [feedbackCompletionActive, setFeedbackCompletionActive] = useState(false);

  useEffect(() => {
    if (!taskId) {
      navigate("/", { replace: true });
    }
  }, [taskId, navigate]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
      } catch (e) {
        if (cancelled) return;
        setMe(null);
        setTeams([]);
        setErr(e instanceof Error ? e.message : "Could not load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
  const isFeedbackAssignee =
    !!me?.id &&
    !!feedbackMeta &&
    task?.assignments.some((assignment) => assignment.user.id === me.id) === true;

  useEffect(() => {
    if (!feedbackMeta || !isFeedbackAssignee) {
      setFeedbackContext(null);
      return;
    }
    if (task?.status === "done" && !feedbackCompletionActive) {
      setFeedbackContext(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const context = await fetchOneOnOneAssociateFeedbackContext(
          feedbackMeta.teamId,
          feedbackMeta.memberUserId,
          feedbackMeta.meetingId,
          feedbackMeta.fieldId,
        );
        if (cancelled) return;
        setFeedbackContext(context.submitted ? null : context);
      } catch {
        if (cancelled) return;
        setFeedbackContext(null);
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

  const handleWorkspaceChange = (id: string) => {
    setWorkspaceId(id);
    if (task && id !== task.team.id) navigate("/dashboard");
  };

  /** Task routes are team-gated; leave if this workspace is on Free once teams are known. */
  useEffect(() => {
    if (teams === null || !workspaceId || !task) return;
    const has = teams.find((t) => t.id === workspaceId)?.hasTeamFeatures === true;
    if (has) return;
    navigate("/chat", { replace: true });
  }, [teams, workspaceId, task, navigate]);

  if (me === undefined) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-dashboard-inner">
          <p className="enterprise-muted">Loading…</p>
        </main>
      </div>
    );
  }

  if (err && !task) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-dashboard-inner task-detail-page">
          <p className="auth-error" role="alert">
            {err}
          </p>
          <Link to="/dashboard" className="enterprise-inline-link">
            ← Back to dashboard
          </Link>
        </main>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-dashboard-inner">
          <p className="enterprise-muted">Loading…</p>
        </main>
      </div>
    );
  }

  const showPlanNav =
    teams !== null && !!workspaceId && teams.find((t) => t.id === workspaceId)?.role === "owner";
  const showActivityExecuteNav =
    teams === null ||
    !workspaceId ||
    teams.find((t) => t.id === workspaceId)?.hasTeamFeatures === true;

  return (
    <EnterpriseLayout
      activeNav="execute"
      teams={teams ?? []}
      selectedTeamId={workspaceId}
      onTeamChange={handleWorkspaceChange}
      user={me ?? null}
      onSignOutNavigate={(path) => navigate(path)}
      topBar={
        <DashboardTopBar user={me ?? null} pageTitle="Task" />
      }
      showPlanNav={showPlanNav}
      showActivityExecuteNav={showActivityExecuteNav}
    >
      <div className="enterprise-dashboard-inner task-detail-page" data-testid="task-detail-screen">
        <div className="task-detail-head">
          <Link to="/dashboard" className="create-task-back">
            ← Back to dashboard
          </Link>
        </div>

        <article className="enterprise-card task-detail-card">
          <header className="task-detail-header">
            <h1 className="task-detail-title">{task.title}</h1>
            <div className="task-detail-meta-row">
              <span className={priorityClass(task.priority)}>{priorityLabel(task.priority)}</span>
              <span className={statusClass(task.status)}>{statusLabel(task.status)}</span>
              {task.incognito ? <span className="task-detail-badge-incog">Incognito</span> : null}
              {task.isJoint ? <span className="task-detail-badge-joint">Shared</span> : null}
            </div>
          </header>

          <dl className="task-detail-dl">
            <dt>Team</dt>
            <dd>{task.team.name}</dd>
            <dt>Due</dt>
            <dd>{formatWhen(task.dueDate)}</dd>
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

          {feedbackContext && feedbackMeta ? (
            <section className="task-detail-section enterprise-oneone-feedback-task-section">
              <h2 className="task-detail-section-title">{ASSOCIATE_FEEDBACK_SECTION_TITLE}</h2>
              <OneOnOneAssociateFeedbackForm
                teamId={feedbackMeta.teamId}
                memberUserId={feedbackMeta.memberUserId}
                meetingId={feedbackMeta.meetingId}
                context={feedbackContext}
                onCompletionStarted={() => setFeedbackCompletionActive(true)}
                onSubmitted={() => {
                  setFeedbackCompletionActive(false);
                  navigate("/dashboard");
                }}
              />
            </section>
          ) : null}

          {task.description && !feedbackMeta ? (
            <section className="task-detail-section">
              <h2 className="task-detail-section-title">Description</h2>
              <p className="task-detail-description">{task.description}</p>
            </section>
          ) : null}

          {task.attachmentUrl ? (
            <section className="task-detail-section">
              <h2 className="task-detail-section-title">Attachment</h2>
              {isImageAttachment(task.attachmentUrl) ? (
                <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="task-detail-attachment-link">
                  <img src={task.attachmentUrl} alt="Task attachment" className="task-detail-attachment-image" />
                </a>
              ) : (
                <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" className="enterprise-inline-link">
                  Open attachment
                </a>
              )}
            </section>
          ) : null}

          <section className="task-detail-section">
            <h2 className="task-detail-section-title">Assignees</h2>
            {task.assignments.length === 0 ? (
              <p className="enterprise-muted">No assignees</p>
            ) : (
              <ul className="task-detail-assignees">
                {task.assignments.map((a) => (
                  <li key={a.user.id} className="task-detail-assignee">
                    {a.user.image ? (
                      <img src={a.user.image} alt={a.user.name ?? a.user.email ?? "Assignee"} className="task-detail-assignee-avatar" width={36} height={36} />
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

          {task.subtasks.length > 0 ? (
            <section className="task-detail-section">
              <h2 className="task-detail-section-title">Subtasks</h2>
              <ul className="task-detail-subtasks">
                {task.subtasks.map((s) => (
                  <li key={s.id} className={s.completed ? "task-detail-subtask done" : "task-detail-subtask"}>
                    <span className="task-detail-subtask-check" aria-hidden>
                      {s.completed ? "✓" : "○"}
                    </span>
                    {s.title}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="task-detail-edit-hint enterprise-muted">To edit this task or change assignees, use the Alenio mobile app.</p>
        </article>
      </div>
    </EnterpriseLayout>
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
