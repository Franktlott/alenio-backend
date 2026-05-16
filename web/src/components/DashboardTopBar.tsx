import type { WebMeUser } from "../lib/api";
import { JoinRequestBell } from "./JoinRequestBell";

function initials(user: WebMeUser | null): string {
  if (!user) return "?";
  const n = user.name?.trim() || user.email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "U";
}

type Props = {
  user: WebMeUser | null;
  pageTitle: string;
  workspaceName?: string | null;
  /** Optional extra count shown on the bell badge (join requests are included automatically). */
  notificationCount?: number;
};

export function DashboardTopBar({ user, pageTitle, workspaceName, notificationCount = 0 }: Props) {
  const workspace = workspaceName?.trim() || null;

  return (
    <header className="enterprise-topbar" data-testid="dashboard-topbar">
      <div className="enterprise-topbar-context" data-testid="topbar-context">
        <h1 className="enterprise-topbar-title">{pageTitle}</h1>
        {workspace ? (
          <>
            <span className="enterprise-topbar-sep" aria-hidden>
              ·
            </span>
            <span className="enterprise-topbar-workspace" data-testid="topbar-workspace">
              {workspace}
            </span>
          </>
        ) : null}
      </div>
      <div className="enterprise-topbar-actions">
        <JoinRequestBell extraNotificationCount={notificationCount} />
        <div className="enterprise-topbar-profile" data-testid="topbar-profile">
          {user?.image ? (
            <img src={user.image} alt={user?.name ?? user?.email ?? "Account"} className="enterprise-topbar-avatar enterprise-topbar-avatar-img" />
          ) : (
            <div className="enterprise-topbar-avatar">{initials(user)}</div>
          )}
          <div className="enterprise-topbar-profile-text">
            <span className="enterprise-topbar-profile-name">{user?.name ?? user?.email ?? "Account"}</span>
            {user?.email && user.email.trim() !== (user.name ?? "").trim() ? (
              <span className="enterprise-topbar-profile-role">{user.email}</span>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
