import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  buildSenecaResponse,
  loadWorkspaceSnapshot,
  SENECA_QUICK_PROMPTS,
  senecaActionPath,
  type SenecaActionCard,
  type SenecaPrompt,
  type SenecaPromptId,
  type WorkspaceSnapshot,
} from "../../lib/seneca-assistant";
import { SenecaIcon } from "./SenecaShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

function PromptIcon({ id }: { id: SenecaPromptId }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, "aria-hidden": true as const };
  switch (id) {
    case "attention":
      return (
        <svg {...common}>
          <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
      );
    case "checklist":
      return (
        <svg {...common}>
          <path d="M9 11l3 3L22 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
      );
    case "prep-1on1":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "notes-to-tasks":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" strokeLinecap="round" />
        </svg>
      );
    case "recognize":
      return (
        <svg {...common}>
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    default:
      return null;
  }
}

export function SenecaAssistantDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { selectedTeamId, teams, me } = useEnterpriseShell();
  const teamId = selectedTeamId || teams?.[0]?.id || "";
  const teamName = teams?.find((t) => t.id === teamId)?.name ?? "Workspace";

  const [view, setView] = useState<"home" | "chat">("home");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [activePrompt, setActivePrompt] = useState<SenecaPrompt | null>(null);
  const [thinking, setThinking] = useState(false);
  const [message, setMessage] = useState("");
  const [actions, setActions] = useState<SenecaActionCard[]>([]);

  const resetChat = useCallback(() => {
    setView("home");
    setActivePrompt(null);
    setThinking(false);
    setMessage("");
    setActions([]);
  }, []);

  const handleClose = useCallback(() => {
    resetChat();
    onClose();
  }, [onClose, resetChat]);

  useEffect(() => {
    if (!open) {
      resetChat();
      return;
    }
    if (!teamId) return;

    let cancelled = false;
    setSnapshotLoading(true);
    void loadWorkspaceSnapshot(teamId, me?.id)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, teamId, me?.id, resetChat]);

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

  const onPromptSelect = (prompt: SenecaPrompt) => {
    setActivePrompt(prompt);
    setView("chat");
    setThinking(true);
    setMessage("");
    setActions([]);

    window.setTimeout(() => {
      const ctx =
        snapshot ??
        ({
          teamName,
          overdueTasks: 3,
          missedChecklists: 1,
          memberNeedingCheckIn: { name: "Vera", days: 42 },
          activeDevGoals: 2,
          membersWithoutRecentCheckIn: 1,
          fromLiveData: false,
        } satisfies WorkspaceSnapshot);
      const res = buildSenecaResponse(prompt.id, ctx);
      setMessage(res.message);
      setActions(res.actions);
      setThinking(false);
    }, 900);
  };

  const onAction = (action: SenecaActionCard) => {
    if (!teamId) return;
    handleClose();
    navigate(senecaActionPath(action.id, teamId));
  };

  if (!open) return null;

  return createPortal(
    <div className="seneca-drawer-backdrop" role="presentation" onClick={handleClose}>
      <aside
        className="seneca-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seneca-drawer-title"
        onClick={(e) => e.stopPropagation()}
        data-testid="seneca-assistant-drawer"
      >
        <div className="seneca-drawer-glow" aria-hidden />

        <header className="seneca-drawer-header">
          <div className="seneca-drawer-header-main">
            {view === "chat" ? (
              <button
                type="button"
                className="seneca-drawer-back"
                onClick={() => {
                  setView("home");
                  setActivePrompt(null);
                  setThinking(false);
                }}
              >
                ← Back
              </button>
            ) : (
              <div className="seneca-drawer-brand">
                <SenecaIcon size={36} className="seneca-drawer-brand-icon" />
                <div>
                  <h2 id="seneca-drawer-title" className="seneca-drawer-title">
                    Seneca
                  </h2>
                  <p className="seneca-drawer-kicker">AI Coaching Assistant</p>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="seneca-drawer-close" aria-label="Close Seneca" onClick={handleClose}>
            ×
          </button>
        </header>

        {view === "home" ? (
          <div className="seneca-drawer-body">
            {!teamId ? (
              <p className="seneca-drawer-lead">Create or join a workspace to unlock manager insights from Seneca.</p>
            ) : (
              <>
            <p className="seneca-drawer-lead">
              Your chief of staff for tasks, checklists, check-ins, development plans, and team recognition.
            </p>
            {snapshotLoading ? (
              <p className="seneca-drawer-muted">Scanning {teamName}…</p>
            ) : snapshot?.fromLiveData ? (
              <p className="seneca-drawer-muted seneca-drawer-muted--live">Live workspace insights ready</p>
            ) : (
              <p className="seneca-drawer-muted">Using sample insights until workspace data loads</p>
            )}

            <ul className="seneca-drawer-prompts">
              {SENECA_QUICK_PROMPTS.map((prompt) => (
                <li key={prompt.id}>
                  <button
                    type="button"
                    className="seneca-drawer-prompt"
                    disabled={!teamId}
                    onClick={() => onPromptSelect(prompt)}
                    data-testid={`seneca-prompt-${prompt.id}`}
                  >
                    <span className="seneca-drawer-prompt-icon">
                      <PromptIcon id={prompt.id} />
                    </span>
                    <span className="seneca-drawer-prompt-copy">
                      <span className="seneca-drawer-prompt-label">{prompt.label}</span>
                      <span className="seneca-drawer-prompt-hint">{prompt.hint}</span>
                    </span>
                    <span className="seneca-drawer-prompt-chevron" aria-hidden>
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </ul>
              </>
            )}
          </div>
        ) : (
          <div className="seneca-drawer-chat">
            {activePrompt ? (
              <div className="seneca-drawer-chat-prompt">
                <p className="seneca-drawer-chat-you-label">You asked</p>
                <p className="seneca-drawer-chat-you-text">{activePrompt.label}</p>
              </div>
            ) : null}

            <div className="seneca-drawer-chat-response">
              <div className="seneca-drawer-chat-seneca-head">
                <SenecaIcon size={24} />
                <span>Seneca</span>
              </div>
              {thinking ? (
                <div className="seneca-drawer-thinking" aria-live="polite">
                  <span className="seneca-drawer-thinking-dot" />
                  <span className="seneca-drawer-thinking-dot" />
                  <span className="seneca-drawer-thinking-dot" />
                  <span className="seneca-drawer-thinking-label">Reviewing your workspace…</span>
                </div>
              ) : (
                <p className="seneca-drawer-chat-message">{message}</p>
              )}
            </div>

            {!thinking && actions.length > 0 ? (
              <div className="seneca-drawer-actions">
                <p className="seneca-drawer-actions-label">Suggested actions</p>
                <ul className="seneca-drawer-action-list">
                  {actions.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="seneca-drawer-action-card"
                        onClick={() => onAction(item)}
                        data-testid={`seneca-action-${item.id}`}
                      >
                        <span className="seneca-drawer-action-title">{item.title}</span>
                        <span className="seneca-drawer-action-desc">{item.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <footer className="seneca-drawer-footer">
          <p className="seneca-drawer-footer-note">
            Manager coaching only — not generic help. Review suggestions before acting.
          </p>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}
