import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { JoinRequestBell } from "../JoinRequestBell";
import { PendingApprovalsPanel } from "../PendingApprovalsPanel";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { usePendingApprovals } from "../../hooks/usePendingApprovals";
import {
  fetchCoreTeamTasks,
  fetchTeamChecklistLocations,
  type WebMeUser,
  type WebTeamRow,
  workspaceChecklistHubUrl,
} from "../../lib/api";
import {
  formatGoDashClock,
  GO_DASH_INACTIVE_MODULES,
  GO_DASH_QUICK_ACTIONS,
  greetingForHour,
  type GoDashModule,
} from "../../lib/alenio-go-dashboard";
import { GoDashFooter, GoDashModuleCard, GoDashQuickActionsGrid } from "./go-dash-parts";
import { canManageApprovals } from "../../lib/pending-approvals";
import { getAuthClient, clearAccessToken } from "../../lib/auth-client";
import { setPersistedEnterpriseTeamId } from "../../lib/enterprise-selected-team";

function initials(user: WebMeUser | null): string {
  if (!user) return "?";
  const n = user.name?.trim() || user.email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return parts[0]?.[0]?.toUpperCase() ?? "U";
}

type TopBarProps = {
  user: WebMeUser | null;
  teams: WebTeamRow[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
};

export function AlenioGoTopBar({ user, teams, selectedTeamId, onTeamChange }: TopBarProps) {
  const [clock, setClock] = useState(() => formatGoDashClock());
  const [menuOpen, setMenuOpen] = useState(false);
  const activeTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0] ?? null;

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatGoDashClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="go-dash-topbar" data-testid="go-dash-topbar">
      <div className="go-dash-topbar-logo">
        <AlenioGoLogo variant="header" />
      </div>

      <div className="go-dash-topbar-center">
        <button
          type="button"
          className="go-dash-workspace-btn"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={() => setMenuOpen((v) => !v)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{activeTeam?.name ?? "Workspace"}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {menuOpen ? (
          <div className="go-dash-workspace-menu" role="listbox" aria-label="Switch workspace">
            {teams.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                aria-selected={t.id === selectedTeamId}
                className={`go-dash-workspace-option${t.id === selectedTeamId ? " go-dash-workspace-option--active" : ""}`}
                onClick={() => {
                  onTeamChange(t.id);
                  setMenuOpen(false);
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="go-dash-topbar-right">
        <div className="go-dash-clock" aria-live="polite">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
          <div>
            <span className="go-dash-clock-time">{clock.time}</span>
            <span className="go-dash-clock-date">{clock.date}</span>
          </div>
        </div>
        <JoinRequestBell />
        <div className="go-dash-profile" data-testid="go-dash-profile">
          {user?.image ? (
            <img src={user.image} alt="" className="go-dash-profile-avatar" />
          ) : (
            <span className="go-dash-profile-avatar go-dash-profile-avatar--fallback">{initials(user)}</span>
          )}
        </div>
      </div>
    </header>
  );
}

export function AlenioGoDashboard() {
  const navigate = useNavigate();
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? null;
  const canManage = activeTeam ? canManageApprovals(activeTeam.role) : false;

  const [taskStats, setTaskStats] = useState({ open: 0, overdue: 0, done: 0 });
  const [checklistStat, setChecklistStat] = useState({ count: 0, hubToken: null as string | null });
  const [showApprovals, setShowApprovals] = useState(false);

  const approvals = usePendingApprovals({
    teamId: canManage ? selectedTeamId : undefined,
    pollMs: 15_000,
  });

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    void fetchCoreTeamTasks(selectedTeamId)
      .then((tasks) => {
        if (cancelled) return;
        const now = Date.now();
        let open = 0;
        let overdue = 0;
        let done = 0;
        for (const t of tasks) {
          const status = (t.status ?? "").toLowerCase();
          if (status === "done" || status === "completed") {
            done += 1;
            continue;
          }
          open += 1;
          if (t.dueDate && new Date(t.dueDate).getTime() < now) overdue += 1;
        }
        setTaskStats({ open, overdue, done });
      })
      .catch(() => {
        if (!cancelled) setTaskStats({ open: 0, overdue: 0, done: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    void fetchTeamChecklistLocations(selectedTeamId)
      .then((data) => {
        if (cancelled) return;
        const active = data.locations.filter((l) => l.isActive).length;
        setChecklistStat({ count: active, hubToken: data.hubToken });
      })
      .catch(() => {
        if (!cancelled) setChecklistStat({ count: 0, hubToken: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  const greeting = greetingForHour(new Date().getHours());
  const totalItems = taskStats.open + checklistStat.count;
  const completedItems = taskStats.done;
  const progressPct =
    totalItems + completedItems > 0 ? Math.round((completedItems / (totalItems + completedItems)) * 100) : 0;

  const modules = useMemo<GoDashModule[]>(() => {
    const active: GoDashModule[] = [
      {
        id: "tasks",
        title: "Tasks",
        subtitle: taskStats.open > 0 ? `${taskStats.open} to complete` : "All caught up",
        active: true,
        href: "/dashboard",
        tone: "indigo",
        icon: "tasks",
      },
      {
        id: "checklists",
        title: "Checklists",
        subtitle:
          checklistStat.count > 0
            ? `${checklistStat.count} active checklist${checklistStat.count === 1 ? "" : "s"}`
            : "Set up checklists",
        active: Boolean(checklistStat.hubToken),
        href: checklistStat.hubToken ? `${workspaceChecklistHubUrl(checklistStat.hubToken)}#go-checklists` : undefined,
        tone: "cyan",
        icon: "checklists",
      },
    ];
    return [...active, ...GO_DASH_INACTIVE_MODULES];
  }, [taskStats.open, checklistStat]);

  const quickActions = useMemo(() => {
    return GO_DASH_QUICK_ACTIONS.map((action) => {
      if (action.id === "history" && checklistStat.hubToken) {
        return { ...action, active: true, href: `${workspaceChecklistHubUrl(checklistStat.hubToken)}#go-checklists` };
      }
      return action;
    });
  }, [checklistStat.hubToken]);

  const alerts = useMemo(() => {
    const rows: { id: string; label: string; onClick?: () => void }[] = [];
    if (canManage && approvals.goRows.length > 0) {
      rows.push({
        id: "go-approvals",
        label: `${approvals.goRows.length} device${approvals.goRows.length === 1 ? "" : "s"} awaiting approval`,
        onClick: () => setShowApprovals(true),
      });
    }
    if (canManage && approvals.joinRows.length > 0) {
      rows.push({
        id: "join-approvals",
        label: `${approvals.joinRows.length} join request${approvals.joinRows.length === 1 ? "" : "s"} pending`,
        onClick: () => setShowApprovals(true),
      });
    }
    if (taskStats.overdue > 0) {
      rows.push({
        id: "overdue-tasks",
        label: `${taskStats.overdue} overdue task${taskStats.overdue === 1 ? "" : "s"}`,
      });
    }
    return rows;
  }, [approvals.goRows.length, approvals.joinRows.length, canManage, taskStats.overdue]);

  async function endSession() {
    try {
      await getAuthClient().signOut();
    } catch {
      /* ignore */
    }
    clearAccessToken();
    setPersistedEnterpriseTeamId("");
    navigate("/login?reason=session");
  }

  const heroStyle = activeTeam?.image
    ? { backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.72), rgba(67,97,238,0.55)), url(${activeTeam.image})` }
    : undefined;

  return (
    <div className="go-dash" data-testid="alenio-go-dashboard">
      <section className="go-dash-hero" style={heroStyle}>
        <div className="go-dash-hero-copy">
          <h1>{greeting}!</h1>
          <p>Here&apos;s what&apos;s ahead for {activeTeam?.name ?? "your workspace"} today.</p>
        </div>

        <div className="go-dash-stats-bar">
          <div className="go-dash-progress">
            <div className="go-dash-progress-ring" style={{ ["--pct" as string]: `${progressPct}` }}>
              <span>{progressPct}%</span>
            </div>
            <div>
              <strong>Today&apos;s progress</strong>
              <span>{progressPct}% complete</span>
            </div>
          </div>
          <div className="go-dash-stat-col">
            <span className="go-dash-stat-value go-dash-stat-value--indigo">{taskStats.open + checklistStat.count}</span>
            <span className="go-dash-stat-label">Remaining items</span>
          </div>
          <div className="go-dash-stat-col">
            <span className="go-dash-stat-value go-dash-stat-value--amber">{taskStats.overdue}</span>
            <span className="go-dash-stat-label">Overdue</span>
          </div>
          <div className="go-dash-stat-col">
            <span className="go-dash-stat-value go-dash-stat-value--green">{taskStats.done}</span>
            <span className="go-dash-stat-label">Completed</span>
          </div>
        </div>
      </section>

      <div className="go-dash-body">
        <div className="go-dash-modules">
          {modules.slice(0, 3).map((m) => (
            <GoDashModuleCard key={m.id} module={m} />
          ))}
        </div>

        <div className="go-dash-secondary-row">
          {modules.slice(3).map((m) => (
            <GoDashModuleCard key={m.id} module={m} />
          ))}

          <section className="go-dash-alerts" aria-labelledby="go-dash-alerts-title">
            <div className="go-dash-alerts-head">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <h2 id="go-dash-alerts-title">Alerts</h2>
            </div>
            {alerts.length === 0 ? (
              <p className="go-dash-alerts-empty">No alerts right now.</p>
            ) : (
              <ul className="go-dash-alerts-list">
                {alerts.map((a) => (
                  <li key={a.id}>
                    {a.onClick ? (
                      <button type="button" className="go-dash-alert-item" onClick={a.onClick}>
                        <span className="go-dash-alert-dot" aria-hidden />
                        <span>{a.label}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </button>
                    ) : (
                      <div className="go-dash-alert-item go-dash-alert-item--static">
                        <span className="go-dash-alert-dot" aria-hidden />
                        <span>{a.label}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="go-dash-quick" aria-labelledby="go-dash-quick-title">
          <h2 id="go-dash-quick-title" className="go-dash-quick-title">
            Quick actions
          </h2>
          <GoDashQuickActionsGrid actions={quickActions} />
        </section>

        {canManage && showApprovals ? (
          <section className="enterprise-card go-dash-approvals-panel" aria-labelledby="go-dash-approvals-title">
            <header className="go-dash-approvals-head">
              <h2 id="go-dash-approvals-title">Pending approvals</h2>
              <button type="button" className="enterprise-inline-link" onClick={() => setShowApprovals(false)}>
                Close
              </button>
            </header>
            <PendingApprovalsPanel
              variant="page"
              joinRows={approvals.joinRows}
              goRows={approvals.goRows}
              loadErr={approvals.loadErr}
              busyKey={approvals.busyKey}
              loading={approvals.loading}
              emptyMessage="No devices or join requests waiting for approval."
              onApproveJoin={approvals.onApproveJoin}
              onRejectJoin={approvals.onRejectJoin}
              onApproveGo={approvals.onApproveGo}
              onRejectGo={approvals.onRejectGo}
            />
          </section>
        ) : null}

        {canManage && !showApprovals && approvals.total > 0 ? (
          <button type="button" className="go-dash-approvals-banner" onClick={() => setShowApprovals(true)}>
            {approvals.total} pending approval{approvals.total === 1 ? "" : "s"} — review
          </button>
        ) : null}
      </div>

      <GoDashFooter onEndSession={() => void endSession()} />
    </div>
  );
}
