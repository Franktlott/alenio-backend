import { useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { AlenioGoBackendDashboard } from "../../components/alenio-go/AlenioGoBackendDashboard";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  canManageEnterpriseGoForTeam,
  enterpriseOrgTeams,
  isEnterpriseOrgAdmin,
  primaryEnterpriseOrg,
} from "../../lib/enterprise-org";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

export function AlenioGoHomePage() {
  const ctx = useAlenioGoShell();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { me, teams } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);
  const enterpriseAdmin = isEnterpriseOrgAdmin(me);
  const workspaceParam = (params.get("teamId") ?? "").trim();

  if (me === undefined || teams === null) {
    return null;
  }

  /** Org admins without a workspace selected land on corporate Alenio Go. */
  if (enterpriseAdmin && org && !workspaceParam) {
    return <Navigate to="/go/org/overview" replace />;
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
              navigate("/go/org/workspaces", { replace: true });
            }}
            data-testid="enterprise-org-go-back"
          >
            ← {org.name} Corporate Workspaces
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
