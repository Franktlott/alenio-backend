import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlenioGoBackendDashboard } from "../../components/alenio-go/AlenioGoBackendDashboard";
import {
  EnterpriseOrgDashboard,
  type EnterpriseOrgDashboardTab,
} from "../../components/alenio-go/EnterpriseOrgDashboard";
import { EnterpriseOrgWorkspacesPanel } from "../../components/alenio-go/EnterpriseOrgWorkspacesPanel";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createEnterpriseOrganizationWorkspace,
  deleteEnterpriseOrganizationWorkspace,
  fetchWebMe,
  renameEnterpriseOrganizationWorkspace,
} from "../../lib/api";
import {
  canManageEnterpriseGoForTeam,
  enterpriseOrgTeams,
  isEnterpriseOrgAdmin,
  primaryEnterpriseOrg,
} from "../../lib/enterprise-org";
import { setPersistedEnterpriseTeamId } from "../../lib/enterprise-selected-team";
import { useAlenioGoShell } from "./alenio-go-outlet-context";

function parseOrgTab(raw: string | null): EnterpriseOrgDashboardTab {
  return raw === "workspaces" ? "workspaces" : "dashboard";
}

export function AlenioGoHomePage() {
  const ctx = useAlenioGoShell();
  const navigate = useNavigate();
  const [params, setSearchParams] = useSearchParams();
  const { me, setMe, setSelectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const org = primaryEnterpriseOrg(me);
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);
  const enterpriseAdmin = isEnterpriseOrgAdmin(me);
  const workspaceParam = (params.get("teamId") ?? "").trim();
  const showOrgHome = enterpriseAdmin && !!org && !workspaceParam;
  const activeTab = parseOrgTab(params.get("tab"));
  const startCreating = params.get("create") === "1";

  const refreshOrg = async () => {
    try {
      const nextMe = await fetchWebMe();
      if (nextMe) setMe(nextMe);
    } catch {
      await refreshMeAndTeams();
    }
  };

  const openWorkspace = (teamId: string) => {
    setPersistedEnterpriseTeamId(teamId);
    setSelectedTeamId(teamId);
    navigate(`/go?teamId=${encodeURIComponent(teamId)}`, { replace: true });
  };

  const setOrgTab = (tab: EnterpriseOrgDashboardTab) => {
    const next = new URLSearchParams();
    if (tab === "workspaces") next.set("tab", "workspaces");
    setSearchParams(next, { replace: true });
  };

  const openNewWorkspace = () => {
    const next = new URLSearchParams();
    next.set("tab", "workspaces");
    next.set("create", "1");
    setSearchParams(next, { replace: true });
  };

  if (showOrgHome && org) {
    return (
      <EnterpriseOrgDashboard
        organizationName={org.name}
        workspaceLimit={org.workspaceLimit ?? 5}
        workspaceCount={org.workspaceCount ?? org.teams.length}
        canCreateWorkspaces={org.canCreateWorkspaces === true}
        teams={orgTeams}
        activeTab={activeTab}
        onTabChange={setOrgTab}
        onSelectWorkspace={openWorkspace}
        onNewWorkspace={openNewWorkspace}
        workspacesPanel={
          <EnterpriseOrgWorkspacesPanel
            organizationName={org.name}
            workspaceLimit={org.workspaceLimit ?? 5}
            workspaceCount={org.workspaceCount ?? org.teams.length}
            canCreateWorkspaces={org.canCreateWorkspaces === true}
            teams={orgTeams}
            startCreating={startCreating && activeTab === "workspaces"}
            onSelectWorkspace={openWorkspace}
            onCreateWorkspace={async (name) => {
              const created = await createEnterpriseOrganizationWorkspace(org.id, {
                name,
                plan: "operations",
              });
              await refreshOrg();
              setPersistedEnterpriseTeamId(created.team.id);
              setSelectedTeamId(created.team.id);
              navigate(`/go?teamId=${encodeURIComponent(created.team.id)}`, { replace: true });
            }}
            onRenameWorkspace={async (teamId, name) => {
              await renameEnterpriseOrganizationWorkspace(org.id, teamId, { name });
              await refreshOrg();
            }}
            onDeleteWorkspace={async (teamId) => {
              await deleteEnterpriseOrganizationWorkspace(org.id, teamId);
              await refreshOrg();
            }}
          />
        }
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
              navigate("/go?tab=workspaces", { replace: true });
            }}
            data-testid="enterprise-org-go-back"
          >
            ← {org.name} workspaces
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
