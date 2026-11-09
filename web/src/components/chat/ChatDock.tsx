import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEnterpriseShell } from "../../contexts/EnterpriseShellContext";
import {
  fetchConnections,
  fetchDmConversations,
  fetchDmMessagePage,
  fetchDmUnreadCounts,
  findOrCreateDm,
  postDmMessage,
  type AcceptedConnectionEntry,
  type DirectChatMessage,
  type DmConversation,
} from "../../lib/api";
import { dmRealtimeChannel, userInboxRealtimeChannel, webRealtimeClient } from "../../lib/realtime-client";
import { UserAvatar } from "../UserAvatar";
import "./chat-dock.css";

const COLLAPSED_KEY = "alenio-web:chat-dock-collapsed";
const OPEN_DM_EVENT = "alenio:open-dm";

/** Ask the docked chat to open (or start) a direct conversation with a person. */
export function openDmWith(userId: string) {
  window.dispatchEvent(new CustomEvent(OPEN_DM_EVENT, { detail: { userId } }));
}
const LAST_READ_KEY = "alenio-web:chat-last-read";
/** Below this width the dock is a strip and opens over the page instead of beside it. */
const DOCK_INLINE_MIN_WIDTH = 1200;

type View = { kind: "list" } | { kind: "thread"; conversationId: string } | { kind: "new" };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== "undefined" ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    setMatches(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function conversationTitle(c: DmConversation): string {
  if (c.isGroup) return c.name?.trim() || "Group";
  return c.recipient?.name?.trim() || c.recipient?.email || "Conversation";
}

function conversationAvatarUser(c: DmConversation) {
  if (c.isGroup) return { name: c.name, email: null, image: c.image ?? null };
  return c.recipient ?? { name: null, email: null, image: null };
}

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const diffDays = Math.round((now.getTime() - date.getTime()) / 86_400_000);
  if (diffDays < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function IconChatBubble() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 18 0z" />
    </svg>
  );
}

function IconCollapse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 6 6 6-6 6M13 6l6 6-6 6" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

function IconCompose() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />
    </svg>
  );
}

/**
 * Chat, docked on the right of every Alenio page. Conversation list, open thread,
 * and a composer. Collapses to a strip; on narrower windows it opens over the page.
 */
