import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlenioGoLogo } from "../components/AlenioGoLogo";
import { fetchGoLinkStatus, postGoWorkspaceLink } from "../lib/api";
import { initGoAlertSound, unlockGoAlertSoundFromGesture } from "../lib/go-alert-sound";
import {
  clearGoLinkedWorkspace,
  clearGoPendingLink,
  defaultGoDeviceLabel,
  getGoDeviceId,
  loadGoLinkedWorkspace,
  loadGoPendingLink,
  saveGoLinkedWorkspace,
  saveGoPendingLink,
} from "../lib/go-device";

type Step = "linked" | "enter-code" | "pending" | "rejected";

export function AlenioGoLinkPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linked = loadGoLinkedWorkspace();
  const pending = loadGoPendingLink();
  const prefilledCode = searchParams.get("code")?.trim().toUpperCase() ?? "";
  const [step, setStep] = useState<Step>(() => {
    if (linked) return "linked";
    if (pending) return "pending";
    return "enter-code";
  });
  const [code, setCode] = useState(prefilledCode);
  const [teamName, setTeamName] = useState(linked?.teamName ?? pending?.teamName ?? "");
  const [requestId, setRequestId] = useState(pending?.requestId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finishApproval = useCallback(
    (hubToken: string, name: string) => {
      void unlockGoAlertSoundFromGesture();
      saveGoLinkedWorkspace(hubToken, name);
      clearGoPendingLink();
      setTeamName(name);
      navigate(`/checklist/${hubToken}`, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    initGoAlertSound();
  }, []);

  useEffect(() => {
    if (step !== "pending" || !requestId) return;
    const deviceId = getGoDeviceId();
    let cancelled = false;
    const poll = async () => {
      try {
        const data = await fetchGoLinkStatus(deviceId, requestId);
        if (cancelled) return;
        if (data.status === "approved" && data.hubToken) {
          finishApproval(data.hubToken, data.teamName);
        } else if (data.status === "rejected") {
          clearGoPendingLink();
          setStep("rejected");
          setError("Your workspace leaders declined this device.");
        }
      } catch {
        /* keep polling */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [step, requestId, finishApproval]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your workspace code.");
      return;
    }
    setBusy(true);
    setError(null);
    void unlockGoAlertSoundFromGesture();
    try {
      const data = await postGoWorkspaceLink({
        inviteCode: trimmed,
        deviceId: getGoDeviceId(),
        deviceLabel: defaultGoDeviceLabel(),
      });
      if (data.status === "approved" && data.hubToken) {
        finishApproval(data.hubToken, data.teamName);
        return;
      }
      setTeamName(data.teamName);
      setRequestId(data.requestId);
      saveGoPendingLink({ requestId: data.requestId, teamName: data.teamName });
      setStep("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not link workspace.");
    } finally {
      setBusy(false);
    }
  }

  function onUseDifferentWorkspace() {
    clearGoLinkedWorkspace();
    clearGoPendingLink();
    setCode("");
    setRequestId("");
    setTeamName("");
    setError(null);
    setStep("enter-code");
  }

  return (
    <div className="alenio-go-link-page" data-testid="aleniogo-link-page">
      <div className="alenio-go-link-card">
        <AlenioGoLogo variant="page" className="alenio-go-link-logo" />
        <h1 className="alenio-go-link-title">Link your workspace</h1>
        <p className="alenio-go-link-sub">
          Enter your workspace code to connect this device to Alenio Go. Your workspace owner or team leader will
          approve the login.
        </p>

        {step === "linked" && linked ? (
          <div className="alenio-go-link-body">
            <p className="alenio-go-link-status alenio-go-link-status--ok">
              Connected to <strong>{linked.teamName}</strong>
            </p>
            <Link
              className="alenio-go-link-primary"
              to={`/checklist/${linked.hubToken}`}
              onClick={() => void unlockGoAlertSoundFromGesture()}
            >
              Open Alenio Go
            </Link>
            <button type="button" className="alenio-go-link-secondary" onClick={onUseDifferentWorkspace}>
              Link a different workspace
            </button>
          </div>
        ) : null}

        {step === "enter-code" || step === "rejected" ? (
          <form className="alenio-go-link-body" onSubmit={(e) => void onSubmit(e)}>
            <label className="alenio-go-link-label" htmlFor="workspace-code">
              Workspace code
            </label>
            <input
              id="workspace-code"
              className="alenio-go-link-input"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. ABC123"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              data-testid="aleniogo-workspace-code"
            />
            {error ? (
              <p className="alenio-go-link-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="alenio-go-link-primary" disabled={busy}>
              {busy ? "Sending request…" : "Request access"}
            </button>
          </form>
        ) : null}

        {step === "pending" ? (
          <div className="alenio-go-link-body">
            <p className="alenio-go-link-status">
              Waiting for approval to connect to <strong>{teamName}</strong>.
            </p>
            <p className="alenio-go-link-hint">
              Your workspace owner and team leaders were notified. Keep this page open — you&apos;ll connect
              automatically once approved.
            </p>
            <button type="button" className="alenio-go-link-secondary" onClick={onUseDifferentWorkspace}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
