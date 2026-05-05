import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import { ChatMessageMedia } from "../components/ChatMessageMedia";
import { linkifyText } from "../lib/linkify";
import {
  fetchDmConversations,
  fetchDmMessages,
  fetchTeamMessages,
  fetchTeamTopics,
  fetchWebMe,
  fetchWebTeams,
  postDmMessage,
  postTeamMessage,
  type DmConversation,
  type DirectChatMessage,
  type TeamChatMessage,
  type TeamTopic,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";

const POLL_MS = 4000;

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const teamIdFromUrl = params.get("teamId")?.trim() ?? "";
  const topicIdFromUrl = params.get("topicId")?.trim() ?? "";
  const conversationIdFromUrl = params.get("conversationId")?.trim() ?? "";

  const [me, setMe] = useState<WebMeUser | null>(null);
  const [teams, setTeams] = useState<WebTeamRow[] | null>(null);
  const [topics, setTopics] = useState<TeamTopic[]>([]);
  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [messages, setMessages] = useState<Array<TeamChatMessage | DirectChatMessage>>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const selectedTeamId =
    teamIdFromUrl && teams?.some((t) => t.id === teamIdFromUrl) ? teamIdFromUrl : teams?.[0]?.id ?? "";
  const selectedTopicId = topicIdFromUrl || "general";
  const selectedConversationId = conversationIdFromUrl;
  const isDmMode = Boolean(selectedConversationId);

  const selectedTeamName = teams?.find((t) => t.id === selectedTeamId)?.name ?? "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [u, t, dms] = await Promise.all([fetchWebMe(), fetchWebTeams(), fetchDmConversations()]);
        if (cancelled) return;
        setMe(u);
        setTeams(t ?? []);
        setConversations(dms ?? []);
      } catch (e) {
        if (cancelled) return;
        setLoadErr(e instanceof Error ? e.message : "Could not load.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!teams?.length || !selectedTeamId) return;
    if (!isDmMode && (teamIdFromUrl !== selectedTeamId || !topicIdFromUrl)) {
      setParams({ teamId: selectedTeamId, topicId: selectedTopicId }, { replace: true });
    }
  }, [teams, selectedTeamId, teamIdFromUrl, topicIdFromUrl, selectedTopicId, isDmMode, setParams]);

  useEffect(() => {
    if (!selectedTeamId) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchTeamTopics(selectedTeamId);
        if (cancelled) return;
        setTopics(data);
      } catch {
        if (cancelled) return;
        setTopics([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTeamId]);

  const refreshMessages = useCallback(async () => {
    if (isDmMode) {
      if (!selectedConversationId) return;
      try {
        const data = await fetchDmMessages(selectedConversationId);
        setMessages(data);
        setLoadErr(null);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : "Could not load messages.");
      }
      return;
    }
    if (!selectedTeamId) return;
    try {
      const data = await fetchTeamMessages(selectedTeamId, selectedTopicId);
      setMessages(data);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load messages.");
    }
  }, [selectedTeamId, selectedTopicId, isDmMode, selectedConversationId]);

  useEffect(() => {
    if (!selectedTeamId) return;
    refreshMessages();
  }, [selectedTeamId, refreshMessages]);

  useEffect(() => {
    if (!selectedTeamId && !isDmMode) return;
    const id = window.setInterval(refreshMessages, POLL_MS);
    return () => window.clearInterval(id);
  }, [selectedTeamId, refreshMessages, isDmMode]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const onTeamChange = (id: string) => {
    setParams({ teamId: id, topicId: "general" });
    setMessages([]);
    setTopics([]);
    setSendErr(null);
  };

  const onTopicChange = (topicId: string) => {
    if (!selectedTeamId) return;
    setParams({ teamId: selectedTeamId, topicId });
    setMessages([]);
    setSendErr(null);
  };

  const onConversationChange = (conversationId: string) => {
    const next: Record<string, string> = { conversationId };
    if (selectedTeamId) next.teamId = selectedTeamId;
    setParams(next);
    setMessages([]);
    setSendErr(null);
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendErr(null);
    try {
      if (isDmMode) {
        if (!selectedConversationId) return;
        await postDmMessage(selectedConversationId, text);
      } else {
        if (!selectedTeamId) return;
        await postTeamMessage(selectedTeamId, text, selectedTopicId);
      }
      setDraft("");
      await refreshMessages();
      const dms = await fetchDmConversations();
      setConversations(dms ?? []);
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const onWorkspaceChange = (id: string) => {
    onTeamChange(id);
  };

  const directConversations = conversations.filter((c) => !c.isGroup);
  const groupConversations = conversations.filter((c) => c.isGroup);
  const activeConversation = selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : null;
  const conversationLabel = activeConversation
    ? activeConversation.isGroup
      ? activeConversation.name ?? "Group chat"
      : activeConversation.recipient?.name ?? activeConversation.recipient?.email ?? "Direct message"
    : null;

  return (
    <EnterpriseLayout
      activeNav="chat"
      teams={teams ?? []}
      selectedTeamId={selectedTeamId}
      onTeamChange={onWorkspaceChange}
      user={me}
      onSignOutNavigate={(path) => navigate(path)}
      contentClassName="enterprise-content-flush"
      mainClassName="enterprise-app-chat"
      topBar={<DashboardTopBar user={me} />}
    >
      <div className="chat-app-body chat-app-body-enterprise" data-testid="chat-screen">
        {loadErr && !teams?.length ? <p className="auth-error chat-app-error">{loadErr}</p> : null}

        {teams && teams.length === 0 ? (
          <p className="chat-app-error" style={{ color: "var(--muted)" }} data-testid="chat-no-teams">
            Join or create a team in the mobile app, then pick it here.
          </p>
        ) : null}

        {teams && teams.length > 0 ? (
          <>
            <aside className="chat-sidebar" aria-label="Channels">
              <div className="chat-sidebar-card">
                <p className="chat-workspace-hint">Workspace is set in the left sidebar.</p>
                <div className="chat-channels-label">Channels</div>
                <ul className="chat-channel-list">
                  <li
                    className={`chat-channel-item ${selectedTopicId === "general" ? "chat-channel-item-active" : ""}`}
                    onClick={() => onTopicChange("general")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onTopicChange("general");
                      }
                    }}
                  >
                    <span>
                      <span className="chat-channel-hash">#</span> Team chat
                    </span>
                  </li>
                  {topics.map((topic) => (
                    <li
                      key={topic.id}
                      className={`chat-channel-item ${selectedTopicId === topic.id ? "chat-channel-item-active" : ""}`}
                      onClick={() => onTopicChange(topic.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onTopicChange(topic.id);
                        }
                      }}
                    >
                      <span>
                        <span className="chat-channel-hash">#</span> {topic.name}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="chat-channels-label">Direct messages</div>
                <ul className="chat-channel-list">
                  {directConversations.map((conv) => (
                    <li
                      key={conv.id}
                      className={`chat-channel-item ${selectedConversationId === conv.id ? "chat-channel-item-active" : ""}`}
                      onClick={() => onConversationChange(conv.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onConversationChange(conv.id);
                        }
                      }}
                    >
                      <span>{conv.recipient?.name ?? conv.recipient?.email ?? "Direct message"}</span>
                    </li>
                  ))}
                </ul>
                <div className="chat-channels-label">Group messages</div>
                <ul className="chat-channel-list">
                  {groupConversations.map((conv) => (
                    <li
                      key={conv.id}
                      className={`chat-channel-item ${selectedConversationId === conv.id ? "chat-channel-item-active" : ""}`}
                      onClick={() => onConversationChange(conv.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onConversationChange(conv.id);
                        }
                      }}
                    >
                      <span>{conv.name ?? "Group chat"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            <div className="chat-main-column">
              <div className="chat-main-card">
                <div className="chat-main-toolbar chat-main-toolbar-compact">
                  <Link to="/dashboard" className="chat-back-link" data-testid="chat-back-link">
                    ← Dashboard
                  </Link>
                  <div className="chat-main-titles">
                    <h1 className="chat-main-title">
                      {isDmMode
                        ? conversationLabel ?? "Direct message"
                        : selectedTopicId === "general"
                        ? "Team chat"
                        : `# ${topics.find((t) => t.id === selectedTopicId)?.name ?? "Team chat"}`}
                    </h1>
                    <p className="chat-main-subtitle">
                      {isDmMode
                        ? "Direct and group messaging"
                        : `${selectedTeamName ? selectedTeamName : "Team chat"} · same as in the mobile app`}
                    </p>
                  </div>
                </div>

                <div className="chat-panel chat-panel-embedded">
                  <div ref={messagesContainerRef} className="chat-messages" data-testid="chat-message-list">
                    {messages.length === 0 ? (
                      <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: 0 }}>
                        No messages yet. Say hello{selectedTeamName ? ` in ${selectedTeamName}` : ""}.
                      </p>
                    ) : (
                      messages.map((m) => {
                        const mine = me?.id && m.senderId === me.id;
                        return (
                          <div key={m.id} style={{ display: "flex", flexDirection: "column" }}>
                            <div
                              className="chat-meta"
                              style={mine ? { alignSelf: "flex-end", textAlign: "right" } : undefined}
                            >
                              <strong>{m.sender.name ?? m.sender.email ?? "Member"}</strong>
                              <span style={{ marginLeft: 8 }}>{formatChatTime(m.createdAt)}</span>
                            </div>
                            <div className={`chat-bubble ${mine ? "chat-bubble-mine" : "chat-bubble-other"}`}>
                              <div className="chat-bubble-content">
                                {m.content ? <div className="chat-text">{linkifyText(m.content)}</div> : null}
                                {m.mediaUrl ? <ChatMessageMedia url={m.mediaUrl} mediaType={m.mediaType} /> : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="chat-composer">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={onKeyDown}
                      placeholder="Message the team… (Enter to send, Shift+Enter for new line)"
                      rows={2}
                      disabled={(!selectedTeamId && !isDmMode) || sending}
                      data-testid="chat-input"
                    />
                    <button
                      type="button"
                      className="chat-send"
                      onClick={() => void send()}
                      disabled={sending || !draft.trim() || (!selectedTeamId && !isDmMode)}
                      data-testid="chat-send"
                    >
                      {sending ? "…" : "Send"}
                    </button>
                  </div>
                </div>
              </div>
              {sendErr ? (
                <p className="auth-error" style={{ marginTop: 12 }} data-testid="chat-send-error">
                  {sendErr}
                </p>
              ) : null}
              {loadErr && teams.length > 0 ? (
                <p className="auth-error" style={{ marginTop: 8 }} data-testid="chat-load-error">
                  {loadErr}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </EnterpriseLayout>
  );
}