export function ChatDock() {
  const { me } = useEnterpriseShell();
  const inline = useMediaQuery(`(min-width: ${DOCK_INLINE_MIN_WIDTH}px)`);
  const [collapsedPref, setCollapsedPref] = useState<boolean>(() => readJson(COLLAPSED_KEY, false));
  const [overlayOpen, setOverlayOpen] = useState(false);
  const expanded = inline ? !collapsedPref : overlayOpen;

  const [view, setView] = useState<View>({ kind: "list" });
  const [conversations, setConversations] = useState<DmConversation[] | null>(null);
  const [lastRead, setLastRead] = useState<Record<string, string>>(() => readJson(LAST_READ_KEY, {}));
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("");

  const setCollapsed = (value: boolean) => {
    if (inline) {
      setCollapsedPref(value);
      writeJson(COLLAPSED_KEY, value);
    } else {
      setOverlayOpen(!value);
    }
  };

  const loadConversations = useCallback(async () => {
    try {
      const rows = await fetchDmConversations();
      setConversations(rows);
    } catch {
      setConversations((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    if (!me?.id) return;
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 45_000);
    const channel = userInboxRealtimeChannel(me.id);
    webRealtimeClient.subscribe([channel]);
    const off = webRealtimeClient.onInboxUpdated((event) => {
      if (event.kind === "dm") void loadConversations();
    });
    return () => {
      window.clearInterval(timer);
      off();
      webRealtimeClient.unsubscribe([channel]);
    };
  }, [me?.id, loadConversations]);

  /** Other pages (Network) ask the dock to open a thread with someone. */
  useEffect(() => {
    const onOpen = (event: Event) => {
      const userId = (event as CustomEvent<{ userId?: string }>).detail?.userId;
      if (!userId) return;
      void findOrCreateDm(userId)
        .then(async (conversation) => {
          await loadConversations();
          setView({ kind: "thread", conversationId: conversation.id });
          if (inline) {
            setCollapsedPref(false);
            writeJson(COLLAPSED_KEY, false);
          } else {
            setOverlayOpen(true);
          }
        })
        .catch(() => {});
    };
    window.addEventListener(OPEN_DM_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_DM_EVENT, onOpen);
  }, [inline, loadConversations]);

  useEffect(() => {
    if (!conversations || conversations.length === 0) {
      setUnread({});
      return;
    }
    const ids: Record<string, string> = {};
    for (const c of conversations) ids[c.id] = lastRead[c.id] ?? "";
    let cancelled = false;
    void fetchDmUnreadCounts(ids)
      .then((counts) => {
        if (!cancelled) setUnread(counts);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversations, lastRead]);

  const markRead = useCallback((conversationId: string, messageId: string | null | undefined) => {
    if (!messageId) return;
    setLastRead((prev) => {
      if (prev[conversationId] === messageId) return prev;
      const next = { ...prev, [conversationId]: messageId };
      writeJson(LAST_READ_KEY, next);
      return next;
    });
    setUnread((prev) => (prev[conversationId] ? { ...prev, [conversationId]: 0 } : prev));
  }, []);

  const totalUnread = useMemo(() => Object.values(unread).reduce((sum, n) => sum + n, 0), [unread]);

  const openConversation = (c: DmConversation) => {
    setView({ kind: "thread", conversationId: c.id });
    markRead(c.id, c.lastMessage?.id);
  };

  const sorted = useMemo(() => {
    const rows = conversations ?? [];
    const q = filter.trim().toLowerCase();
    const filtered = q ? rows.filter((c) => conversationTitle(c).toLowerCase().includes(q)) : rows;
    return [...filtered].sort((a, b) => {
      const at = new Date(a.lastMessage?.createdAt ?? a.updatedAt).getTime();
      const bt = new Date(b.lastMessage?.createdAt ?? b.updatedAt).getTime();
      return bt - at;
    });
  }, [conversations, filter]);

  const current = view.kind === "thread" ? conversations?.find((c) => c.id === view.conversationId) ?? null : null;

  const panel = (
    <aside
      className={`chat-dock${inline ? "" : " chat-dock--overlay"}`}
      aria-label="Chat"
      data-testid="chat-dock"
    >
      {view.kind === "thread" && current ? (
        <Thread
          conversation={current}
          meId={me?.id ?? ""}
          onBack={() => setView({ kind: "list" })}
          onRead={(messageId) => markRead(current.id, messageId)}
          onSent={() => void loadConversations()}
          onCollapse={() => setCollapsed(true)}
        />
      ) : view.kind === "new" ? (
        <NewMessage
          onBack={() => setView({ kind: "list" })}
          onCollapse={() => setCollapsed(true)}
          onPicked={async (userId) => {
            const conversation = await findOrCreateDm(userId);
            await loadConversations();
            setView({ kind: "thread", conversationId: conversation.id });
          }}
        />
      ) : (
        <>
          <header className="chat-dock-head">
            <h2>
              Chat
              {totalUnread > 0 ? <span className="chat-dock-count">{totalUnread}</span> : null}
            </h2>
            <div className="chat-dock-head-actions">
              <button type="button" className="chat-dock-icon-btn" onClick={() => setView({ kind: "new" })} aria-label="New message" title="New message">
                <IconCompose />
              </button>
              <button type="button" className="chat-dock-icon-btn" onClick={() => setCollapsed(true)} aria-label="Hide chat" title="Hide chat">
                <IconCollapse />
              </button>
            </div>
          </header>
          <div className="chat-dock-search">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search conversations"
              aria-label="Search conversations"
            />
          </div>
          <div className="chat-dock-list" role="list">
            {conversations === null ? (
              <p className="chat-dock-muted">Loading…</p>
            ) : sorted.length === 0 ? (
              <div className="chat-dock-empty">
                <span className="chat-dock-empty-mark">
                  <IconChatBubble />
                </span>
                <strong>{filter ? "No matches" : "No conversations yet"}</strong>
                <span>{filter ? "Try a different name." : "Message someone in your network to get started."}</span>
                {!filter ? (
                  <button type="button" className="chat-dock-primary" onClick={() => setView({ kind: "new" })}>
                    New message
                  </button>
                ) : null}
              </div>
            ) : (
              sorted.map((c) => {
                const count = unread[c.id] ?? 0;
                const preview = c.lastMessage?.content?.trim() || (c.lastMessage ? "Attachment" : "Say hello");
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="listitem"
                    className={`chat-dock-row${count > 0 ? " is-unread" : ""}`}
                    onClick={() => openConversation(c)}
                  >
                    <span className="chat-dock-avatar">
                      <UserAvatar user={conversationAvatarUser(c)} className="chat-dock-avatar-wrap" imgClassName="chat-dock-avatar-img" alt="" />
                      {!c.isGroup && c.recipient?.activeNow ? <span className="chat-dock-online" aria-label="Active now" /> : null}
                    </span>
                    <span className="chat-dock-row-copy">
                      <span className="chat-dock-row-top">
                        <strong>{conversationTitle(c)}</strong>
                        {c.lastMessage ? <time>{timeLabel(c.lastMessage.createdAt)}</time> : null}
                      </span>
                      <span className="chat-dock-row-bottom">
                        <span className="chat-dock-preview">
                          {c.isGroup && c.lastMessage?.sender?.name ? `${c.lastMessage.sender.name.split(/\s+/)[0]}: ` : ""}
                          {preview}
                        </span>
                        {count > 0 ? <span className="chat-dock-badge">{count > 99 ? "99+" : count}</span> : null}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </aside>
  );

  if (!expanded) {
    return (
      <div className="chat-dock-strip" data-testid="chat-dock-strip">
        <button
          type="button"
          className="chat-dock-strip-btn"
          onClick={() => setCollapsed(false)}
          aria-label={totalUnread > 0 ? `Open chat, ${totalUnread} unread` : "Open chat"}
          title="Open chat"
        >
          <IconChatBubble />
          {totalUnread > 0 ? <span className="chat-dock-badge chat-dock-badge--strip">{totalUnread > 99 ? "99+" : totalUnread}</span> : null}
        </button>
      </div>
    );
  }

  if (!inline) {
    return (
      <>
        <div className="chat-dock-strip chat-dock-strip--placeholder" aria-hidden />
        <div className="chat-dock-backdrop" onClick={() => setCollapsed(true)} aria-hidden />
        {panel}
      </>
    );
  }

  return panel;
}

function Thread({
  conversation,
  meId,
  onBack,
  onRead,
  onSent,
  onCollapse,
}: {
  conversation: DmConversation;
  meId: string;
  onBack: () => void;
  onRead: (messageId: string) => void;
  onSent: () => void;
  onCollapse: () => void;
}) {
  const [messages, setMessages] = useState<DirectChatMessage[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const stickToBottom = useRef(true);

  const canSend = (conversation.messagingStatus ?? "available") === "available";

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMessages(null);
    setError(null);
    stickToBottom.current = true;
    void fetchDmMessagePage(conversation.id)
      .then((page) => {
        if (cancelled) return;
        setMessages(page.messages);
        setHasMore(page.hasMore);
        setCursor(page.nextCursor);
        const last = page.messages[page.messages.length - 1];
        if (last) onRead(last.id);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load messages.");
      });
    const channel = dmRealtimeChannel(conversation.id);
    webRealtimeClient.subscribe([channel]);
    const off = webRealtimeClient.onDmMessageCreated((event) => {
      if (event.conversationId !== conversation.id) return;
      const incoming = event.message as DirectChatMessage;
      if (!incoming?.id) return;
      setMessages((prev) => (prev && !prev.some((m) => m.id === incoming.id) ? [...prev, incoming] : prev));
      onRead(incoming.id);
    });
    return () => {
      cancelled = true;
      off();
      webRealtimeClient.unsubscribe([channel]);
    };
    // onRead is stable from the parent (useCallback).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    if (stickToBottom.current) scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation.id]);

  const loadMore = async () => {
    if (!hasMore || loadingMore || !cursor) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await fetchDmMessagePage(conversation.id, cursor);
      setMessages((prev) => [...page.messages, ...(prev ?? [])]);
      setHasMore(page.hasMore);
      setCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || !canSend) return;
    setSending(true);
    setError(null);
    try {
      const message = await postDmMessage(conversation.id, text);
      setMessages((prev) => (prev && !prev.some((m) => m.id === message.id) ? [...prev, message] : prev));
      setDraft("");
      stickToBottom.current = true;
      onRead(message.id);
      onSent();
      if (inputRef.current) inputRef.current.style.height = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send.");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const grouped = useMemo(() => {
    const out: Array<{ day: string; items: DirectChatMessage[] }> = [];
    for (const m of messages ?? []) {
      const day = dayLabel(m.createdAt);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(m);
      else out.push({ day, items: [m] });
    }
    return out;
  }, [messages]);

  const title = conversationTitle(conversation);
  const subtitle = conversation.isGroup
    ? `${conversation.participants.length} people`
    : conversation.recipient?.activeNow
      ? "Active now"
      : null;

  return (
    <>
      <header className="chat-dock-head chat-dock-head--thread">
        <button type="button" className="chat-dock-icon-btn" onClick={onBack} aria-label="Back to conversations">
          <IconBack />
        </button>
        <UserAvatar user={conversationAvatarUser(conversation)} className="chat-dock-avatar-wrap chat-dock-avatar-wrap--sm" imgClassName="chat-dock-avatar-img" alt="" />
        <div className="chat-dock-thread-title">
          <strong>{title}</strong>
          {subtitle ? <span>{subtitle}</span> : null}
        </div>
        <button type="button" className="chat-dock-icon-btn" onClick={onCollapse} aria-label="Hide chat" title="Hide chat">
          <IconCollapse />
        </button>
      </header>

      <div
        className="chat-dock-messages"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
          if (el.scrollTop < 60) void loadMore();
        }}
      >
        {hasMore ? (
          <button type="button" className="chat-dock-more" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Earlier messages"}
          </button>
        ) : null}
        {messages === null ? (
          <p className="chat-dock-muted">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="chat-dock-muted chat-dock-muted--center">Say hello to {title}.</p>
        ) : (
          grouped.map((group) => (
            <div key={group.day}>
              <div className="chat-dock-day">
                <span>{group.day}</span>
              </div>
              {group.items.map((m, index) => {
                const mine = m.senderId === meId;
                const prev = group.items[index - 1];
                const continued = !!prev && prev.senderId === m.senderId;
                return (
                  <div key={m.id} className={`chat-dock-msg${mine ? " is-mine" : ""}${continued ? " is-continued" : ""}`}>
                    {!mine && !continued ? (
                      <UserAvatar user={m.sender} className="chat-dock-avatar-wrap chat-dock-avatar-wrap--xs" imgClassName="chat-dock-avatar-img" alt="" />
                    ) : !mine ? (
                      <span className="chat-dock-avatar-spacer" />
                    ) : null}
                    <div className="chat-dock-bubble-col">
                      {!mine && !continued && conversation.isGroup ? (
                        <span className="chat-dock-sender">{m.sender.name ?? "Member"}</span>
                      ) : null}
                      {m.replyTo ? (
                        <span className="chat-dock-reply">
                          {m.replyTo.sender.name ?? "Someone"}: {m.replyTo.content?.trim() || "Attachment"}
                        </span>
                      ) : null}
                      <div className="chat-dock-bubble" title={new Date(m.createdAt).toLocaleString()}>
                        {m.mediaUrl && m.mediaType?.startsWith("image") ? (
                          <img src={m.mediaUrl} alt="" className="chat-dock-media" />
                        ) : m.mediaUrl && m.mediaType?.startsWith("video") ? (
                          <video src={m.mediaUrl} controls className="chat-dock-media" />
                        ) : null}
                        {m.content ? <span>{m.content}</span> : null}
                      </div>
                      <time className="chat-dock-time">
                        {new Date(m.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </time>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {error ? (
        <p className="chat-dock-error" role="alert">
          {error}
        </p>
      ) : null}

      <form
        className="chat-dock-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          ref={inputRef}
          value={draft}
          rows={1}
          placeholder={canSend ? `Message ${title}` : "You can't message this conversation"}
          disabled={!canSend || sending}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          aria-label="Message"
        />
        <button type="submit" className="chat-dock-send" disabled={!draft.trim() || sending || !canSend} aria-label="Send">
          <IconSend />
        </button>
      </form>
    </>
  );
}

function NewMessage({
  onBack,
  onCollapse,
  onPicked,
}: {
  onBack: () => void;
  onCollapse: () => void;
  onPicked: (userId: string) => Promise<void>;
}) {
  const [people, setPeople] = useState<AcceptedConnectionEntry[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchConnections()
      .then((res) => {
        if (!cancelled) setPeople(res.accepted);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = people ?? [];
    if (!q) return rows;
    return rows.filter((row) => {
      const p = row.person;
      return [p.name, p.username, p.email].some((v) => v?.toLowerCase().includes(q));
    });
  }, [people, query]);

  return (
    <>
      <header className="chat-dock-head chat-dock-head--thread">
        <button type="button" className="chat-dock-icon-btn" onClick={onBack} aria-label="Back to conversations">
          <IconBack />
        </button>
        <div className="chat-dock-thread-title">
          <strong>New message</strong>
          <span>People in your network</span>
        </div>
        <button type="button" className="chat-dock-icon-btn" onClick={onCollapse} aria-label="Hide chat" title="Hide chat">
          <IconCollapse />
        </button>
      </header>
      <div className="chat-dock-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, username, or email"
          aria-label="Search people"
          autoFocus
        />
      </div>
      {error ? (
        <p className="chat-dock-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="chat-dock-list" role="list">
        {people === null ? (
          <p className="chat-dock-muted">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="chat-dock-empty">
            <strong>{query ? "No one matches" : "No connections yet"}</strong>
            <span>{query ? "Try another name." : "Connect with people on the Network tab, then message them here."}</span>
          </div>
        ) : (
          filtered.map((row) => (
            <button
              key={row.person.id}
              type="button"
              role="listitem"
              className="chat-dock-row"
              disabled={busyId !== null}
              onClick={() => {
                setBusyId(row.person.id);
                setError(null);
                void onPicked(row.person.id)
                  .catch((e) => setError(e instanceof Error ? e.message : "Could not start the conversation."))
                  .finally(() => setBusyId(null));
              }}
            >
              <span className="chat-dock-avatar">
                <UserAvatar user={row.person} className="chat-dock-avatar-wrap" imgClassName="chat-dock-avatar-img" alt="" />
                {row.activeNow ? <span className="chat-dock-online" aria-label="Active now" /> : null}
              </span>
              <span className="chat-dock-row-copy">
                <span className="chat-dock-row-top">
                  <strong>{row.person.name?.trim() || row.person.email || "Member"}</strong>
                </span>
                <span className="chat-dock-row-bottom">
                  <span className="chat-dock-preview">
                    {busyId === row.person.id
                      ? "Opening…"
                      : row.person.profileTitle || (row.person.username ? `@${row.person.username}` : row.person.email ?? "")}
                  </span>
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </>
  );
}
