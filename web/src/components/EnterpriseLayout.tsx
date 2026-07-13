import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { AlenioGoLogo } from "./AlenioGoLogo";
import { AlenioWorkspaceLoading } from "./AlenioWorkspaceLoading";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";
import {
  isRecentFooterEnterpriseWorkspaceSelect,
  setPersistedEnterpriseTeamId,
  switchEnterpriseWorkspace,
} from "../lib/enterprise-selected-team";
import type { WebMeUser, WebTeamRow } from "../lib/api";

export type EnterpriseNavId = "activity" | "chat" | "execute" | "go" | "team" | "plan" | "profile";

type Props = {
  activeNav: EnterpriseNavId;
  teams: WebTeamRow[];
  selectedTeamId: string;
  onTeamChange: (teamId: string) => void;
  user: WebMeUser | null;
  onSignOutNavigate: (path: string) => void;
  topBar: ReactNode;
  children: ReactNode;
  mainClassName?: string;
  contentClassName?: string;
  /**
   * True while this page is still loading data for the newly selected workspace.
   * Only affects the overlay after the user changes workspace from the footer select (not when using nav links).
   */
  workspaceOverlayLoading?: boolean;
  /** When false, the Billing sidebar item is hidden (non-owners in a workspace). */
  showPlanNav: boolean;
  /** When false, Activity and Workspace are hidden (workspace on Free plan). */
  showActivityExecuteNav: boolean;
  /** When false, Alenio Go is hidden (requires Operations plan). */
  showGoNav?: boolean;
};

const WORKSPACE_OVERLAY_MIN_MS = 220;
const WORKSPACE_OVERLAY_MAX_MS = 1200;

function IconChat() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconWorkspace() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}
function IconTeam() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function IconPlan() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

function NavItem({
  to,
  navId,
  activeNav,
  icon,
  label,
}: {
  to: string;
  navId: EnterpriseNavId;
  activeNav: EnterpriseNavId;
  icon: ReactNode;
  label: string;
}) {
  const active = activeNav === navId;
  return (
    <Link
      to={to}
      className={`enterprise-nav-item ${active ? "enterprise-nav-item-active" : ""}`}
      data-testid={`nav-${navId}`}
    >
      <span className="enterprise-nav-icon">{icon}</span>
      <span className="enterprise-nav-label">{label}</span>
    </Link>
  );
}

function userInitials(user: WebMeUser | null): string {
  if (!user) return "?";
  const n = user.name?.trim() || user.email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "U";
}

