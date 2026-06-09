import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout, type EnterpriseNavId } from "../components/EnterpriseLayout";
import { EnterpriseShellContext, type EnterpriseShellContextValue } from "../contexts/EnterpriseShellContext";
import { fetchWebMe, fetchWebTeams, type WebMeUser, type WebTeamRow } from "../lib/api";
import { pickEnterpriseTeamId, teamsWorkspaceSelectionKey } from "../lib/enterprise-selected-team";
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
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [shellLoadErr, setShellLoadErr] = useState<string | null>(null);
  const [workspaceMainLoading, setWorkspaceMainLoading] = useState(false);
  const [shellMainSuffix, setShellMainSuffix] = useState("");
  const [shellContentSuffix, setShellContentSuffix] = useState("");

  useEffect(() => {
    setWorkspaceMainLoading(false);
    setShellMainSuffix("");
    setShellContentSuffix("");
  }, [location.pathname]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
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
  }, []);

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

  const refreshMeAndTeams = useCallback(async () => {
    const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
    setMe(u);
    setTeams(t ?? []);
    setShellLoadErr(null);
  }, []);

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

  /** Plan page reconciles Stripe into DB; refresh team rows so `hasTeamFeatures` matches the sidebar. */
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
  const topBarWorkspaceName =
    teams !== null && effectiveTeamId ? (teams.find((t) => t.id === effectiveTeamId)?.name ?? null) : null;

  const workspaceOwner =
    teams !== null && !!effectiveTeamId && teams.find((t) => t.id === effectiveTeamId)?.role === "owner";
  /** Treat missing `hasTeamFeatures` as allowed so refetches / first paint never redirect to Chat. */
  const showActivityExecuteNav =
    teams === null ||
    !effectiveTeamId ||
    teams.find((t) => t.id === effectiveTeamId)?.hasTeamFeatures !== false;

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
      path.startsWith("/activity") || path.startsWith("/dashboard") || path.startsWith("/tasks/new");
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
          <DashboardTopBar user={me ?? null} pageTitle={topBarPageTitle} workspaceName={topBarWorkspaceName} />
        }
        mainClassName={mainClassName}
        contentClassName={contentClassName}
        workspaceOverlayLoading={workspaceMainLoading}
        showPlanNav={workspaceOwner}
        showActivityExecuteNav={showActivityExecuteNav}
      >
        <Outlet />
      </EnterpriseLayout>
    </EnterpriseShellContext.Provider>
  );
}
