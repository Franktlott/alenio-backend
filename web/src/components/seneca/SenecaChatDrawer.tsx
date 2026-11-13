import { useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { SenecaPage } from "../../routes/seneca/SenecaPage";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Right-side panel hosting the real Seneca chat (history + multi-turn).
 * Closing returns to home on next open; chats stay saved (7-day retention).
 */
export function SenecaChatDrawer({ open, onClose }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();

  const clearActiveChat = useCallback(() => {
    if (!searchParams.has("c") && !searchParams.has("q")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("c");
    next.delete("q");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleClose = useCallback(() => {
    clearActiveChat();
    onClose();
  }, [clearActiveChat, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, handleClose]);

  if (!open) return null;

  return createPortal(
    <div className="seneca-chat-drawer-root" data-testid="seneca-chat-drawer">
      <button
        type="button"
        className="seneca-chat-drawer-backdrop"
        aria-label="Close Seneca assistant"
        onClick={handleClose}
      />
      <aside
        className="seneca-chat-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-chat-drawer-title"
      >
        <header className="seneca-chat-drawer-header">
          <div className="seneca-chat-drawer-brand">
            <img src="/seneca-button-icon.png" alt="" width={36} height={36} aria-hidden />
            <div>
              <h2 id="seneca-chat-drawer-title">Seneca</h2>
              <p>Your AI coaching assistant</p>
            </div>
          </div>
          <div className="seneca-chat-drawer-actions">
            <button
              type="button"
              className="seneca-chat-drawer-close"
              aria-label="Close Seneca"
              onClick={handleClose}
            >
              ×
            </button>
          </div>
        </header>
        <div className="seneca-chat-drawer-body">
          <SenecaPage embedded />
        </div>
      </aside>
    </div>,
    document.body,
  );
}
