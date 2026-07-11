import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  buildSenecaResponse,
  loadWorkspaceSnapshot,
  SENECA_QUICK_PROMPTS,
  senecaActionPath,
  type SenecaActionCard,
  type SenecaInsightItem,
  type SenecaPrompt,
  type SenecaPromptId,
  type WorkspaceSnapshot,
} from "../../lib/seneca-assistant";
import {
  briefingActionPath,
  buildLeadershipBriefing,
  buildTeamPulse,
  getSenecaGreeting,
  matchStructuredPrompt,
  quickActionPath,
  SENECA_ASK_EXAMPLES,
  SENECA_COMPACT_QUICK_ACTIONS,
  type BriefingInsightCard,
  type BriefingTone,
  type TeamPulseMetric,
} from "../../lib/seneca-briefing";
import { fetchSenecaAsk, type SenecaAskActionId } from "../../lib/seneca-api";
import { SenecaIcon } from "./SenecaShared";

type Props = {
  open: boolean;
  onClose: () => void;
};

function toneClass(tone: BriefingTone): string {
  return `seneca-brief-card--${tone}`;
}

function pulseStatusClass(status: TeamPulseMetric["status"]): string {
  return `seneca-pulse-bar-fill--${status}`;
}

function BriefingCard({
  card,
  onAction,
}: {
  card: BriefingInsightCard;
  onAction: (actionId: string) => void;
}) {
  return (
    <article className={`seneca-brief-card ${toneClass(card.tone)}`} data-testid={`seneca-brief-${card.id}`}>
      <div className="seneca-brief-card-head">
        <span className={`seneca-brief-card-dot seneca-brief-card-dot--${card.tone}`} aria-hidden />
        <p className="seneca-brief-card-category">{card.category}</p>
      </div>
      <h3 className="seneca-brief-card-title">{card.title}</h3>
      <p className="seneca-brief-card-detail">{card.detail}</p>
      <div className="seneca-brief-card-actions">
        {card.actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className="seneca-brief-card-action"
            onClick={() => onAction(action.id)}
          >
            {action.label}
          </button>
        ))}
      </div>
    </article>
  );
}

function TeamPulseRow({ metric }: { metric: TeamPulseMetric }) {
  return (
    <div className="seneca-pulse-row">
      <div className="seneca-pulse-row-head">
        <span className="seneca-pulse-label">{metric.label}</span>
        <span className={`seneca-pulse-value seneca-pulse-value--${metric.status}`}>{metric.value}%</span>
      </div>
      <div className="seneca-pulse-bar" aria-hidden>
        <span
          className={`seneca-pulse-bar-fill ${pulseStatusClass(metric.status)}`}
          style={{ width: `${metric.value}%` }}
        />
      </div>
    </div>
  );
}

