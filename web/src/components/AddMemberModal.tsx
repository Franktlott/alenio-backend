import { useEffect, useState } from "react";
import { previewTeamInvite, type WebTeamInvitePreview } from "../lib/api";

type Props = {
  open: boolean;
  teamId: string;
  teamName: string;
  confirming: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (email: string) => void;
  onClearError?: () => void;
};

export function AddMemberModal({
  open,
  teamId,
  teamName,
  confirming,
  error,
  onClose,
  onConfirm,
  onClearError,
}: Props) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "confirm">("email");
  const [preview, setPreview] = useState<WebTeamInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const reset = () => {
    setEmail("");
    setStep("email");
    setPreview(null);
    setPreviewLoading(false);
    setPreviewError(null);
  };

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleContinue = async () => {
    const trimmed = email.trim();
    if (!trimmed || !teamId) return;
    setPreviewLoading(true);
    setPreviewError(null);
    onClearError?.();
    try {
      const result = await previewTeamInvite(teamId, trimmed);
      setPreview(result);
      setStep("confirm");
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "Could not look up this email.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirm = () => {
    const trimmed = email.trim();
    if (!trimmed || preview?.alreadyMember) return;
    onConfirm(trimmed);
  };

  if (!open) return null;

  const displayName = preview?.user?.name ?? preview?.email ?? email;
  const otherWorkspaces = (preview?.workspaces ?? []).filter((ws) => !ws.isCurrentTeam);

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={handleClose}>
      <div
        className="enterprise-modal-sheet enterprise-add-member-modal"
        role="dialog"
        aria-label="Add member"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" onClick={handleClose}>
          ×
        </button>

        <div className="enterprise-add-member-head">
          {step === "confirm" ? (
            <button
              type="button"
              className="enterprise-add-member-back"
              onClick={() => {
                setStep("email");
                setPreview(null);
                setPreviewError(null);
              }}
            >
              ← Back
            </button>
          ) : null}
          <div>
            <h3 style={{ marginTop: 0, marginBottom: 4 }}>{step === "confirm" ? "Confirm add" : "Add member"}</h3>
            <p className="enterprise-muted" style={{ margin: 0 }}>{teamName}</p>
          </div>
        </div>

        {step === "email" ? (
          <>
            <p className="enterprise-muted">
              Enter their email. We&apos;ll look them up before adding them to this workspace.
            </p>
            {(error || previewError) ? (
              <p className="enterprise-form-error" role="alert" style={{ marginBottom: 16 }}>
                {error ?? previewError}
              </p>
            ) : null}
            <label className="enterprise-muted" style={{ fontSize: 13, display: "block", marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              className="enterprise-team-list-search"
              style={{ width: "100%", marginBottom: 16 }}
              placeholder="name@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                onClearError?.();
                setPreviewError(null);
              }}
              autoComplete="email"
            />
            <button
              type="button"
              className="auth-submit"
              disabled={previewLoading || !email.trim()}
              onClick={() => void handleContinue()}
            >
              {previewLoading ? "Looking up…" : "Continue"}
            </button>
          </>
        ) : (
          <div className="enterprise-add-member-confirm">
            <div className="enterprise-add-member-person">
              <span className="enterprise-add-member-avatar">
                {preview?.user?.image ? (
                  <img src={preview.user.image} alt={displayName ?? "Member"} />
                ) : (
                  (displayName?.[0] ?? "?").toUpperCase()
                )}
              </span>
              <strong className="enterprise-add-member-name">{displayName}</strong>
              <span className="enterprise-muted">{preview?.email}</span>
            </div>

            {preview?.alreadyMember ? (
              <p className="enterprise-form-error" role="alert">
                This person is already in {teamName}.
              </p>
            ) : preview?.found ? (
              <p className="enterprise-muted enterprise-add-member-copy">
                Add <strong>{preview.user?.name ?? "this person"}</strong> to <strong>{teamName}</strong>? They&apos;ll join right away.
              </p>
            ) : (
              <p className="enterprise-muted enterprise-add-member-copy">
                This email isn&apos;t on Alenio yet. We&apos;ll send an invite to join <strong>{teamName}</strong>.
              </p>
            )}

            {preview?.pendingInvite && !preview.alreadyMember ? (
              <p className="enterprise-add-member-note">Already invited — confirming will refresh their invite.</p>
            ) : null}

            {preview?.found && otherWorkspaces.length > 0 ? (
              <div className="enterprise-add-member-workspaces">
                <h4>Workspaces ({otherWorkspaces.length})</h4>
                <ul>
                  {otherWorkspaces.map((ws) => (
                    <li key={ws.id}>
                      <span className="enterprise-add-member-ws-avatar">
                        {ws.image ? <img src={ws.image} alt={ws.name} /> : (ws.name[0] ?? "?").toUpperCase()}
                      </span>
                      <span>
                        <strong>{ws.name}</strong>
                        <span className="enterprise-muted">
                          {ws.role === "owner" ? "Owner" : ws.role === "team_leader" ? "Team Leader" : "Member"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? (
              <p className="enterprise-form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="button"
              className="auth-submit"
              disabled={confirming || preview?.alreadyMember}
              onClick={handleConfirm}
            >
              {confirming ? "Adding…" : preview?.found ? `Add to ${teamName}` : "Send invite"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
