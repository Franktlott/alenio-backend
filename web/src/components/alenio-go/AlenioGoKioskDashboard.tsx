import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { ackGoWorkplaceAlert, fetchGoWorkplaceAlerts, fetchPublicChecklistHub, type GoWorkplaceAlert } from "../../lib/api";
import { playGoAlertSound, unlockGoAlertSound } from "../../lib/go-alert-sound";
import {
  formatGoDashClock,
  GO_DASH_KIOSK_MODULES,
  GO_DASH_QUICK_ACTIONS,
  greetingForHour,
} from "../../lib/alenio-go-dashboard";
import { clearGoLinkedWorkspace, getGoDeviceId, saveGoLinkedWorkspace } from "../../lib/go-device";
import { handleGoDeviceSessionError } from "../../lib/go-session";
import { GoDashFooter, GoDashModuleCard, GoDashQuickActionsGrid } from "./go-dash-parts";

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

export function AlenioGoKioskDashboard({ hubToken }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamImage, setTeamImage] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<GoWorkplaceAlert[]>([]);
  const [soundReady, setSoundReady] = useState(false);
  const handledAlertIds = useRef(new Set<string>());

  const handleIncomingAlerts = useCallback(
    (incoming: GoWorkplaceAlert[]) => {
      if (incoming.length === 0) return;
      const deviceId = getGoDeviceId();
      let played = false;
      for (const alert of incoming) {
        if (handledAlertIds.current.has(alert.id)) continue;
        handledAlertIds.current.add(alert.id);
        if (alert.playSound && !played) {
          playGoAlertSound();
          played = true;
        }
        void ackGoWorkplaceAlert(alert.id, hubToken, deviceId);
      }
      setAlerts((prev) => {
        const merged = [...incoming, ...prev.filter((a) => !incoming.some((n) => n.id === a.id))];
        return merged.slice(0, 8);
      });
    },
    [hubToken],
  );

  useEffect(() => {
    const unlock = () => {
      void unlockGoAlertSound().then((ok) => {
        if (ok) setSoundReady(true);
      });
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("touchstart", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("touchstart", unlock);
      window.removeEventListener("keydown", unlock);
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
    const deviceId = getGoDeviceId();
    void fetchPublicChecklistHub(hubToken, deviceId)
      .then((data) => {
        if (cancelled) return;
        setTeamName(data.team.name);
        setTeamImage(data.team.image);
        saveGoLinkedWorkspace(hubToken, data.team.name);
      })
      .catch((err) => {
        if (cancelled) return;
        if (handleGoDeviceSessionError(err)) return;
        setError("Workspace not found.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hubToken]);

  useEffect(() => {
    if (!hubToken || loading || error) return;
    const deviceId = getGoDeviceId();
    let cancelled = false;

    const poll = () => {
      void fetchGoWorkplaceAlerts(hubToken, deviceId)
        .then((rows) => {
          if (!cancelled) handleIncomingAlerts(rows);
        })
        .catch(() => {
          /* session gate handles unlink logout */
        });
    };

    poll();
    const pollId = window.setInterval(poll, 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [hubToken, loading, error, handleIncomingAlerts]);

  const greeting = greetingForHour(new Date().getHours());

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

      {!soundReady ? (
        <div className="go-dash-sound-hint" role="status">
          Tap anywhere on the screen to enable alert sounds.
        </div>
      ) : null}

      <div className="go-dash-scroll">
        <section className="go-dash-hero" style={heroStyle}>
          <div className="go-dash-hero-copy">
            <h1>{greeting}!</h1>
            <p>Here&apos;s what&apos;s ahead for {teamName} today.</p>
          </div>

          <div className="go-dash-stats-bar">
            <div className="go-dash-progress">
              <div className="go-dash-progress-ring" style={{ ["--pct" as string]: "0" }}>
                <span>0%</span>
              </div>
              <div>
                <strong>Today&apos;s progress</strong>
                <span>0% complete</span>
              </div>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--indigo">0</span>
              <span className="go-dash-stat-label">Remaining items</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--amber">0</span>
              <span className="go-dash-stat-label">Overdue</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--green">0</span>
              <span className="go-dash-stat-label">Completed</span>
            </div>
          </div>
        </section>

        <div className="go-dash-body go-dash-body--kiosk">
          <div className="go-dash-modules">
            {GO_DASH_KIOSK_MODULES.slice(0, 3).map((m) => (
              <GoDashModuleCard
                key={m.id}
                module={
                  m.id === "briefings"
                    ? { ...m, href: `/checklist/${hubToken}/briefings`, subtitle: "Review & initial" }
                    : m
                }
              />
            ))}
          </div>

          <div className="go-dash-secondary-row">
            {GO_DASH_KIOSK_MODULES.slice(3).map((m) => (
              <GoDashModuleCard
                key={m.id}
                module={
                  m.id === "briefings"
                    ? { ...m, href: `/checklist/${hubToken}/briefings`, subtitle: "Review & initial" }
                    : m
                }
              />
            ))}

            <section className="go-dash-alerts go-dash-alerts--live" aria-labelledby="go-kiosk-alerts-title">
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
                  {alerts.map((alert) => (
                    <li key={alert.id}>
                      <div className="go-dash-alert-item go-dash-alert-item--banner">
                        <span className="go-dash-alert-dot" aria-hidden />
                        <div className="go-dash-alert-copy">
                          <strong>{alert.title}</strong>
                          <span>{alert.body}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </div>

      <div className="go-dash-bottom-dock">
        <section className="go-dash-quick go-dash-quick--dock" aria-labelledby="go-kiosk-quick-title">
          <h2 id="go-kiosk-quick-title" className="go-dash-quick-title">
            Quick actions
          </h2>
          <GoDashQuickActionsGrid actions={GO_DASH_QUICK_ACTIONS} />
        </section>
        <GoDashFooter onEndSession={endSession} endLabel="Disconnect device" />
      </div>
    </div>
  );
}
