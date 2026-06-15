import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlenioWorkspaceLoading } from "./AlenioWorkspaceLoading";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";
import {
  isRecentFooterEnterpriseWorkspaceSelect,
  setPersistedEnterpriseTeamId,
  switchEnterpriseWorkspace,
} from "../lib/enterprise-selected-team";
import type { WebMeUser, WebTeamRow } from "../lib/api";

export type EnterpriseNavId = "activity" | "chat" | "execute" | "team" | "plan" | "profile";

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
};

const WORKSPACE_OVERLAY_MIN_MS = 800;

function IconActivity() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}
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

function IconProfile() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
      <span>{label}</span>
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
}: Props) {
  const [showWorkspaceOverlay, setShowWorkspaceOverlay] = useState(false);
  /** User changed workspace (sidebar or profile); until cleared, `workspaceOverlayLoading` controls how long the overlay may stay up. */
  const [sidebarWorkspaceSwitch, setSidebarWorkspaceSwitch] = useState(false);
  const overlayStartedAtRef = useRef<number | null>(null);
  const hideOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSelectedTeamIdRef = useRef(selectedTeamId);

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
    switchEnterpriseWorkspace(teamId, onTeamChange);
    beginWorkspaceSwitchOverlay();
    onTeamChange(teamId);
  };

  useEffect(() => {
    const prev = prevSelectedTeamIdRef.current;
    prevSelectedTeamIdRef.current = selectedTeamId;
    if (!selectedTeamId || prev === selectedTeamId || prev === "") return;
    if (!isRecentFooterEnterpriseWorkspaceSelect()) return;
    beginWorkspaceSwitchOverlay();
  }, [selectedTeamId, beginWorkspaceSwitchOverlay]);

  useEffect(() => {
    if (!sidebarWorkspaceSwitch) return;

    if (workspaceOverlayLoading) {
      clearPendingHideTimer();
      return;
    }

    const started = overlayStartedAtRef.current;
    if (started == null) {
      endSidebarWorkspaceSwitchSession();
      return;
    }

    const elapsed = Date.now() - started;
    const remaining = WORKSPACE_OVERLAY_MIN_MS - elapsed;

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

  const roleLabel = teams.find((t) => t.id === selectedTeamId)?.role ?? "member";

  return (
    <div className={`enterprise-app ${mainClassName}`.trim()} data-testid="enterprise-layout">
      <aside className="enterprise-sidebar" aria-label="Main navigation">
        <Link to="/dashboard" className="enterprise-sidebar-brand">
          <img src="/alenio-logo-white.png" alt="Alenio home" className="enterprise-sidebar-logo" />
        </Link>
        <nav className="enterprise-nav" aria-label="Product">
          {showActivityExecuteNav ? (
            <NavItem to="/activity" navId="activity" activeNav={activeNav} icon={<IconActivity />} label="Activity" />
          ) : null}
          <NavItem to="/chat" navId="chat" activeNav={activeNav} icon={<IconChat />} label="Chat" />
          {showActivityExecuteNav ? (
            <NavItem to="/dashboard" navId="execute" activeNav={activeNav} icon={<IconWorkspace />} label="Workspace" />
          ) : null}
          <NavItem to="/team" navId="team" activeNav={activeNav} icon={<IconTeam />} label="Team" />
          {showPlanNav ? (
            <NavItem to="/billing" navId="plan" activeNav={activeNav} icon={<IconPlan />} label="Billing" />
          ) : null}
          <NavItem to="/profile" navId="profile" activeNav={activeNav} icon={<IconProfile />} label="Profile" />
        </nav>
        <div className="enterprise-sidebar-footer">
          <label className="enterprise-workspace-label" htmlFor="enterprise-workspace">
            Workspace
          </label>
          <select
            id="enterprise-workspace"
            className="enterprise-workspace-select"
            value={teams.some((t) => t.id === selectedTeamId) ? selectedTeamId : ""}
            onChange={(e) => handleWorkspaceSelectChange(e.target.value)}
            data-testid="enterprise-workspace-select"
          >
            {teams.length === 0 ? (
              <option value="">No teams</option>
            ) : (
              teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))
            )}
          </select>
          <div className="enterprise-sidebar-user">
            {user?.image ? (
              <img src={user.image} alt={user?.name ?? user?.email ?? "Account"} className="enterprise-user-avatar enterprise-user-avatar-img" />
            ) : (
              <div className="enterprise-user-avatar">{userInitials(user)}</div>
            )}
            <div className="enterprise-user-text">
              <div className="enterprise-user-name">{user?.name ?? user?.email ?? "Signed in"}</div>
              <div className="enterprise-user-role">{formatRole(roleLabel)}</div>
            </div>
          </div>
          <button type="button" className="enterprise-sidebar-signout" onClick={signOut} data-testid="enterprise-sign-out">
            Sign out
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

function formatRole(role: string): string {
  const r = role.replace(/_/g, " ");
  return r.replace(/\b\w/g, (c) => c.toUpperCase());
}
