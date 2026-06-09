import { useEffect, useState } from "react";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { TeamTabPanel } from "../components/TeamTabPanel";

export function TeamPage() {
  const {
    me,
    teams,
    selectedTeamId,
    refreshMeAndTeams,
    setWorkspaceMainLoading,
  } = useEnterpriseShell();
  const [workspaceOverlayLoading, setWorkspaceOverlayLoading] = useState(false);

  const hasNoTeams = teams !== null && teams.length === 0;

  useEffect(() => {
    if (hasNoTeams) {
      setWorkspaceMainLoading(false);
      return;
    }
    setWorkspaceMainLoading(workspaceOverlayLoading);
    return () => setWorkspaceMainLoading(false);
  }, [hasNoTeams, workspaceOverlayLoading, setWorkspaceMainLoading]);

  if (me === undefined) {
    return (
      <div className="enterprise-tab-shell">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div
      className={`enterprise-tab-shell enterprise-team-page-shell${hasNoTeams ? " chat-app-body-no-teams" : ""}`}
      data-testid="team-screen"
    >
      <TeamTabPanel
        teams={teams}
        selectedTeamId={selectedTeamId}
        me={me}
        onTeamsRefresh={refreshMeAndTeams}
        onWorkspaceSwitchLoading={hasNoTeams ? undefined : setWorkspaceOverlayLoading}
      />
    </div>
  );
}
