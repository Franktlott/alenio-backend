import { useEffect, useState, type FormEvent } from "react";
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
  /** When true, open the create form immediately (e.g. from Dashboard “New workspace”). */
  startCreating?: boolean;
  onSelectWorkspace: (teamId: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onRenameWorkspace: (teamId: string, name: string) => Promise<void>;
  onDeleteWorkspace: (teamId: string) => Promise<void>;
};

export function EnterpriseOrgWorkspacesPanel({
  organizationName,
  workspaceLimit,
  workspaceCount,
  canCreateWorkspaces,
  teams,
  startCreating = false,
  onSelectWorkspace,
  onCreateWorkspace,
  onRenameWorkspace,
  onDeleteWorkspace,
}: Props) {
  const [showCreate, setShowCreate] = useState(startCreating && canCreateWorkspaces);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startCreating && canCreateWorkspaces) setShowCreate(true);
  }, [startCreating, canCreateWorkspaces]);

  const [renameTarget, setRenameTarget] = useState<OrgTeam | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<OrgTeam | null>(null);
  const [deletePhrase, setDeletePhrase] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  const openRename = (team: OrgTeam) => {
    setRenameTarget(team);
    setRenameName(team.name);
    setRenameError(null);
  };

  const closeRename = () => {
    if (renameBusy) return;
    setRenameTarget(null);
    setRenameName("");
    setRenameError(null);
  };

  const submitRename = async (e: FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameName.trim() || renameBusy) return;
    setRenameBusy(true);
    setRenameError(null);
    try {
      await onRenameWorkspace(renameTarget.id, renameName.trim());
      setRenameTarget(null);
      setRenameName("");
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Could not rename workspace.");
    } finally {
      setRenameBusy(false);
    }
  };

  const openDelete = (team: OrgTeam) => {
    setDeleteTarget(team);
    setDeletePhrase("");
    setDeleteError(null);
  };

  const closeDelete = () => {
    if (deleteBusy) return;
    setDeleteTarget(null);
    setDeletePhrase("");
    setDeleteError(null);
  };

  const submitDelete = async (e: FormEvent) => {
    e.preventDefault();
    if (!deleteTarget || deletePhrase.trim() !== "DELETE" || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await onDeleteWorkspace(deleteTarget.id);
      setDeleteTarget(null);
      setDeletePhrase("");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Could not delete workspace.");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div data-testid="enterprise-org-go-home">
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h2 className="enterprise-card-title" style={{ margin: 0 }}>
            Workspaces
          </h2>
          <p className="enterprise-muted" style={{ margin: "0.35rem 0 0", maxWidth: 620 }}>
            Add, rename, or delete workspaces for {organizationName} (cap: {workspaceCount}/{workspaceLimit}).
          </p>
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

      {showCreate ? (
        <form className="enterprise-card" onSubmit={onSubmit} style={{ marginBottom: "1rem", padding: "1rem" }}>
          <h3 className="enterprise-card-title" style={{ marginBottom: "0.75rem", fontSize: "1rem" }}>
            Create workspace
          </h3>
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
          <h3 className="enterprise-card-title" style={{ marginBottom: "0.5rem" }}>
            No workspaces yet
          </h3>
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
                <th>Actions</th>
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
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                      <button
                        type="button"
                        className="auth-submit"
                        style={{ padding: "0.4rem 0.85rem", fontSize: 13 }}
                        onClick={() => onSelectWorkspace(team.id)}
                        data-testid={`enterprise-org-go-open-${team.id}`}
                      >
                        Open Go
                      </button>
                      <button
                        type="button"
                        className="enterprise-team-btn-outline"
                        style={{ padding: "0.4rem 0.85rem", fontSize: 13 }}
                        onClick={() => openRename(team)}
                        data-testid={`enterprise-org-rename-${team.id}`}
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        className="enterprise-team-btn-destructive"
                        style={{ padding: "0.4rem 0.85rem", fontSize: 13, width: "auto" }}
                        onClick={() => openDelete(team)}
                        data-testid={`enterprise-org-delete-${team.id}`}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {renameTarget ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeRename}>
          <div
            className="enterprise-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ent-ws-rename-title"
            style={{ width: "min(420px, 100%)", padding: "1.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ent-ws-rename-title" className="enterprise-card-title" style={{ marginBottom: "0.75rem" }}>
              Rename workspace
            </h2>
            <form onSubmit={submitRename}>
              <label className="auth-label" htmlFor="ent-ws-rename-name">
                Workspace name
              </label>
              <input
                id="ent-ws-rename-name"
                className="auth-input"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                required
                autoFocus
                data-testid="enterprise-org-rename-input"
              />
              {renameError ? <p className="auth-error">{renameError}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
                <button type="button" className="enterprise-team-btn-outline" onClick={closeRename} disabled={renameBusy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="auth-submit"
                  disabled={renameBusy || !renameName.trim()}
                  data-testid="enterprise-org-rename-submit"
                >
                  {renameBusy ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeDelete}>
          <div
            className="enterprise-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ent-ws-delete-title"
            style={{ width: "min(440px, 100%)", padding: "1.25rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="ent-ws-delete-title" className="enterprise-card-title" style={{ marginBottom: "0.5rem" }}>
              Delete workspace
            </h2>
            <p className="enterprise-muted" style={{ marginTop: 0 }}>
              This permanently deletes <strong>{deleteTarget.name}</strong> and all of its Alenio Go data. Type{" "}
              <strong>DELETE</strong> to confirm.
            </p>
            <form onSubmit={submitDelete}>
              <label className="auth-label" htmlFor="ent-ws-delete-phrase">
                Confirmation
              </label>
              <input
                id="ent-ws-delete-phrase"
                className="auth-input"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                placeholder="DELETE"
                autoComplete="off"
                data-testid="enterprise-org-delete-confirm"
              />
              {deleteError ? <p className="auth-error">{deleteError}</p> : null}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.85rem" }}>
                <button type="button" className="enterprise-team-btn-outline" onClick={closeDelete} disabled={deleteBusy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="enterprise-team-btn-destructive"
                  style={{ width: "auto" }}
                  disabled={deleteBusy || deletePhrase.trim() !== "DELETE"}
                  data-testid="enterprise-org-delete-submit"
                >
                  {deleteBusy ? "Deleting…" : "Delete workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
