import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronDown,
  ClipboardCheck,
  Crown,
  FileAudio,
  FileText,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { UserAvatar } from "../components/UserAvatar";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { fetchWebTeam } from "../lib/api";
import { CheckInTranscriptDrawer } from "../components/workspace/CheckInTranscriptDrawer";
import { StartCheckInFlow } from "../components/workspace/StartCheckInFlow";
import {
  cancelCheckInRecording,
  createGoal,
  deleteCheckIn,
  deleteGoal,
  fetchActiveCheckInRecordings,
  fetchCheckIns,
  fetchGoals,
  fetchPlannedCheckIns,
  finishCheckInRecording,
  goalProgress,
  setGoalStatus,
  setGoalStep,
  type ActiveCheckInRecording,
  type CheckIn,
  type CheckInField,
  type DevelopmentGoal,
  type GoalPriority,
} from "../lib/member-development-api";
import { queryKeys } from "../lib/query-keys";
import {
  AlenioList,
  AlenioListRow,
  Button,
  EmptyState,
  ErrorState,
  InlineProgress,
  RowActions,
  RowMetadata,
  StatusIndicator,
  type IndicatorTone,
  type RowAction,
} from "../components/ui";
import "./discover/discover-categories-drawer.css";
import "./discover/discover-manage.css";
import "./web-network.css";
import "./web-workspace.css";

const MANAGER_ROLES = new Set(["owner", "team_leader"]);

type Tab = "check-ins" | "goals";

const keys = {
  checkIns: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "check-ins"] as const,
  planned: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "planned"] as const,
  goals: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "goals"] as const,
  recordings: (teamId: string, userId: string) => ["workspace", "member", teamId, userId, "recordings"] as const,
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team leader";
  if (role === "admin") return "Admin";
  return "Member";
}

function formatDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}) });
}

