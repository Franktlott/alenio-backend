import { useState } from "react";
import { WorkspaceCreateJoinModals } from "./WorkspaceCreateJoinModals";

const ONBOARDING_STEPS = [
  {
    title: "Account ready",
    detail: "You're signed in and verified.",
    done: true,
  },
  {
    title: "Connect a workspace",
    detail: "Join with a code from your organization, or create one as the owner.",
    done: false,
  },
  {
    title: "Bring your team in",
    detail: "From Team, send invites so leaders and associates share one workspace.",
    done: false,
  },
  {
    title: "Operate from Chat",
    detail: "Chat becomes home base for updates, tasks, and day-to-day execution.",
    done: false,
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
      <section className="enterprise-no-teams-panel" aria-labelledby="enterprise-no-teams-title">
        <header className="enterprise-no-teams-header">
          <p className="enterprise-no-teams-eyebrow">Workspace setup</p>
          <h2 id="enterprise-no-teams-title" className="enterprise-no-teams-title">
            Set up your organization workspace
          </h2>
          <p className="enterprise-no-teams-lead">
            Chat, Activity, and execution tools unlock after you join or create a workspace. Most teams join with a
            manager code; owners create the workspace first.
          </p>
        </header>

        <div className="enterprise-no-teams-body">
          <ol className="enterprise-no-teams-rail" aria-label="Getting started">
            {ONBOARDING_STEPS.map((step, index) => (
              <li
                key={step.title}
                className={`enterprise-no-teams-rail-item${step.done ? " is-done" : ""}${index === 1 ? " is-current" : ""}`}
              >
                <span className="enterprise-no-teams-rail-marker" aria-hidden>
                  {step.done ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </span>
                <div className="enterprise-no-teams-rail-copy">
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </div>
              </li>
            ))}
          </ol>

          <aside className="enterprise-no-teams-cta">
            <p className="enterprise-no-teams-cta-label">Choose how to continue</p>
            {info ? (
              <p className="enterprise-no-teams-info" role="status">
                {info}
              </p>
            ) : null}
            <div className="enterprise-no-teams-actions">
              <button
                type="button"
                className="enterprise-no-teams-btn enterprise-no-teams-btn-primary"
                onClick={() => setCreateOpen(true)}
                data-testid="no-teams-create"
              >
                Create workspace
              </button>
              <button
                type="button"
                className="enterprise-no-teams-btn enterprise-no-teams-btn-secondary"
                onClick={() => setJoinOpen(true)}
                data-testid="no-teams-join"
              >
                Join with invite code
              </button>
            </div>
            <p className="enterprise-no-teams-footnote">
              Creating a workspace makes you the owner. Billing is managed per workspace on Plan.
            </p>
          </aside>
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
