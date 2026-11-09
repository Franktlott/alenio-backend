import { Check, Copy, Mail, MessageSquareText, X } from "lucide-react";
import { useEffect, useState } from "react";

function useCopied(): [string | null, (key: string, text: string) => void] {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(null), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).then(() => setCopied(key));
  };
  return [copied, copy];
}

export function workspaceInviteMessage(teamName: string, code: string, origin: string): string {
  return `Join ${teamName} on Alenio! Download the Alenio app or sign up at ${origin}/signup, then join the workspace with invite code ${code}.`;
}

/** Invite people: share the workspace code, add someone by email, or review pending invites. */
export function WorkspaceInviteModal({
  open,
  teamName,
  inviteCode,
  pendingCount,
  onClose,
  onAddByEmail,
  onOpenPending,
}: {
  open: boolean;
  teamName: string;
  inviteCode: string | null;
  pendingCount: number;
  onClose: () => void;
  onAddByEmail: () => void;
  onOpenPending: () => void;
}) {
  const [copied, copy] = useCopied();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const message = inviteCode ? workspaceInviteMessage(teamName, inviteCode, window.location.origin) : "";

  return (
    <div className="ws-invite-backdrop" role="presentation" onClick={onClose}>
      <div className="ws-invite" role="dialog" aria-label="Invite people" onClick={(e) => e.stopPropagation()} data-testid="ws-invite-modal">
        <button type="button" className="ws-invite-close" aria-label="Close" onClick={onClose}>
          <X size={18} strokeWidth={2.2} />
        </button>
        <header className="ws-invite-head">
          <h2>Invite people</h2>
          <p>Bring your team into {teamName}.</p>
        </header>

        <section className="ws-invite-block">
          <h3>Share your invite code</h3>
          <p>Anyone with this code can join from the Alenio app or website.</p>
          {inviteCode ? (
            <>
              <div className="ws-invite-code" data-testid="ws-invite-code">
                <span>{inviteCode}</span>
                <button type="button" className="ws-invite-copy" onClick={() => copy("code", inviteCode)}>
                  {copied === "code" ? <Check size={15} strokeWidth={2.6} /> : <Copy size={15} strokeWidth={2.2} />}
                  {copied === "code" ? "Copied" : "Copy code"}
                </button>
              </div>
              <button type="button" className="ws-invite-link" onClick={() => copy("message", message)}>
                {copied === "message" ? <Check size={15} strokeWidth={2.6} /> : <MessageSquareText size={15} strokeWidth={2.2} />}
                {copied === "message" ? "Invite message copied" : "Copy an invite message to text or email"}
              </button>
            </>
          ) : (
            <p className="ws-invite-muted">This workspace doesn't have an invite code yet.</p>
          )}
        </section>

        <div className="ws-invite-or" aria-hidden>
          <span>or</span>
        </div>

        <section className="ws-invite-block">
          <h3>Add by email</h3>
          <p>We'll add them right away if they're on Alenio, or email them an invite if they're not.</p>
          <button type="button" className="ws-panel-btn" onClick={onAddByEmail} data-testid="ws-invite-email">
            <Mail size={16} strokeWidth={2.2} />
            Add member by email
          </button>
        </section>

        {pendingCount > 0 ? (
          <footer className="ws-invite-foot">
            <button type="button" onClick={onOpenPending} data-testid="ws-invite-pending">
              {pendingCount} pending {pendingCount === 1 ? "invite" : "invites"} — view, resend or cancel
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
