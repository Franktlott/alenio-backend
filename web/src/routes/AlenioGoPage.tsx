import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { LocationChecklistsSection } from "../components/checklists/LocationChecklistsSection";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";

export function AlenioGoPage() {
  const [params] = useSearchParams();
  const teamIdFromUrl = params.get("teamId")?.trim() ?? "";
  const { teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();

  useEffect(() => {
    if (!teams?.length) return;
    if (teamIdFromUrl && teams.some((t) => t.id === teamIdFromUrl) && teamIdFromUrl !== selectedTeamId) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teams, teamIdFromUrl, selectedTeamId, setSelectedTeamId]);

  const teamId = teamIdFromUrl || selectedTeamId;
  const selectedTeam = useMemo(() => teams?.find((t) => t.id === teamId) ?? null, [teams, teamId]);
  const myRole = selectedTeam?.role ?? "";

  if (!teamId) {
    return (
      <div className="enterprise-tab-shell enterprise-go-page">
        <p className="enterprise-muted">Select a workspace to manage checklists.</p>
      </div>
    );
  }

  return (
    <div className="enterprise-tab-shell enterprise-go-page" data-testid="alenio-go-page">
      <LocationChecklistsSection
        teamId={teamId}
        myRole={myRole}
        teamName={selectedTeam?.name}
        teamImage={selectedTeam?.image}
      />
    </div>
  );
}
