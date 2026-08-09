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
  const [createIndustry, setCreateIndustry] = useState("");
  const [createStep, setCreateStep] = useState<"details" | "confirm" | "welcome">("details");
  const [createdTeam, setCreatedTeam] = useState<WebTeamRow | null>(null);
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
    setCreateIndustry("");
    setCreateStep("details");
    setCreatedTeam(null);
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
      setCreateIndustry("");
      setCreateStep("details");
      setCreatedTeam(null);
      setCreateErr(null);
    }
  }, [createOpen]);

  const onCreateWorkspace = async () => {
    const trimmed = createName.trim();
    const industry = createIndustry.trim();
    if (!trimmed || !industry || createBusy) return;
    setCreateBusy(true);
    setCreateErr(null);
    try {
      const team = await createWebTeam({ name: trimmed, industry, startTrial: true });
      setCreatedTeam(team);
      setCreateStep("welcome");
      await onRefreshWorkspaces().catch(() => {
        /* keep the successful creation confirmation available */
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
                {createStep === "details"
                  ? "Create workspace"
                  : createStep === "confirm"
                    ? "Start your Operations trial"
                    : "Your workspace is ready"}
              </h3>
              <p className="enterprise-muted">
                {createStep === "details"
                  ? "Tell us about your workspace. Nothing is created until you confirm the trial."
                  : createStep === "confirm"
                    ? "Try every Operations feature for 14 days. No card is required."
                    : `Welcome to ${createdTeam?.name ?? createName.trim()}. Your 14-day Operations trial starts today.`}
              </p>
            </header>
            <div className="chat-create-modal-body">
              {createErr ? (
                <p className="enterprise-form-error" role="alert">
                  {createErr}
                </p>
              ) : null}
              {createStep === "details" ? (
                <>
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
                    data-testid="create-workspace-name-input"
                  />
                  <label className="auth-label" htmlFor="ws-create-industry">
                    Industry
                  </label>
                  <input
                    id="ws-create-industry"
                    className="auth-input"
                    placeholder="e.g. Retail, hospitality, healthcare"
                    value={createIndustry}
                    onChange={(e) => setCreateIndustry(e.target.value)}
                    data-testid="create-workspace-industry-input"
                  />
                  <p className="workspace-create-logo-note">
                    You can add a workspace logo later from Settings.
                  </p>
                </>
              ) : createStep === "confirm" ? (
                <div className="workspace-trial-confirm">
                  <strong>14 days of Operations, free</strong>
                  <ul>
                    <li>Team tasks, chat, calendars, and coaching</li>
                    <li>Alenio Go checklists, walks, and temperature checks</li>
                    <li>No card today; choose a paid plan before the trial ends to keep editing</li>
                  </ul>
                  <p>
                    <strong>{createName.trim()}</strong> · {createIndustry.trim()}
                  </p>
                </div>
              ) : (
                <div className="workspace-trial-welcome" role="status">
                  <span className="workspace-trial-welcome-mark" aria-hidden>✓</span>
                  <p>All Operations features are unlocked. We’ll show a countdown in your workspace.</p>
                </div>
              )}
            </div>
            <footer className="enterprise-task-modal-footer">
              {createStep !== "welcome" ? (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                  disabled={createBusy}
                  onClick={() => createStep === "confirm" ? setCreateStep("details") : closeCreate()}
                >
                  {createStep === "confirm" ? "Back" : "Cancel"}
                </button>
              ) : null}
              {createStep === "details" ? (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                  disabled={!createName.trim() || !createIndustry.trim()}
                  data-testid="create-workspace-details-next"
                  onClick={() => setCreateStep("confirm")}
                >
                  Continue
                </button>
              ) : createStep === "confirm" ? (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                  disabled={createBusy}
                  data-testid="create-workspace-submit"
                  onClick={() => void onCreateWorkspace()}
                >
                  {createBusy ? "Creating…" : "Start free trial"}
                </button>
              ) : (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                  data-testid="create-workspace-enter"
                  onClick={() => {
                    const team = createdTeam;
                    closeCreate();
                    if (team) void onWorkspaceEntered?.(team);
                  }}
                >
                  Enter workspace
                </button>
              )}
            </footer>
          </div>
        </div>
      ) : null}
    </>
  );
}
