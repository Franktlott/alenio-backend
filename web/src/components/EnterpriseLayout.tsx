import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AlenioWorkspaceLoading } from "./AlenioWorkspaceLoading";
import type { WebMeUser, WebTeamRow } from "../lib/api";
import { clearAccessToken, getAuthClient } from "../lib/auth-client";
import {
  isRecentFooterEnterpriseWorkspaceSelect,
  setPersistedEnterpriseTeamId,
} from "../lib/enterprise-selected-team";
import { UserAvatar } from "./UserAvatar";
import "../v2/alenio-chrome.css";

export type EnterpriseNavId =
  | "activity"
  | "chat"
  | "network"
  | "execute"
  | "go"
  | "workspaces"
  | "users"
  | "team"
  | "plan"
  | "settings"
  | "admin"
  | "discover"
  | "content"
  | "home"
  | "workspace"
  | "adminUsers"
  | "adminWorkspaces"
  | "adminSeneca"
  | "adminActivity"
  | "adminNotifications"
  | "adminPricing"
  | "seneca";

/** Which Admin tools pages the signed-in staff member can open. */
export type AdminNavAccess = {
  users: boolean;
  workspaces: boolean;
  content: boolean;
  seneca: boolean;
  activity: boolean;
  notifications: boolean;
  pricing: boolean;
};

type AdminSection = "users" | "workspaces" | "seneca-studio";

const ADMIN_SECTIONS: Array<{ id: AdminSection; label: string; to: string; hint: string }> = [
  { id: "users", label: "Users", to: "/admin", hint: "Platform users" },
  { id: "workspaces", label: "Workspaces", to: "/admin?tab=workspaces", hint: "Self-serve & linked" },
  {
    id: "seneca-studio",
    label: "Seneca Studio",
    to: "/admin?tab=seneca-studio",
    hint: "Platform coaching",
  },
];

function adminSectionFromSearch(search: string): AdminSection {
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "workspaces" || tab === "seneca-studio") return tab;
  return "users";
}

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
  /** Kept for callers; Workspace stays in the rail regardless. */
  showActivityExecuteNav?: boolean;
  /** When false, Alenio Go is hidden (requires Operations plan). */
  showGoNav?: boolean;
  /** Sidebar label for `/go` — e.g. "Dashboard" for enterprise org admins. */
  goNavLabel?: string;
  /** Enterprise org admin: Corporate Workspaces + Users in the left rail. */
  showEnterpriseOrgNav?: boolean;
  /** Dashboard / Go href — org admins use `/go/org/overview`. */
  goNavTo?: string;
  /** When true, platform Admin sidebar item is shown. */
  showAdminNav?: boolean;
  /** When true, the platform-admin Discover section is shown. */
  showDiscoverNav?: boolean;
  /** Per-page Admin tools access for staff roles; every page shows when omitted. */
  adminNav?: AdminNavAccess;
  /** Sidebar + page label for `/team` — "Profile" for regular members. */
  teamNavLabel?: string;
  /**
   * No workspace yet — Settings, Sign out, My Network, plus Admin / enterprise org nav when applicable.
   * Hides Workspace / Billing.
   * Alenio Go stays off until an Operations workspace (or enterprise org membership).
   */
  setupNavMode?: boolean;
  /** Enterprise: start SSO-style boot before switching workspace (tabs settle under overlay). */
  onEnterpriseWorkspaceBoot?: (teamId: string) => void;
  /** Opens the account panel. When set, the Profile item opens it instead of going to /settings. */
  onOpenAccount?: () => void;
  /** Column docked to the right of the page (chat on Alenio pages). */
  rightDock?: ReactNode;
  /** Header laid over the top of the page and the right dock (Alenio pages). */
  topHeader?: ReactNode;
};

const WORKSPACE_OVERLAY_MIN_MS = 700;
const WORKSPACE_OVERLAY_MAX_MS = 10000;

