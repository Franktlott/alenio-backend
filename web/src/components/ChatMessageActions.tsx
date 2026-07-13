import { type MouseEvent, type PointerEvent, type ReactNode, useCallback, useRef } from "react";
import type { ChatMessageReaction, DirectChatMessage, TeamChatMessage } from "../lib/api";

export const CHAT_REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

export type ChatMessageLike = TeamChatMessage | DirectChatMessage;

export function groupChatReactions(reactions: ChatMessageReaction[] | undefined) {
  const map = new Map<string, { count: number; userIds: string[] }>();
  for (const r of reactions ?? []) {
    const row = map.get(r.emoji) ?? { count: 0, userIds: [] };
    row.count += 1;
    row.userIds.push(r.userId);
    map.set(r.emoji, row);
  }
  return [...map.entries()].map(([emoji, data]) => ({ emoji, ...data }));
}

export function useChatLongPress(onLongPress: () => void, delayMs = 450) {
  const timerRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      cancel();
      timerRef.current = window.setTimeout(onLongPress, delayMs);
    },
    [cancel, delayMs, onLongPress],
  );

  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      cancel();
      onLongPress();
    },
    [cancel, onLongPress],
  );

  return { onPointerDown, onPointerUp: cancel, onPointerLeave: cancel, onPointerCancel: cancel, onContextMenu };
}

type InteractiveBodyProps = {
  className?: string;
  onLongPress: () => void;
  children: ReactNode;
};

export function ChatMessageBodyInteractive({ className = "", onLongPress, children }: InteractiveBodyProps) {
  const longPress = useChatLongPress(onLongPress);
  return (
    <div className={`chat-message-body chat-message-body--interactive ${className}`.trim()} {...longPress}>
      {children}
    </div>
  );
}

type ReactionPillsProps = {
  reactions: ChatMessageReaction[] | undefined;
  currentUserId: string | undefined;
  onOpen: () => void;
};

export function ChatMessageReactionPills({ reactions, currentUserId, onOpen }: ReactionPillsProps) {
  const grouped = groupChatReactions(reactions);
  if (grouped.length === 0) return null;

  return (
    <div className={`chat-message-reactions${grouped.length ? "" : ""}`}>
      {grouped.map(({ emoji, count, userIds }) => {
        const isMine = currentUserId ? userIds.includes(currentUserId) : false;
        return (
          <button
            key={emoji}
            type="button"
            className={`chat-message-reaction-pill${isMine ? " chat-message-reaction-pill--mine" : ""}`}
            onClick={onOpen}
            aria-label={`${emoji} reaction${count > 1 ? `, ${count}` : ""}`}
          >
            <span aria-hidden>{emoji}</span>
            {count > 1 ? <span className="chat-message-reaction-count">{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

type ActionSheetProps = {
  open: boolean;
  message: ChatMessageLike | null;
  myReaction: string | undefined;
  canEdit: boolean;
  canDelete: boolean;
  saving: boolean;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onRemoveReaction: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function ChatMessageActionSheet({
  open,
  message,
  myReaction,
  canEdit,
  canDelete,
  saving,
  onClose,
  onReact,
  onRemoveReaction,
  onEdit,
  onDelete,
}: ActionSheetProps) {
  if (!open || !message) return null;

  return (
    <div className="chat-message-sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="chat-message-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Message actions"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="chat-message-sheet-head">
          <p className="chat-message-sheet-eyebrow">Message</p>
          <h3 className="chat-message-sheet-title">Quick actions</h3>
        </header>

        <section className="chat-message-sheet-react" aria-label="Add reaction">
          <p className="chat-message-sheet-section-label">React</p>
          <div className="chat-message-sheet-emojis">
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const isMine = emoji === myReaction;
              return (
                <button
                  key={emoji}
                  type="button"
                  className={`chat-message-sheet-emoji${isMine ? " chat-message-sheet-emoji--active" : ""}`}
                  disabled={saving}
                  onClick={() => onReact(emoji)}
                  aria-label={`React with ${emoji}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </section>

        <div className="chat-message-sheet-actions">
          {myReaction ? (
            <button
              type="button"
              className="chat-message-sheet-action"
              disabled={saving}
              onClick={onRemoveReaction}
            >
              <span className="chat-message-sheet-action-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M8 12h8" />
                </svg>
              </span>
              <span className="chat-message-sheet-action-copy">
                <strong>Remove reaction</strong>
                <em>Clear your emoji on this message</em>
              </span>
            </button>
          ) : null}
          {canEdit ? (
            <button type="button" className="chat-message-sheet-action" disabled={saving} onClick={onEdit}>
              <span className="chat-message-sheet-action-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </span>
              <span className="chat-message-sheet-action-copy">
                <strong>Edit message</strong>
                <em>Update what you wrote</em>
              </span>
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="chat-message-sheet-action chat-message-sheet-action--danger"
              disabled={saving}
              onClick={onDelete}
            >
              <span className="chat-message-sheet-action-icon" aria-hidden>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                </svg>
              </span>
              <span className="chat-message-sheet-action-copy">
                <strong>Delete message</strong>
                <em>Remove it from this conversation</em>
              </span>
            </button>
          ) : null}
        </div>

        <button type="button" className="chat-message-sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type EditModalProps = {
  open: boolean;
  draft: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function ChatMessageEditModal({ open, draft, saving, onDraftChange, onClose, onSave }: EditModalProps) {
  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="chat-message-edit-modal" role="dialog" aria-modal="true" aria-label="Edit message" onClick={(e) => e.stopPropagation()}>
        <h3 className="enterprise-card-title">Edit message</h3>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          rows={4}
          className="chat-message-edit-input"
          autoFocus
        />
        <div className="chat-message-edit-actions">
          <button type="button" className="auth-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="auth-btn-primary" onClick={onSave} disabled={saving || !draft.trim()}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

type DeleteModalProps = {
  open: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ChatMessageDeleteConfirm({ open, saving, onClose, onConfirm }: DeleteModalProps) {
  if (!open) return null;

  return (
    <div className="enterprise-task-modal-backdrop" role="presentation" onClick={onClose}>
      <div className="chat-message-delete-modal" role="dialog" aria-modal="true" aria-label="Delete message" onClick={(e) => e.stopPropagation()}>
        <h3 className="enterprise-card-title">Delete message?</h3>
        <p className="enterprise-muted">This message will be permanently removed.</p>
        <div className="chat-message-edit-actions">
          <button type="button" className="auth-btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="enterprise-team-btn-destructive" onClick={onConfirm} disabled={saving}>
            {saving ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
