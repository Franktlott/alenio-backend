import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AuthLoadingScreen,
  ENTERPRISE_WORKSPACE_LOADING_STEPS,
} from "../components/AuthLoadingScreen";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout, type EnterpriseNavId } from "../components/EnterpriseLayout";
import { NoTeamsEmptyState } from "../components/NoTeamsEmptyState";
import { EnterpriseShellContext, type EnterpriseShellContextValue } from "../contexts/EnterpriseShellContext";
import { fetchWebMe, fetchWebTeams, patchApiProfile, type WebMeUser, type WebTeamRow } from "../lib/api";
import { getBrowserTimeZone } from "../lib/timezone";
import { hasMobileWebPreferred } from "../lib/app-links";
import { getPersistedEnterpriseTeamId, pickEnterpriseTeamId, resolveEnterpriseTeamId, setPersistedEnterpriseTeamId, teamsWorkspaceSelectionKey } from "../lib/enterprise-selected-team";
import { isMobileBrowser } from "../lib/mobile-browser";
import { enterpriseNavTitle, enterpriseTeamNavTitle } from "../lib/enterprise-nav";
import { enterpriseOrgTeams, isEnterpriseOrgAdmin, isEnterpriseOrgMember } from "../lib/enterprise-org";
import { SenecaFloatingLauncher } from "../components/seneca/SenecaFloatingLauncher";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { greetingForHour } from "../lib/alenio-go-dashboard";

const WORKSPACE_BOOT_STEP_MS = 700;
const WORKSPACE_BOOT_MIN_MS = 2000;
const WORKSPACE_BOOT_MAX_MS = 6500;
const WORKSPACE_BOOT_EXIT_MS = 320;
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
  return {
    enterpriseContentClassName: "enterprise-content-flush",
  };
}

function activeNavFromPath(pathname: string): EnterpriseNavId {
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/go")) return "go";
  if (pathname.startsWith("/billing")) return "plan";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/admin")) return "admin";
  if (pathname.startsWith("/settings") || pathname.startsWith("/profile")) return "settings";
  if (pathname.startsWith("/tasks")) return "execute";
  return "execute";
}

