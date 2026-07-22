import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EnterpriseOrgWorkspacesPanel } from "../../components/alenio-go/EnterpriseOrgWorkspacesPanel";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createEnterpriseOrganizationWorkspace,
  deleteEnterpriseOrganizationWorkspace,
  fetchWebMe,
  renameEnterpriseOrganizationWorkspace,
} from "../../lib/api";
import { enterpriseOrgTeams } from "../../lib/enterprise-org";
import { switchEnterpriseWorkspace } from "../../lib/enterprise-selected-team";
import { useEnterpriseOrgGoOptional } from "./enterprise-org-go-context";

export function EnterpriseOrgGoWorkspacesPage() {
  const ctx = useEnterpriseOrgGoOptional();
  const {
    me,
    setMe,
    setSelectedTeamId,
    refreshMeAndTeams,
    teams,
    beginEnterpriseWorkspaceBoot,
  } = useEnterpriseShell();
  const navigate = useNavigate();
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);

  if (!ctx || me === undefined || teams === null) {
    return <EnterprisePageLoading label="Loading corporate workspaces" />;
  }

  const { organizationId, organizationName, org } = ctx;

  const refreshOrg = async () => {
    try {
      const nextMe = await fetchWebMe();
      if (nextMe) setMe(nextMe);
    } catch {
      await refreshMeAndTeams();
    }
  };

  const openWorkspace = (teamId: string) => {
    beginEnterpriseWorkspaceBoot(teamId);
    switchEnterpriseWorkspace(teamId, setSelectedTeamId);
    navigate(`/go?teamId=${encodeURIComponent(teamId)}`, { replace: true });
  };

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-workspaces">
      <header className="enterprise-org-go-page-head">
        <div>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Corporate Workspaces</h2>
          <p className="enterprise-muted" style={{ margin: "0.35rem 0 0" }}>
            Create and manage store workspaces. Click a row to open Go and configure assigned modules.
          </p>
        </div>
      </header>
      <EnterpriseOrgWorkspacesPanel
        organizationName={organizationName}
        workspaceLimit={org.workspaceLimit ?? 5}
        workspaceCount={org.workspaceCount ?? org.teams.length}
        canCreateWorkspaces={org.canCreateWorkspaces === true}
        teams={orgTeams}
        onSelectWorkspace={openWorkspace}
        onCreateWorkspace={async (name) => {
          const created = await createEnterpriseOrganizationWorkspace(organizationId, {
            name,
            plan: "operations",
          });
          await refreshOrg();
          openWorkspace(created.team.id);
        }}
        onRenameWorkspace={async (teamId, name) => {
          await renameEnterpriseOrganizationWorkspace(organizationId, teamId, { name });
          await refreshOrg();
        }}
        onDeleteWorkspace={async (teamId) => {
          await deleteEnterpriseOrganizationWorkspace(organizationId, teamId);
          await refreshOrg();
        }}
      />
    </div>
  );
}
