import { Outlet, useLocation, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { AlenioGoDevGate } from "../../components/alenio-go/AlenioGoDevGate";
import { GoLeaderPinSetupModal } from "../../components/alenio-go/GoLeaderPinSetupModal";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { usePendingApprovals } from "../../hooks/usePendingApprovals";
import { fetchGoLeaderPinStatus } from "../../lib/api";
import {
  canManageEnterpriseGoForTeam,
  enterpriseOrgTeams,
} from "../../lib/enterprise-org";
import { canManageApprovals } from "../../lib/pending-approvals";
import type { AlenioGoOutletContext } from "./alenio-go-outlet-context";

const PIN_PROMPT_DISMISS_KEY = "alenio.go.pinPromptDismissed.";

function roleLabelForTeam(role: string | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "team_leader") return "Team Leader";
  if (role === "org_admin") return "Org admin";
  return "Member";
}

export function AlenioGoLayout() {
  const { me, teams, selectedTeamId, setSelectedTeamId } = useEnterpriseShell();
  const location = useLocation();
  const [params] = useSearchParams();
  const teamIdFromQuery = (params.get("teamId") ?? "").trim();
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);
  const effectiveGoTeamId = teamIdFromQuery || selectedTeamId || "";

  useEffect(() => {
    if (teamIdFromQuery && teamIdFromQuery !== selectedTeamId) {
      setSelectedTeamId(teamIdFromQuery);
    }
  }, [teamIdFromQuery, selectedTeamId, setSelectedTeamId]);

  const personalTeam = teams?.find((t) => t.id === effectiveGoTeamId) ?? null;
  const orgTeam = orgTeams.find((t) => t.id === effectiveGoTeamId) ?? null;
  const orgManaged = canManageEnterpriseGoForTeam(me, effectiveGoTeamId || undefined);
  const canManage = canManageApprovals(personalTeam?.role ?? "") || orgManaged;
  const onPinPage = location.pathname.startsWith("/go/devices/pin");

  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);

  const approvals = usePendingApprovals({
    teamId: canManage ? effectiveGoTeamId || undefined : undefined,
    pollMs: 15_000,
  });

  useEffect(() => {
    if (!canManage || !effectiveGoTeamId) {
      setHasPin(null);
      setShowPinModal(false);
      return;
    }

    let cancelled = false;
    void fetchGoLeaderPinStatus(effectiveGoTeamId)
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
  }, [canManage, effectiveGoTeamId]);

  useEffect(() => {
    if (!canManage || !effectiveGoTeamId || hasPin !== false || onPinPage) {
      setShowPinModal(false);
      return;
    }
    const dismissed = sessionStorage.getItem(`${PIN_PROMPT_DISMISS_KEY}${effectiveGoTeamId}`);
    setShowPinModal(!dismissed);
  }, [canManage, hasPin, onPinPage, effectiveGoTeamId]);

  const outletContext: AlenioGoOutletContext = {
    teamId: effectiveGoTeamId || undefined,
    teamName: personalTeam?.name ?? orgTeam?.name ?? "Workspace",
    teamImage: personalTeam?.image,
    inviteCode: personalTeam?.inviteCode ?? orgTeam?.inviteCode,
    userName: me?.name,
    roleLabel:
      orgManaged && !canManageApprovals(personalTeam?.role ?? "")
        ? "Org admin"
        : roleLabelForTeam(personalTeam?.role),
    canManage,
    approvals,
  };

  return (
    <AlenioGoDevGate>
      <div className="enterprise-tab-shell enterprise-alenio-go-page" data-testid="alenio-go-page-shell">
        <Outlet context={outletContext} />
        {effectiveGoTeamId ? (
          <GoLeaderPinSetupModal
            open={showPinModal}
            teamId={effectiveGoTeamId}
            leaderName={me?.name}
            onCreated={() => {
              setHasPin(true);
              setShowPinModal(false);
            }}
            onDismiss={() => {
              sessionStorage.setItem(`${PIN_PROMPT_DISMISS_KEY}${effectiveGoTeamId}`, "1");
              setShowPinModal(false);
            }}
          />
        ) : null}
      </div>
    </AlenioGoDevGate>
  );
}
