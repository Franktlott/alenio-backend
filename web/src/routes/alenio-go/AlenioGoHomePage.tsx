import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlenioGoBackendDashboard } from "../../components/alenio-go/AlenioGoBackendDashboard";
import { EnterpriseOrgGoHome } from "../../components/alenio-go/EnterpriseOrgGoHome";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  canManageEnterpriseGoForTeam,
  enterpriseOrgTeams,
  isEnterpriseOrgAdmin,
  primaryEnterpriseOrg,
} from "../../lib/enterprise-org";
import { setPersistedEnterpriseTeamId } from "../../lib/enterprise-selected-team";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoHomePage() {
  const ctx = useAlenioGoShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, setSelectedTeamId } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);
  const enterpriseAdmin = isEnterpriseOrgAdmin(me);
  const workspaceParam = (params.get("teamId") ?? "").trim();
  const showOrgHome = enterpriseAdmin && !!org && !workspaceParam;

  if (showOrgHome) {
    return (
      <EnterpriseOrgGoHome
        organizationName={org.name}
        teams={orgTeams}
        onSelectWorkspace={(teamId) => {
          setPersistedEnterpriseTeamId(teamId);
          setSelectedTeamId(teamId);
          navigate(`/go?teamId=${encodeURIComponent(teamId)}`, { replace: true });
        }}
      />
    );
  }

  if (!ctx) return null;

  const orgManaged = canManageEnterpriseGoForTeam(me, ctx.teamId);
  const orgTeam = orgTeams.find((t) => t.id === ctx.teamId);

  return (
    <>
      {enterpriseAdmin && org ? (
        <div style={{ padding: "0.75rem 1.25rem 0" }}>
          <button
            type="button"
            className="enterprise-team-btn-outline"
            onClick={() => {
              navigate("/go", { replace: true });
            }}
            data-testid="enterprise-org-go-back"
          >
            ← All {org.name} workspaces
          </button>
        </div>
      ) : null}
      <AlenioGoBackendDashboard
        {...ctx}
        teamName={orgTeam?.name ?? ctx.teamName}
        inviteCode={orgTeam?.inviteCode ?? ctx.inviteCode}
        canManage={ctx.canManage || orgManaged}
        roleLabel={orgManaged && !ctx.canManage ? "Org admin" : ctx.roleLabel}
      />
    </>
  );
}
