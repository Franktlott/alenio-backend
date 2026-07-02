import { Outlet } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { canManageApprovals } from "../../lib/pending-approvals";
import type { AlenioGoOutletContext } from "./alenio-go-outlet-context";

function roleLabelForTeam(role: string | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

export function AlenioGoLayout() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? null;
  const canManage = activeTeam ? canManageApprovals(activeTeam.role) : false;

  const approvals = usePendingApprovals({
    teamId: canManage ? selectedTeamId : undefined,
    pollMs: 15_000,
  });

  const outletContext: AlenioGoOutletContext = {
    teamId: selectedTeamId || undefined,
    teamName: activeTeam?.name ?? "Workspace",
    teamImage: activeTeam?.image,
    inviteCode: activeTeam?.inviteCode,
    userName: me?.name,
    roleLabel: roleLabelForTeam(activeTeam?.role),
    canManage,
    approvals,
  };

  return (
    <div className="enterprise-tab-shell enterprise-alenio-go-page" data-testid="alenio-go-page-shell">
      <Outlet context={outletContext} />
    </div>
  );
}
