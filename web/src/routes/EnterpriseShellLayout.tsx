import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout, type AdminNavAccess, type EnterpriseNavId } from "../components/EnterpriseLayout";
import { abilityForAdminPath, firstAdminPath, isStaff, staffCan } from "../lib/staff-access";
import { NoTeamsEmptyState } from "../components/NoTeamsEmptyState";
import { EnterpriseShellContext, type EnterpriseShellContextValue } from "../contexts/EnterpriseShellContext";
import {
  fetchWebMe,
  fetchWebTeams,
  fetchWebTeamSubscription,
  patchApiProfile,
  type WebMeUser,
  type WebTeamRow,
  type WebTeamSubscription,
} from "../lib/api";
import { getBrowserTimeZone } from "../lib/timezone";
import { hasMobileWebPreferred } from "../lib/app-links";
import {
  getPersistedEnterpriseTeamId,
  pickEnterpriseTeamId,
  setPersistedEnterpriseTeamId,
  teamsWorkspaceSelectionKey,
} from "../lib/enterprise-selected-team";
import { isMobileBrowser } from "../lib/mobile-browser";
import { enterpriseTeamNavTitle } from "../lib/enterprise-nav";
import { isKnownEnterpriseWorkspace } from "../lib/enterprise-org";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { AccountPanel } from "../components/AccountPanel";
import { AlenioTopBar } from "../components/AlenioTopBar";
import { ChatDock } from "../components/chat/ChatDock";
import { SenecaFloatingAssistant } from "../components/seneca/SenecaFloatingAssistant";
import { greetingForHour } from "../lib/alenio-go-dashboard";


export type EnterpriseRouteHandle = {
  enterpriseContentClassName?: string;
  enterpriseMainClassName?: string;
};

/** Route-specific shell classes (BrowserRouter has no route `handle`; mirror App routes here). */
function routeLayoutHandleFromPath(pathname: string): EnterpriseRouteHandle {
  if (pathname.startsWith("/go")) {
    return {
      enterpriseContentClassName: "enterprise-content-flush enterprise-content-go",
      enterpriseMainClassName: "enterprise-app--go",
    };
  }
  if (isAlenioPersonalPath(pathname)) {
    return {
      enterpriseContentClassName: "enterprise-content-flush enterprise-content-alenio",
      enterpriseMainClassName: "enterprise-app--alenio",
    };
  }
  return {
    enterpriseContentClassName: "enterprise-content-flush",
  };
}

/** The Alenio (non-Go) web app: white pages, light side bar, no dashboard top bar. */
function isAlenioPersonalPath(pathname: string): boolean {
  return (
    pathname === "/home" ||
    pathname === "/workspace" ||
    pathname.startsWith("/workspace/") ||
    pathname.startsWith("/tasks/") ||
    pathname === "/network" ||
    pathname.startsWith("/people/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/") ||
    pathname === "/seneca" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/profile")
  );
}

function activeNavFromPath(pathname: string): EnterpriseNavId {
  if (pathname.startsWith("/home")) return "home";
  if (pathname === "/discover" || pathname.startsWith("/discover/")) return "discover";
  if (pathname === "/workspace" || pathname.startsWith("/workspace/")) return "workspace";
  if (pathname === "/network" || pathname.startsWith("/people/")) return "network";
  if (pathname.startsWith("/go/org/workspaces")) return "workspaces";
  if (pathname.startsWith("/go/org/users")) return "users";
  if (pathname.startsWith("/go")) return "go";
  if (pathname.startsWith("/billing")) return "plan";
  if (
    pathname.startsWith("/admin/discover") ||
    pathname.startsWith("/admin/home-insights") ||
    pathname.startsWith("/admin/home-workspace")
  ) {
    return "content";
  }
  if (pathname.startsWith("/admin/users")) return "adminUsers";
  if (pathname.startsWith("/admin/workspaces")) return "adminWorkspaces";
  if (pathname.startsWith("/admin/seneca")) return "adminSeneca";
  if (pathname.startsWith("/admin/activity")) return "adminActivity";
  if (pathname.startsWith("/admin/notifications")) return "adminNotifications";
  if (pathname.startsWith("/admin/pricing")) return "adminPricing";
  if (pathname === "/seneca" || pathname.startsWith("/seneca/")) return "seneca";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/settings") || pathname.startsWith("/profile")) return "settings";
  if (pathname.startsWith("/tasks/")) return "workspace";
  return "go";
}

