import { useEnterpriseOrgGo } from "./enterprise-org-go-context";
import { EnterpriseOrgWorkspacesPanel } from "../../components/alenio-go/EnterpriseOrgWorkspacesPanel";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  createEnterpriseOrganizationWorkspace,
  deleteEnterpriseOrganizationWorkspace,
  fetchWebMe,
  renameEnterpriseOrganizationWorkspace,
} from "../../lib/api";
import { enterpriseOrgTeams } from "../../lib/enterprise-org";
import { setPersistedEnterpriseTeamId } from "../../lib/enterprise-selected-team";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

export function EnterpriseOrgGoWorkspacesPage() {
  const { organizationId, organizationName, org } = useEnterpriseOrgGo();
  const { me, setMe, setSelectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const navigate = useNavigate();
  const orgTeams = useMemo(() => enterpriseOrgTeams(me), [me]);

  const refreshOrg = async () => {
    try {
      const nextMe = await fetchWebMe();
      if (nextMe) setMe(nextMe);
    } catch {
      await refreshMeAndTeams();
    }
  };

  return (
    <div className="enterprise-org-go-page" data-testid="enterprise-org-go-workspaces">
      <header className="enterprise-org-go-page-head">
        <div>
          <p className="enterprise-org-go-eyebrow">Organization</p>
          <h1>Workspaces</h1>
          <p className="enterprise-muted">Create and manage store workspaces. Open Go to configure assigned modules.</p>
        </div>
      </header>
      <EnterpriseOrgWorkspacesPanel
        organizationName={organizationName}
        workspaceLimit={org.workspaceLimit ?? 5}
        workspaceCount={org.workspaceCount ?? org.teams.length}
        canCreateWorkspaces={org.canCreateWorkspaces === true}
        teams={orgTeams}
        onSelectWorkspace={(teamId) => {
          setPersistedEnterpriseTeamId(teamId);
          setSelectedTeamId(teamId);
          navigate(`/go?teamId=${encodeURIComponent(teamId)}`, { replace: true });
        }}
        onCreateWorkspace={async (name) => {
          const created = await createEnterpriseOrganizationWorkspace(organizationId, {
            name,
            plan: "operations",
          });
          await refreshOrg();
          setPersistedEnterpriseTeamId(created.team.id);
          setSelectedTeamId(created.team.id);
          navigate(`/go?teamId=${encodeURIComponent(created.team.id)}`, { replace: true });
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
