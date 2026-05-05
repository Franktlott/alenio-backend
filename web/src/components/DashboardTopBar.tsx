import { useCallback, type KeyboardEvent } from "react";
import type { WebMeUser } from "../lib/api";

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
  notificationCount?: number;
};

export function DashboardTopBar({ user, notificationCount = 0 }: Props) {
  const onSearchKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.target as HTMLInputElement).focus();
    }
  }, []);

  return (
    <header className="enterprise-topbar" data-testid="dashboard-topbar">
      <div className="enterprise-topbar-search-wrap">
        <span className="enterprise-topbar-search-icon" aria-hidden>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </span>
        <input
          type="search"
          className="enterprise-topbar-search"
          placeholder="Search tasks, teams, metrics…"
          aria-label="Search"
          onKeyDown={onSearchKeyDown}
          data-testid="topbar-search"
        />
        <kbd className="enterprise-topbar-kbd">⌘ K</kbd>
      </div>
      <div className="enterprise-topbar-actions">
        <button type="button" className="enterprise-topbar-bell" aria-label="Notifications" data-testid="topbar-notifications">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {notificationCount > 0 ? <span className="enterprise-topbar-badge">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
        </button>
        <div className="enterprise-topbar-profile" data-testid="topbar-profile">
          {user?.image ? (
            <img src={user.image} alt="" className="enterprise-topbar-avatar enterprise-topbar-avatar-img" />
          ) : (
            <div className="enterprise-topbar-avatar">{initials(user)}</div>
          )}
          <div className="enterprise-topbar-profile-text">
            <span className="enterprise-topbar-profile-name">{user?.name ?? user?.email ?? "Account"}</span>
            <span className="enterprise-topbar-profile-role">Team member</span>
          </div>
        </div>
      </div>
    </header>
  );
}
