import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";
import type { WebMeUser, WebTeamRow } from "../lib/api";

export type EnterpriseNavId = "activity" | "chat" | "execute" | "team" | "analytics" | "settings";

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
};

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
function IconExecute() {
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
function IconAnalytics() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
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
}: Props) {
  const signOut = async () => {
    try {
      await getAuthClient().signOut();
    } catch {
      /* ignore */
    }
    clearAccessToken();
    onSignOutNavigate("/login?reason=session");
  };

  const roleLabel = teams.find((t) => t.id === selectedTeamId)?.role ?? "member";

  return (
    <div className={`enterprise-app ${mainClassName}`.trim()} data-testid="enterprise-layout">
      <aside className="enterprise-sidebar" aria-label="Main navigation">
        <Link to="/dashboard" className="enterprise-sidebar-brand" aria-label="Alenio home">
          <img src="/alenio-logo-white.png" alt="" className="enterprise-sidebar-logo" />
        </Link>
        <nav className="enterprise-nav" aria-label="Product">
          <NavItem to="/activity" navId="activity" activeNav={activeNav} icon={<IconActivity />} label="Activity" />
          <NavItem to="/chat" navId="chat" activeNav={activeNav} icon={<IconChat />} label="Chat" />
          <NavItem to="/dashboard" navId="execute" activeNav={activeNav} icon={<IconExecute />} label="Execute" />
          <NavItem to="/dashboard#team" navId="team" activeNav={activeNav} icon={<IconTeam />} label="Team" />
          <NavItem
            to="/dashboard#analytics"
            navId="analytics"
            activeNav={activeNav}
            icon={<IconAnalytics />}
            label="Analytics"
          />
          <NavItem to="/dashboard#settings" navId="settings" activeNav={activeNav} icon={<IconSettings />} label="Settings" />
        </nav>
        <div className="enterprise-sidebar-footer">
          <label className="enterprise-workspace-label" htmlFor="enterprise-workspace">
            Workspace
          </label>
          <select
            id="enterprise-workspace"
            className="enterprise-workspace-select"
            value={selectedTeamId}
            onChange={(e) => onTeamChange(e.target.value)}
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
              <img src={user.image} alt="" className="enterprise-user-avatar enterprise-user-avatar-img" />
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
        {topBar}
        <div className={`enterprise-content ${contentClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}

function formatRole(role: string): string {
  const r = role.replace(/_/g, " ");
  return r.replace(/\b\w/g, (c) => c.toUpperCase());
}
