import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout, type EnterpriseNavId } from "../components/EnterpriseLayout";
import { NoTeamsEmptyState } from "../components/NoTeamsEmptyState";
import { EnterpriseShellContext, type EnterpriseShellContextValue } from "../contexts/EnterpriseShellContext";
import { fetchWebMe, fetchWebTeams, patchApiProfile, type WebMeUser, type WebTeamRow } from "../lib/api";
import { getBrowserTimeZone } from "../lib/timezone";
import { hasMobileWebPreferred } from "../lib/app-links";
import { getPersistedEnterpriseTeamId, pickEnterpriseTeamId, resolveEnterpriseTeamId, setPersistedEnterpriseTeamId, teamsWorkspaceSelectionKey } from "../lib/enterprise-selected-team";
import { isMobileBrowser } from "../lib/mobile-browser";
import { enterpriseNavTitle } from "../lib/enterprise-nav";
import { SenecaFloatingLauncher } from "../components/seneca/SenecaFloatingLauncher";

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
    const teamIdFromUrl = new URLSearchParams(location.search).get("teamId")?.trim() ?? "";
    if (!teamIdFromUrl) return;
    const resolved = resolveEnterpriseTeamId(teams, { teamIdFromUrl }, selectedTeamId);
    if (resolved && resolved !== selectedTeamId) {
      setSelectedTeamId(resolved);
      setPersistedEnterpriseTeamId(resolved);
    }
  }, [teams, location.search, selectedTeamId]);

  /** Resolve workspace before passive effects run pickEnterpriseTeamId — layout effects need this or owners get misclassified briefly. */
  const effectiveTeamId = useMemo(() => {
    if (teams === null || !teams.length) return "";
    const inList = selectedTeamId && teams.some((t) => t.id === selectedTeamId) ? selectedTeamId : "";
    const picked = inList || pickEnterpriseTeamId(teams, selectedTeamId);
    return picked && teams.some((t) => t.id === picked) ? picked : "";
  }, [teams, selectedTeamId]);

  const topBarPageTitle = enterpriseNavTitle(activeNav);
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
  /** Alenio Go only on Operations — missing flag means hidden (safer default). */
  const showGoNav =
    teams !== null &&
    !!effectiveTeamId &&
    teams.find((t) => t.id === effectiveTeamId)?.hasGoFeatures === true;

  /** Phone browsers should use the native app unless the user chose web explicitly. */
  useLayoutEffect(() => {
    if (!isMobileBrowser() || hasMobileWebPreferred()) return;
    navigate("/get-app", { replace: true });
  }, [navigate]);

  /** Plan / billing is owner-only; Workspace requires Pro+; Go requires Operations. */
  useLayoutEffect(() => {
    if (teams === null) return;
    const path = location.pathname;
    if (path.startsWith("/billing")) {
      if (!workspaceOwner && effectiveTeamId) {
        navigate("/dashboard", { replace: true });
      }
      return;
    }
    if (path.startsWith("/go") && !showGoNav && path !== "/chat") {
      navigate(showActivityExecuteNav ? "/dashboard" : "/chat", { replace: true });
      return;
    }
    const isTeamGatedShellRoute = path.startsWith("/dashboard") || path.startsWith("/tasks/new");
    if (isTeamGatedShellRoute && !showActivityExecuteNav && path !== "/chat") {
      navigate("/chat", { replace: true });
    }
  }, [teams, location.pathname, workspaceOwner, showActivityExecuteNav, showGoNav, effectiveTeamId, navigate]);

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
          />
        }
        mainClassName={mainClassName}
        contentClassName={contentClassName}
        workspaceOverlayLoading={workspaceMainLoading}
        showPlanNav={workspaceOwner}
        showActivityExecuteNav={showActivityExecuteNav}
        showGoNav={showGoNav}
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
        {teams !== null &&
        (teams.find((t) => t.id === effectiveTeamId)?.role === "owner" ||
          teams.find((t) => t.id === effectiveTeamId)?.role === "team_leader") ? (
          <SenecaFloatingLauncher />
        ) : null}
      </EnterpriseLayout>
    </EnterpriseShellContext.Provider>
  );
}
