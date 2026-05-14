import { useEffect, useState } from "react";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { TeamTabPanel } from "../components/TeamTabPanel";

export function TeamPage() {
  const {
    me,
    teams,
    selectedTeamId,
    setSelectedTeamId,
    refreshMeAndTeams,
    setShellMainClassSuffix,
    setShellContentClassSuffix,
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

  useEffect(() => {
    if (hasNoTeams) {
      setShellMainClassSuffix("enterprise-app-chat");
      setShellContentClassSuffix("enterprise-content-flush");
    } else {
      setShellMainClassSuffix("");
      setShellContentClassSuffix("");
    }
    return () => {
      setShellMainClassSuffix("");
      setShellContentClassSuffix("");
    };
  }, [hasNoTeams, setShellMainClassSuffix, setShellContentClassSuffix]);

  if (me === undefined) {
    return (
      <div className="enterprise-dashboard-inner">
        <p className="enterprise-muted">Loading…</p>
      </div>
    );
  }

  return (
    <>
      {hasNoTeams ? (
        <div className="chat-app-body chat-app-body-enterprise chat-app-body-no-teams">
          <TeamTabPanel teams={teams} selectedTeamId={selectedTeamId} me={me} onTeamsRefresh={refreshMeAndTeams} />
        </div>
      ) : (
        <div className="enterprise-dashboard-inner enterprise-profile-page">
          <h1 className="enterprise-page-title enterprise-profile-page-title">Team</h1>
          <TeamTabPanel
            teams={teams}
            selectedTeamId={selectedTeamId}
            me={me}
            onTeamsRefresh={refreshMeAndTeams}
            onWorkspaceSwitchLoading={setWorkspaceOverlayLoading}
          />
        </div>
      )}
    </>
  );
}
