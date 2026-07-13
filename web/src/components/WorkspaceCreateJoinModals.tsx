import { useEffect, useState } from "react";
import { createWebTeam, postJoinTeamByCode, type JoinByCodeResult, type WebTeamRow } from "../lib/api";

function isJoinPendingResult(r: JoinByCodeResult): r is { status: "pending"; teamName: string; requestId: string } {
  return "status" in r && r.status === "pending";
}

type Props = {
  joinOpen: boolean;
  createOpen: boolean;
  onCloseJoin: () => void;
  onCloseCreate: () => void;
  onRefreshWorkspaces: () => Promise<void>;
  onJoinSuccessInfo?: (msg: string) => void;
  /** Fired after create (or an immediate join) so the shell can select the workspace and navigate. */
  onWorkspaceEntered?: (team: WebTeamRow) => void | Promise<void>;
};

export function WorkspaceCreateJoinModals({
  joinOpen,
  createOpen,
  onCloseJoin,
  onCloseCreate,
  onRefreshWorkspaces,
  onJoinSuccessInfo,
  onWorkspaceEntered,
}: Props) {
  const [joinCode, setJoinCode] = useState("");
  const [createName, setCreateName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const closeJoin = () => {
    onCloseJoin();
    setJoinCode("");
    setJoinErr(null);
  };

  const closeCreate = () => {
    onCloseCreate();
    setCreateName("");
    setCreateErr(null);
  };

  useEffect(() => {
    if (!joinOpen) {
      setJoinCode("");
      setJoinErr(null);
    }
  }, [joinOpen]);

  useEffect(() => {
    if (!createOpen) {
      setCreateName("");
      setCreateErr(null);
    }
  }, [createOpen]);

  const onCreateWorkspace = async () => {
    const trimmed = createName.trim();
    if (!trimmed || createBusy) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const team = await createWebTeam(trimmed);
      closeCreate();
      await onWorkspaceEntered?.(team);
      await onRefreshWorkspaces().catch(() => {
        /* shell already has optimistic team from onWorkspaceEntered */
      });
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create workspace.");
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <>
      {joinOpen ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => !joinBusy && closeJoin()}>
          <div
            className="enterprise-task-modal chat-create-modal workspace-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-join-title"
            onClick={(e) => e.stopPropagation()}
            data-testid="join-workspace-modal"
          >
            <button
              type="button"
              className="enterprise-task-modal-close"
              aria-label="Close"
              disabled={joinBusy}
              onClick={closeJoin}
            >
              ×
            </button>
            <header className="enterprise-task-modal-head">
              <h3 id="ws-join-title" className="enterprise-task-modal-title">
                Join workspace
              </h3>
              <p className="enterprise-muted">Paste the invite code your team shared.</p>
            </header>
            <div className="chat-create-modal-body">
              {joinErr ? (
                <p className="enterprise-form-error" role="alert">
                  {joinErr}
                </p>
              ) : null}
              <label className="auth-label" htmlFor="ws-join-code">
                Invite code
              </label>
              <input
                id="ws-join-code"
                className="auth-input"
                placeholder="e.g. ABC123"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                autoFocus
                data-testid="join-workspace-code-input"
              />
            </div>
            <footer className="enterprise-task-modal-footer">
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                disabled={joinBusy}
                onClick={closeJoin}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                disabled={joinBusy || !joinCode.trim()}
                data-testid="join-workspace-submit"
                onClick={async () => {
                  setJoinBusy(true);
                  setJoinErr(null);
                  try {
                    const res = await postJoinTeamByCode(joinCode.trim());
                    if (isJoinPendingResult(res)) {
                      onJoinSuccessInfo?.(`Request sent to ${res.teamName}. A team leader will approve your join.`);
                      closeJoin();
                      await onRefreshWorkspaces();
                    } else {
                      closeJoin();
                      await onWorkspaceEntered?.(res);
                      await onRefreshWorkspaces().catch(() => undefined);
                    }
                  } catch (e) {
                    setJoinErr(e instanceof Error ? e.message : "Could not join.");
                  } finally {
                    setJoinBusy(false);
                  }
                }}
              >
                {joinBusy ? "Sending…" : "Continue"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => !createBusy && closeCreate()}>
          <div
            className="enterprise-task-modal chat-create-modal workspace-form-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ws-create-title"
            onClick={(e) => e.stopPropagation()}
            data-testid="create-workspace-modal"
          >
            <button
              type="button"
              className="enterprise-task-modal-close"
              aria-label="Close"
              disabled={createBusy}
              onClick={closeCreate}
            >
              ×
            </button>
            <header className="enterprise-task-modal-head">
              <h3 id="ws-create-title" className="enterprise-task-modal-title">
                Create workspace
              </h3>
              <p className="enterprise-muted">
                You will be the workspace owner. Subscriptions are billed per workspace on the Billing page.
              </p>
            </header>
            <div className="chat-create-modal-body">
              {createErr ? (
                <p className="enterprise-form-error" role="alert">
                  {createErr}
                </p>
              ) : null}
              <label className="auth-label" htmlFor="ws-create-name">
                Workspace name
              </label>
              <input
                id="ws-create-name"
                className="auth-input"
                placeholder="e.g. Acme Retail"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoComplete="organization"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && createName.trim() && !createBusy) {
                    e.preventDefault();
                    void onCreateWorkspace();
                  }
                }}
                data-testid="create-workspace-name-input"
              />
            </div>
            <footer className="enterprise-task-modal-footer">
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                disabled={createBusy}
                onClick={closeCreate}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                disabled={createBusy || !createName.trim()}
                data-testid="create-workspace-submit"
                onClick={() => void onCreateWorkspace()}
              >
                {createBusy ? "Creating…" : "Create workspace"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