export function EnterpriseLayout({
  activeNav,
  teams,
  selectedTeamId,
  onTeamChange,
  user,
  onSignOutNavigate,
  topBar,
  children,
  mainClassName = "",
  contentClassName = "",
  workspaceOverlayLoading = false,
  showPlanNav,
  showActivityExecuteNav,
  showGoNav = false,
}: Props) {
  const [showWorkspaceOverlay, setShowWorkspaceOverlay] = useState(false);
  /** User changed workspace (sidebar or profile); until cleared, `workspaceOverlayLoading` controls how long the overlay may stay up. */
  const [sidebarWorkspaceSwitch, setSidebarWorkspaceSwitch] = useState(false);
  const overlayStartedAtRef = useRef<number | null>(null);
  const hideOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedTeamIdRef = useRef(selectedTeamId);

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceTriggerRef = useRef<HTMLButtonElement>(null);
  const [workspaceMenuStyle, setWorkspaceMenuStyle] = useState<CSSProperties | null>(null);

  const updateWorkspaceMenuPosition = useCallback(() => {
    const trigger = workspaceTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setWorkspaceMenuStyle({
      position: "fixed",
      left: rect.right + 7,
      bottom: window.innerHeight - rect.bottom,
      zIndex: 300,
    });
  }, []);

  const clearPendingHideTimer = useCallback(() => {
    if (hideOverlayTimerRef.current) {
      clearTimeout(hideOverlayTimerRef.current);
      hideOverlayTimerRef.current = null;
    }
  }, []);

  const endSidebarWorkspaceSwitchSession = useCallback(() => {
    clearPendingHideTimer();
    overlayStartedAtRef.current = null;
    setShowWorkspaceOverlay(false);
    setSidebarWorkspaceSwitch(false);
  }, [clearPendingHideTimer]);

  const beginWorkspaceSwitchOverlay = useCallback(() => {
    clearPendingHideTimer();
    overlayStartedAtRef.current = Date.now();
    setShowWorkspaceOverlay(true);
    setSidebarWorkspaceSwitch(true);
  }, [clearPendingHideTimer]);

  const handleWorkspaceSelectChange = (teamId: string) => {
    if (teamId === selectedTeamId) return;
    beginWorkspaceSwitchOverlay();
    switchEnterpriseWorkspace(teamId, onTeamChange);
  };

  useEffect(() => {
    const prev = prevSelectedTeamIdRef.current;
    prevSelectedTeamIdRef.current = selectedTeamId;
    if (!selectedTeamId || prev === selectedTeamId || prev === "") return;
    // Sidebar/profile already started the overlay; only catch switches that didn't.
    if (showWorkspaceOverlay || sidebarWorkspaceSwitch) return;
    if (!isRecentFooterEnterpriseWorkspaceSelect()) return;
    beginWorkspaceSwitchOverlay();
  }, [selectedTeamId, beginWorkspaceSwitchOverlay, showWorkspaceOverlay, sidebarWorkspaceSwitch]);

  useEffect(() => {
    if (!sidebarWorkspaceSwitch) return;

    // Hard cap so a stuck page loading flag can't leave the overlay up forever.
    const started = overlayStartedAtRef.current ?? Date.now();
    const maxRemaining = WORKSPACE_OVERLAY_MAX_MS - (Date.now() - started);
    if (maxRemaining <= 0) {
      endSidebarWorkspaceSwitchSession();
      return;
    }

    if (workspaceOverlayLoading) {
      clearPendingHideTimer();
      const id = window.setTimeout(() => {
        endSidebarWorkspaceSwitchSession();
      }, maxRemaining);
      hideOverlayTimerRef.current = id;
      return () => {
        clearTimeout(id);
      };
    }

    const elapsed = Date.now() - started;
    const remaining = Math.min(
      Math.max(WORKSPACE_OVERLAY_MIN_MS - elapsed, 0),
      maxRemaining,
    );

    if (remaining <= 0) {
      endSidebarWorkspaceSwitchSession();
      return;
    }

    const id = window.setTimeout(() => {
      endSidebarWorkspaceSwitchSession();
    }, remaining);
    hideOverlayTimerRef.current = id;
    return () => {
      clearTimeout(id);
    };
  }, [workspaceOverlayLoading, sidebarWorkspaceSwitch, clearPendingHideTimer, endSidebarWorkspaceSwitchSession]);

  useEffect(() => {
    if (!workspaceMenuOpen) {
      setWorkspaceMenuStyle(null);
      return;
    }
    updateWorkspaceMenuPosition();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (workspaceMenuRef.current?.contains(target)) return;
      if (workspaceTriggerRef.current?.contains(target)) return;
      setWorkspaceMenuOpen(false);
    };
    const onLayoutChange = () => updateWorkspaceMenuPosition();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [workspaceMenuOpen, updateWorkspaceMenuPosition]);

  const signOut = async () => {
    try {
      await getAuthClient().signOut();
    } catch {
      /* ignore */
    }
    clearAccessToken();
    setPersistedEnterpriseTeamId("");
    onSignOutNavigate("/login?reason=session");
  };

  const activeTeam = teams.find((t) => t.id === selectedTeamId) ?? teams[0] ?? null;
  const workspaceLabel =
    activeTeam?.name?.trim().split(/\s+/)[0]?.slice(0, 10) ?? "Workspace";
  const canSwitchWorkspace = teams.length > 1;

  return (
    <div className={`enterprise-app ${mainClassName}`.trim()} data-testid="enterprise-layout">
      <aside className="enterprise-sidebar enterprise-sidebar--rail" aria-label="Main navigation">
        <Link to="/dashboard" className="enterprise-sidebar-brand" aria-label="Alenio home">
          <img src="/icon.png" alt="" className="enterprise-sidebar-mark" width={60} height={60} />
        </Link>
        <nav className="enterprise-nav" aria-label="Product">
          <NavItem to="/chat" navId="chat" activeNav={activeNav} icon={<IconChat />} label="Chat" />
          {showActivityExecuteNav ? (
            <NavItem to="/dashboard" navId="execute" activeNav={activeNav} icon={<IconWorkspace />} label="Workspace" />
          ) : null}
          {showGoNav ? (
            <NavItem
              to="/go"
              navId="go"
              activeNav={activeNav}
              icon={<AlenioGoLogo />}
              label="Alenio Go"
            />
          ) : null}
          <NavItem to="/team" navId="team" activeNav={activeNav} icon={<IconTeam />} label="Team" />
          {showPlanNav ? (
            <NavItem to="/billing" navId="plan" activeNav={activeNav} icon={<IconPlan />} label="Billing" />
          ) : null}
        </nav>
        <div className="enterprise-rail-footer">
          <div className="enterprise-rail-footer-item-wrap" ref={workspaceMenuRef}>
            <button
              ref={workspaceTriggerRef}
              type="button"
              className={`enterprise-nav-item enterprise-nav-item--button${workspaceMenuOpen ? " enterprise-nav-item-active" : ""}${canSwitchWorkspace ? " enterprise-nav-item--switchable" : ""}`}
              onClick={() => {
                if (canSwitchWorkspace) setWorkspaceMenuOpen((open) => !open);
              }}
              aria-expanded={canSwitchWorkspace ? workspaceMenuOpen : undefined}
              aria-haspopup={canSwitchWorkspace ? "menu" : undefined}
              aria-label={canSwitchWorkspace ? `Switch workspace, current: ${activeTeam?.name ?? "none"}` : activeTeam?.name ?? "Workspace"}
              data-testid="enterprise-workspace-menu-trigger"
              disabled={!canSwitchWorkspace && teams.length === 0}
            >
              <span className="enterprise-nav-icon">
                {activeTeam?.image ? (
                  <img src={activeTeam.image} alt="" className="enterprise-rail-ws-icon-img" />
                ) : (
                  <span className="enterprise-rail-ws-fallback">{activeTeam?.name?.[0]?.toUpperCase() ?? "W"}</span>
                )}
              </span>
              <span className="enterprise-nav-label enterprise-nav-label--stack">
                <span>{workspaceLabel}</span>
                {canSwitchWorkspace ? (
                  <span className="enterprise-nav-chevron" aria-hidden>
                    {workspaceMenuOpen ? "▴" : "▾"}
                  </span>
                ) : null}
              </span>
            </button>
            {workspaceMenuOpen && canSwitchWorkspace && workspaceMenuStyle
              ? createPortal(
                  <div
                    ref={workspaceMenuRef}
                    className="enterprise-ws-menu enterprise-ws-menu--portal"
                    style={workspaceMenuStyle}
                    role="menu"
                    aria-label="Switch workspace"
                  >
                    <p className="enterprise-ws-menu-title">Switch workspace</p>
                    {teams.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="menuitem"
                        className={`enterprise-ws-menu-item${t.id === selectedTeamId ? " enterprise-ws-menu-item--active" : ""}`}
                        onClick={() => {
                          if (t.id !== selectedTeamId) handleWorkspaceSelectChange(t.id);
                          setWorkspaceMenuOpen(false);
                        }}
                      >
                        <span className="enterprise-ws-menu-item-icon" aria-hidden>
                          {t.image ? (
                            <img src={t.image} alt="" className="enterprise-rail-ws-icon-img" />
                          ) : (
                            <span className="enterprise-rail-ws-fallback">{t.name?.[0]?.toUpperCase() ?? "W"}</span>
                          )}
                        </span>
                        <span className="enterprise-ws-menu-item-name">{t.name}</span>
                      </button>
                    ))}
                  </div>,
                  document.body,
                )
              : null}
          </div>
          <Link
            to="/profile"
            className={`enterprise-nav-item${activeNav === "profile" ? " enterprise-nav-item-active" : ""}`}
            data-testid="nav-profile"
          >
            <span className="enterprise-nav-icon">
              {user?.image ? (
                <img src={user.image} alt="" className="enterprise-rail-avatar-img" />
              ) : (
                <span className="enterprise-rail-avatar-fallback">{userInitials(user)}</span>
              )}
            </span>
            <span className="enterprise-nav-label">Profile</span>
          </Link>
          <button
            type="button"
            className="enterprise-nav-item enterprise-nav-item--button"
            onClick={() => void signOut()}
            data-testid="enterprise-sign-out"
          >
            <span className="enterprise-nav-icon">
              <IconSignOut />
            </span>
            <span className="enterprise-nav-label">Sign out</span>
          </button>
        </div>
      </aside>
      <div className="enterprise-main-column">
        <div
          className={`enterprise-main-column-body${showWorkspaceOverlay ? " enterprise-main-column-body-loading" : ""}`.trim()}
        >
          {topBar}
          <div className={`enterprise-content ${contentClassName}`.trim()}>{children}</div>
          {showWorkspaceOverlay ? (
            <div
              className="enterprise-workspace-loading-overlay"
              role="status"
              aria-live="polite"
              aria-label="Switching Workspace"
            >
              <AlenioWorkspaceLoading />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
