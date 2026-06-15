import { useState } from "react";
import { WorkspaceCreateJoinModals } from "./WorkspaceCreateJoinModals";

const ONBOARDING_STEPS = [
  {
    title: "Create your account",
    detail: "You're signed in — verification is complete.",
  },
  {
    title: "Create or join a workspace",
    detail: "Use an invite code from your manager, or create a new workspace to get started.",
  },
  {
    title: "Invite your team",
    detail: "Open Team to send invites so everyone lands in the same workspace.",
  },
  {
    title: "Start in Chat",
    detail: "Once you're in a workspace, Chat is your home base for shift updates and execution.",
  },
] as const;

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
        <h2 className="enterprise-card-title enterprise-card-title-spaced">Get started with Alenio</h2>
        <p className="enterprise-muted enterprise-no-teams-lead">
          You need a workspace before Chat, Activity, and execution tools unlock. Follow the steps below, then pick an
          option to join or create one.
        </p>
        <ol className="enterprise-no-teams-steps" aria-label="Getting started steps">
          {ONBOARDING_STEPS.map((step, index) => (
            <li key={step.title} className="enterprise-no-teams-step">
              <span className="enterprise-no-teams-step-num" aria-hidden>
                {index + 1}
              </span>
              <div>
                <strong>{step.title}</strong>
                <span>{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
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
