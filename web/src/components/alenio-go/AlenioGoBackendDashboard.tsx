import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { fetchTeamGoDevices, fetchWebTeam } from "../../lib/api";
import { resolveGoHeroImage } from "../../lib/go-frontend-settings";
import { probeImageUrl } from "../../lib/image-probe";
import { goBackendAdminTiles, goBackendGreeting, goBackendQuickActions } from "../../lib/alenio-go-backend";
import { formatGoDashClock } from "../../lib/alenio-go-dashboard";
import type { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { GoBackendAdminTile } from "./GoBackendAdminTile";

type ApprovalsState = ReturnType<typeof usePendingApprovals>;

type Props = {
  teamId: string | undefined;
  teamName: string;
  teamImage?: string | null;
  inviteCode?: string | null;
  userName?: string | null;
  roleLabel: string;
  canManage: boolean;
  approvals: ApprovalsState;
};

export function AlenioGoBackendDashboard({
  teamId,
  teamName,
  teamImage,
  inviteCode,
  userName,
  roleLabel,
  canManage,
  approvals,
}: Props) {
  const location = useLocation();
  const [linkedDeviceCount, setLinkedDeviceCount] = useState(0);
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatGoDashClock());
  const [copyOk, setCopyOk] = useState(false);
  const heroRequestRef = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatGoDashClock()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!teamId) {
      setHeroImage(null);
      return;
    }
    let cancelled = false;
    const reqId = ++heroRequestRef.current;
    void fetchWebTeam(teamId)
      .then(async (team) => {
        if (cancelled || reqId !== heroRequestRef.current) return;
        const candidate = resolveGoHeroImage(team.image, team.goFrontendSettings);
        if (!candidate) {
          setHeroImage(null);
          return;
        }
        const ok = await probeImageUrl(candidate);
        if (cancelled || reqId !== heroRequestRef.current) return;
        setHeroImage(ok ? candidate : null);
      })
      .catch(() => {
        if (!cancelled && reqId === heroRequestRef.current) setHeroImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [teamId, location.pathname]);

  useEffect(() => {
    if (!canManage || !teamId) {
      setLinkedDeviceCount(0);
      return;
    }
    let cancelled = false;
    void fetchTeamGoDevices(teamId)
      .then((rows) => {
        if (!cancelled) setLinkedDeviceCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setLinkedDeviceCount(0);
      });
    const id = window.setInterval(() => {
      void fetchTeamGoDevices(teamId)
        .then((rows) => {
          if (!cancelled) setLinkedDeviceCount(rows.length);
        })
        .catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canManage, teamId]);

  const firstName = userName?.trim().split(/\s+/)[0] ?? "there";
  const greeting = goBackendGreeting();
  const tiles = useMemo(
    () =>
      goBackendAdminTiles({
        canManage,
        pendingCount: approvals.total,
      }),
    [canManage, approvals.total],
  );
  const quickActions = goBackendQuickActions({ inviteCode, linkedDeviceCount });

  const heroStyle = heroImage
    ? {
        backgroundImage: `linear-gradient(135deg, rgba(15,23,42,0.78), rgba(67,97,238,0.62)), url(${heroImage})`,
      }
    : undefined;

  async function copyWorkspaceCode() {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="go-backend" data-testid="alenio-go-page">
      <div className="go-backend-scroll">
        <section className="go-backend-hero go-dash-hero" style={heroStyle}>
          <div className="go-backend-hero-bar">
            <div className="go-backend-hero-brand">
              <AlenioGoLogo variant="header" className="go-backend-hero-logo" />
              <span className="go-backend-hero-pill">Enterprise console</span>
            </div>
            <div className="go-backend-hero-clock" aria-live="polite">
              <span className="go-dash-clock-time">{clock.time}</span>
              <span className="go-dash-clock-date">{clock.date}</span>
            </div>
          </div>

          <div className="go-dash-hero-copy go-backend-hero-copy">
            <h1>
              {greeting}, {firstName}
            </h1>
            <p>
              Manage Alenio Go for <strong>{teamName || "your workspace"}</strong> — devices, alerts, and frontline
              access.
            </p>
          </div>

          <div className="go-dash-stats-bar go-backend-stats">
            <div className="go-dash-stat-col go-backend-stat-main">
              <span className="go-dash-stat-value go-dash-stat-value--indigo">{linkedDeviceCount}</span>
              <span className="go-dash-stat-label">Linked devices</span>
            </div>
            <div className="go-dash-stat-col">
              <span
                className={`go-dash-stat-value${approvals.total > 0 ? " go-dash-stat-value--amber" : " go-dash-stat-value--green"}`}
              >
                {canManage ? approvals.total : "—"}
              </span>
              <span className="go-dash-stat-label">Pending approvals</span>
            </div>
            <div className="go-dash-stat-col">
              <span className="go-dash-stat-value go-dash-stat-value--green">{roleLabel}</span>
              <span className="go-dash-stat-label">Your access</span>
            </div>
            {inviteCode ? (
              <div className="go-dash-stat-col go-backend-stat-code">
                <button type="button" className="go-backend-code-btn" onClick={() => void copyWorkspaceCode()}>
                  {copyOk ? "Copied!" : inviteCode}
                </button>
                <span className="go-dash-stat-label">Workspace code</span>
              </div>
            ) : null}
          </div>
        </section>

        <div className="go-backend-body">
          <section className="go-backend-section" aria-labelledby="go-backend-modules-title">
            <div className="go-backend-section-head">
              <h2 id="go-backend-modules-title" className="go-backend-section-title">
                Admin modules
              </h2>
              <p className="go-backend-section-sub">Same Alenio Go experience your floor teams use — configured here.</p>
            </div>
            <div className="go-backend-tiles">
              {tiles.map((tile) => (
                <GoBackendAdminTile key={tile.id} tile={tile} />
              ))}
            </div>
          </section>

          <section className="go-backend-quick" aria-labelledby="go-backend-quick-title">
            <h2 id="go-backend-quick-title" className="go-dash-quick-title">
              Quick actions
            </h2>
            <div className="go-dash-quick-grid go-backend-quick-grid">
              {quickActions.map((action) =>
                action.copyValue ? (
                  <button
                    key={action.id}
                    type="button"
                    className={`go-dash-quick-card go-dash-quick-card--${action.tone}${action.active ? "" : " go-dash-quick-card--inactive"}`}
                    onClick={() => void copyWorkspaceCode()}
                    disabled={!action.active}
                  >
                    <span className="go-dash-quick-icon" aria-hidden>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    </span>
                    {copyOk ? "Copied!" : action.label}
                  </button>
                ) : (
                  <Link
                    key={action.id}
                    to={action.href ?? "/go"}
                    className={`go-dash-quick-card go-dash-quick-card--${action.tone}${action.active ? "" : " go-dash-quick-card--inactive"}`}
                  >
                    <span className="go-dash-quick-icon" aria-hidden>
                      {action.id === "link" ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="4" y="2" width="16" height="20" rx="2" />
                          <line x1="12" y1="18" x2="12.01" y2="18" />
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      )}
                    </span>
                    {action.label}
                  </Link>
                ),
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
