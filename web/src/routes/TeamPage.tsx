import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import { TeamTabPanel } from "../components/TeamTabPanel";
import { fetchWebMe, fetchWebTeams, type WebMeUser, type WebTeamRow } from "../lib/api";

export function TeamPage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<WebMeUser | null | undefined>(undefined);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const refreshTeamsList = useCallback(async () => {
    try {
      const t = await fetchWebTeams();
      setTeams(t ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, t] = await Promise.all([fetchWebMe(), fetchWebTeams()]);
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
        setLoadErr(null);
      } catch (e) {
        if (cancelled) return;
        setLoadErr(e instanceof Error ? e.message : "Could not load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teams?.length) {
      setSelectedTeamId("");
      return;
    }
    setSelectedTeamId((prev) => {
      if (prev && teams.some((t) => t.id === prev)) return prev;
      return teams[0]!.id;
    });
  }, [teams]);

  if (loadErr) {
    return (
      <div className="enterprise-app">
        <main className="enterprise-content" style={{ padding: 24 }}>
          <p className="enterprise-muted">{loadErr}</p>
        </main>
      </div>
    );
  }

  return (
    <EnterpriseLayout
      activeNav="team"
      teams={teams ?? []}
      selectedTeamId={selectedTeamId}
      onTeamChange={setSelectedTeamId}
      user={me ?? null}
      onSignOutNavigate={(path) => navigate(path)}
      topBar={<DashboardTopBar user={me ?? null} />}
    >
      <div className="enterprise-dashboard-inner">
        <h1 className="enterprise-page-title">Team</h1>
        <p className="enterprise-muted" style={{ marginBottom: 24 }}>
          Members, invites, and workspace details for the team selected in the sidebar.
        </p>
        <TeamTabPanel teams={teams} selectedTeamId={selectedTeamId} me={me} onTeamsRefresh={refreshTeamsList} />
      </div>
    </EnterpriseLayout>
  );
}