function formatDateTime(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (allDay) return `${day} · All day`;
  return `${day} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/** A workspace member's check-ins and development goals. Leaders see anyone; members see themselves. */
export function WebWorkspaceMemberPage() {
  const { userId = "" } = useParams<{ userId: string }>();
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get("tab") === "goals" ? "goals" : "check-ins";
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<CheckIn | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  const team = useMemo(() => {
    if (!teams || teams.length === 0) return null;
    return teams.find((t) => t.id === selectedTeamId) ?? teams[0] ?? null;
  }, [teams, selectedTeamId]);
  const teamId = team?.id ?? "";

  const detail = useQuery({
    queryKey: queryKeys.teamDetail(teamId),
    queryFn: () => fetchWebTeam(teamId),
    enabled: Boolean(team),
    staleTime: 60_000,
  });

  const myRole = detail.data?.myRole ?? team?.role ?? "member";
  const isManager = MANAGER_ROLES.has(myRole);
  const isSelf = me?.id === userId;
  const allowed = isManager || isSelf;

  const checkIns = useQuery({
    queryKey: keys.checkIns(teamId, userId),
    queryFn: () => fetchCheckIns(teamId, userId),
    enabled: Boolean(teamId && userId && allowed),
  });
  const planned = useQuery({
    queryKey: keys.planned(teamId, userId),
    queryFn: () => fetchPlannedCheckIns(teamId, userId),
    enabled: Boolean(teamId && userId && allowed),
    retry: false,
  });
  const goals = useQuery({
    queryKey: keys.goals(teamId, userId),
    queryFn: () => fetchGoals(teamId, userId),
    enabled: Boolean(teamId && userId && allowed),
  });

  if (me === undefined || teams === null) return <EnterprisePageLoading label="Loading member" />;
  if (!me) return null;
  if (!team) return <Navigate to="/workspace" replace />;
  if (detail.isSuccess && !allowed) return <Navigate to={`/people/${encodeURIComponent(userId)}`} replace />;

  const member = detail.data?.members.find((m) => m.userId === userId) ?? null;
  if (detail.isSuccess && !member) {
    return (
      <div className="dm-page nw-page ws-page wm-page" data-testid="ws-member-page">
        <div className="wm-missing">
          <BackLink />
          <div className="dm-empty">
            <UserRound size={28} />
            <h3>Not in this workspace</h3>
            <p>This person isn't a member of {team.name}. Switch workspaces or go back to see who's here.</p>
          </div>
        </div>
      </div>
    );
  }

  const name = member?.user.name ?? member?.user.email ?? "Member";
  const lead = member ? MANAGER_ROLES.has(member.role) : false;
  const canStartCheckIn = isManager && !isSelf;
  const canAddGoal = allowed;
  const meetings = checkIns.data ?? [];
  const goalList = goals.data ?? [];
  const activeGoals = goalList.filter((g) => g.status !== "closed");

  const setTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    if (next === "goals") params.set("tab", "goals");
    else params.delete("tab");
    setSearchParams(params, { replace: true });
  };

  return (
    <div className="dm-page nw-page ws-page wm-page" data-testid="ws-member-page">
      <header className="dm-hero nw-hero ws-hero wm-hero">
        <img src="/alenio-home-hero-afternoon.jpg" alt="" className="dm-hero-photo" />
        <div className="dm-hero-fade" aria-hidden />
        <div className="dm-hero-copy wm-hero-copy">
          <BackLink teamName={team.name} />
          <div className="wm-hero-row">
            <span className={`ws-member-ring wm-ring${lead ? " wm-ring--lead" : ""}`}>
              {member ? (
                <UserAvatar user={member.user} className="ws-member-avatar wm-avatar" imgClassName="nw-avatar-img" alt="" />
              ) : (
                <span className="ws-member-avatar wm-avatar" />
              )}
              {lead ? (
                <span className="ws-member-badge wm-badge" aria-hidden>
                  <Crown size={11} strokeWidth={2.6} />
                </span>
              ) : null}
            </span>
            <div className="wm-hero-text">
              <h1>{member ? (isSelf ? `${name} (you)` : name) : "\u00a0"}</h1>
              <p>
                {member ? roleLabel(member.role) : ""}
                {member?.joinedAt ? ` · Joined ${formatDate(member.joinedAt)}` : ""}
              </p>
            </div>
            <div className="wm-hero-actions">
              <Link className="nw-btn" to={`/people/${encodeURIComponent(userId)}`} data-testid="wm-public-profile">
                <UserRound size={14} strokeWidth={2.2} />
                Public profile
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="nw-tabs-row wm-tabs-row">
        <nav className="dm-tabs" aria-label="Member sections">
          <button
            type="button"
            className={`dm-tab${tab === "check-ins" ? " dm-tab--active" : ""}`}
            aria-current={tab === "check-ins" ? "page" : undefined}
            onClick={() => setTab("check-ins")}
            data-testid="wm-tab-check-ins"
          >
            <ClipboardCheck size={15} strokeWidth={2.2} />
            Check-ins
            <span className="wm-tab-count">{meetings.length}</span>
          </button>
          <button
            type="button"
            className={`dm-tab${tab === "goals" ? " dm-tab--active" : ""}`}
            aria-current={tab === "goals" ? "page" : undefined}
            onClick={() => setTab("goals")}
            data-testid="wm-tab-goals"
          >
            <Target size={15} strokeWidth={2.2} />
            Goals
            <span className="wm-tab-count">{activeGoals.length}</span>
          </button>
        </nav>
        {tab === "check-ins" && canStartCheckIn ? (
          <button type="button" className="nw-btn nw-btn--primary" onClick={() => setCheckInOpen(true)} data-testid="wm-start-check-in">
            <Plus size={15} strokeWidth={2.4} />
            Start check-in
          </button>
        ) : null}
        {tab === "goals" && canAddGoal ? (
          <button type="button" className="nw-btn nw-btn--primary" onClick={() => setGoalOpen(true)} data-testid="wm-add-goal">
            <Plus size={15} strokeWidth={2.4} />
            Add goal
          </button>
        ) : null}
      </div>

      <div className="wm-body al-ds">
        {tab === "check-ins" ? (
          <CheckInsTab
            teamId={teamId}
            userId={userId}
            firstName={isSelf ? "you" : name.split(/\s+/)[0] ?? name}
            isSelf={isSelf}
            canManage={isManager && !isSelf}
            meetings={meetings}
            loading={checkIns.isLoading}
            error={checkIns.isError ? errorMessage(checkIns.error, "Couldn't load check-ins.") : null}
            planned={planned.data ?? []}
            onStart={canStartCheckIn ? () => setCheckInOpen(true) : undefined}
            onResume={
              canStartCheckIn
                ? (meeting) => {
                    setResumeDraft(meeting);
                    setCheckInOpen(true);
                  }
                : undefined
            }
          />
        ) : (
          <GoalsTab
            teamId={teamId}
            userId={userId}
            isSelf={isSelf}
            goals={goalList}
            loading={goals.isLoading}
            error={goals.isError ? errorMessage(goals.error, "Couldn't load goals.") : null}
            onAdd={canAddGoal ? () => setGoalOpen(true) : undefined}
          />
        )}
      </div>

      <StartCheckInFlow
        open={checkInOpen}
        resume={resumeDraft}
        teamId={teamId}
        userId={userId}
        memberName={name}
        onClose={() => {
          setCheckInOpen(false);
          setResumeDraft(null);
        }}
      />
      <NewGoalDrawer
        open={goalOpen}
        teamId={teamId}
        userId={userId}
        memberName={isSelf ? null : name}
        onClose={() => setGoalOpen(false)}
      />
    </div>
  );
}

function BackLink({ teamName }: { teamName?: string }) {
  return (
    <Link to="/workspace" className="wm-back" data-testid="wm-back">
      <ArrowLeft size={14} strokeWidth={2.4} />
      {teamName ?? "Workspace"}
    </Link>
  );
}

function Panel({ title, icon, children, count }: { title: string; icon: ReactNode; children: ReactNode; count?: number }) {
  return (
    <section className="wm-panel">
      <header className="wm-panel-head">
        <h2>
          {icon}
          {title}
          {count !== undefined ? <span className="al-seg-count">{count}</span> : null}
        </h2>
      </header>
      {children}
    </section>
  );
}

function RowChevron() {
  return <ChevronDown size={16} strokeWidth={2} className="al-row-chevron" aria-hidden />;
}

/* ---------- Check-ins ---------- */

function CheckInsTab({
  teamId,
  userId,
  firstName,
  isSelf,
  canManage,
  meetings,
  loading,
  error,
  planned,
  onStart,
  onResume,
}: {
  teamId: string;
  userId: string;
  firstName: string;
  isSelf: boolean;
  canManage: boolean;
  meetings: CheckIn[];
  loading: boolean;
  error: string | null;
  planned: { id: string; title: string; startDate: string; allDay: boolean; isVideoMeeting: boolean }[];
  onStart?: () => void;
  onResume?: (meeting: CheckIn) => void;
}) {
  const [transcriptFor, setTranscriptFor] = useState<CheckIn | null>(null);
  const [pickedId, setOpenId] = useState<string | null | undefined>(undefined);
  const openId = pickedId === undefined ? (meetings[0]?.id ?? null) : pickedId;
  const qc = useQueryClient();
  const remove = useMutation({
    mutationFn: (id: string) => deleteCheckIn(teamId, userId, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.checkIns(teamId, userId) }),
  });
  const recordings = useQuery({
    queryKey: keys.recordings(teamId, userId),
    queryFn: () => fetchActiveCheckInRecordings(teamId, userId),
    enabled: canManage && Boolean(teamId && userId),
    retry: false,
    refetchInterval: (query) =>
      (query.state.data as ActiveCheckInRecording[] | undefined)?.some((r) => r.status === "transcribing")
        ? 4000
        : false,
  });
  const active = recordings.data ?? [];
  const writingCount = active.filter((r) => r.status === "transcribing").length;
  useEffect(() => {
    if (writingCount === 0) void qc.invalidateQueries({ queryKey: keys.checkIns(teamId, userId) });
  }, [writingCount, qc, teamId, userId]);

  const writeUpDraft = useMutation({
    mutationFn: (recording: ActiveCheckInRecording) =>
      finishCheckInRecording(teamId, userId, recording.id, recording.durationSec),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recordings(teamId, userId) }),
  });
  const dismissRecording = useMutation({
    mutationFn: (recording: ActiveCheckInRecording) =>
      cancelCheckInRecording(teamId, userId, recording.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.recordings(teamId, userId) }),
  });

  return (
    <div className="wm-grid">
      <Panel title="Check-ins" icon={<ClipboardCheck size={16} strokeWidth={2} />} count={meetings.length}>
        {error ? (
          <ErrorState>{error}</ErrorState>
        ) : (
          <AlenioList
            label="Check-ins"
            loading={loading}
            loadingRows={3}
            testId="wm-check-ins"
            empty={
              meetings.length === 0 && active.length === 0 ? (
                <EmptyState
                  icon={<ClipboardCheck size={20} strokeWidth={2} />}
                  title="No check-ins yet"
                  description={
                    isSelf
                      ? "When a leader completes a check-in with you, it'll show up here."
                      : `Start a check-in to capture how ${firstName} is doing and what's next.`
                  }
                  action={
                    onStart ? (
                      <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />} onClick={onStart}>
                        Start check-in
                      </Button>
                    ) : undefined
                  }
                />
              ) : undefined
            }
          >
            {active.map((r) => {
              const failed = r.status === "failed";
              const transcriptDraft = r.status === "draft";
              return (
                <AlenioListRow
                  key={r.id}
                  testId={`wm-recording-${r.id}`}
                  leading={
                    <span
                      className={`al-row-icon${
                        failed ? " al-row-icon--danger" : transcriptDraft ? "" : " al-row-icon--accent"
                      }`}
                    >
                      {failed ? (
                        <AlertCircle size={15} strokeWidth={2} />
                      ) : transcriptDraft ? (
                        <FileText size={15} strokeWidth={2} />
                      ) : (
                        <Loader2 size={15} className="ci-spin" />
                      )}
                    </span>
                  }
                  title={r.templateTitle}
                  description={
                    failed
                      ? (r.error ?? "We couldn't write up this recording.")
                      : transcriptDraft
                        ? "Transcript draft — write it up when ready."
                        : "Seneca is writing this up…"
                  }
                  titleAddon={
                    <StatusIndicator tone={failed ? "danger" : transcriptDraft ? "neutral" : "info"}>
                      {failed ? "Failed" : transcriptDraft ? "Draft" : "Writing up"}
                    </StatusIndicator>
                  }
                  trailing={
                    transcriptDraft || failed ? (
                      <span style={{ display: "inline-flex", gap: 8 }}>
                        {transcriptDraft ? (
                          <Button
                            variant="primary"
                            onClick={() => writeUpDraft.mutate(r)}
                            disabled={writeUpDraft.isPending}
                          >
                            Write up
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (
                              !window.confirm(
                                transcriptDraft
                                  ? "Dismiss this transcript draft? This can't be undone."
                                  : "Dismiss this failed recording?",
                              )
                            ) {
                              return;
                            }
                            dismissRecording.mutate(r);
                          }}
                          disabled={dismissRecording.isPending}
                        >
                          Dismiss
                        </Button>
                      </span>
                    ) : undefined
                  }
                />
              );
            })}
            {meetings.map((m) => (
              <CheckInRow
                key={m.id}
                meeting={m}
                open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)}
                onResume={onResume && m.status === "draft" ? () => onResume(m) : undefined}
                onTranscript={canManage && m.captureMode === "recorded" ? () => setTranscriptFor(m) : undefined}
                onDelete={
                  canManage
                    ? () => {
                        const recordingNote =
                          m.captureMode === "recorded" ? " Its recording and transcript are deleted too." : "";
                        if (window.confirm(`Delete "${m.templateTitle}"?${recordingNote} This can't be undone.`)) {
                          remove.mutate(m.id);
                        }
                      }
                    : undefined
                }
              />
            ))}
          </AlenioList>
        )}
      </Panel>

      <aside className="wm-side">
        <Panel title="Coming up" icon={<CalendarClock size={16} strokeWidth={2} />}>
          <AlenioList
            label="Planned check-ins"
            empty={
              planned.length === 0 ? (
                <p className="wm-side-empty">No check-ins scheduled. Planned check-ins from the calendar appear here.</p>
              ) : undefined
            }
          >
            {planned.map((p) => (
              <AlenioListRow
                key={p.id}
                leading={
                  <span className="al-row-icon">
                    {p.isVideoMeeting ? <Video size={15} strokeWidth={2} /> : <CalendarClock size={15} strokeWidth={2} />}
                  </span>
                }
                title={p.title}
                meta={<RowMetadata>{formatDateTime(p.startDate, p.allDay)}</RowMetadata>}
              />
            ))}
          </AlenioList>
        </Panel>
      </aside>
      <CheckInTranscriptDrawer
        teamId={teamId}
        userId={userId}
        meetingId={transcriptFor?.id ?? null}
        title={transcriptFor?.templateTitle}
        onClose={() => setTranscriptFor(null)}
      />
    </div>
  );
}

