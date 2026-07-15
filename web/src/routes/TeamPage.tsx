import { useEffect, useState } from "react";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { TeamTabPanel } from "../components/TeamTabPanel";
import { TeamUpgradePanel } from "../components/TeamUpgradePanel";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";

export function TeamPage() {
  const {
    me,
    teams,
    selectedTeamId,
    refreshMeAndTeams,
    setWorkspaceMainLoading,
  } = useEnterpriseShell();
  const [workspaceOverlayLoading, setWorkspaceOverlayLoading] = useState(false);

  useEffect(() => {
    setWorkspaceMainLoading(workspaceOverlayLoading);
    return () => setWorkspaceMainLoading(false);
  }, [workspaceOverlayLoading, setWorkspaceMainLoading]);

  if (me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading your team" />;
  }

  const activeTeam = teams.find((t) => t.id === selectedTeamId) ?? null;
  const teamFeaturesUnlocked = activeTeam?.hasTeamFeatures !== false;

  if (activeTeam && !teamFeaturesUnlocked) {
    return (
      <div className="enterprise-tab-shell enterprise-team-page-shell enterprise-team-page-shell--upgrade" data-testid="team-screen">
        <TeamUpgradePanel isOwner={activeTeam.role === "owner"} teamId={activeTeam.id} />
      </div>
    );
  }

  return (
    <div className="enterprise-tab-shell enterprise-team-page-shell" data-testid="team-screen">
      <TeamTabPanel
        teams={teams}
        selectedTeamId={selectedTeamId}
        me={me}
        onTeamsRefresh={refreshMeAndTeams}
        onWorkspaceSwitchLoading={setWorkspaceOverlayLoading}
      />
    </div>
  );
}
