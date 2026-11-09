import { useEffect, useState } from "react";
import { usePlans } from "../lib/plans-api";
import {
  createWebPaidWorkspaceCheckout,
  createWebTeam,
  fetchWebMe,
  fetchWebTeams,
  fetchWebPaidWorkspaceCheckout,
  postJoinTeamByCode,
  type JoinByCodeResult,
  type WebTeamRow,
} from "../lib/api";

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
  const [canStartTrial, setCanStartTrial] = useState<boolean | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<"pro" | "operations">("pro");
  const plans = usePlans();
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
      setCanStartTrial(null);
      setSelectedPlan("pro");
    } else {
      void fetchWebMe()
        .then((me) => setCanStartTrial(me?.canStartWorkspaceTrial !== false))
        .catch(() => setCanStartTrial(true));
    }
  }, [createOpen]);

  const onCreateDetailsNext = async () => {
    const name = createName.trim().toLocaleLowerCase();
    setCreateErr(null);
    setCreateBusy(true);
    try {
      const mine = await fetchWebTeams().catch(() => [] as WebTeamRow[]);
      if (mine.some((team) => team.name.trim().toLocaleLowerCase() === name)) {
        setCreateErr("You already have a workspace with this name. Pick a different name.");
        return;
      }
      setCreateStep("confirm");
    } finally {
      setCreateBusy(false);
    }
  };

  const onCreateWorkspace = async () => {
    const trimmed = createName.trim();
    const industry = createIndustry.trim();
    if (!trimmed || !industry || createBusy) return;
    setCreateBusy(true);
    setCreateErr(null);
    const checkoutWindow = canStartTrial === false ? window.open("", "_blank") : null;
    if (checkoutWindow) checkoutWindow.opener = null;
    try {
      let team: WebTeamRow;
      if (canStartTrial === false) {
        if (!checkoutWindow) throw new Error("Allow pop-ups to open secure checkout.");
        const checkout = await createWebPaidWorkspaceCheckout({
          name: trimmed,
          industry,
          plan: selectedPlan,
        });
        checkoutWindow.location.replace(checkout.url);
        let completed: WebTeamRow | null = null;
        for (let attempt = 0; attempt < 300; attempt += 1) {
          const status = await fetchWebPaidWorkspaceCheckout(checkout.checkoutId);
          if (status.status === "completed" && status.team) {
            completed = status.team;
            break;
          }
          if (status.status === "expired" || status.status === "failed") {
            throw new Error("Checkout did not complete. No workspace was created.");
          }
          if (checkoutWindow.closed) {
            throw new Error("Checkout was closed. No workspace was created.");
          }
          await new Promise((resolve) => window.setTimeout(resolve, 1_000));
        }
        if (!completed) throw new Error("Workspace setup is still waiting for checkout confirmation.");
        checkoutWindow.close();
        team = completed;
      } else {
        team = await createWebTeam({ name: trimmed, industry, startTrial: true });
      }
      setCreatedTeam(team);
      setCreateStep("welcome");
      await onRefreshWorkspaces().catch(() => {
        /* keep the successful creation confirmation available */
      });
    } catch (e) {
      checkoutWindow?.close();
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
            className={`enterprise-task-modal chat-create-modal workspace-form-modal${
              createStep !== "details" && canStartTrial !== false ? " workspace-form-modal--trial" : ""
            }`}
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
                    ? canStartTrial === false
                      ? "Choose a workspace plan"
                      : "Start your Operations trial"
                    : "Your workspace is ready"}
              </h3>
              <p className="enterprise-muted">
                {createStep === "details"
                  ? canStartTrial === false
                    ? "Tell us about your workspace. Nothing is created until paid checkout succeeds."
                    : "Tell us about your workspace. Nothing is created until you confirm the trial."
                  : createStep === "confirm"
                    ? canStartTrial === false
                      ? "Your workspace is created only after secure checkout succeeds."
                      : "Try every Operations feature for 14 days. No card is required."
                    : canStartTrial === false
                      ? `Welcome to ${createdTeam?.name ?? createName.trim()}. Your paid workspace is active.`
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
              ) : createStep === "confirm" && canStartTrial !== false ? (
                <div className="workspace-trial-premium">
                  <div className="workspace-trial-hero">
                    <span className="workspace-trial-badge">Operations plan</span>
                    <p className="workspace-trial-days">
                      <strong>14</strong>
                      <span>days free</span>
                    </p>
                    <p className="workspace-trial-hero-note">Every Operations feature, unlocked.</p>
                  </div>
                  <ul className="workspace-trial-features">
                    <li>Team tasks, chat, calendars, and coaching</li>
                    <li>Seneca AI, check-ins, and development plans</li>
                    <li>Alenio Go checklists, walks, and temperature checks</li>
                  </ul>
                  <div className="workspace-trial-ws">
                    <span className="workspace-trial-ws-mark" aria-hidden>
                      {createName.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="workspace-trial-ws-copy">
                      <strong>{createName.trim()}</strong>
                      <small>{createIndustry.trim()}</small>
                    </span>
                  </div>
                  <p className="workspace-trial-fine">
                    Choose a paid plan before day 14 to keep editing. Nothing is charged today.
                  </p>
                </div>
              ) : createStep === "confirm" ? (
                <div className="workspace-trial-confirm">
                  <strong>Your free trial has already been used</strong>
                  <p>Choose a plan. No workspace is created and no charge is made unless checkout succeeds.</p>
                  <label className="auth-label" htmlFor="ws-create-plan">Workspace plan</label>
                  <select
                    id="ws-create-plan"
                    className="auth-input"
                    value={selectedPlan}
                    onChange={(event) => setSelectedPlan(event.target.value === "operations" ? "operations" : "pro")}
                    data-testid="create-workspace-plan"
                  >
                    <option value="pro">
                      {plans.pro.name} — {plans.pro.priceLabel} {plans.pro.periodLabel}
                    </option>
                    <option value="operations">
                      {plans.operations.name} — {plans.operations.priceLabel} {plans.operations.periodLabel}
                    </option>
                  </select>
                  <p><strong>{createName.trim()}</strong> · {createIndustry.trim()}</p>
                </div>
              ) : (
                <div className="workspace-trial-welcome" role="status">
                  <span className="workspace-trial-welcome-mark" aria-hidden>✓</span>
                  <p>
                    {canStartTrial === false
                      ? `Your ${selectedPlan === "operations" ? "Operations" : "Pro"} workspace is active.`
                      : "All Operations features are unlocked. We’ll show a countdown in your workspace."}
                  </p>
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
                  disabled={!createName.trim() || !createIndustry.trim() || canStartTrial === null || createBusy}
                  data-testid="create-workspace-details-next"
                  onClick={() => void onCreateDetailsNext()}
                >
                  {createBusy ? "Checking…" : "Continue"}
                </button>
              ) : createStep === "confirm" ? (
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                  disabled={createBusy}
                  data-testid="create-workspace-submit"
                  onClick={() => void onCreateWorkspace()}
                >
                  {createBusy
                    ? canStartTrial === false
                      ? "Waiting for checkout…"
                      : "Creating…"
                    : canStartTrial === false
                      ? "Continue to secure checkout"
                      : "Start free trial"}
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