function CheckInRow({
  meeting,
  open,
  onToggle,
  onResume,
  onTranscript,
  onDelete,
}: {
  meeting: CheckIn;
  open: boolean;
  onToggle: () => void;
  onResume?: () => void;
  onTranscript?: () => void;
  onDelete?: () => void;
}) {
  const fields = [...(meeting.templateFields ?? [])].sort((a, b) => a.order - b.order);
  const tasks = meeting.followUpTasks ?? [];
  const when = meeting.publishedAt ?? meeting.createdAt;
  const recorded = meeting.captureMode === "recorded";
  const resumeLabel = recorded ? "Review write-up" : "Continue draft";
  const actions: RowAction[] = [
    ...(onResume ? [{ id: "resume", label: resumeLabel, icon: <Pencil size={15} strokeWidth={2} />, onSelect: onResume }] : []),
    ...(onTranscript ? [{ id: "transcript", label: "View transcript", icon: <FileAudio size={15} strokeWidth={2} />, onSelect: onTranscript }] : []),
    ...(onDelete ? [{ id: "delete", label: "Delete", icon: <Trash2 size={15} strokeWidth={2} />, onSelect: onDelete, tone: "danger" as const }] : []),
  ];
  return (
    <AlenioListRow
      testId={`wm-check-in-${meeting.id}`}
      expanded={open}
      onOpen={onToggle}
      leading={
        <span className="al-row-icon al-row-icon--accent">
          <ClipboardCheck size={15} strokeWidth={2} />
        </span>
      }
      title={meeting.templateTitle}
      titleAddon={
        recorded ? (
          <span className="al-tag" title="Written up by Seneca from a recording">
            <Sparkles size={11} strokeWidth={2.2} aria-hidden /> Seneca
          </span>
        ) : null
      }
      meta={
        <RowMetadata>
          {formatDate(when)}
          {meeting.createdBy?.name ? `with ${meeting.createdBy.name}` : null}
          {meeting.status === "draft" ? <StatusIndicator tone="warning">Draft</StatusIndicator> : null}
          {meeting.associateFeedbackPending ? <StatusIndicator tone="info">Awaiting notes</StatusIndicator> : null}
        </RowMetadata>
      }
      trailing={
        <>
          <RowActions actions={actions} label={`Actions for ${meeting.templateTitle}`} testId={`wm-check-in-menu-${meeting.id}`} />
          <RowChevron />
        </>
      }
    >
      <dl className="wm-answers">
        {fields.map((f) => (
          <Answer key={f.id} field={f} value={meeting.responses?.[f.id]} />
        ))}
      </dl>
      {tasks.length > 0 ? (
        <div className="wm-followups">
          <h4>Follow-up tasks</h4>
          <ul>
            {tasks.map((t) => (
              <li key={t.id} className={t.status === "done" || t.status === "completed" ? "is-done" : ""}>
                <Check size={13} strokeWidth={2.6} />
                <span>{t.title}</span>
                {t.assignee?.name ? <small>{t.assignee.name}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {onResume ? (
        <div className="wm-card-foot">
          <Button variant="primary" size="sm" icon={<Pencil size={14} strokeWidth={2} />} onClick={onResume} data-testid={`wm-resume-${meeting.id}`}>
            {resumeLabel}
          </Button>
        </div>
      ) : null}
    </AlenioListRow>
  );
}

function Answer({ field, value }: { field: CheckInField; value: string | number | undefined }) {
  if (field.type === "section") return <dt className="wm-answer-section">{field.label}</dt>;
  const empty = value === undefined || value === null || String(value).trim() === "";
  let display: ReactNode = <span className="wm-muted">No answer</span>;
  if (!empty) {
    if (field.type === "rating") {
      const max = field.ratingMax ?? 5;
      const num = Number(value);
      display = (
        <span className="wm-rating" aria-label={`${num} out of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={i < num ? "is-on" : ""} />
          ))}
          <b>
            {num}/{max}
          </b>
        </span>
      );
    } else if (field.type === "yes_no") {
      const yes = String(value).toLowerCase() === "yes";
      display = (
        <StatusIndicator tone={yes ? "success" : "danger"}>{yes ? "Yes" : "No"}</StatusIndicator>
      );
    } else {
      display = <p>{String(value)}</p>;
    }
  }
  return (
    <div className="wm-answer">
      <dt>{field.label}</dt>
      <dd>{display}</dd>
    </div>
  );
}

/* ---------- Goals ---------- */

const PRIORITY_LABEL: Record<GoalPriority, string> = { high: "High", normal: "Normal", low: "Low" };
const PRIORITY_TONE: Record<GoalPriority, IndicatorTone> = { high: "danger", normal: "accent", low: "neutral" };

function GoalsTab({
  teamId,
  userId,
  isSelf,
  goals,
  loading,
  error,
  onAdd,
}: {
  teamId: string;
  userId: string;
  isSelf: boolean;
  goals: DevelopmentGoal[];
  loading: boolean;
  error: string | null;
  onAdd?: () => void;
}) {
  const active = goals.filter((g) => g.status !== "closed");
  const closed = goals.filter((g) => g.status === "closed");
  const [pickedId, setOpenId] = useState<string | null | undefined>(undefined);
  const openId = pickedId === undefined ? (active[0]?.id ?? null) : pickedId;
  const toggle = (id: string) => setOpenId(openId === id ? null : id);

  if (error) return <ErrorState>{error}</ErrorState>;

  return (
    <div className="wm-goals" data-testid="wm-goals">
      <Panel title="Active goals" icon={<Target size={16} strokeWidth={2} />} count={loading ? undefined : active.length}>
        <AlenioList
          label="Active goals"
          loading={loading}
          loadingRows={2}
          empty={
            active.length === 0 ? (
              <EmptyState
                icon={<Target size={20} strokeWidth={2} />}
                title="No active goals"
                description={
                  isSelf
                    ? "Set a goal for a skill you want to grow, broken into small steps."
                    : "Set a development goal with clear steps you can check off together."
                }
                action={
                  onAdd ? (
                    <Button variant="primary" icon={<Plus size={16} strokeWidth={2.2} />} onClick={onAdd}>
                      Add goal
                    </Button>
                  ) : undefined
                }
              />
            ) : undefined
          }
        >
          {active.map((g) => (
            <GoalRow key={g.id} teamId={teamId} userId={userId} goal={g} open={openId === g.id} onToggle={() => toggle(g.id)} />
          ))}
        </AlenioList>
      </Panel>

      {closed.length > 0 ? (
        <Panel title="Completed & closed" icon={<Check size={16} strokeWidth={2} />} count={closed.length}>
          <AlenioList label="Completed and closed goals">
            {closed.map((g) => (
              <GoalRow key={g.id} teamId={teamId} userId={userId} goal={g} open={openId === g.id} onToggle={() => toggle(g.id)} />
            ))}
          </AlenioList>
        </Panel>
      ) : null}
    </div>
  );
}

function GoalRow({
  teamId,
  userId,
  goal,
  open,
  onToggle,
}: {
  teamId: string;
  userId: string;
  goal: DevelopmentGoal;
  open: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const queryKey = keys.goals(teamId, userId);
  const [error, setError] = useState<string | null>(null);
  const replace = (next: DevelopmentGoal) =>
    qc.setQueryData<DevelopmentGoal[]>(queryKey, (prev) => prev?.map((g) => (g.id === next.id ? next : g)));

  const toggleStep = useMutation({
    mutationFn: ({ index, completed }: { index: number; completed: boolean }) =>
      setGoalStep(teamId, userId, goal.id, index, completed),
    onSuccess: replace,
    onError: (err) => setError(errorMessage(err, "Couldn't update the step.")),
  });
  const status = useMutation({
    mutationFn: (next: "active" | "closed") => setGoalStatus(teamId, userId, goal.id, next),
    onSuccess: replace,
    onError: (err) => setError(errorMessage(err, "Couldn't update the goal.")),
  });
  const remove = useMutation({
    mutationFn: () => deleteGoal(teamId, userId, goal.id),
    onSuccess: () => qc.setQueryData<DevelopmentGoal[]>(queryKey, (prev) => prev?.filter((g) => g.id !== goal.id)),
    onError: (err) => setError(errorMessage(err, "Couldn't delete the goal.")),
  });

  const { done, total } = goalProgress(goal);
  const completed = new Set(goal.completedStepIndexes ?? []);
  const closed = goal.status === "closed";
  const editable = !goal.readOnly;
  const setStatus = (next: "active" | "closed") => {
    setError(null);
    status.mutate(next);
  };
  const confirmDelete = () => {
    if (window.confirm(`Delete "${goal.skill}"? This can't be undone.`)) {
      setError(null);
      remove.mutate();
    }
  };

  const actions: RowAction[] = editable
    ? [
        closed
          ? { id: "reopen", label: "Reopen goal", icon: <RotateCcw size={15} strokeWidth={2} />, onSelect: () => setStatus("active"), disabled: status.isPending }
          : { id: "close", label: "Close goal", icon: <Check size={15} strokeWidth={2} />, onSelect: () => setStatus("closed"), disabled: status.isPending },
        { id: "delete", label: "Delete goal", icon: <Trash2 size={15} strokeWidth={2} />, onSelect: confirmDelete, tone: "danger", disabled: remove.isPending },
      ]
    : [];

  return (
    <AlenioListRow
      testId={`wm-goal-${goal.id}`}
      expanded={open}
      onOpen={onToggle}
      muted={closed}
      leading={
        <span className={`al-row-icon${closed ? "" : " al-row-icon--accent"}`}>
          <Target size={15} strokeWidth={2} />
        </span>
      }
      title={goal.skill}
      meta={
        <RowMetadata>
          {closed && goal.closedAt ? `Closed ${formatDate(goal.closedAt)}` : goal.dueDate ? `Due ${formatDate(goal.dueDate)}` : "No due date"}
          <InlineProgress done={done} total={total} label={`${done}/${total} steps`} tone={closed ? "success" : "accent"} />
          {closed ? null : (
            <StatusIndicator tone={PRIORITY_TONE[goal.priority] ?? "accent"}>{PRIORITY_LABEL[goal.priority] ?? "Normal"} priority</StatusIndicator>
          )}
          {!closed && (goal.status === "inactive" || goal.nearingInactive) ? (
            <StatusIndicator tone="warning">{goal.status === "inactive" ? "No recent progress" : "Needs a step soon"}</StatusIndicator>
          ) : null}
        </RowMetadata>
      }
      trailing={
        <>
          <RowActions actions={actions} label={`Actions for ${goal.skill}`} testId={`wm-goal-menu-${goal.id}`} />
          <RowChevron />
        </>
      }
    >
      {goal.description ? <p className="wm-goal-desc">{goal.description}</p> : null}
      {goal.status === "inactive" || goal.nearingInactive ? (
        <p className="wm-goal-warn">
          {goal.status === "inactive" ? "No progress in a while." : "Check off a step soon to keep this goal active."}
        </p>
      ) : null}
      <ul className="wm-steps">
        {goal.steps.map((step, index) => {
          const isDone = completed.has(index);
          return (
            <li key={index}>
              <label className={`wm-step${isDone ? " is-done" : ""}`}>
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={!editable || closed || toggleStep.isPending}
                  onChange={(e) => {
                    setError(null);
                    toggleStep.mutate({ index, completed: e.target.checked });
                  }}
                />
                <span className="wm-step-box">{isDone ? <Check size={12} strokeWidth={3} /> : null}</span>
                <span>{step}</span>
              </label>
            </li>
          );
        })}
      </ul>
      {error ? <ErrorState>{error}</ErrorState> : null}
      {editable ? (
        <div className="wm-card-foot">
          {closed ? (
            <Button size="sm" icon={<RotateCcw size={14} strokeWidth={2} />} onClick={() => setStatus("active")} disabled={status.isPending}>
              Reopen
            </Button>
          ) : (
            <Button size="sm" icon={<Check size={14} strokeWidth={2} />} onClick={() => setStatus("closed")} disabled={status.isPending}>
              Close goal
            </Button>
          )}
        </div>
      ) : null}
    </AlenioListRow>
  );
}

function NewGoalDrawer({
  open,
  teamId,
  userId,
  memberName,
  onClose,
}: {
  open: boolean;
  teamId: string;
  userId: string;
  memberName: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [skill, setSkill] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<GoalPriority>("normal");
  const [steps, setSteps] = useState<string[]>(["", ""]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSkill("");
    setDescription("");
    setDueDate("");
    setPriority("normal");
    setSteps(["", ""]);
    setError(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const create = useMutation({
    mutationFn: () => {
      const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
      if (cleanSteps.length === 0) throw new Error("Add at least one step.");
      return createGoal(teamId, userId, {
        skill: skill.trim(),
        description: description.trim() || null,
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
        priority,
        steps: cleanSteps,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.goals(teamId, userId) });
      onClose();
    },
    onError: (err) => setError(errorMessage(err, "Couldn't save the goal.")),
  });

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!skill.trim()) return;
    setError(null);
    create.mutate();
  };

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="dcat-drawer wm-drawer" role="dialog" aria-modal="true" aria-label="Add goal" data-testid="wm-goal-drawer">
        <header className="dcat-head">
          <span className="dcat-head-icon">
            <Target size={18} strokeWidth={2.2} />
          </span>
          <div className="dcat-head-copy">
            <h2>New goal</h2>
            <p>{memberName ? `A development goal for ${memberName.split(/\s+/)[0]}.` : "A skill you want to grow."}</p>
          </div>
          <button type="button" className="dcat-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <form className="dcat-form wm-form" onSubmit={submit}>
          <label className="dcat-field">
            <span>Skill or goal</span>
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="Coaching new hires, closing shifts, merchandising…"
              maxLength={200}
              autoFocus
              required
              data-testid="wm-goal-skill"
            />
          </label>
          <label className="dcat-field">
            <span>Why it matters (optional)</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={2000} />
          </label>
          <div className="ws-cal-form-row">
            <label className="dcat-field">
              <span>Due date</span>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            <div className="dcat-field">
              <span>Priority</span>
              <div className="wm-rate-pick wm-priority" role="radiogroup" aria-label="Priority">
                {(["low", "normal", "high"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={priority === p}
                    className={priority === p ? "is-on" : ""}
                    onClick={() => setPriority(p)}
                  >
                    {PRIORITY_LABEL[p]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="dcat-field">
            <span>Steps</span>
            <ol className="wm-step-inputs">
              {steps.map((s, i) => (
                <li key={i}>
                  <input
                    value={s}
                    onChange={(e) => setSteps((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder={i === 0 ? "First step" : "Next step"}
                    maxLength={300}
                    data-testid={`wm-goal-step-${i}`}
                  />
                  {steps.length > 1 ? (
                    <button
                      type="button"
                      className="nw-icon-btn"
                      aria-label="Remove step"
                      onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X size={14} strokeWidth={2.2} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
            {steps.length < 20 ? (
              <button type="button" className="nw-btn wm-add-step" onClick={() => setSteps((prev) => [...prev, ""])}>
                <Plus size={14} strokeWidth={2.4} />
                Add step
              </button>
            ) : null}
          </div>

          {error ? <p className="nw-error">{error}</p> : null}
          <div className="dcat-form-actions">
            <button type="button" className="dcat-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="dcat-btn dcat-btn--primary" disabled={create.isPending || !skill.trim()} data-testid="wm-goal-save">
              {create.isPending ? "Saving…" : "Add goal"}
            </button>
          </div>
        </form>
      </aside>
    </div>,
    document.body,
  );
}
