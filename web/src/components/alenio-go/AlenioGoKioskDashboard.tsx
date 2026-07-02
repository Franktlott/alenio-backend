import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { fetchPublicChecklistHub } from "../../lib/api";
import {
  formatGoDashClock,
  GO_DASH_INACTIVE_MODULES,
  GO_DASH_QUICK_ACTIONS,
  greetingForHour,
  type GoDashModule,
} from "../../lib/alenio-go-dashboard";
import { checklistCardColorStyles } from "../../lib/checklist-card-colors";
import { clearGoLinkedWorkspace, saveGoLinkedWorkspace } from "../../lib/go-device";
import { kioskProgressPercent, loadKioskProgress } from "../../lib/kiosk-checklist-progress";
import { GoDashFooter, GoDashModuleCard, GoDashQuickActionsGrid } from "./go-dash-parts";

type HubChecklist = {
  id: string;
  name: string;
  cardColor: string | null;
  taskCount: number;
};

type Props = {
  hubToken: string;
};

function AlenioGoKioskTopBar({ teamName }: { teamName: string }) {
  const [clock, setClock] = useState(() => formatGoDashClock());

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatGoDashClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <header className="go-dash-topbar" data-testid="go-kiosk-topbar">
      <div className="go-dash-topbar-logo">
        <AlenioGoLogo variant="header" />
      </div>

      <div className="go-dash-topbar-center">
        <div className="go-dash-workspace-btn go-dash-workspace-btn--static" aria-label="Workspace">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <span>{teamName || "Workspace"}</span>
        </div>
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
      </div>
    </header>
  );
}

function computeChecklistStats(hubToken: string, checklists: HubChecklist[]) {
  let totalTasks = 0;
  let completedTasks = 0;
  let incompleteChecklists = 0;

  for (const cl of checklists) {
    totalTasks += cl.taskCount;
    const stored = loadKioskProgress(hubToken, cl.id);
    const signed = stored ? Object.values(stored).filter((t) => t.signed).length : 0;
    completedTasks += signed;
    if (kioskProgressPercent(stored, cl.taskCount) < 100) incompleteChecklists += 1;
  }

  return {
    totalTasks,
    completedTasks,
    remaining: Math.max(0, totalTasks - completedTasks),
    incompleteChecklists,
  };
}