export function SenecaAssistantDrawer({ open, onClose }: Props) {
  const navigate = useNavigate();
  const { selectedTeamId, teams, me } = useEnterpriseShell();
  const teamId = selectedTeamId || teams?.[0]?.id || "";
  const teamName = teams?.find((t) => t.id === teamId)?.name ?? "Workspace";

  const [view, setView] = useState<"briefing" | "chat">("briefing");
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [activePrompt, setActivePrompt] = useState<SenecaPrompt | null>(null);
  const [activeAsk, setActiveAsk] = useState<string | null>(null);
  const [askDraft, setAskDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [message, setMessage] = useState("");
  const [insights, setInsights] = useState<SenecaInsightItem[]>([]);
  const [actions, setActions] = useState<SenecaActionCard[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);

  const greeting = useMemo(() => getSenecaGreeting(), [open]);
  const briefingCards = useMemo(
    () => (snapshot?.fromLiveData ? buildLeadershipBriefing(snapshot) : []),
    [snapshot],
  );
  const teamPulse = useMemo(
    () => (snapshot?.fromLiveData ? buildTeamPulse(snapshot) : []),
    [snapshot],
  );

  const statusLabel = snapshotLoading
    ? `Scanning ${teamName}…`
    : snapshot?.fromLiveData
      ? "Live workspace insights ready"
      : snapshot?.loadError
        ? "Workspace data unavailable"
        : "Briefing ready";

  const resetChat = useCallback(() => {
    setView("briefing");
    setActivePrompt(null);
    setActiveAsk(null);
    setAskDraft("");
    setThinking(false);
    setMessage("");
    setInsights([]);
    setActions([]);
    setChatError(null);
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
    void loadWorkspaceSnapshot(teamId, me?.id, teamName)
      .then((data) => {
        if (!cancelled) setSnapshot(data);
      })
      .finally(() => {
        if (!cancelled) setSnapshotLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, teamId, me?.id, teamName, resetChat]);

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

  const runPrompt = useCallback(
    (label: string, promptId: SenecaPromptId) => {
      if (!teamId) return;

      const prompt = SENECA_QUICK_PROMPTS.find((p) => p.id === promptId) ?? {
        id: promptId,
        label,
        hint: "",
      };

      setActivePrompt(prompt);
      setActiveAsk(label);
      setView("chat");
      setThinking(true);
      setMessage("");
      setInsights([]);
      setActions([]);
      setChatError(null);

      void (async () => {
        try {
          const ctx = await loadWorkspaceSnapshot(teamId, me?.id, teamName);
          setSnapshot(ctx);
          const res = buildSenecaResponse(promptId, ctx);
          setMessage(res.message);
          setInsights(res.insights);
          setActions(res.actions);
        } catch (e) {
          setChatError(e instanceof Error ? e.message : "Could not load workspace insights.");
        } finally {
          setThinking(false);
        }
      })();
    },
    [teamId, me?.id, teamName],
  );

  const runFreeformAsk = useCallback(
    (question: string) => {
      if (!teamId) return;

      setActivePrompt(null);
      setActiveAsk(question);
      setView("chat");
      setThinking(true);
      setMessage("");
      setInsights([]);
      setActions([]);
      setChatError(null);

      void (async () => {
        try {
          const res = await fetchSenecaAsk(teamId, question);
          setMessage(res.message);
          setInsights(
            (res.insights ?? []).map((item, index) => ({
              id: `ask-insight-${index}`,
              label: item.label,
              detail: item.detail,
            })),
          );
          setActions(
            (res.suggestedActions ?? []).map((item) => ({
              id: item.action as SenecaAskActionId,
              title: item.title,
              description: item.description,
            })),
          );
        } catch (e) {
          setChatError(e instanceof Error ? e.message : "Seneca could not answer right now.");
          setMessage("");
        } finally {
          setThinking(false);
        }
      })();
    },
    [teamId],
  );

  const onAskSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !teamId) return;
    setAskDraft("");
    const structured = matchStructuredPrompt(trimmed);
    if (structured) {
      runPrompt(trimmed, structured);
    } else {
      runFreeformAsk(trimmed);
    }
  };

  const onBriefingAction = (actionId: string) => {
    if (!teamId) return;
    handleClose();
    navigate(briefingActionPath(actionId, teamId));
  };

  const onQuickAction = (actionId: (typeof SENECA_COMPACT_QUICK_ACTIONS)[number]["id"]) => {
    if (!teamId) return;
    handleClose();
    navigate(quickActionPath(actionId, teamId));
  };

  const onSenecaAction = (action: SenecaActionCard) => {
    if (!teamId) return;
    handleClose();
    navigate(senecaActionPath(action.id, teamId, action.taskId));
  };

  const onInsightSelect = (insight: SenecaInsightItem) => {
    if (!teamId || !insight.taskId) return;
    handleClose();
    navigate(senecaActionPath("open_task", teamId, insight.taskId));
  };

  if (!open) return null;

  return createPortal(
    <div className="seneca-drawer-backdrop" role="presentation" onClick={handleClose}>
      <aside
        className="seneca-drawer seneca-drawer--briefing"
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
                  setView("briefing");
                  setActivePrompt(null);
                  setActiveAsk(null);
                  setThinking(false);
                }}
              >
                ← Back to briefing
              </button>
            ) : (
              <div className="seneca-drawer-brand">
                <SenecaIcon size={40} className="seneca-drawer-brand-icon" />
                <div>
                  <h2 id="seneca-drawer-title" className="seneca-drawer-title">
                    Seneca
                  </h2>
                  <p className="seneca-drawer-kicker">BETA mode</p>
                  <p
                    className={`seneca-drawer-status${
                      snapshot?.fromLiveData ? " seneca-drawer-status--live" : snapshotLoading ? " seneca-drawer-status--loading" : ""
                    }`}
                  >
                    <span className="seneca-drawer-status-dot" aria-hidden />
                    {statusLabel}
                  </p>
                </div>
              </div>
            )}
          </div>
          <button type="button" className="seneca-drawer-close" aria-label="Close Seneca" onClick={handleClose}>
            ×
          </button>
        </header>

        {view === "briefing" ? (
          <>
            <div className="seneca-drawer-body seneca-drawer-body--briefing">
              {!teamId ? (
                <p className="seneca-drawer-lead">Create or join a workspace to unlock your leadership briefing.</p>
              ) : (
                <>
                  <p className="seneca-drawer-greeting">
                    {greeting}. Here&apos;s what needs your attention today.
                  </p>

                  <section className="seneca-brief-section" aria-labelledby="seneca-brief-heading">
                    <h3 id="seneca-brief-heading" className="seneca-brief-section-title">
                      Leadership Briefing
                    </h3>
                    {snapshotLoading ? (
                      <p className="seneca-drawer-muted">Building your briefing from {teamName}…</p>
                    ) : snapshot?.loadError ? (
                      <p className="seneca-drawer-muted seneca-drawer-muted--warn">{snapshot.loadError}</p>
                    ) : (
                      <div className="seneca-brief-cards">
                        {briefingCards.map((card) => (
                          <BriefingCard key={card.id} card={card} onAction={onBriefingAction} />
                        ))}
                      </div>
                    )}
                  </section>

                  <section className="seneca-brief-section" aria-labelledby="seneca-pulse-heading">
                    <h3 id="seneca-pulse-heading" className="seneca-brief-section-title">
                      Team Pulse
                    </h3>
                    {snapshotLoading ? (
                      <p className="seneca-drawer-muted">Calculating team pulse…</p>
                    ) : teamPulse.length > 0 ? (
                      <div className="seneca-pulse-panel">
                        {teamPulse.map((metric) => (
                          <TeamPulseRow key={metric.id} metric={metric} />
                        ))}
                      </div>
                    ) : (
                      <p className="seneca-drawer-muted">Team pulse will appear once member data loads.</p>
                    )}
                  </section>
                </>
              )}
            </div>

            {teamId ? (
              <div className="seneca-drawer-bottom">
                <section className="seneca-ask-section" aria-labelledby="seneca-ask-heading">
                  <h3 id="seneca-ask-heading" className="seneca-ask-heading">
                    Ask Seneca
                  </h3>
                  <form
                    className="seneca-ask-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      onAskSubmit(askDraft);
                    }}
                  >
                    <input
                      type="text"
                      className="seneca-ask-input"
                      placeholder="Ask about your team, tasks, check-ins, or development…"
                      value={askDraft}
                      onChange={(e) => setAskDraft(e.target.value)}
                      aria-label="Ask Seneca"
                    />
                    <button type="submit" className="seneca-ask-submit" disabled={!askDraft.trim()}>
                      Ask
                    </button>
                  </form>
                  <div className="seneca-ask-examples">
                    {SENECA_ASK_EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        className="seneca-ask-chip"
                        onClick={() => onAskSubmit(example)}
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </section>

                <section className="seneca-quick-section" aria-labelledby="seneca-quick-heading">
                  <h3 id="seneca-quick-heading" className="seneca-quick-heading">
                    Quick Actions
                  </h3>
                  <div className="seneca-quick-grid">
                    {SENECA_COMPACT_QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        className="seneca-quick-btn"
                        onClick={() => onQuickAction(action.id)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </section>

                <p className="seneca-drawer-footer-note">
                  Manager coaching only — not generic help. Review suggestions before acting.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <div className="seneca-drawer-chat">
            {(activeAsk || activePrompt) ? (
              <div className="seneca-drawer-chat-prompt">
                <p className="seneca-drawer-chat-you-label">You asked</p>
                <p className="seneca-drawer-chat-you-text">{activeAsk ?? activePrompt?.label}</p>
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
                <>
                  {chatError ? (
                    <p className="seneca-drawer-chat-error" role="alert">
                      {chatError}
                    </p>
                  ) : null}
                  {message ? <p className="seneca-drawer-chat-message">{message}</p> : null}
                  {insights.length > 0 ? (
                    <ul className="seneca-drawer-insights">
                      {insights.map((insight) => (
                        <li key={insight.id}>
                          {insight.taskId ? (
                            <button
                              type="button"
                              className="seneca-drawer-insight seneca-drawer-insight--action"
                              onClick={() => onInsightSelect(insight)}
                            >
                              <span className="seneca-drawer-insight-label">{insight.label}</span>
                              {insight.detail ? (
                                <span className="seneca-drawer-insight-detail">{insight.detail}</span>
                              ) : null}
                            </button>
                          ) : (
                            <div className="seneca-drawer-insight">
                              <span className="seneca-drawer-insight-label">{insight.label}</span>
                              {insight.detail ? (
                                <span className="seneca-drawer-insight-detail">{insight.detail}</span>
                              ) : null}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              )}
            </div>

            {!thinking && actions.length > 0 ? (
              <div className="seneca-drawer-actions">
                <p className="seneca-drawer-actions-label">Recommended next steps</p>
                <ul className="seneca-drawer-action-list">
                  {actions.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="seneca-drawer-action-card"
                        onClick={() => onSenecaAction(item)}
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
      </aside>
    </div>,
    document.body,
  );
}
