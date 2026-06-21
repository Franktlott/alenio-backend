import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { GoWorkspaceHeaderInfo } from "../components/checklists/GoWorkspaceHeaderInfo";
import { EnterpriseLayout, type EnterpriseNavId } from "../components/EnterpriseLayout";
import { NoTeamsEmptyState } from "../components/NoTeamsEmptyState";
import { EnterpriseShellContext, type EnterpriseShellContextValue } from "../contexts/EnterpriseShellContext";
import { fetchChecklistLocations, fetchWebMe, fetchWebTeams, patchApiProfile, type WebMeUser, type WebTeamRow } from "../lib/api";
import { isIpadRecentlyActive, latestSubmissionAt } from "../lib/go-dashboard-utils";
import { queryKeys } from "../lib/query-keys";
import { getBrowserTimeZone } from "../lib/timezone";
import { hasMobileWebPreferred } from "../lib/app-links";
import { getPersistedEnterpriseTeamId, pickEnterpriseTeamId, setPersistedEnterpriseTeamId, teamsWorkspaceSelectionKey } from "../lib/enterprise-selected-team";
import { isMobileBrowser } from "../lib/mobile-browser";
import { enterpriseNavTitle } from "../lib/enterprise-nav";

export type EnterpriseRouteHandle = {
  enterpriseContentClassName?: string;
  enterpriseMainClassName?: string;
};

/** Route-specific shell classes (BrowserRouter has no route `handle`; mirror App routes here). */
function routeLayoutHandleFromPath(_pathname: string): EnterpriseRouteHandle {
  return {
    enterpriseContentClassName: "enterprise-content-flush",
  };
}

