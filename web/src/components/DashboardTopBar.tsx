import type { ReactNode } from "react";
import type { WebMeUser } from "../lib/api";
import { JoinRequestBell } from "./JoinRequestBell";
import { VideoMeetingTopBarJoin } from "./VideoMeetingTopBarJoin";

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
  selectedTeamId?: string;
  /** Optional extra count shown on the bell badge (join requests are included automatically). */
  notificationCount?: number;
  /** Optional brand mark shown above the page title (e.g. Alenio Go logo). */
  brandHeader?: ReactNode;
  /** Alenio Go dashboard styling — borderless header on grey background. */
  variant?: "default" | "go";
  /** Role shown under the user name (Go header uses this instead of email). */
  roleLabel?: string;
  /** Extra content before bell/profile (e.g. Go workspace status). */
  actionsPrefix?: ReactNode;
};

function roleChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function DashboardTopBar({
  user,
  pageTitle,
  selectedTeamId = "",
  notificationCount = 0,
  brandHeader,
  variant = "default",
  roleLabel,
  actionsPrefix,
}: Props) {
  const isGo = variant === "go";

  return (
    <header className={`enterprise-topbar${isGo ? " enterprise-topbar--go" : ""}`} data-testid="dashboard-topbar">
      <div className="enterprise-topbar-context" data-testid="topbar-context">
        {brandHeader ? (
          <>
            {brandHeader}
            <h1 className="sr-only">{pageTitle}</h1>
          </>
        ) : (
          <h1 className="enterprise-topbar-title">{pageTitle}</h1>
        )}
      </div>

      <div className="enterprise-topbar-actions">
        {!isGo ? <VideoMeetingTopBarJoin selectedTeamId={selectedTeamId} user={user} /> : null}
        {actionsPrefix}
        <JoinRequestBell extraNotificationCount={notificationCount} />
        <div className="enterprise-topbar-profile" data-testid="topbar-profile">
          {user?.image ? (
            <img src={user.image} alt={user?.name ?? user?.email ?? "Account"} className="enterprise-topbar-avatar enterprise-topbar-avatar-img" />
          ) : (
            <div className="enterprise-topbar-avatar">{initials(user)}</div>
          )}
          <div className="enterprise-topbar-profile-text">
            <span className="enterprise-topbar-profile-name">{user?.name ?? user?.email ?? "Account"}</span>
            {roleLabel ? (
              <span className="enterprise-topbar-profile-role">{roleLabel}</span>
            ) : user?.email && user.email.trim() !== (user.name ?? "").trim() ? (
              <span className="enterprise-topbar-profile-role">{user.email}</span>
            ) : null}
          </div>
          {isGo ? <span className="enterprise-topbar-profile-chevron">{roleChevron()}</span> : null}
        </div>
      </div>
    </header>
  );
}