function IconWorkspace() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconSeneca() {
  return <img src="/seneca-icon.png" alt="" width="20" height="20" className="enterprise-nav-icon-img" aria-hidden />;
}

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconSparkles() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      <path d="M5 2l.6 1.6L7.2 4.2l-1.6.6L5 6.4l-.6-1.6L2.8 4.2l1.6-.6z" />
    </svg>
  );
}

function IconActivity() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

function IconBell() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function IconPen() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M8 12.5l2.5 2.5L16 9" />
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

function IconCorporateWorkspaces() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 21h18" />
      <path d="M5 21V7l7-4 7 4v14" />
      <path d="M9 21v-6h6v6" />
      <path d="M9 10h.01" />
      <path d="M15 10h.01" />
      <path d="M9 14h.01" />
      <path d="M15 14h.01" />
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
      title={label}
    >
      <span className="enterprise-nav-icon">{icon}</span>
      <span className="enterprise-nav-label">{label}</span>
    </Link>
  );
}

/**
 * Hover/click flyout anchored to the right of a rail item. Shared by the
 * Workspace switcher and the Admin sections menu.
 */
function useRailFlyout(menuHeight: number) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setMenuOpen(true);
  }, [clearCloseTimer]);

  const scheduleCloseMenu = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      closeTimerRef.current = null;
    }, 180);
  }, [clearCloseTimer]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const top = Math.min(Math.max(12, rect.top), Math.max(12, window.innerHeight - menuHeight - 12));
    setMenuStyle({ position: "fixed", left: rect.right + 8, top, zIndex: 300 });
  }, [menuHeight]);

  useEffect(() => {
    if (!menuOpen) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    const onLayoutChange = () => updateMenuPosition();
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onLayoutChange);
    window.addEventListener("scroll", onLayoutChange, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onLayoutChange);
      window.removeEventListener("scroll", onLayoutChange, true);
    };
  }, [menuOpen, updateMenuPosition]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return { menuOpen, setMenuOpen, menuStyle, wrapRef, triggerRef, menuRef, openMenu, scheduleCloseMenu };
}

