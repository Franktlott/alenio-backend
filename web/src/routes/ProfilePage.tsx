import { Link } from "react-router-dom";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { ProfileTeamsSection } from "../components/ProfileTeamsSection";
import { EnterprisePageLoading } from "../components/EnterprisePageLoading";
import { fetchWebTeams } from "../lib/api";
import { pickEnterpriseTeamId, switchEnterpriseWorkspace } from "../lib/enterprise-selected-team";
import { senecaStudioAccess } from "../lib/seneca-studio-api";
import "./workspaces-page.css";

/**
 * /settings — workspace management for the signed-in user: the workspaces they belong to,
 * plus Seneca AI context and Okta for the current workspace when their role allows it.
 * Personal account settings live in the account panel (Profile in the side bar).
 */
export function ProfilePage() {
  const {
    me,
    teams,
    setTeams,
    selectedTeamId,
    setSelectedTeamId,
    setWorkspaceMainLoading,
    refreshMeAndTeams,
  } = useEnterpriseShell();

  if (me === undefined) {
    return <EnterprisePageLoading label="Loading your workspaces" />;
  }

  const activeTeam = teams?.find((t) => t.id === selectedTeamId) ?? teams?.[0];
  const aiAccess = senecaStudioAccess(activeTeam?.role);
  const showAdminLinks = aiAccess.canView || activeTeam?.role === "owner";

  return (
    <div className="workspaces-page" data-testid="settings-screen">
      <div className="workspaces-page-inner">
        <header className="workspaces-head">
          <h1>Workspaces</h1>
          <p>Where you work with your team. Each workspace has its own members, tasks, and plan.</p>
        </header>

        <ProfileTeamsSection
          teams={teams ?? []}
          selectedTeamId={selectedTeamId}
          onSelectWorkspace={(teamId) => {
            if (!teamId || teamId === selectedTeamId) return;
            setWorkspaceMainLoading(true);
            switchEnterpriseWorkspace(teamId, setSelectedTeamId);
            window.setTimeout(() => setWorkspaceMainLoading(false), 800);
          }}
          onRefresh={refreshMeAndTeams}
          onWorkspaceDeleted={async (deletedId) => {
            const fresh = await fetchWebTeams();
            setTeams(fresh ?? []);
            if (selectedTeamId === deletedId) {
              const next = pickEnterpriseTeamId(fresh ?? [], "");
              switchEnterpriseWorkspace(next, setSelectedTeamId);
            }
            await refreshMeAndTeams();
          }}
        />

        {showAdminLinks ? (
          <section className="workspaces-admin" aria-labelledby="workspaces-admin-title">
            <h2 id="workspaces-admin-title">{activeTeam?.name ?? "This workspace"}</h2>
            <div className="workspaces-admin-rows">
              {aiAccess.canView ? (
                <Link to="/settings/ai" className="workspaces-admin-row" data-testid="settings-ai-entry">
                  <span>
                    <strong>Seneca AI settings</strong>
                    <small>
                      Priorities and context Seneca keeps in mind for this workspace.
                      {!aiAccess.canEdit ? " View only for your role." : null}
                    </small>
                  </span>
                  <span aria-hidden>›</span>
                </Link>
              ) : null}
              {activeTeam?.role === "owner" ? (
                <Link to="/settings/sso/okta" className="workspaces-admin-row" data-testid="settings-okta-entry">
                  <span>
                    <strong>Okta SSO &amp; SCIM</strong>
                    <small>Company sign-in and optional automatic user provisioning.</small>
                  </span>
                  <span aria-hidden>›</span>
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
