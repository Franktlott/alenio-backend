import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AlenioGoLogo } from "../AlenioGoLogo";
import { fetchTeamGoDevices, fetchWebTeam, fetchWorkspaceModules, type WorkspaceModule } from "../../lib/api";
import {
  defaultModulesByKey,
  mergeWorkspaceModules,
  readCachedLinkedDeviceCount,
  readCachedModulesByKey,
  workspaceModulesSignature,
  writeCachedLinkedDeviceCount,
  writeCachedModulesByKey,
} from "../../lib/workspace-modules";
import { resolveGoHeroImage } from "../../lib/go-frontend-settings";
import { probeImageUrl } from "../../lib/image-probe";
import { goBackendAdminTiles, goBackendQuickActions } from "../../lib/alenio-go-backend";
import { formatGoDashClock } from "../../lib/alenio-go-dashboard";
import type { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { GoBackendAdminTile } from "./GoBackendAdminTile";
import { GoDeviceQuickActionsManagePanel } from "./GoDeviceQuickActionsManagePanel";
import { GoWorkspaceModulesPanel, GoWorkspaceModulesTab } from "./GoWorkspaceModulesPanel";

const WSM_PANEL_KEY = "alenio.go.wsmPanelOpen";

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

function initialModulesByKey(teamId: string | undefined): Record<string, WorkspaceModule> {
  if (!teamId) return defaultModulesByKey();
  return readCachedModulesByKey(teamId) ?? defaultModulesByKey();
}

function initialLinkedDeviceCount(teamId: string | undefined): number {
  if (!teamId) return 0;
  return readCachedLinkedDeviceCount(teamId) ?? 0;
}

export function AlenioGoBackendDashboard({
  teamId,
  inviteCode,
  roleLabel,
  canManage,
  approvals,
}: Props) {
  const location = useLocation();
  const [linkedDeviceCount, setLinkedDeviceCount] = useState(() => initialLinkedDeviceCount(teamId));
  const [modulesByKey, setModulesByKey] = useState<Record<string, WorkspaceModule>>(() =>
    initialModulesByKey(teamId),
  );
  const [wsmOpen, setWsmOpen] = useState(() => {
    try {
      return sessionStorage.getItem(WSM_PANEL_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const [heroImage, setHeroImage] = useState<string | null>(null);
  const [clock, setClock] = useState(() => formatGoDashClock());
  const [copyOk, setCopyOk] = useState(false);
  const [manageQuickActionsOpen, setManageQuickActionsOpen] = useState(false);
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
    setLinkedDeviceCount((prev) => {
      const next = initialLinkedDeviceCount(teamId);
      return prev === next ? prev : next;
    });
    setModulesByKey((prev) => {
      const next = initialModulesByKey(teamId);
      return workspaceModulesSignature(prev) === workspaceModulesSignature(next) ? prev : next;
    });
  }, [teamId]);

  useEffect(() => {
    if (!canManage || !teamId) {
      setLinkedDeviceCount(0);
      return;
    }
    let cancelled = false;
    const applyCount = (count: number) => {
      if (cancelled) return;
      setLinkedDeviceCount((prev) => {
        if (prev === count) return prev;
        writeCachedLinkedDeviceCount(teamId, count);
        return count;
      });
    };
    void fetchTeamGoDevices(teamId)
      .then((rows) => applyCount(rows.length))
      .catch(() => {
        /* Keep cached count on transient failures. */
      });
    const id = window.setInterval(() => {
      void fetchTeamGoDevices(teamId)
        .then((rows) => applyCount(rows.length))
        .catch(() => undefined);
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [canManage, teamId]);

  useEffect(() => {
    if (!canManage || !teamId) {
      setModulesByKey(defaultModulesByKey());
      return;
    }
    let cancelled = false;
    void fetchWorkspaceModules(teamId)
      .then((mods) => {
        if (cancelled) return;
        const next = mergeWorkspaceModules(mods);
        writeCachedModulesByKey(teamId, next);
        setModulesByKey((prev) =>
          workspaceModulesSignature(prev) === workspaceModulesSignature(next) ? prev : next,
        );
      })
      .catch(() => {
        // Keep cached / default modules when API is unavailable — don't wipe the tile strip.
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, teamId, location.pathname]);

  function applyModulesByKey(next: Record<string, WorkspaceModule>) {
    setModulesByKey(next);
    if (teamId) writeCachedModulesByKey(teamId, next);
  }

  const tiles = useMemo(
    () =>
      goBackendAdminTiles({
        canManage,
        pendingCount: approvals.total,
        modulesByKey,
      }),
    [canManage, approvals.total, modulesByKey],
  );
  const quickActions = goBackendQuickActions({
    inviteCode,
    linkedDeviceCount,
    canManage,
  });

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

  function toggleWsmPanel() {
    setWsmOpen((open) => {
      const next = !open;
      try {
        sessionStorage.setItem(WSM_PANEL_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div
      className={`go-backend-shell${canManage && wsmOpen ? " go-backend-shell--wsm-open" : ""}`}
      data-testid="alenio-go-page"
    >
      <div className="go-backend">
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
            <div className="go-backend-tiles go-backend-tiles--core">
              {tiles.map((tile) => (
                <GoBackendAdminTile key={tile.id} tile={tile} />
              ))}
            </div>
          </section>
        </div>
        </div>

        <div className="go-dash-bottom-dock go-backend-quick-dock">
          <section className="go-dash-quick go-dash-quick--dock go-backend-quick" aria-labelledby="go-backend-quick-title">
            <h2 id="go-backend-quick-title" className="go-dash-quick-title">
              Quick actions
            </h2>
            <div className="go-dash-quick-grid go-backend-quick-grid">
              {quickActions.map((action) => {
                const className = `go-dash-quick-card go-dash-quick-card--${action.tone}${action.active ? "" : " go-dash-quick-card--inactive"}`;
                if (action.copyValue) {
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={className}
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
                  );
                }
                if (action.manageDeviceActions) {
                  return (
                    <button
                      key={action.id}
                      type="button"
                      className={className}
                      onClick={() => setManageQuickActionsOpen(true)}
                      disabled={!action.active}
                    >
                      <span className="go-dash-quick-icon" aria-hidden>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="7" height="7" rx="1" />
                          <rect x="14" y="3" width="7" height="7" rx="1" />
                          <rect x="3" y="14" width="7" height="7" rx="1" />
                          <rect x="14" y="14" width="7" height="7" rx="1" />
                        </svg>
                      </span>
                      {action.label}
                    </button>
                  );
                }
                return (
                  <Link key={action.id} to={action.href ?? "/go"} className={className}>
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
                );
              })}
            </div>
          </section>
        </div>
      </div>

      {canManage && teamId ? (
        <>
          <GoWorkspaceModulesTab open={wsmOpen} onToggle={toggleWsmPanel} />
          <GoWorkspaceModulesPanel
            open={wsmOpen}
            onClose={() => {
              setWsmOpen(false);
              try {
                sessionStorage.setItem(WSM_PANEL_KEY, "0");
              } catch {
                /* ignore */
              }
            }}
            teamId={teamId}
            modulesByKey={modulesByKey}
            onModulesChange={applyModulesByKey}
          />
          <GoDeviceQuickActionsManagePanel
            open={manageQuickActionsOpen}
            onClose={() => setManageQuickActionsOpen(false)}
            teamId={teamId}
          />
        </>
      ) : null}
    </div>
  );
}