function activeNavFromPath(pathname: string): EnterpriseNavId {
  if (pathname.startsWith("/activity")) return "activity";
  if (pathname.startsWith("/chat")) return "chat";
  if (pathname.startsWith("/go")) return "go";
  if (pathname.startsWith("/billing")) return "plan";
  if (pathname.startsWith("/team")) return "team";
  if (pathname.startsWith("/profile")) return "profile";
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

  /** Refetch teams when the selected workspace id changes (not when the same id gets a new `teams` array). */
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
    let cancelled = false;
    setWorkspaceMainLoading(true);
    void refreshMeAndTeams().finally(() => {
      if (!cancelled) setWorkspaceMainLoading(false);
    });
    return () => {
      cancelled = true;
    };
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

  /** Resolve workspace before passive effects run pickEnterpriseTeamId — layout effects need this or owners get misclassified briefly. */
  const effectiveTeamId = useMemo(() => {
    if (teams === null || !teams.length) return "";
    const inList = selectedTeamId && teams.some((t) => t.id === selectedTeamId) ? selectedTeamId : "";
    const picked = inList || pickEnterpriseTeamId(teams, selectedTeamId);
    return picked && teams.some((t) => t.id === picked) ? picked : "";
  }, [teams, selectedTeamId]);

  const topBarPageTitle = enterpriseNavTitle(activeNav);
  const selectedTeam = teams?.find((t) => t.id === effectiveTeamId) ?? null;
  const goRoleLabel =
    selectedTeam?.role === "owner"
      ? "Owner"
      : selectedTeam?.role === "team_leader"
        ? "Manager"
        : selectedTeam?.role === "admin"
          ? "Admin"
          : selectedTeam
            ? "Member"
            : undefined;

  const goListQuery = useQuery({
    queryKey: queryKeys.checklistLocations(effectiveTeamId),
    queryFn: () => fetchChecklistLocations(effectiveTeamId),
    enabled: activeNav === "go" && !!effectiveTeamId,
    refetchInterval: 8000,
  });
  const goHubToken = goListQuery.data?.hubToken ?? null;
  const goActiveChecklists = useMemo(
    () => (goListQuery.data?.locations ?? []).filter((l) => l.isActive),
    [goListQuery.data?.locations],
  );
  const goLastDeviceActivity = useMemo(
    () => latestSubmissionAt(goListQuery.data?.recentSubmissions ?? []),
    [goListQuery.data?.recentSubmissions],
  );
  const goIpadConnected = isIpadRecentlyActive(goLastDeviceActivity);
  const hasNoTeams = teams !== null && teams.length === 0;
  const isProfileRoute = location.pathname.startsWith("/profile");
  const showNoTeamsEmptyState = hasNoTeams && !isProfileRoute;

  const workspaceOwner =
    teams !== null && !!effectiveTeamId && teams.find((t) => t.id === effectiveTeamId)?.role === "owner";
  /** Treat missing `hasTeamFeatures` as allowed so refetches / first paint never redirect to Chat. */
  const showActivityExecuteNav =
    teams === null ||
    !effectiveTeamId ||
    teams.find((t) => t.id === effectiveTeamId)?.hasTeamFeatures !== false;

  /** Phone browsers should use the native app unless the user chose web explicitly. */
  useLayoutEffect(() => {
    if (!isMobileBrowser() || hasMobileWebPreferred()) return;
    navigate("/get-app", { replace: true });
  }, [navigate]);

  /** Plan / billing is owner-only; Activity / Workspace require Team plan. Runs in layout effect so URL settles before paint (avoids replaceState thrash with Chat sync). */
  useLayoutEffect(() => {
    if (teams === null) return;
    const path = location.pathname;
    if (path.startsWith("/billing")) {
      if (!workspaceOwner && effectiveTeamId) {
        navigate("/dashboard", { replace: true });
      }
      return;
    }
    const isTeamGatedShellRoute =
      path.startsWith("/activity") ||
      path.startsWith("/dashboard") ||
      path.startsWith("/go") ||
      path.startsWith("/tasks/new");
    if (isTeamGatedShellRoute && !showActivityExecuteNav && path !== "/chat") {
      navigate("/chat", { replace: true });
    }
  }, [teams, location.pathname, workspaceOwner, showActivityExecuteNav, effectiveTeamId, navigate]);

  const contextValue = useMemo<EnterpriseShellContextValue>(
    () => ({
      me,
      setMe,
      teams,
      setTeams,
      selectedTeamId,
      setSelectedTeamId,
      setWorkspaceMainLoading: setWorkspaceMainLoadingCb,
      refreshMeAndTeams,
      setShellMainClassSuffix,
      setShellContentClassSuffix,
    }),
    [
      me,
      teams,
      selectedTeamId,
      setWorkspaceMainLoadingCb,
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

  return (
    <EnterpriseShellContext.Provider value={contextValue}>
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
            selectedTeamId={teams?.some((t) => t.id === selectedTeamId) ? selectedTeamId : effectiveTeamId}
            variant={activeNav === "go" ? "go" : "default"}
            roleLabel={activeNav === "go" ? goRoleLabel : undefined}
            actionsPrefix={
              activeNav === "go" && effectiveTeamId ? (
                <GoWorkspaceHeaderInfo
                  teamName={selectedTeam?.name}
                  teamImage={selectedTeam?.image}
                  hubToken={goHubToken}
                  ipadConnected={goIpadConnected}
                  checklistCount={goActiveChecklists.length}
                  lastSeen={goLastDeviceActivity}
                />
              ) : undefined
            }
            brandHeader={
              activeNav === "go" ? (
                <div className="enterprise-topbar-go-brand">
                  <AlenioGoLogo variant="dashboard" className="enterprise-topbar-go-logo" />
                  <div className="enterprise-topbar-go-copy">
                    <p className="enterprise-topbar-go-headline">Frontline execution, made simple.</p>
                    <p className="enterprise-topbar-go-sub">Create, assign, and track checklists across all your locations.</p>
                  </div>
                </div>
              ) : undefined
            }
          />
        }
        mainClassName={mainClassName}
        contentClassName={contentClassName}
        workspaceOverlayLoading={workspaceMainLoading}
        showPlanNav={workspaceOwner}
        showActivityExecuteNav={showActivityExecuteNav}
      >
        {teams === null ? (
          <div className="enterprise-tab-shell">
            <p className="enterprise-muted">Loading…</p>
          </div>
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
