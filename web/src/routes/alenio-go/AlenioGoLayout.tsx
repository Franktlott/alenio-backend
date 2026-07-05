import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { GoLeaderPinSetupModal } from "../../components/alenio-go/GoLeaderPinSetupModal";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { fetchGoLeaderPinStatus } from "../../lib/api";
import { canManageApprovals } from "../../lib/pending-approvals";
import type { AlenioGoOutletContext } from "./alenio-go-outlet-context";

const PIN_PROMPT_DISMISS_KEY = "alenio.go.pinPromptDismissed.";

function roleLabelForTeam(role: string | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  return "Member";
}

export function AlenioGoLayout() {
  const { me, teams, selectedTeamId } = useEnterpriseShell();
  const location = useLocation();
  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? null;
  const canManage = activeTeam ? canManageApprovals(activeTeam.role) : false;
  const onPinPage = location.pathname.startsWith("/go/devices/pin");

  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  const approvals = usePendingApprovals({
    teamId: canManage ? selectedTeamId : undefined,
    pollMs: 15_000,
  });

  useEffect(() => {
    if (!canManage || !selectedTeamId) {
      setHasPin(null);
      setShowPinModal(false);
      return;
    }

    let cancelled = false;
    void fetchGoLeaderPinStatus(selectedTeamId)
      .then((status) => {
        if (cancelled) return;
        setHasPin(status.hasPin);
      })
      .catch(() => {
        if (cancelled) return;
        setHasPin(null);
      });

    return () => {
      cancelled = true;
    };
  }, [canManage, selectedTeamId]);

  useEffect(() => {
    if (!canManage || !selectedTeamId || hasPin !== false || onPinPage) {
      setShowPinModal(false);
      return;
    }
    const dismissed = sessionStorage.getItem(`${PIN_PROMPT_DISMISS_KEY}${selectedTeamId}`);
    setShowPinModal(!dismissed);
  }, [canManage, hasPin, onPinPage, selectedTeamId]);

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
      {selectedTeamId ? (
        <GoLeaderPinSetupModal
          open={showPinModal}
          teamId={selectedTeamId}
          leaderName={me?.name}
          onCreated={() => {
            setHasPin(true);
            setShowPinModal(false);
          }}
          onDismiss={() => {
            sessionStorage.setItem(`${PIN_PROMPT_DISMISS_KEY}${selectedTeamId}`, "1");
            setShowPinModal(false);
          }}
        />
      ) : null}
    </div>
  );
}
