import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, CalendarClock, ListTodo, MessageSquare, Plus, Smartphone, Trash2 } from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EnterprisePageLoading } from "../../components/EnterprisePageLoading";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import { ApiError } from "../../lib/api";
import { queryKeys } from "../../lib/query-keys";
import {
  askSeneca,
  deleteSenecaConversation,
  fetchSenecaConversation,
  fetchSenecaConversations,
  presentSenecaMessages,
  senecaErrorMessage,
  senecaWhenLabel,
  type SenecaChatMessage,
  type SenecaResolvedContext,
} from "../../lib/seneca-chat-api";
import "./seneca-page.css";

function usingLabel(context: SenecaResolvedContext | null | undefined): string | null {
  if (!context) return null;
  return context.type === "personal" ? "Using Personal" : `Using ${context.name}`;
}

/** **bold** inside a line. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

/** Paragraphs and simple "-" / "1." lists, which is all Seneca writes. */
function SenecaText({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="sx-text">
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        const bullets = lines.every((l) => /^\s*[-•*]\s+/.test(l));
        const numbered = lines.every((l) => /^\s*\d+[.)]\s+/.test(l));
        if (bullets || numbered) {
          const items = lines.map((l) => l.replace(/^\s*([-•*]|\d+[.)])\s+/, ""));
          const ListTag = numbered ? "ol" : "ul";
          return (
            <ListTag key={i}>
              {items.map((item, j) => (
                <li key={j}>{inline(item)}</li>
              ))}
            </ListTag>
          );
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 ? <br /> : null}
                {inline(line.replace(/^#+\s*/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ProposalNote({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return (
    <div className="sx-proposal">
      <span className="sx-proposal-icon">{icon}</span>
      <span className="sx-proposal-copy">
        <strong>{title}</strong>
        <span>{detail}</span>
      </span>
      <Link to="/get-app" className="sx-proposal-link">
        <Smartphone size={13} strokeWidth={2.3} />
        Confirm in the app
      </Link>
    </div>
  );
}

type SenecaPageProps = {
  /** Compact single-column chat for the floating assistant panel. */
  embedded?: boolean;
};

export function SenecaPage({ embedded = false }: SenecaPageProps) {
  const { me } = useEnterpriseShell();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeConversationId = searchParams.get("c");
  const pendingPrompt = searchParams.get("q");

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SenecaChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const generation = useRef(0);
  const sentPrompt = useRef<string | null>(null);

  const history = useQuery({
    queryKey: queryKeys.senecaConversations,
    queryFn: fetchSenecaConversations,
    enabled: Boolean(me),
    staleTime: 30_000,
  });

  const openConversation = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (id) next.set("c", id);
      else next.delete("c");
      next.delete("q");
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  // React only when `?c=` itself changes: the URL catches up a render after a new chat gets its id.
  const lastRoute = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastRoute.current === routeConversationId) return;
    lastRoute.current = routeConversationId;
    if (!routeConversationId) {
      if (conversationId) {
        generation.current += 1;
        setConversationId(null);
        setMessages([]);
        setError(null);
        setThinking(false);
      }
      return;
    }
    if (routeConversationId === conversationId) return;
    const gen = ++generation.current;
    setLoadingThread(true);
    setError(null);
    setThinking(false);
    fetchSenecaConversation(routeConversationId)
      .then((conversation) => {
        if (gen !== generation.current) return;
        setConversationId(conversation.id);
        setMessages(presentSenecaMessages(conversation.messages));
      })
      .catch((reason: unknown) => {
        if (gen !== generation.current) return;
        setConversationId(null);
        setMessages([]);
        setError(
          reason instanceof ApiError && reason.status === 404
            ? "That chat expired or is no longer available."
            : senecaErrorMessage(reason),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.senecaConversations });
      })
      .finally(() => {
        if (gen === generation.current) setLoadingThread(false);
      });
  }, [routeConversationId, conversationId, queryClient]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || thinking) return;
      const gen = generation.current;
      const turns = messages.slice(-40).map((m) => ({ role: m.role, content: m.text }));
      setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: "user", text: question }]);
      setDraft("");
      setThinking(true);
      setError(null);
      try {
        const res = await askSeneca({ question, messages: turns, conversationId: conversationId ?? undefined });
        if (gen !== generation.current) return;
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            text: res.message,
            resolvedContext: res.resolvedContext ?? null,
            clarifyOptions: res.clarify?.options ?? null,
            planProposal: res.planOneOnOne ?? null,
            cancelProposal: res.cancelOneOnOne ?? null,
            createTaskProposal: res.createTask ?? null,
          },
        ]);
        if (res.conversationId !== conversationId) {
          setConversationId(res.conversationId);
          const next = new URLSearchParams(window.location.search);
          next.set("c", res.conversationId);
          next.delete("q");
          setSearchParams(next, { replace: true });
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.senecaConversations });
      } catch (reason) {
        if (gen !== generation.current) return;
        if (reason instanceof ApiError && reason.status === 404 && conversationId) {
          setConversationId(null);
          setError("This saved chat expired. Your messages are still here; send again to start a new chat.");
        } else {
          setError(senecaErrorMessage(reason));
        }
        setDraft(question);
        setMessages((prev) => prev.slice(0, -1));
      } finally {
        if (gen === generation.current) setThinking(false);
      }
    },
    [thinking, messages, conversationId, queryClient, setSearchParams],
  );

  // `?q=` (from Home or Insight) starts a new chat with that prompt, once.
  useEffect(() => {
    if (!me || !pendingPrompt || routeConversationId || sentPrompt.current === pendingPrompt) return;
    sentPrompt.current = pendingPrompt;
    void send(pendingPrompt);
  }, [me, pendingPrompt, routeConversationId, send]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    if (!loadingThread) inputRef.current?.focus();
  }, [loadingThread, routeConversationId]);

  const remove = useMutation({
    mutationFn: deleteSenecaConversation,
    onSuccess: (_res, id) => {
      setConfirmDeleteId(null);
      if (id === conversationId) openConversation(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.senecaConversations });
    },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  if (me === undefined) return <EnterprisePageLoading label="Loading Seneca" />;
  if (!me) return null;

  const firstName = (me.name ?? me.email ?? "").trim().split(/[\s@]+/)[0] || "there";
  const conversations = history.data ?? [];
  const current = conversations.find((c) => c.id === conversationId);
  const lastContext = [...messages].reverse().find((m) => m.resolvedContext)?.resolvedContext;
  const empty = messages.length === 0 && !loadingThread;

  return (
    <div
      className={`sx-page${embedded ? " sx-page--panel" : ""}`}
      data-testid={embedded ? "seneca-page-panel" : "seneca-page"}
    >
      {!embedded ? (
        <aside className="sx-history" aria-label="Seneca chats">
          <button type="button" className="sx-new" onClick={() => openConversation(null)} data-testid="seneca-new-chat">
            <Plus size={16} strokeWidth={2.4} />
            New chat
          </button>
          <h2 className="sx-history-label">Recent</h2>
          {history.isLoading ? <p className="sx-history-empty">Loading…</p> : null}
          {!history.isLoading && conversations.length === 0 ? (
            <p className="sx-history-empty">Your chats with Seneca show up here.</p>
          ) : null}
          <ul className="sx-history-list">
            {conversations.map((c) => (
              <li key={c.id} className={c.id === conversationId ? "is-active" : undefined}>
                <button type="button" className="sx-history-item" onClick={() => openConversation(c.id)}>
                  <MessageSquare size={15} strokeWidth={2.2} />
                  <span className="sx-history-copy">
                    <span className="sx-history-title">{c.title || "New chat"}</span>
                    <span className="sx-history-when">{senecaWhenLabel(c.updatedAt)}</span>
                  </span>
                </button>
                {confirmDeleteId === c.id ? (
                  <span className="sx-history-confirm">
                    <button type="button" onClick={() => remove.mutate(c.id)} disabled={remove.isPending}>
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="sx-history-delete"
                    aria-label={`Delete ${c.title || "chat"}`}
                    onClick={() => setConfirmDeleteId(c.id)}
                  >
                    <Trash2 size={14} strokeWidth={2.2} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="sx-history-foot">Chats are kept for 7 days after your last message.</p>
        </aside>
      ) : null}

      <section className="sx-chat" aria-label="Chat with Seneca">
        {!embedded ? (
          <header className="sx-chat-head">
            <img src="/seneca-icon.png" alt="" className="sx-chat-mark" />
            <div className="sx-chat-head-copy">
              <h1>{current?.title || (empty ? "Seneca" : "New chat")}</h1>
              <p>{usingLabel(lastContext) ?? "Your personal growth coach"}</p>
            </div>
          </header>
        ) : empty && conversations.length > 0 ? null : (
          <header className="sx-chat-head sx-chat-head--panel">
            <div className="sx-chat-head-copy">
              <h1>{current?.title || (empty ? "New chat" : "Chat")}</h1>
              <p>{usingLabel(lastContext) ?? "Your personal growth coach"}</p>
            </div>
          </header>
        )}

        <div className="sx-thread" ref={threadRef} data-testid="seneca-thread">
          {loadingThread ? <EnterprisePageLoading label="Loading chat" /> : null}

          {empty && embedded && conversations.length > 0 ? (
            <div className="sx-home-saved" data-testid="seneca-home-saved">
              <div className="sx-home-saved-head">
                <h2>Welcome back, {firstName}</h2>
                <p>Continue a saved chat, or ask Seneca anything below.</p>
              </div>
              <div className="sx-recent sx-recent--primary" aria-label="Saved chats">
                <h3 className="sx-recent-label">Recent chats</h3>
                <ul className="sx-recent-list">
                  {conversations.slice(0, 8).map((c) => (
                    <li key={c.id} className="sx-recent-row">
                      <button type="button" className="sx-recent-item" onClick={() => openConversation(c.id)}>
                        <MessageSquare size={14} strokeWidth={2.2} />
                        <span className="sx-recent-copy">
                          <span className="sx-recent-title">{c.title || "New chat"}</span>
                          <span className="sx-recent-when">{senecaWhenLabel(c.updatedAt)}</span>
                        </span>
                      </button>
                      {confirmDeleteId === c.id ? (
                        <span className="sx-recent-confirm">
                          <button
                            type="button"
                            onClick={() => remove.mutate(c.id)}
                            disabled={remove.isPending}
                          >
                            Delete
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)}>
                            Keep
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="sx-recent-delete"
                          aria-label={`Delete ${c.title || "chat"}`}
                          onClick={() => setConfirmDeleteId(c.id)}
                        >
                          <Trash2 size={14} strokeWidth={2.2} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="sx-recent-foot">Chats are kept for 7 days after your last message.</p>
              </div>
            </div>
          ) : null}

          {empty && !(embedded && conversations.length > 0) ? (
            <div className="sx-welcome">
              <img src="/seneca-icon.png" alt="" className="sx-welcome-mark" />
              <h2>What's on your mind, {firstName}?</h2>
              <p>Talk through a decision, prepare for a hard conversation, or set a goal. Seneca keeps it private to you.</p>
            </div>
          ) : null}

          {!loadingThread
            ? messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="sx-msg sx-msg--user">
                    <div className="sx-bubble">{m.text}</div>
                  </div>
                ) : (
                  <div key={m.id} className="sx-msg sx-msg--seneca">
                    <img src="/seneca-icon.png" alt="" className="sx-avatar" />
                    <div className="sx-msg-body">
                      <SenecaText text={m.text} />
                      {m.clarifyOptions && m.clarifyOptions.length > 0 ? (
                        <div className="sx-clarify">
                          {m.clarifyOptions.map((option) => (
                            <button
                              key={option.type === "workspace" ? option.workspaceId : option.type}
                              type="button"
                              disabled={thinking}
                              onClick={() => void send(option.type === "personal" ? "Use personal." : option.name)}
                            >
                              {option.name}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {m.planProposal ? (
                        <ProposalNote
                          icon={<CalendarClock size={15} strokeWidth={2.2} />}
                          title={`Check-in with ${m.planProposal.memberName}`}
                          detail={`${m.planProposal.dateLabel} at ${m.planProposal.timeLabel}`}
                        />
                      ) : null}
                      {m.cancelProposal ? (
                        <ProposalNote
                          icon={<CalendarClock size={15} strokeWidth={2.2} />}
                          title={`Cancel check-in with ${m.cancelProposal.memberName}`}
                          detail={`${m.cancelProposal.dateLabel} at ${m.cancelProposal.timeLabel}`}
                        />
                      ) : null}
                      {m.createTaskProposal ? (
                        <ProposalNote
                          icon={<ListTodo size={15} strokeWidth={2.2} />}
                          title={m.createTaskProposal.title}
                          detail={[
                            m.createTaskProposal.assigneeNames.join(", "),
                            m.createTaskProposal.dueDateLabel,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "New task"}
                        />
                      ) : null}
                    </div>
                  </div>
                ),
              )
            : null}

          {thinking ? (
            <div className="sx-msg sx-msg--seneca" aria-live="polite">
              <img src="/seneca-icon.png" alt="" className="sx-avatar" />
              <div className="sx-typing" aria-label="Seneca is thinking">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="sx-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <form
          className="sx-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask Seneca anything…"
            rows={1}
            maxLength={4000}
            aria-label="Message Seneca"
            data-testid="seneca-input"
          />
          <button type="submit" className="sx-send" disabled={!draft.trim() || thinking} aria-label="Send">
            <ArrowUp size={18} strokeWidth={2.6} />
          </button>
        </form>
        <p className="sx-disclaimer">Seneca can make mistakes. Check anything important.</p>
      </section>
    </div>
  );
}