function AdminNavItem({ activeNav, icon }: { activeNav: EnterpriseNavId; icon: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const active = activeNav === "admin";
  const currentSection = active ? adminSectionFromSearch(location.search) : null;
  const { menuOpen, setMenuOpen, menuStyle, wrapRef, triggerRef, menuRef, openMenu, scheduleCloseMenu } =
    useRailFlyout(168);

  return (
    <div
      className="enterprise-rail-nav-item-wrap"
      ref={wrapRef}
      onMouseEnter={openMenu}
      onMouseLeave={scheduleCloseMenu}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`enterprise-nav-item enterprise-nav-item--button enterprise-nav-item--switchable${
          active || menuOpen ? " enterprise-nav-item-active" : ""
        }`}
        onClick={() => {
          if (!active) {
            navigate("/admin");
            setMenuOpen(false);
            return;
          }
          setMenuOpen((open) => !open);
        }}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        aria-label="Admin sections — hover or click to switch"
        title="Admin — hover or click to switch"
        data-testid="nav-admin"
      >
        <span className="enterprise-nav-icon">{icon}</span>
        <span className="enterprise-nav-label enterprise-nav-label--with-chevron">
          Admin
          <span className="enterprise-nav-chevron" aria-hidden>
            {menuOpen ? "◂" : "▸"}
          </span>
        </span>
      </button>
      {menuOpen && menuStyle
        ? createPortal(
            <div
              ref={menuRef}
              className="enterprise-ws-menu enterprise-ws-menu--portal enterprise-admin-menu"
              style={menuStyle}
              role="menu"
              aria-label="Admin sections"
              onMouseEnter={openMenu}
              onMouseLeave={scheduleCloseMenu}
            >
              <p className="enterprise-ws-menu-title">Admin</p>
              {ADMIN_SECTIONS.map((section) => {
                const isCurrent = currentSection === section.id;
                return (
                  <button
                    key={section.id}
                    type="button"
                    role="menuitem"
                    className={`enterprise-ws-menu-item${isCurrent ? " enterprise-ws-menu-item--active" : ""}`}
                    data-testid={`admin-nav-${section.id}`}
                    onClick={() => {
                      navigate(section.to);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="enterprise-ws-menu-item-copy">
                      <span className="enterprise-ws-menu-item-name">{section.label}</span>
                      <span className="enterprise-ws-menu-item-code">{section.hint}</span>
                    </span>
                    {isCurrent ? <span className="enterprise-ws-menu-item-current">Current</span> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export function EnterpriseLayout({
  activeNav,
  selectedTeamId,
  user,
  topBar,
  children,
  mainClassName = "",
  contentClassName = "",
  workspaceOverlayLoading = false,
  showGoNav = false,
  goNavLabel,
  goNavTo,
  showEnterpriseOrgNav = false,
  showAdminNav = false,
  showDiscoverNav = false,
  adminNav,
  setupNavMode = false,
  onOpenAccount,
  rightDock,
  topHeader,
}: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOut) return;
    if (!window.confirm("Sign out of Alenio on this device?")) return;
    setSigningOut(true);
    try {
      try {
        await getAuthClient().signOut();
      } catch {
        /* The local session still needs to end if the server call fails. */
      }
      clearAccessToken();
      setPersistedEnterpriseTeamId("");
      navigate("/login", { replace: true });
    } finally {
      setSigningOut(false);
    }
  };
  const [showWorkspaceOverlay, setShowWorkspaceOverlay] = useState(false);
  /** User changed workspace; until cleared, `workspaceOverlayLoading` controls how long the overlay may stay up. */
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

  useEffect(() => {
    if (workspaceOverlayLoading) beginWorkspaceSwitchOverlay();
  }, [workspaceOverlayLoading, beginWorkspaceSwitchOverlay]);

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

  const mainColumn = (
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
  );

  return (
    <div
      className={`enterprise-app ${mainClassName}`.trim()}
      data-testid="enterprise-layout"
    >
      <aside className="enterprise-sidebar enterprise-sidebar--rail" aria-label="Main navigation">
        <Link to="/home" className="enterprise-sidebar-brand" aria-label="Alenio home">
          <img src="/icon.png" alt="" className="enterprise-sidebar-mark" width={60} height={60} />
          {onOpenAccount ? (
            <img src="/alenio-logo-white.png" alt="Alenio" className="enterprise-sidebar-logo-wide" />
          ) : null}
        </Link>
        <nav className="enterprise-nav" aria-label="Product">
          <NavItem to="/home" navId="home" activeNav={activeNav} icon={<IconHome />} label="Home" />
          <NavItem to="/workspace" navId="workspace" activeNav={activeNav} icon={<IconTasks />} label="Workspace" />
          <NavItem to="/network" navId="network" activeNav={activeNav} icon={<IconUsers />} label="Network" />
          <NavItem to="/seneca" navId="seneca" activeNav={activeNav} icon={<IconSeneca />} label="Seneca" />
          <NavItem to="/discover" navId="discover" activeNav={activeNav} icon={<IconSparkles />} label="Discover" />
          {location.pathname.startsWith("/go") && showGoNav && !setupNavMode ? (
            <NavItem
              to={goNavTo ?? "/go"}
              navId="go"
              activeNav={activeNav}
              icon={<IconWorkspace />}
              label={goNavLabel ?? "Alenio Go"}
            />
          ) : null}
          {showEnterpriseOrgNav ? (
            <>
              <NavItem
                to="/go/org/workspaces"
                navId="workspaces"
                activeNav={activeNav}
                icon={<IconCorporateWorkspaces />}
                label="Workspaces"
              />
              <NavItem to="/go/org/users" navId="users" activeNav={activeNav} icon={<IconUsers />} label="Users" />
            </>
          ) : null}
          {showDiscoverNav || showAdminNav ? (
            <div className="enterprise-nav-section" role="presentation">
              <span className="enterprise-nav-section-label">Admin tools</span>
            </div>
          ) : null}
          {showDiscoverNav ? (
            <>
              {adminNav?.users ?? true ? (
                <NavItem to="/admin/users" navId="adminUsers" activeNav={activeNav} icon={<IconUsers />} label="Users" />
              ) : null}
              {adminNav?.workspaces ?? true ? (
                <NavItem
                  to="/admin/workspaces"
                  navId="adminWorkspaces"
                  activeNav={activeNav}
                  icon={<IconCorporateWorkspaces />}
                  label="Workspaces"
                />
              ) : null}
              {adminNav?.content ?? true ? (
                <NavItem to="/admin/discover" navId="content" activeNav={activeNav} icon={<IconPen />} label="Content" />
              ) : null}
              {adminNav?.seneca ?? true ? (
                <NavItem to="/admin/seneca" navId="adminSeneca" activeNav={activeNav} icon={<IconSeneca />} label="Seneca" />
              ) : null}
              {adminNav?.notifications ?? true ? (
                <NavItem
                  to="/admin/notifications"
                  navId="adminNotifications"
                  activeNav={activeNav}
                  icon={<IconBell />}
                  label="Notifications"
                />
              ) : null}
              {adminNav?.pricing ? (
                <NavItem to="/admin/pricing" navId="adminPricing" activeNav={activeNav} icon={<IconTag />} label="Pricing" />
              ) : null}
              {adminNav?.activity ?? true ? (
                <NavItem
                  to="/admin/activity"
                  navId="adminActivity"
                  activeNav={activeNav}
                  icon={<IconActivity />}
                  label="Activity"
                />
              ) : null}
            </>
          ) : null}
          {showAdminNav ? <AdminNavItem activeNav={activeNav} icon={<IconAdmin />} /> : null}
        </nav>
        <div className="enterprise-rail-footer">
          {onOpenAccount ? (
            <button
              type="button"
              className="enterprise-rail-user"
              onClick={onOpenAccount}
              data-testid="nav-settings"
              aria-label="Open profile"
            >
              <UserAvatar
                user={user ?? { name: null, email: null, image: null }}
                className="enterprise-rail-user-avatar"
                imgClassName="enterprise-rail-user-avatar-img"
                alt=""
              />
              <span className="enterprise-rail-user-copy">
                <span className="enterprise-rail-user-name">{user?.name?.trim() || user?.email || "Profile"}</span>
                <span className="enterprise-rail-user-sub">Personal Account</span>
              </span>
              <svg
                className="enterprise-rail-user-chevron"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </button>
          ) : (
            <Link
              to="/settings"
              className={`enterprise-nav-item${activeNav === "settings" ? " enterprise-nav-item-active" : ""}`}
              data-testid="nav-settings"
            >
              <span className="enterprise-nav-icon">
                <UserAvatar
                  user={user ?? { name: null, email: null, image: null }}
                  className="enterprise-nav-avatar"
                  imgClassName="enterprise-nav-avatar-img"
                  alt="Profile"
                />
              </span>
              <span className="enterprise-nav-label">Profile</span>
            </Link>
          )}
          {onOpenAccount ? null : (
            <button
              type="button"
              className="enterprise-nav-item enterprise-nav-item--button"
              onClick={() => void signOut()}
              disabled={signingOut}
              data-testid="nav-sign-out"
            >
              <span className="enterprise-nav-icon">
                <IconSignOut />
              </span>
              <span className="enterprise-nav-label">Sign out</span>
            </button>
          )}
        </div>
      </aside>
      {topHeader ? (
        <div className="enterprise-shell-right">
          {topHeader}
          {mainColumn}
          {rightDock}
        </div>
      ) : (
        <>
          {mainColumn}
          {rightDock}
        </>
      )}
    </div>
  );
}
