import { useEffect, useState } from "react";
import { createWebTeam, postJoinTeamByCode, type JoinByCodeResult } from "../lib/api";

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
};

export function WorkspaceCreateJoinModals({
  joinOpen,
  createOpen,
  onCloseJoin,
  onCloseCreate,
  onRefreshWorkspaces,
  onJoinSuccessInfo,
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

  return (
    <>
      {joinOpen ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !joinBusy && closeJoin()}>
          <div
            className="enterprise-modal-panel"
            role="dialog"
            aria-labelledby="ws-join-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ws-join-title" className="enterprise-modal-title">
              Join workspace
            </h3>
            <p className="enterprise-muted enterprise-modal-sub">Paste the invite code your team shared.</p>
            <input
              className="auth-input enterprise-modal-input"
              placeholder="Invite code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
            />
            {joinErr ? (
              <p className="enterprise-form-error" role="alert">
                {joinErr}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button type="button" className="enterprise-inline-link" disabled={joinBusy} onClick={closeJoin}>
                Cancel
              </button>
              <button
                type="button"
                className="auth-submit"
                disabled={joinBusy || !joinCode.trim()}
                onClick={async () => {
                  setJoinBusy(true);
                  setJoinErr(null);
                  try {
                    const res = await postJoinTeamByCode(joinCode.trim());
                    if (isJoinPendingResult(res)) {
                      onJoinSuccessInfo?.(`Request sent to ${res.teamName}. A team leader will approve your join.`);
                      closeJoin();
                    } else {
                      closeJoin();
                    }
                    await onRefreshWorkspaces();
                  } catch (e) {
                    setJoinErr(e instanceof Error ? e.message : "Could not join.");
                  } finally {
                    setJoinBusy(false);
                  }
                }}
              >
                {joinBusy ? "Sending…" : "Continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !createBusy && closeCreate()}>
          <div
            className="enterprise-modal-panel"
            role="dialog"
            aria-labelledby="ws-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ws-create-title" className="enterprise-modal-title">
              Create workspace
            </h3>
            <p className="enterprise-muted enterprise-modal-sub">You will be the workspace owner.</p>
            <input
              className="auth-input enterprise-modal-input"
              placeholder="Workspace name"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
            />
            {createErr ? (
              <p className="enterprise-form-error" role="alert">
                {createErr}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button type="button" className="enterprise-inline-link" disabled={createBusy} onClick={closeCreate}>
                Cancel
              </button>
              <button
                type="button"
                className="auth-submit"
                disabled={createBusy || !createName.trim()}
                onClick={async () => {
                  setCreateBusy(true);
                  setCreateErr(null);
                  try {
                    await createWebTeam(createName.trim());
                    closeCreate();
                    await onRefreshWorkspaces();
                  } catch (e) {
                    setCreateErr(e instanceof Error ? e.message : "Could not create workspace.");
                  } finally {
                    setCreateBusy(false);
                  }
                }}
              >
                {createBusy ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
