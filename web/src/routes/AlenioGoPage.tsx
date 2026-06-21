import { useMemo } from "react";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { LocationChecklistsSection } from "../components/checklists/LocationChecklistsSection";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";

export function AlenioGoPage() {
  const { teams, selectedTeamId } = useEnterpriseShell();

  const selectedTeam = useMemo(
    () => teams?.find((t) => t.id === selectedTeamId) ?? null,
    [teams, selectedTeamId],
  );
  const myRole = selectedTeam?.role ?? "";

  if (!selectedTeamId) {
    return (
      <div className="enterprise-tab-shell">
        <p className="enterprise-muted">Select a workspace to manage checklists.</p>
      </div>
    );
  }

  return (
    <div className="enterprise-tab-shell enterprise-go-page" data-testid="alenio-go-page">
      <div className="enterprise-go-intro">
        <AlenioGoLogo variant="page" />
        <p className="enterprise-go-intro__sub">
          iPad checklists for frontline teams — one QR per workspace, no login for associates.
        </p>
      </div>
      <LocationChecklistsSection teamId={selectedTeamId} myRole={myRole} teamName={selectedTeam?.name} />
    </div>
  );
}