export function EnterpriseShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState(() => getPersistedEnterpriseTeamId());
  const [workspaceAccess, setWorkspaceAccess] = useState<WebTeamSubscription | null>(null);
  const [workspaceAccessLoading, setWorkspaceAccessLoading] = useState(false);
  const [shellLoadErr, setShellLoadErr] = useState<string | null>(null);
  const [workspaceMainLoading, setWorkspaceMainLoading] = useState(false);
  const [shellMainSuffix, setShellMainSuffix] = useState("");
  const [shellContentSuffix, setShellContentSuffix] = useState("");
  useEffect(() => {
    setWorkspaceMainLoading(false);
    setShellMainSuffix("");
    setShellContentSuffix("");
  }, [location.pathname]);

  const syncTimeZoneIfNeeded = useCallback(async (user: WebMeUser | null) => {
    if (!user) return user;
    const browserTz = getBrowserTimeZone();
    if (!user.timezone && browserTz) {
      try {
        const updated = await patchApiProfile({ timezone: browserTz });
        return { ...user, timezone: updated.timezone };
      } catch {
        return user;
      }
    }
    return user;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [rawMe, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
        const u = rawMe ? await syncTimeZoneIfNeeded(rawMe) : rawMe;
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
        setShellLoadErr(null);
      } catch (e) {
        if (cancelled) return;
        setShellLoadErr(e instanceof Error ? e.message : "Could not load.");
        setMe(null);
        setTeams([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncTimeZoneIfNeeded]);

  const teamsWorkspaceKeyRef = useRef("");
  useEffect(() => {
    if (teams === null) return;
    if (!teams.length) {
      teamsWorkspaceKeyRef.current = "";
      // Org admins are often not TeamMembers — keep their selected org workspace.
      setSelectedTeamId((prev) => (isKnownEnterpriseWorkspace(me, teams, prev) ? prev : ""));
      return;
    }
    const nextKey = teamsWorkspaceSelectionKey(teams);
    if (nextKey === teamsWorkspaceKeyRef.current) return;
    teamsWorkspaceKeyRef.current = nextKey;
    setSelectedTeamId((prev) => {
      if (isKnownEnterpriseWorkspace(me, teams, prev)) return prev;
      return pickEnterpriseTeamId(teams, prev);
    });
  }, [teams, me]);

  useEffect(() => {
    if (!selectedTeamId) return;
    if (!isKnownEnterpriseWorkspace(me, teams, selectedTeamId)) return;
    setPersistedEnterpriseTeamId(selectedTeamId);
  }, [selectedTeamId, teams, me]);

  const refreshMeAndTeams = useCallback(async () => {
    const [rawMe, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
    const u = rawMe ? await syncTimeZoneIfNeeded(rawMe) : rawMe;
    setMe(u);
    setTeams(t ?? []);
    setShellLoadErr(null);
  }, [syncTimeZoneIfNeeded]);

  const refreshWorkspaceAccess = useCallback(async () => {
    if (!selectedTeamId) {
      setWorkspaceAccess(null);
      return;
    }
    const access = await fetchWebTeamSubscription(selectedTeamId);
    setWorkspaceAccess(access);
  }, [selectedTeamId]);

  useEffect(() => {
    if (!selectedTeamId || teams === null || !teams.some((team) => team.id === selectedTeamId)) {
      setWorkspaceAccess(null);
      setWorkspaceAccessLoading(false);
      return;
    }
    let cancelled = false;
    setWorkspaceAccess(null);
    setWorkspaceAccessLoading(true);
    void fetchWebTeamSubscription(selectedTeamId)
      .then((access) => {
        if (!cancelled) setWorkspaceAccess(access);
      })
      .catch(() => {
        if (!cancelled) setWorkspaceAccess(null);
      })
      .finally(() => {
        if (!cancelled) setWorkspaceAccessLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId, teams]);

  useEffect(() => {
    const onReadOnly = (event: Event) => {
      const teamId = (event as CustomEvent<{ teamId?: string }>).detail?.teamId;
      if (!teamId || teamId === selectedTeamId) void refreshWorkspaceAccess();
    };
    window.addEventListener("alenio:workspace-read-only", onReadOnly);
    return () => window.removeEventListener("alenio:workspace-read-only", onReadOnly);
  }, [selectedTeamId, refreshWorkspaceAccess]);

  /** Soft-refresh team list after a workspace change — never block the UI overlay on this. */
  const lastTeamRefreshForSelectedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (teams === null) return;
    if (!teams.length || !selectedTeamId) {
      lastTeamRefreshForSelectedIdRef.current = null;
      return;
    }
    if (lastTeamRefreshForSelectedIdRef.current === null) {
      lastTeamRefreshForSelectedIdRef.current = selectedTeamId;
      return;
    }
    if (lastTeamRefreshForSelectedIdRef.current === selectedTeamId) return;
    lastTeamRefreshForSelectedIdRef.current = selectedTeamId;
    void refreshMeAndTeams().catch(() => {
      /* keep current shell state on soft-refresh failure */
    });
  }, [selectedTeamId, teams, refreshMeAndTeams]);

  /** Once per navigation onto /billing — avoids refresh+setTeams thrashing layout redirects. */
  const lastBillingTeamsRefreshRef = useRef<string | null>(null);

  /** Billing page reconciles Stripe into DB; refresh team rows so `hasTeamFeatures` matches the sidebar. */
  useEffect(() => {
    const path = location.pathname;
    if (!path.startsWith("/billing")) {
      lastBillingTeamsRefreshRef.current = null;
      return;
    }
    if (lastBillingTeamsRefreshRef.current === path) return;
    lastBillingTeamsRefreshRef.current = path;
    void refreshMeAndTeams();
  }, [location.pathname, refreshMeAndTeams]);

  const setWorkspaceMainLoadingCb = useCallback((v: boolean) => {
    setWorkspaceMainLoading(v);
  }, []);

  const beginEnterpriseWorkspaceBoot = useCallback((_teamId: string) => {
    /* Full-screen workspace boot was removed. */
  }, []);

  const setShellMainClassSuffix = useCallback((v: string) => {
    setShellMainSuffix(v);
  }, []);

  const setShellContentClassSuffix = useCallback((v: string) => {
    setShellContentSuffix(v);
  }, []);

  const handle = routeLayoutHandleFromPath(location.pathname);

  const mainClassName = [
    handle.enterpriseMainClassName ?? "",
    location.pathname === "/home" ||
    location.pathname === "/workspace" ||
    location.pathname.startsWith("/workspace/") ||
    location.pathname === "/network" ||
    location.pathname.startsWith("/people/") ||
    location.pathname === "/discover" ||
    location.pathname === "/admin/discover" ||
    location.pathname.startsWith("/admin/home-insights") ||
    location.pathname.startsWith("/admin/home-workspace") ||
    location.pathname === "/admin/users"
      ? "enterprise-app--hero-under-topbar"
      : "",
    shellMainSuffix,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const contentClassName = [handle.enterpriseContentClassName ?? "", shellContentSuffix].filter(Boolean).join(" ").trim();

  const activeNav = activeNavFromPath(location.pathname);

  useEffect(() => {
    if (teams === null || me === undefined) return;
    const teamIdFromUrl = new URLSearchParams(location.search).get("teamId")?.trim() ?? "";
    if (!teamIdFromUrl) return;
    if (!isKnownEnterpriseWorkspace(me, teams, teamIdFromUrl)) return;
    if (teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
      setPersistedEnterpriseTeamId(teamIdFromUrl);
    }
  }, [teams, me, location.pathname, location.search, selectedTeamId]);

  /** Resolve workspace before passive effects run pickEnterpriseTeamId — layout effects need this or owners get misclassified briefly. */
  const effectiveTeamId = useMemo(() => {
    if (me === undefined || teams === null) return "";
    if (isKnownEnterpriseWorkspace(me, teams, selectedTeamId)) return selectedTeamId;
    if (!teams.length) return "";
    const picked = pickEnterpriseTeamId(teams, selectedTeamId);
    return picked && teams.some((t) => t.id === picked) ? picked : "";
  }, [teams, selectedTeamId, me]);

  const workspaceOwner =
    teams !== null && !!effectiveTeamId && teams.find((t) => t.id === effectiveTeamId)?.role === "owner";
  const workspaceRole =
    teams !== null && effectiveTeamId ? teams.find((t) => t.id === effectiveTeamId)?.role : undefined;
  const teamNavLabel = enterpriseTeamNavTitle(workspaceRole);
  const viewerName = (me?.name ?? me?.email ?? "there").trim().split(/\s+/)[0] || "there";
  const goNavLabel = "Alenio Go";
  const topBarPageTitle = `${greetingForHour(new Date().getHours())}, ${viewerName} 👋`;
  const hasNoTeams = teams !== null && teams.length === 0;
  const isSettingsRoute =
    location.pathname.startsWith("/settings") || location.pathname.startsWith("/profile");
  const isAdminRoute = location.pathname.startsWith("/admin");
  const showAdminNav = false;
  const showDiscoverNav = isStaff(me);
  const adminNav: AdminNavAccess = {
    users: staffCan(me, "users.view"),
    workspaces: staffCan(me, "teams.view"),
    content: staffCan(me, "content.view"),
    seneca: staffCan(me, "seneca.view"),
    activity: staffCan(me, "activity.view"),
    notifications: staffCan(me, "notifications.view"),
    pricing: staffCan(me, "pricing.manage"),
  };
  const personalHome = isAlenioPersonalPath(location.pathname);
  const showNoTeamsEmptyState = hasNoTeams && !isSettingsRoute && !isAdminRoute && !personalHome;
  /**
   * Alenio Go: Operations workspaces only (never during self-serve no-workspace setup).
   */
  const showGoNav =
    teams !== null &&
    !!effectiveTeamId &&
    (workspaceAccess?.teamId === effectiveTeamId
      ? workspaceAccess.hasGoFeatures
      : teams.find((t) => t.id === effectiveTeamId)?.hasGoFeatures === true);
  const showPlanNav = workspaceOwner && !hasNoTeams;

  /** Account panel (photo, name, time zone, calendar, sign out). Outlook returns here with ?outlook=. */
  const [accountOpen, setAccountOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has("outlook")) setAccountOpen(true);
  }, [location.search]);

  /** Phone browsers should use the native app unless the user chose web explicitly. */
  useLayoutEffect(() => {
    if (!isMobileBrowser() || hasMobileWebPreferred()) return;
    navigate("/get-app", { replace: true });
  }, [navigate]);

  /** Plan / billing is owner-only; Go requires Operations; Admin is platform-admin-only. */
  useLayoutEffect(() => {
    if (teams === null || me === undefined) return;
    const path = location.pathname;
    if (path.startsWith("/admin")) {
      if (!isStaff(me)) {
        navigate("/settings", { replace: true });
        return;
      }
      // A staff role that can't open this page lands on the first one it can.
      const needed = abilityForAdminPath(path);
      if (needed && !staffCan(me, needed)) navigate(firstAdminPath(me) ?? "/settings", { replace: true });
      return;
    }
    if (path.startsWith("/billing")) {
      if (!workspaceOwner && effectiveTeamId) {
        navigate("/settings", { replace: true });
      }
      return;
    }
    if (path.startsWith("/go") && !hasNoTeams && !showGoNav) {
      navigate("/settings", { replace: true });
      return;
    }
  }, [
    teams,
    location.pathname,
    workspaceOwner,
    showGoNav,
    effectiveTeamId,
    navigate,
    hasNoTeams,
    me,
  ]);

  const contextValue = useMemo<EnterpriseShellContextValue>(
    () => ({
      me,
      setMe,
      teams,
      setTeams,
      selectedTeamId,
      setSelectedTeamId,
      workspaceAccess,
      workspaceAccessLoading,
      refreshWorkspaceAccess,
      setWorkspaceMainLoading: setWorkspaceMainLoadingCb,
      beginEnterpriseWorkspaceBoot,
      refreshMeAndTeams,
      setShellMainClassSuffix,
      setShellContentClassSuffix,
    }),
    [
      me,
      teams,
      selectedTeamId,
      workspaceAccess,
      workspaceAccessLoading,
      refreshWorkspaceAccess,
      setWorkspaceMainLoadingCb,
      beginEnterpriseWorkspaceBoot,
      refreshMeAndTeams,
      setShellMainClassSuffix,
      setShellContentClassSuffix,
    ],
  );

  if (shellLoadErr) {
    const looksUnauthorized = /unauthorized|unauthenticated|session/i.test(
      shellLoadErr,
    );
    if (looksUnauthorized) {
      return <Navigate to="/login?reason=session" replace />;
    }
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-content" style={{ padding: 24 }}>
          <p className="enterprise-muted">{shellLoadErr}</p>
          <button
            type="button"
            className="enterprise-button"
            style={{ marginTop: 16 }}
            onClick={() => navigate("/login", { replace: true })}
          >
            Back to sign in
          </button>
        </main>
      </div>
    );
  }

  const shellSelectedTeamId = isKnownEnterpriseWorkspace(me, teams, selectedTeamId)
    ? selectedTeamId
    : effectiveTeamId;
  const isReadOnly = workspaceAccess?.accessMode === "read_only";

  const onSenecaFullPage =
    location.pathname === "/seneca" || location.pathname.startsWith("/seneca/");
  const showSenecaAssistant = Boolean(me) && !onSenecaFullPage && !location.pathname.startsWith("/go");

  return (
    <EnterpriseShellContext.Provider value={contextValue}>
      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} />
      <SenecaFloatingAssistant visible={showSenecaAssistant} />
      <EnterpriseLayout
        activeNav={activeNav}
        teams={teams ?? []}
        selectedTeamId={shellSelectedTeamId}
        onTeamChange={setSelectedTeamId}
        user={me ?? null}
        onSignOutNavigate={(path) => navigate(path)}
        topBar={
          personalHome ? null : (
          <DashboardTopBar
            user={me ?? null}
            pageTitle={topBarPageTitle}
            selectedTeamId={shellSelectedTeamId}
            workspaceCallout={
              isReadOnly && workspaceAccess?.teamId === shellSelectedTeamId
                ? { kind: "read_only", canChoosePlan: workspaceOwner }
                : null
            }
          />
          )
        }
        mainClassName={mainClassName}
        contentClassName={contentClassName}
        workspaceOverlayLoading={workspaceMainLoading}
        showPlanNav={showPlanNav}
        showGoNav={showGoNav}
        goNavLabel={goNavLabel}
        goNavTo="/go"
        showEnterpriseOrgNav={false}
        showAdminNav={showAdminNav}
        showDiscoverNav={showDiscoverNav}
        adminNav={adminNav}
        teamNavLabel={teamNavLabel}
        setupNavMode={hasNoTeams}
        onEnterpriseWorkspaceBoot={undefined}
        onOpenAccount={personalHome ? () => setAccountOpen(true) : undefined}
        rightDock={personalHome && me ? <ChatDock /> : null}
        topHeader={
          personalHome && me ? (
            <AlenioTopBar
              user={me}
              onOpenAccount={() => setAccountOpen(true)}
            />
          ) : null
        }
      >
        {teams === null ? (
          <EnterprisePageLoading label="Loading your workspace" />
        ) : showNoTeamsEmptyState ? (
          <div className="chat-app-body chat-app-body-enterprise chat-app-body-no-teams enterprise-tab-shell">
            <NoTeamsEmptyState onRefreshWorkspaces={refreshMeAndTeams} />
          </div>
        ) : (
          <Outlet />
        )}
      </EnterpriseLayout>
    </EnterpriseShellContext.Provider>
  );
}
