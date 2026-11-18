import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button, StatusIndicator } from "../../components/ui";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  deleteIncompleteSignup,
  formatAdminDate,
  type IncompleteSignupRow,
} from "../../lib/admin-api";
import { staffCan } from "../../lib/staff-access";
import "../discover/discover-categories-drawer.css";

function statusLabel(row: IncompleteSignupRow): string {
  if (row.status === "awaiting_verification") return "Awaiting verification";
  if (row.status === "verified_not_synced") return "Verified, not synced";
  return "Synced";
}

export function AdminIncompleteSignupDrawer({
  signup,
  onClose,
  onDeleted,
}: {
  signup: IncompleteSignupRow | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const { me } = useEnterpriseShell();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mayDelete = staffCan(me, "users.delete");
  const open = Boolean(signup);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    setBusy(false);
    setError(null);
  }, [signup?.id]);

  if (!signup) return null;

  const canDeleteAuthOnly = !signup.hasAppUser;

  const handleDelete = async () => {
    if (!mayDelete || !canDeleteAuthOnly) return;
    const ok = window.confirm(
      `Delete incomplete signup for ${signup.email}?\n\nThis removes the Better Auth account and any pending verification emails. It cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await deleteIncompleteSignup(signup.id);
      onDeleted(signup.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete this signup.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="dcat-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside
        className="dcat-drawer au-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Review ${signup.email}`}
        data-testid="au-incomplete-drawer"
      >
        <header className="dcat-head au-drawer-head">
          <div className="au-drawer-title-row">
            <span className="au-avatar au-avatar--lg au-avatar--blank" aria-hidden>
              {(signup.name || signup.email).slice(0, 1).toUpperCase()}
            </span>
            <div>
              <h2>{signup.name || "Unnamed"}</h2>
              <p className="au-drawer-email">{signup.email}</p>
              <div className="au-drawer-badges">
                <StatusIndicator tone={signup.emailVerified ? "accent" : "warning"}>
                  {statusLabel(signup)}
                </StatusIndicator>
              </div>
            </div>
          </div>
          <button type="button" className="dcat-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2} />
          </button>
        </header>

        <div className="dcat-body au-drawer-body">
          <section className="au-review-block">
            <h3>Signup details</h3>
            <dl className="au-review-dl">
              <div>
                <dt>Email verified</dt>
                <dd>{signup.emailVerified ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Alenio app user</dt>
                <dd>{signup.hasAppUser ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt>Started</dt>
                <dd>{formatAdminDate(signup.createdAt)}</dd>
              </div>
              <div>
                <dt>Auth user id</dt>
                <dd className="au-mono">{signup.id}</dd>
              </div>
            </dl>
          </section>

          <section className="au-review-block">
            <h3>What this means</h3>
            <p>
              {signup.hasAppUser
                ? "This auth account already has a finished Alenio user. Delete it from the regular Users list instead."
                : signup.emailVerified
                  ? "They verified email, but never synced into Alenio. Safe to remove if this was abandoned."
                  : "They started signup and may have received OTP email, but never finished verification."}
            </p>
          </section>

          {error ? <p className="discover-error">{error}</p> : null}
        </div>

        <footer className="dcat-foot au-drawer-foot">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          {mayDelete ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => void handleDelete()}
              disabled={busy || !canDeleteAuthOnly}
              title={canDeleteAuthOnly ? undefined : "Has an Alenio app user — use Users delete instead"}
              data-testid="au-incomplete-delete"
            >
              <Trash2 size={15} strokeWidth={2} />
              {busy ? "Deleting…" : "Delete signup"}
            </Button>
          ) : null}
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