export function EnterpriseShellLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState(() => getPersistedEnterpriseTeamId());
  const [shellLoadErr, setShellLoadErr] = useState<string | null>(null);
  const [workspaceMainLoading, setWorkspaceMainLoading] = useState(false);
  const [shellMainSuffix, setShellMainSuffix] = useState("");
  const [shellContentSuffix, setShellContentSuffix] = useState("");
  const [workspaceBoot, setWorkspaceBoot] = useState<{ teamId: string; startedAt: number } | null>(null);
  const [bootActiveIndex, setBootActiveIndex] = useState(0);
  const [bootAllDone, setBootAllDone] = useState(false);
  const [bootExiting, setBootExiting] = useState(false);
  const [bootTabsReady, setBootTabsReady] = useState(false);
  const [bootRefreshDone, setBootRefreshDone] = useState(false);
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
    if (!teams?.length) {
      teamsWorkspaceKeyRef.current = "";
      setSelectedTeamId("");
      return;
    }
    const nextKey = teamsWorkspaceSelectionKey(teams);
    if (nextKey === teamsWorkspaceKeyRef.current) return;
    teamsWorkspaceKeyRef.current = nextKey;
    setSelectedTeamId((prev) => pickEnterpriseTeamId(teams, prev));
  }, [teams]);

  useEffect(() => {
    if (!selectedTeamId) return;
    if (teams !== null && !teams.some((t) => t.id === selectedTeamId)) return;
    setPersistedEnterpriseTeamId(selectedTeamId);
  }, [selectedTeamId, teams]);

  const refreshMeAndTeams = useCallback(async () => {
    const [rawMe, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
    const u = rawMe ? await syncTimeZoneIfNeeded(rawMe) : rawMe;
    setMe(u);
    setTeams(t ?? []);
    setShellLoadErr(null);
  }, [syncTimeZoneIfNeeded]);

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

  const beginEnterpriseWorkspaceBoot = useCallback((teamId: string) => {
    const id = teamId.trim();
    if (!id) return;
    setBootRefreshDone(false);
    setBootActiveIndex(0);
    setBootAllDone(false);
    setBootExiting(false);
    setBootTabsReady(false);
    setWorkspaceBoot({ teamId: id, startedAt: Date.now() });
  }, []);

  /** Animate SSO-style checklist while an enterprise workspace boots. */
  useEffect(() => {
    if (!workspaceBoot) return;
    const timers: number[] = [];
    ENTERPRISE_WORKSPACE_LOADING_STEPS.forEach((_, index) => {
      if (index === 0) return;
      timers.push(
        window.setTimeout(() => {
          setBootActiveIndex(index);
        }, WORKSPACE_BOOT_STEP_MS * index),
      );
    });
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [workspaceBoot]);

  /** Refresh membership/feature flags so sidebar tabs match the opened workspace. */
  useEffect(() => {
    if (!workspaceBoot) return;
    let cancelled = false;
    void refreshMeAndTeams()
      .catch(() => {
        /* keep current shell state */
      })
      .finally(() => {
        if (!cancelled) setBootRefreshDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceBoot, refreshMeAndTeams]);

  const setShellMainClassSuffix = useCallback((v: string) => {
    setShellMainSuffix(v);
  }, []);

  const setShellContentClassSuffix = useCallback((v: string) => {
    setShellContentSuffix(v);
  }, []);

  const handle = routeLayoutHandleFromPath(location.pathname);

  const mainClassName = [handle.enterpriseMainClassName ?? "", shellMainSuffix].filter(Boolean).join(" ").trim();
  const contentClassName = [handle.enterpriseContentClassName ?? "", shellContentSuffix].filter(Boolean).join(" ").trim();

  const activeNav = activeNavFromPath(location.pathname);

  useEffect(() => {
    if (!teams?.length) return;
    // Chat's teamId identifies the conversation being viewed, not the user's
    // globally selected workspace.
    if (location.pathname.startsWith("/chat")) return;
    const teamIdFromUrl = new URLSearchParams(location.search).get("teamId")?.trim() ?? "";
    if (!teamIdFromUrl) return;
    const resolved = resolveEnterpriseTeamId(teams, { teamIdFromUrl }, selectedTeamId);
    if (resolved && resolved !== selectedTeamId) {
      setSelectedTeamId(resolved);
      setPersistedEnterpriseTeamId(resolved);
    }
  }, [teams, location.pathname, location.search, selectedTeamId]);

  /** Resolve workspace before passive effects run pickEnterpriseTeamId — layout effects need this or owners get misclassified briefly. */
  const effectiveTeamId = useMemo(() => {
    if (teams === null || !teams.length) return "";
    const inList = selectedTeamId && teams.some((t) => t.id === selectedTeamId) ? selectedTeamId : "";
    const picked = inList || pickEnterpriseTeamId(teams, selectedTeamId);
    return picked && teams.some((t) => t.id === picked) ? picked : "";
  }, [teams, selectedTeamId]);

  const workspaceOwner =
    teams !== null && !!effectiveTeamId && teams.find((t) => t.id === effectiveTeamId)?.role === "owner";
  const workspaceRole =
    teams !== null && effectiveTeamId ? teams.find((t) => t.id === effectiveTeamId)?.role : undefined;
  const teamNavLabel = enterpriseTeamNavTitle(workspaceRole);
  const viewerName = (me?.name ?? me?.email ?? "there").trim().split(/\s+/)[0] || "there";
  const enterpriseMember = isEnterpriseOrgMember(me);
  const enterpriseOrgAdmin = isEnterpriseOrgAdmin(me);
  const goNavLabel = enterpriseOrgAdmin ? "Dashboard" : "Alenio Go";
  const topBarPageTitle = `${greetingForHour(new Date().getHours())}, ${viewerName} 👋`;
  const topBarPageSubtitle =
    activeNav === "team"
      ? "Review goals and what’s next for this teammate."
      : activeNav === "chat"
        ? undefined
        : activeNav === "go" && enterpriseOrgAdmin
          ? "Enterprise Dashboard"
          : enterpriseNavTitle(activeNav);
  const hasNoTeams = teams !== null && teams.length === 0;
  const isSettingsRoute =
    location.pathname.startsWith("/settings") || location.pathname.startsWith("/profile");
  const isAdminRoute = location.pathname.startsWith("/admin");
  const isGoRoute = location.pathname.startsWith("/go");
  const showAdminNav = me?.isAdmin === true;
  /** Self-serve users without a workspace see setup. Enterprise customers skip it — they use org Go. */
  const showNoTeamsEmptyState =
    hasNoTeams && !enterpriseMember && !isSettingsRoute && !isAdminRoute;
  /** Treat missing `hasTeamFeatures` as allowed so refetches / first paint never redirect to Chat. */
  const showActivityExecuteNav =
    teams === null ||
    !effectiveTeamId ||
    teams.find((t) => t.id === effectiveTeamId)?.hasTeamFeatures !== false;
  /**
   * Alenio Go: enterprise org members always; otherwise Operations workspace or no-team setup.
   */
  const showGoNav =
    enterpriseMember ||
    hasNoTeams ||
    (teams !== null &&
      !!effectiveTeamId &&
      teams.find((t) => t.id === effectiveTeamId)?.hasGoFeatures === true);

  /** Phone browsers should use the native app unless the user chose web explicitly. */
  useLayoutEffect(() => {
    if (!isMobileBrowser() || hasMobileWebPreferred()) return;
    navigate("/get-app", { replace: true });
  }, [navigate]);

  /** Enterprise customers land in Alenio Go instead of workspace create/join. */
  useLayoutEffect(() => {
    if (teams === null || me === undefined) return;
    if (!enterpriseMember || !hasNoTeams) return;
    if (isSettingsRoute || isAdminRoute || isGoRoute) return;
    navigate("/go", { replace: true });
  }, [
    teams,
    me,
    enterpriseMember,
    hasNoTeams,
    isSettingsRoute,
    isAdminRoute,
    isGoRoute,
    navigate,
  ]);

  /** Plan / billing is owner-only; Workspace requires Pro+; Go requires Operations; Admin is platform-admin-only. */
  useLayoutEffect(() => {
    if (teams === null) return;
    const path = location.pathname;
    if (path.startsWith("/admin")) {
      if (me !== undefined && me?.isAdmin !== true) {
        navigate(enterpriseMember ? "/go" : "/dashboard", { replace: true });
      }
      return;
    }
    if (path.startsWith("/billing")) {
      if (!workspaceOwner && effectiveTeamId) {
        navigate(enterpriseMember ? "/go" : "/dashboard", { replace: true });
      }
      return;
    }
    if (path.startsWith("/go") && !showGoNav && path !== "/chat") {
      navigate(showActivityExecuteNav ? "/dashboard" : "/chat", { replace: true });
      return;
    }
    const isTeamGatedShellRoute = path.startsWith("/dashboard") || path.startsWith("/tasks/new");
    if (isTeamGatedShellRoute && !showActivityExecuteNav && path !== "/chat") {
      navigate(enterpriseMember ? "/go" : "/chat", { replace: true });
    }
  }, [
    teams,
    location.pathname,
    workspaceOwner,
    showActivityExecuteNav,
    showGoNav,
    effectiveTeamId,
    navigate,
    me,
    enterpriseMember,
  ]);

  /** Hold SSO boot until workspace selection + allowed nav tabs have settled. */
  useEffect(() => {
    if (!workspaceBoot) return;
    if (me === undefined || teams === null) return;
    if (selectedTeamId !== workspaceBoot.teamId) return;
    if (!bootRefreshDone) return;

    const knownInPersonal = teams.some((t) => t.id === workspaceBoot.teamId);
    const knownInOrg = enterpriseOrgTeams(me).some((t) => t.id === workspaceBoot.teamId);
    if (!knownInPersonal && !knownInOrg) return;

    const id = window.setTimeout(() => setBootTabsReady(true), 40);
    return () => window.clearTimeout(id);
  }, [
    workspaceBoot,
    me,
    teams,
    selectedTeamId,
    bootRefreshDone,
    showGoNav,
    showActivityExecuteNav,
    showPlanNav,
    teamNavLabel,
    goNavLabel,
  ]);

  useEffect(() => {
    if (!workspaceBoot || !bootTabsReady || bootExiting) return;
    const elapsed = Date.now() - workspaceBoot.startedAt;
    const remaining = Math.max(WORKSPACE_BOOT_MIN_MS - elapsed, 0);
    const id = window.setTimeout(() => {
      setBootAllDone(true);
      setBootExiting(true);
    }, remaining);
    return () => window.clearTimeout(id);
  }, [workspaceBoot, bootTabsReady, bootExiting]);

  useEffect(() => {
    if (!workspaceBoot || !bootExiting) return;
    const id = window.setTimeout(() => {
      setWorkspaceBoot(null);
      setBootAllDone(false);
      setBootExiting(false);
      setBootTabsReady(false);
      setBootActiveIndex(0);
    }, WORKSPACE_BOOT_EXIT_MS);
    return () => window.clearTimeout(id);
  }, [workspaceBoot, bootExiting]);

  useEffect(() => {
    if (!workspaceBoot) return;
    const id = window.setTimeout(() => {
      setBootAllDone(true);
      setBootExiting(true);
    }, WORKSPACE_BOOT_MAX_MS);
    return () => window.clearTimeout(id);
  }, [workspaceBoot]);

  const contextValue = useMemo<EnterpriseShellContextValue>(
    () => ({
      me,
      setMe,
      teams,
      setTeams,
      selectedTeamId,
      setSelectedTeamId,
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
      setWorkspaceMainLoadingCb,
      beginEnterpriseWorkspaceBoot,
      refreshMeAndTeams,
      setShellMainClassSuffix,
      setShellContentClassSuffix,
    ],
  );

  if (shellLoadErr) {
    return (
      <div className="enterprise-app enterprise-app-simple">
        <main className="enterprise-content" style={{ padding: 24 }}>
          <p className="enterprise-muted">{shellLoadErr}</p>
        </main>
      </div>
    );
  }

  const showEnterpriseSsoBoot =
    Boolean(workspaceBoot) || me === undefined || (enterpriseMember && teams === null);

  return (
    <EnterpriseShellContext.Provider value={contextValue}>
      {showEnterpriseSsoBoot ? (
        <AuthLoadingScreen
          overlay
          title={workspaceBoot ? "Opening workspace" : "Connecting your workspace"}
          subtitle={
            workspaceBoot
              ? "Updating navigation for this workspace"
              : "Preparing your enterprise dashboard"
          }
          steps={ENTERPRISE_WORKSPACE_LOADING_STEPS}
          activeIndex={bootActiveIndex}
          allDone={bootAllDone || (!workspaceBoot && teams !== null && me !== undefined)}
          exiting={bootExiting}
          testId="enterprise-workspace-boot-screen"
        />
      ) : null}
      <EnterpriseLayout
        activeNav={activeNav}
        teams={teams ?? []}
        selectedTeamId={teams?.some((t) => t.id === selectedTeamId) ? selectedTeamId : ""}
        onTeamChange={setSelectedTeamId}
        user={me ?? null}
        onSignOutNavigate={(path) => navigate(path)}
        topBar={
          <DashboardTopBar
            user={me ?? null}
            pageTitle={topBarPageTitle}
            pageSubtitle={topBarPageSubtitle}
            selectedTeamId={teams?.some((t) => t.id === selectedTeamId) ? selectedTeamId : effectiveTeamId}
          />
        }
        mainClassName={mainClassName}
        contentClassName={contentClassName}
        workspaceOverlayLoading={workspaceMainLoading}
        showPlanNav={workspaceOwner && !hasNoTeams}
        showActivityExecuteNav={showActivityExecuteNav && !hasNoTeams}
        showGoNav={showGoNav}
        goNavLabel={goNavLabel}
        showAdminNav={showAdminNav}
        teamNavLabel={teamNavLabel}
        setupNavMode={hasNoTeams}
        onEnterpriseWorkspaceBoot={enterpriseMember ? beginEnterpriseWorkspaceBoot : undefined}
      >
        {teams === null ? (
          enterpriseMember || me === undefined ? null : (
            <EnterprisePageLoading label="Loading your workspace" />
          )
        ) : showNoTeamsEmptyState ? (
          <div className="chat-app-body chat-app-body-enterprise chat-app-body-no-teams enterprise-tab-shell">
            <NoTeamsEmptyState onRefreshWorkspaces={refreshMeAndTeams} />
          </div>
        ) : (
          <Outlet />
        )}
        {teams !== null &&
        (teams.find((t) => t.id === effectiveTeamId)?.role === "owner" ||
          teams.find((t) => t.id === effectiveTeamId)?.role === "team_leader") ? (
          <SenecaFloatingLauncher />
        ) : null}
      </EnterpriseLayout>
    </EnterpriseShellContext.Provider>
  );
}
