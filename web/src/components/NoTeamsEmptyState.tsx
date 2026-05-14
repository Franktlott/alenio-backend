import { useState } from "react";
import { WorkspaceCreateJoinModals } from "./WorkspaceCreateJoinModals";

type Props = {
  onRefreshWorkspaces: () => Promise<void>;
};

export function NoTeamsEmptyState({ onRefreshWorkspaces }: Props) {
  const [joinOpen, setJoinOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  return (
    <div className="enterprise-no-teams-root" data-testid="dashboard-no-teams">
      <section className="enterprise-card enterprise-no-teams-card">
        <h2 className="enterprise-card-title enterprise-card-title-spaced">Workspaces</h2>
        <p className="enterprise-muted enterprise-no-teams-lead">
          Join a team with an invite code, or create a new workspace. You can switch workspaces anytime from the sidebar.
        </p>
        {info ? (
          <p className="enterprise-no-teams-info" role="status">
            {info}
          </p>
        ) : null}
        <div className="enterprise-no-teams-actions">
          <button type="button" className="auth-submit enterprise-no-teams-btn-secondary" onClick={() => setJoinOpen(true)}>
            Join with code
          </button>
          <button type="button" className="auth-submit" onClick={() => setCreateOpen(true)}>
            Create workspace
          </button>
        </div>
      </section>

      <WorkspaceCreateJoinModals
        joinOpen={joinOpen}
        createOpen={createOpen}
        onCloseJoin={() => setJoinOpen(false)}
        onCloseCreate={() => setCreateOpen(false)}
        onRefreshWorkspaces={onRefreshWorkspaces}
        onJoinSuccessInfo={(msg) => setInfo(msg)}
      />
    </div>
  );
}
