import { useState } from "react";
import type { WebTeamMemberRow } from "../lib/api";
import {
  initiateOwnershipTransfer,
  type OwnershipBillingPath,
  type OwnershipTransferDisposition,
} from "../lib/api";
import { UserAvatar } from "./UserAvatar";

type Props = {
  teamId: string;
  member: WebTeamMemberRow;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  onError: (error: string | null) => void;
  onStarted: () => void;
};

const DISPOSITIONS: { value: OwnershipTransferDisposition; label: string; hint: string }[] = [
  {
    value: "WORKSPACE_ADMIN",
    label: "Keep me as Workspace Admin (recommended)",
    hint: "You’ll stay as a team leader after the transfer.",
  },
  {
    value: "MANAGER",
    label: "Change me to Manager",
    hint: "Same mid-tier access as team leader in Alenio today.",
  },
  {
    value: "MEMBER",
    label: "Change me to Member",
    hint: "You’ll remain on the team as a regular member.",
  },
  {
    value: "REMOVE",
    label: "Remove me from the workspace after transfer",
    hint: "You’ll leave automatically once they accept.",
  },
];

export function OwnershipTransferModal({
  teamId,
  member,
  busy,
  error,
  onClose,
  onBusy,
  onError,
  onStarted,
}: Props) {
  const displayName = member.user.name ?? member.user.email ?? "this member";
  const [step, setStep] = useState<"review" | "confirm" | "success">("review");
  const [disposition, setDisposition] = useState<OwnershipTransferDisposition>("WORKSPACE_ADMIN");
  const [billingPath, setBillingPath] = useState<OwnershipBillingPath>("KEEP_PAYMENT_METHOD");
  const [password, setPassword] = useState("");
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [useSsoConfirm, setUseSsoConfirm] = useState(false);

  const dispositionLabel = DISPOSITIONS.find((d) => d.value === disposition)?.label ?? disposition;

  const submit = async () => {
    onBusy(true);
    onError(null);
    try {
      await initiateOwnershipTransfer(teamId, {
        toUserId: member.userId,
        previousOwnerDisposition: disposition,
        billingPath,
        ...(useSsoConfirm ? { confirmPhrase: "TRANSFER" } : { password }),
      });
      setStep("success");
      onStarted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transfer failed.";
      // Only offer TRANSFER confirm when the server says this account has no password.
      if (/typing TRANSFER|SSO reauthentication/i.test(msg)) {
        setUseSsoConfirm(true);
        setPassword("");
      } else {
        setUseSsoConfirm(false);
      }
      onError(msg);
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className="enterprise-modal-backdrop" role="presentation" onClick={() => !busy && onClose()}>
      <div
        className="enterprise-member-manage-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ownership-transfer-title"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <button type="button" className="enterprise-task-modal-close" aria-label="Close" disabled={busy} onClick={onClose}>
          ×
        </button>

        {step === "success" ? (
          <div className="enterprise-member-manage-section">
            <h3 id="ownership-transfer-title" className="enterprise-member-manage-title">
              ✓ Transfer request sent
            </h3>
            <p className="enterprise-member-manage-section-sub">
              <strong>{displayName}</strong> has 7 days to accept. You’ll see ownership change after they accept
              {billingPath === "REPLACE_PAYMENT_METHOD" ? " and complete payment setup" : ""}.
            </p>
            <p className="enterprise-muted" style={{ marginTop: 8 }}>
              Administrative control and billing responsibility move when they accept. Your current plan stays
              unchanged.
            </p>
            <div className="enterprise-member-manage-actions" style={{ marginTop: 16 }}>
              <button type="button" className="enterprise-modal-primary-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : null}

        {step === "review" ? (
          <>
            <header className="enterprise-member-manage-head">
              <div className="enterprise-member-manage-identity">
                <UserAvatar user={member.user} className="enterprise-member-manage-avatar" alt={displayName} />
                <div className="enterprise-member-manage-copy">
                  <h3 id="ownership-transfer-title" className="enterprise-member-manage-title">
                    Transfer Workspace Ownership
                  </h3>
                  <p className="enterprise-member-manage-section-sub">
                    This transfers administrative control and billing responsibility for this workspace to{" "}
                    <strong>{displayName}</strong>.
                  </p>
                </div>
              </div>
            </header>

            <section className="enterprise-member-manage-section">
              <h4 className="enterprise-member-manage-section-title">After transfer, what happens to you?</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {DISPOSITIONS.map((opt) => (
                  <label key={opt.value} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input
                      type="radio"
                      name="disposition"
                      checked={disposition === opt.value}
                      onChange={() => setDisposition(opt.value)}
                      disabled={busy}
                    />
                    <span>
                      <strong style={{ display: "block", fontSize: 13 }}>{opt.label}</strong>
                      <span className="enterprise-muted" style={{ fontSize: 12 }}>
                        {opt.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className="enterprise-member-manage-section enterprise-member-manage-section--divider">
              <h4 className="enterprise-member-manage-section-title">Billing</h4>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer", marginBottom: 8 }}>
                <input
                  type="radio"
                  name="billing"
                  checked={billingPath === "KEEP_PAYMENT_METHOD"}
                  onChange={() => setBillingPath("KEEP_PAYMENT_METHOD")}
                  disabled={busy}
                />
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>Keep existing payment method</strong>
                  <span className="enterprise-muted" style={{ fontSize: 12 }}>
                    Same Stripe subscription and card; billing contact updates to the new owner.
                  </span>
                </span>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input
                  type="radio"
                  name="billing"
                  checked={billingPath === "REPLACE_PAYMENT_METHOD"}
                  onChange={() => setBillingPath("REPLACE_PAYMENT_METHOD")}
                  disabled={busy}
                />
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>New owner must add a payment method</strong>
                  <span className="enterprise-muted" style={{ fontSize: 12 }}>
                    Ownership completes only after they add their card. No new subscription is created.
                  </span>
                </span>
              </label>
            </section>

            <section className="enterprise-member-manage-section enterprise-member-manage-section--divider">
              <h4 className="enterprise-member-manage-section-title">Review</h4>
              <ul className="enterprise-muted" style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>
                <li>Workspace ownership will transfer to {displayName} after they accept (within 7 days).</li>
                <li>Billing responsibility will transfer.</li>
                <li>Current plan will remain unchanged.</li>
                <li>Existing subscription remains active.</li>
                <li>{dispositionLabel}</li>
                <li>
                  {billingPath === "KEEP_PAYMENT_METHOD"
                    ? "Existing payment method will be kept."
                    : "New owner must add a payment method before ownership completes."}
                </li>
              </ul>
            </section>

            {error ? (
              <p className="enterprise-form-error enterprise-member-manage-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="enterprise-member-manage-actions">
              <button type="button" className="enterprise-member-manage-secondary-btn" disabled={busy} onClick={onClose}>
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-modal-primary-btn"
                disabled={busy}
                onClick={() => {
                  onError(null);
                  setStep("confirm");
                }}
              >
                Continue
              </button>
            </div>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            <header className="enterprise-member-manage-head">
              <h3 id="ownership-transfer-title" className="enterprise-member-manage-title">
                Confirm transfer
              </h3>
              <p className="enterprise-member-manage-section-sub">
                Reauthenticate to start the transfer to <strong>{displayName}</strong>.
              </p>
            </header>

            <section className="enterprise-member-manage-section">
              {!useSsoConfirm ? (
                <>
                  <label className="enterprise-muted" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
                    Account password
                  </label>
                  <input
                    type="password"
                    className="enterprise-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    autoComplete="current-password"
                    placeholder="Password"
                  />
                  <p className="enterprise-muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Required for accounts with email/password login.
                  </p>
                </>
              ) : (
                <>
                  <p className="enterprise-muted" style={{ fontSize: 13 }}>
                    This account uses SSO. Type <strong>TRANSFER</strong> to confirm.
                  </p>
                  <input
                    type="text"
                    className="enterprise-input"
                    value={confirmPhrase}
                    onChange={(e) => setConfirmPhrase(e.target.value)}
                    disabled={busy}
                    placeholder="TRANSFER"
                    autoCapitalize="characters"
                  />
                </>
              )}
            </section>
            {error ? (
              <p className="enterprise-form-error enterprise-member-manage-error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="enterprise-member-manage-actions">
              <button
                type="button"
                className="enterprise-member-manage-secondary-btn"
                disabled={busy}
                onClick={() => {
                  onError(null);
                  setStep("review");
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="enterprise-modal-primary-btn"
                disabled={
                  busy || (!useSsoConfirm ? password.trim().length === 0 : confirmPhrase.trim() !== "TRANSFER")
                }
                onClick={() => void submit()}
              >
                {busy ? "Sending…" : "Transfer ownership"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