export function AlenioGoKioskDashboard({ hubToken }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [checklists, setChecklists] = useState<HubChecklist[]>([]);
  const [progressTick, setProgressTick] = useState(0);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("alenio.kioskProgress:")) setProgressTick((n) => n + 1);
    };
    const refresh = () => setProgressTick((n) => n + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!hubToken) {
      setError("Invalid workspace link.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void fetchPublicChecklistHub(hubToken)
      .then((data) => {
        if (cancelled) return;
        setTeamName(data.team.name);
        setTeamImage(data.team.image);
        setChecklists(data.checklists);
        saveGoLinkedWorkspace(hubToken, data.team.name);
        setProgressTick((n) => n + 1);
      })
      .catch(() => {
        if (!cancelled) setError("Workspace not found.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken]);

  const stats = useMemo(() => {
    void progressTick;
    return computeChecklistStats(hubToken, checklists);
  }, [hubToken, checklists, progressTick]);

  const tiles = useMemo(() => {
    void progressTick;
    return checklists.map((cl) => {
      const stored = loadKioskProgress(hubToken, cl.id);
      const percentComplete = kioskProgressPercent(stored, cl.taskCount);
      return { ...cl, percentComplete };
    });
  }, [checklists, hubToken, progressTick]);

  const greeting = greetingForHour(new Date().getHours());
  const progressPct =
    stats.totalTasks > 0 ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;

  const modules = useMemo<GoDashModule[]>(() => {
    const checklistCount = checklists.length;
    const active: GoDashModule[] = [
      {
        id: "tasks",
        title: "Tasks",
        subtitle: "Requires Alenio account",
        active: false,
        tone: "indigo",
        icon: "tasks",
      },
      {
        id: "checklists",
        title: "Checklists",
        subtitle:
          checklistCount > 0
            ? `${checklistCount} to complete today`
            : "No checklists yet",
        active: checklistCount > 0,
        href: "#go-checklists",
        tone: "cyan",
        icon: "checklists",
      },
    ];
    return [...active, ...GO_DASH_INACTIVE_MODULES];
  }, [checklists.length]);

  const quickActions = useMemo(() => {
    return GO_DASH_QUICK_ACTIONS.map((action) => {
      if (action.id === "history" && checklists.length > 0) {
        return { ...action, active: true, href: "#go-checklists" };
      }
      return action;
    });
  }, [checklists.length]);

  const alerts = useMemo(() => {
    const rows: { id: string; label: string; href?: string }[] = [];
    for (const cl of tiles) {
      if (cl.percentComplete > 0 && cl.percentComplete < 100) {
        rows.push({
          id: `progress-${cl.id}`,
          label: `${cl.name} — ${cl.percentComplete}% complete`,
          href: `/checklist/${hubToken}/${cl.id}`,
        });
      } else if (cl.percentComplete === 0 && cl.taskCount > 0) {
        rows.push({
          id: `pending-${cl.id}`,
          label: `${cl.name} not started`,
          href: `/checklist/${hubToken}/${cl.id}`,
        });
      }
    }
    return rows.slice(0, 4);
  }, [tiles, hubToken]);

  function endSession() {
    clearGoLinkedWorkspace();
    navigate("/aleniogo", { replace: true });
  }

  const heroStyle = teamImage
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.72), rgba(67,97,238,0.55)), url(${teamImage})`,
      }
    : undefined;

  if (loading) {
    return (
      <div className="go-dash go-dash--kiosk" data-testid="alenio-go-kiosk-dashboard">
        <AlenioGoKioskTopBar teamName="" />
        <p className="go-dash-loading">Loading workspace…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="go-dash go-dash--kiosk" data-testid="alenio-go-kiosk-dashboard">
        <AlenioGoKioskTopBar teamName="" />
        <p className="go-dash-error" role="alert">
          {error}
        </p>
      </div>
    );
  }

  return (
    <div className="go-dash go-dash--kiosk" data-testid="alenio-go-kiosk-dashboard">
      <AlenioGoKioskTopBar teamName={teamName} />

      <div className="go-dash-scroll">
        <section className="go-dash-hero" style={heroStyle}>
          <div className="go-dash-hero-copy">
            <h1>{greeting}!</h1>
            <p>Here&apos;s what&apos;s ahead for {teamName} today.</p>
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
              <span className="go-dash-stat-value go-dash-stat-value--indigo">{stats.remaining}</span>
              <span className="go-dash-stat-label">Remaining items</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--amber">{stats.incompleteChecklists}</span>
              <span className="go-dash-stat-label">Checklists open</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--green">{stats.completedTasks}</span>
              <span className="go-dash-stat-label">Completed</span>
            </div>
          </div>
        </section>

        <div className="go-dash-body go-dash-body--kiosk">
          <div className="go-dash-modules">
            {modules.slice(0, 3).map((m) => (
              <GoDashModuleCard key={m.id} module={m} />
            ))}
          </div>

          <div className="go-dash-secondary-row">
            {modules.slice(3).map((m) => (
              <GoDashModuleCard key={m.id} module={m} />
            ))}

            <section className="go-dash-alerts" aria-labelledby="go-kiosk-alerts-title">
              <div className="go-dash-alerts-head">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <h2 id="go-kiosk-alerts-title">Alerts</h2>
              </div>
              {alerts.length === 0 ? (
                <p className="go-dash-alerts-empty">No alerts right now.</p>
              ) : (
                <ul className="go-dash-alerts-list">
                  {alerts.map((a) => (
                    <li key={a.id}>
                      <Link to={a.href ?? "#"} className="go-dash-alert-item">
                        <span className="go-dash-alert-dot" aria-hidden />
                        <span>{a.label}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                          <polyline points="9 18 15 12 9 6" />
                        </svg>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section id="go-checklists" className="go-dash-checklists" aria-labelledby="go-checklists-title">
            <h2 id="go-checklists-title" className="go-dash-checklists-title">
              Today&apos;s checklists
            </h2>
            {checklists.length === 0 ? (
              <p className="go-dash-checklists-empty">Your manager can add checklists from the workspace dashboard.</p>
            ) : (
              <ul className="go-dash-checklist-grid">
                {tiles.map((cl) => {
                  const cardStyle = checklistCardColorStyles(cl.cardColor);
                  return (
                    <li key={cl.id}>
                      <Link
                        to={`/checklist/${hubToken}/${cl.id}`}
                        className="go-dash-checklist-card"
                        style={{
                          background: cardStyle.background,
                          borderColor: cardStyle.borderColor,
                          boxShadow: `inset 4px 0 0 ${cardStyle.accent}`,
                        }}
                      >
                        <h3 className="go-dash-checklist-card__title">{cl.name}</h3>
                        <p className="go-dash-checklist-card__meta">
                          {cl.taskCount} task{cl.taskCount === 1 ? "" : "s"}
                        </p>
                        <div className="go-dash-checklist-card__progress-wrap">
                          <div className="go-dash-checklist-card__progress-head">
                            <span>Progress</span>
                            <span>{cl.percentComplete}%</span>
                          </div>
                          <div
                            className="go-dash-checklist-card__progress-bar"
                            role="progressbar"
                            aria-valuenow={cl.percentComplete}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={`${cl.name} progress`}
                          >
                            <span style={{ width: `${cl.percentComplete}%`, background: cardStyle.accent }} />
                          </div>
                        </div>
                        <span className="go-dash-checklist-card__cta" style={{ color: cardStyle.accent }}>
                          Open checklist →
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      <div className="go-dash-bottom-dock">
        <section className="go-dash-quick go-dash-quick--dock" aria-labelledby="go-kiosk-quick-title">
          <h2 id="go-kiosk-quick-title" className="go-dash-quick-title">
            Quick actions
          </h2>
          <GoDashQuickActionsGrid actions={quickActions} />
        </section>
        <GoDashFooter onEndSession={endSession} endLabel="Disconnect device" />
      </div>
    </div>
  );
}
