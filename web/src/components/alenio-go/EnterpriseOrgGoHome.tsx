import { useState, type FormEvent } from "react";
import { AlenioGoLogo } from "../AlenioGoLogo";
import type { WebEnterpriseOrganization } from "../../lib/api";

type OrgTeam = WebEnterpriseOrganization["teams"][number] & {
  organizationName?: string;
};

type Props = {
  organizationName: string;
  workspaceLimit: number;
  workspaceCount: number;
  canCreateWorkspaces: boolean;
  teams: OrgTeam[];
  onSelectWorkspace: (teamId: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
};

export function EnterpriseOrgGoHome({
  organizationName,
  workspaceLimit,
  workspaceCount,
  canCreateWorkspaces,
  teams,
  onSelectWorkspace,
  onCreateWorkspace,
}: Props) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreateWorkspace(name.trim());
      setName("");
      setShowCreate(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create workspace.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="enterprise-tab-shell" data-testid="enterprise-org-go-home" style={{ padding: "1.5rem" }}>
      <header style={{ marginBottom: "1.25rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
            marginBottom: "0.5rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <AlenioGoLogo />
            <div>
              <p
                className="enterprise-muted"
                style={{ margin: 0, fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase" }}
              >
                Enterprise · Alenio Go
              </p>
              <h1 style={{ margin: 0, fontSize: "1.35rem" }}>{organizationName}</h1>
            </div>
          </div>
          {canCreateWorkspaces ? (
            <button
              type="button"
              className="auth-submit"
              onClick={() => {
                setShowCreate((v) => !v);
                setError(null);
              }}
              data-testid="enterprise-org-create-workspace-toggle"
            >
              {showCreate ? "Cancel" : "New workspace"}
            </button>
          ) : null}
        </div>
        <p className="enterprise-muted" style={{ margin: 0, maxWidth: 620 }}>
          Create and manage workspaces for this organization (cap set by Alenio: {workspaceCount}/{workspaceLimit}).
          Open a workspace to configure Alenio Go devices, modules, and floor tools.
        </p>
      </header>

      {showCreate ? (
        <form className="enterprise-card" onSubmit={onSubmit} style={{ marginBottom: "1rem", padding: "1rem" }}>
          <h2 className="enterprise-card-title" style={{ marginBottom: "0.75rem" }}>
            Create workspace
          </h2>
          <label className="auth-label" htmlFor="ent-ws-name">
            Workspace name
          </label>
          <input
            id="ent-ws-name"
            className="auth-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Store #1204"
            required
            data-testid="enterprise-org-workspace-name"
          />
          {error ? <p className="auth-error">{error}</p> : null}
          <button type="submit" className="auth-submit" disabled={busy} data-testid="enterprise-org-workspace-submit">
            {busy ? "Creating…" : "Create workspace"}
          </button>
        </form>
      ) : null}

      {!canCreateWorkspaces && workspaceCount >= workspaceLimit ? (
        <p className="enterprise-muted" style={{ marginBottom: "1rem" }}>
          You’ve reached your workspace limit ({workspaceCount}/{workspaceLimit}). Contact Alenio to raise the cap.
        </p>
      ) : null}

      {teams.length === 0 ? (
        <div className="enterprise-card" style={{ padding: "1.25rem" }}>
          <h2 className="enterprise-card-title" style={{ marginBottom: "0.5rem" }}>
            No workspaces yet
          </h2>
          <p className="enterprise-muted" style={{ margin: 0 }}>
            Create your first workspace to start setting up Alenio Go for {organizationName}.
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
