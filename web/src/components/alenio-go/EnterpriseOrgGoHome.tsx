import { AlenioGoLogo } from "../AlenioGoLogo";
import type { WebEnterpriseOrganization } from "../../lib/api";

type OrgTeam = WebEnterpriseOrganization["teams"][number] & {
  organizationName?: string;
};

type Props = {
  organizationName: string;
  teams: OrgTeam[];
  onSelectWorkspace: (teamId: string) => void;
};

export function EnterpriseOrgGoHome({ organizationName, teams, onSelectWorkspace }: Props) {
  return (
    <div className="enterprise-tab-shell" data-testid="enterprise-org-go-home" style={{ padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
          <AlenioGoLogo />
          <div>
            <p className="enterprise-muted" style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Enterprise · Alenio Go
            </p>
            <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{organizationName}</h1>
          </div>
        </div>
        <p className="enterprise-muted" style={{ margin: 0, maxWidth: 560 }}>
          Manage Alenio Go across every workspace in this organization. Workspaces are created in bulk by Alenio —
          pick one to configure devices, modules, and floor tools.
        </p>
      </header>

      {teams.length === 0 ? (
        <div className="enterprise-card" style={{ padding: "1.25rem" }}>
          <h2 className="enterprise-card-title" style={{ marginBottom: "0.5rem" }}>
            No workspaces yet
          </h2>
          <p className="enterprise-muted" style={{ margin: 0 }}>
            Your enterprise account is ready. When workspaces are added to {organizationName}, they will appear here
            for Alenio Go setup.
          </p>
        </div>
      ) : (
        <div className="enterprise-table-wrap">
          <table className="enterprise-table">
            <thead>
              <tr>
                <th>Workspace</th>
                <th>Code</th>
                <th>Go</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td>
                    <strong>{team.name}</strong>
                  </td>
                  <td>{team.inviteCode ?? "—"}</td>
                  <td>{team.hasGoFeatures ? "Ready" : "Features pending"}</td>
                  <td>
                    <button
                      type="button"
                      className="auth-submit"
                      style={{ padding: "0.4rem 0.85rem", fontSize: 13 }}
                      onClick={() => onSelectWorkspace(team.id)}
                      data-testid={`enterprise-org-go-open-${team.id}`}
                    >
                      Open Go
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
