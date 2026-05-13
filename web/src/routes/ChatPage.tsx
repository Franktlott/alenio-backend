import {
  type ClipboardEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DashboardTopBar } from "../components/DashboardTopBar";
import { EnterpriseLayout } from "../components/EnterpriseLayout";
import { ChatMessageMedia } from "../components/ChatMessageMedia";
import { linkifyText } from "../lib/linkify";
import {
  createTeamPoll,
  createVideoRoom,
  fetchDmConversations,
  fetchDmMessages,
  fetchTeamMessages,
  fetchTeamPolls,
  fetchTeamTopics,
  fetchWebMe,
  fetchWebTeams,
  postDmMessage,
  postTeamMessage,
  uploadChatMedia,
  voteTeamPoll,
  type ApiPoll,
  type DmConversation,
  type DirectChatMessage,
  type TeamChatMessage,
  type TeamTopic,
  type WebMeUser,
  type WebTeamRow,
} from "../lib/api";

const MESSAGE_REFRESH_MS = 4000;

function mediaFileFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  if (data.files?.length) {
    const f = data.files[0];
    if (f && (f.type.startsWith("image/") || f.type.startsWith("video/"))) return f;
  }
  for (let i = 0; i < data.items.length; i++) {
    const it = data.items[i];
    if (it?.kind === "file" && (it.type.startsWith("image/") || it.type.startsWith("video/"))) {
      const f = it.getAsFile();
      if (f) return f;
    }
  }
  return null;
}

const POLL_DURATION_OPTIONS = [
  { label: "1 hour", value: 1 },
  { label: "6 hours", value: 6 },
  { label: "24 hours", value: 24 },
  { label: "3 days", value: 72 },
  { label: "7 days", value: 168 },
] as const;

function formatChatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function conversationRecencyMs(c: DmConversation): number {
  const last = c.lastMessage?.createdAt;
  if (last) {
    const t = new Date(last).getTime();
    if (!Number.isNaN(t)) return t;
  }
  const u = new Date(c.updatedAt).getTime();
  return Number.isNaN(u) ? 0 : u;
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
  const [mediaUploading, setMediaUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File;
    previewUrl: string;
    isVideo: boolean;
  } | null>(null);
  const [polls, setPolls] = useState<ApiPoll[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoTitle, setVideoTitle] = useState("");
  const [videoLoading, setVideoLoading] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [pollModalOpen, setPollModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptionDrafts, setPollOptionDrafts] = useState<string[]>(["", ""]);
  const [pollDurationHours, setPollDurationHours] = useState(24);
  const [pollSaving, setPollSaving] = useState(false);
  const [pollVoteId, setPollVoteId] = useState<string | null>(null);

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

  const discardPendingAttachment = useCallback(() => {
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
  }, []);

  useEffect(() => {
    discardPendingAttachment();
  }, [selectedTeamId, selectedTopicId, selectedConversationId, discardPendingAttachment]);

  const pendingAttachmentRef = useRef(pendingAttachment);
  pendingAttachmentRef.current = pendingAttachment;

  useEffect(() => {
    return () => {
      const p = pendingAttachmentRef.current;
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const refreshChat = useCallback(async () => {
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
      const [data, pollData] = await Promise.all([
        fetchTeamMessages(selectedTeamId, selectedTopicId),
        fetchTeamPolls(selectedTeamId, selectedTopicId),
      ]);
      setMessages(data);
      setPolls(pollData);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Could not load messages.");
    }
  }, [selectedTeamId, selectedTopicId, isDmMode, selectedConversationId]);

  useEffect(() => {
    if (isDmMode) setPolls([]);
    if (isDmMode) {
      if (!selectedConversationId) return;
    } else if (!selectedTeamId) {
      return;
    }
    void refreshChat();
  }, [selectedTeamId, selectedTopicId, isDmMode, selectedConversationId, refreshChat]);

  useEffect(() => {
    if (isDmMode) {
      if (!selectedConversationId) return;
    } else if (!selectedTeamId) {
      return;
    }
    const id = window.setInterval(() => void refreshChat(), MESSAGE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [selectedTeamId, selectedConversationId, refreshChat, isDmMode]);

  const threadKey = useMemo(
    () =>
      `${isDmMode ? "dm" : "ch"}:${isDmMode ? selectedConversationId ?? "" : `${selectedTeamId}:${selectedTopicId}`}`,
    [isDmMode, selectedConversationId, selectedTeamId, selectedTopicId],
  );

  const scrollSnapBoostRef = useRef(0);
  useLayoutEffect(() => {
    scrollSnapBoostRef.current = 2;
  }, [threadKey]);

  useLayoutEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;

    const snap = () => {
      el.scrollTop = el.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    };

    if (scrollSnapBoostRef.current > 0) {
      snap();
      requestAnimationFrame(() => requestAnimationFrame(snap));
      scrollSnapBoostRef.current -= 1;
      return;
    }

    // Keep chat anchored to newest messages after refreshes.
    requestAnimationFrame(snap);
  }, [messages, threadKey]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const timers = [0, 120, 320, 700].map((delay) =>
      window.setTimeout(() => {
        el.scrollTop = el.scrollHeight;
        messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
      }, delay),
    );
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [threadKey, messages.length]);

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
    if (sending || mediaUploading) return;
    const text = draft.trim();
    const pending = pendingAttachment;
    if (!pending && !text) return;

    setSendErr(null);

    if (pending) {
      if (isDmMode && !selectedConversationId) return;
      if (!isDmMode && !selectedTeamId) return;

      setMediaUploading(true);
      try {
        const uploaded = await uploadChatMedia(pending.file);
        const mt = uploaded.contentType.startsWith("video/") ? "video" : "image";
        if (isDmMode) {
          await postDmMessage(selectedConversationId!, text, { mediaUrl: uploaded.url, mediaType: mt });
        } else {
          await postTeamMessage(selectedTeamId, text, selectedTopicId, { mediaUrl: uploaded.url, mediaType: mt });
        }
        discardPendingAttachment();
        setDraft("");
        await refreshChat();
        const dms = await fetchDmConversations();
        setConversations(dms ?? []);
      } catch (e) {
        setSendErr(e instanceof Error ? e.message : "Could not send attachment.");
      } finally {
        setMediaUploading(false);
      }
      return;
    }

    setSending(true);
    try {
      if (isDmMode) {
        if (!selectedConversationId) return;
        await postDmMessage(selectedConversationId, text);
      } else {
        if (!selectedTeamId) return;
        await postTeamMessage(selectedTeamId, text, selectedTopicId);
      }
      setDraft("");
      await refreshChat();
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

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = mediaFileFromClipboard(e.clipboardData);
    if (!file) return;
    e.preventDefault();
    if (sending || mediaUploading) return;
    if (isDmMode && !selectedConversationId) return;
    if (!isDmMode && !selectedTeamId) return;

    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      };
    });
    setSendErr(null);
  };

  const onWorkspaceChange = (id: string) => {
    onTeamChange(id);
  };

  const directConversations = useMemo(
    () => conversations.filter((c) => !c.isGroup).sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a)),
    [conversations],
  );
  const groupConversations = useMemo(
    () => conversations.filter((c) => c.isGroup).sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a)),
    [conversations],
  );
  const activeConversation = selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : null;
  const conversationLabel = activeConversation
    ? activeConversation.isGroup
      ? activeConversation.name ?? "Group chat"
      : activeConversation.recipient?.name ?? activeConversation.recipient?.email ?? "Direct message"
    : null;

  const channelLabel =
    selectedTopicId === "general"
      ? "Team chat"
      : `# ${topics.find((t) => t.id === selectedTopicId)?.name ?? "channel"}`;

  const chatVideoRoomId = selectedTeamId && !isDmMode ? `chat-${selectedTeamId}-${selectedTopicId}` : "";

  const openChatVideo = async () => {
    if (!chatVideoRoomId) return;
    setActionErr(null);
    setVideoLoading(true);
    try {
      const room = await createVideoRoom(chatVideoRoomId, me?.name ?? me?.email ?? "Guest");
      const call = room.token ? `${room.url}?t=${encodeURIComponent(room.token)}&prejoin=false` : `${room.url}?prejoin=false`;
      setVideoTitle(`${selectedTeamName} · ${channelLabel}`);
      setVideoUrl(call);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : "Could not start meeting.");
    } finally {
      setVideoLoading(false);
    }
  };

  const submitPoll = async () => {
    if (!selectedTeamId || isDmMode) return;
    const q = pollQuestion.trim();
    const opts = pollOptionDrafts.map((o) => o.trim()).filter(Boolean);
    if (!q || opts.length < 2) {
      setActionErr("Add a question and at least two options.");
      return;
    }
    if (opts.length > 6) {
      setActionErr("Maximum six options.");
      return;
    }
    setPollSaving(true);
    setActionErr(null);
    try {
      await createTeamPoll(selectedTeamId, {
        question: q,
        options: opts,
        durationHours: pollDurationHours,
        topicId: selectedTopicId === "general" ? null : selectedTopicId,
      });
      setPollModalOpen(false);
      setPollQuestion("");
      setPollOptionDrafts(["", ""]);
      setPollDurationHours(24);
      await refreshChat();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not create poll.");
    } finally {
      setPollSaving(false);
    }
  };

  const onVotePoll = async (pollId: string, optionId: string) => {
    if (!selectedTeamId || isDmMode) return;
    setPollVoteId(pollId);
    setActionErr(null);
    try {
      const updated = await voteTeamPoll(selectedTeamId, pollId, optionId);
      setPolls((prev) => prev.map((p) => (p.id === pollId ? updated : p)));
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not record vote.");
    } finally {
      setPollVoteId(null);
    }
  };

  function pollTotalVotes(poll: ApiPoll): number {
    return poll.options.reduce((n, o) => n + o.votes.length, 0);
  }

  function pollEndsLabel(iso: string): string {
    const end = new Date(iso);
    if (Number.isNaN(end.getTime())) return "";
    if (end.getTime() < Date.now()) return "Ended";
    return `Ends ${end.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  }

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
            Join or create a workspace on the <Link to="/team">Team</Link> page, then pick it here.
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
                <div
                  className={`chat-main-toolbar chat-main-toolbar-compact ${!isDmMode ? "chat-main-toolbar-with-actions" : ""}`}
                >
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
                  {!isDmMode ? (
                    <div className="chat-toolbar-actions">
                      <button
                        type="button"
                        className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary chat-toolbar-action-btn"
                        onClick={() => void openChatVideo()}
                        disabled={videoLoading || !selectedTeamId}
                        data-testid="chat-start-meeting"
                      >
                        {videoLoading ? "Starting…" : "Start virtual meeting"}
                      </button>
                      <button
                        type="button"
                        className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary chat-toolbar-action-btn"
                        onClick={() => {
                          setActionErr(null);
                          setPollModalOpen(true);
                        }}
                        disabled={!selectedTeamId}
                        data-testid="chat-create-poll"
                      >
                        Create poll
                      </button>
                    </div>
                  ) : null}
                </div>

                {actionErr ? (
                  <p className="enterprise-banner-warn chat-action-banner" role="status">
                    {actionErr}
                  </p>
                ) : null}

                <div className="chat-panel chat-panel-embedded">
                  {!isDmMode && polls.length > 0 ? (
                    <div className="chat-polls-strip" aria-label="Polls for this channel">
                      {polls.map((poll) => {
                        const ended = new Date(poll.endsAt).getTime() < Date.now();
                        const total = pollTotalVotes(poll);
                        const myVote = me?.id ? poll.votes.find((v) => v.userId === me.id)?.optionId : undefined;
                        return (
                          <div key={poll.id} className="chat-poll-card">
                            <div className="chat-poll-card-head">
                              <span className="chat-poll-question">{poll.question}</span>
                              <span className="chat-poll-meta">
                                {poll.createdBy.name ?? "Member"} · {pollEndsLabel(poll.endsAt)}
                              </span>
                            </div>
                            <ul className="chat-poll-options">
                              {poll.options.map((opt) => {
                                const c = opt.votes.length;
                                const pct = total > 0 ? Math.round((c / total) * 100) : 0;
                                const isMine = myVote === opt.id;
                                return (
                                  <li key={opt.id}>
                                    <button
                                      type="button"
                                      className={`chat-poll-option ${isMine ? "chat-poll-option-mine" : ""} ${ended ? "chat-poll-option-ended" : ""}`}
                                      disabled={ended || pollVoteId === poll.id}
                                      onClick={() => void onVotePoll(poll.id, opt.id)}
                                    >
                                      <span className="chat-poll-option-bar" style={{ width: `${pct}%` }} aria-hidden />
                                      <span className="chat-poll-option-label">{opt.text}</span>
                                      <span className="chat-poll-option-count">{c}</span>
                                    </button>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
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
                    <div className="chat-composer-main">
                      {pendingAttachment ? (
                        <div className="chat-composer-pending">
                          <div className="chat-composer-pending-preview">
                            {pendingAttachment.isVideo ? (
                              <video
                                src={pendingAttachment.previewUrl}
                                className="chat-composer-pending-media"
                                controls
                                muted
                                playsInline
                              />
                            ) : (
                              <img src={pendingAttachment.previewUrl} alt="" className="chat-composer-pending-media" />
                            )}
                          </div>
                          <div className="chat-composer-pending-actions">
                            <span className="chat-composer-pending-label">
                              {pendingAttachment.isVideo ? "Video" : "Photo"} — add a caption if you want, then Send
                            </span>
                            <button
                              type="button"
                              className="chat-composer-pending-remove"
                              onClick={discardPendingAttachment}
                              aria-label="Remove attachment"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : null}
                      <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={onKeyDown}
                        onPaste={onPaste}
                        placeholder="Write a message… Enter to send · Shift+Enter new line · Paste image or video to attach"
                        rows={2}
                        disabled={(!selectedTeamId && !isDmMode) || sending || mediaUploading}
                        data-testid="chat-input"
                      />
                    </div>
                    <button
                      type="button"
                      className="chat-send"
                      onClick={() => void send()}
                      disabled={
                        sending ||
                        mediaUploading ||
                        (!draft.trim() && !pendingAttachment) ||
                        (!selectedTeamId && !isDmMode)
                      }
                      data-testid="chat-send"
                    >
                      {mediaUploading ? "Sending…" : sending ? "…" : "Send"}
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

      {pollModalOpen ? (
        <div
          className="enterprise-task-modal-backdrop"
          role="presentation"
          onClick={() => {
            setPollModalOpen(false);
            setActionErr(null);
          }}
        >
          <div className="enterprise-task-modal chat-poll-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="enterprise-task-modal-close"
              onClick={() => {
                setPollModalOpen(false);
                setActionErr(null);
              }}
              aria-label="Close"
            >
              ×
            </button>
            <header className="enterprise-task-modal-head">
              <h3 className="enterprise-task-modal-title">Create poll</h3>
              <p className="enterprise-muted">Posted to {channelLabel}. Team members get a notification.</p>
            </header>
            <div className="chat-poll-modal-body">
              <label className="auth-label">Question</label>
              <input
                className="auth-input"
                value={pollQuestion}
                onChange={(e) => setPollQuestion(e.target.value)}
                placeholder="What do you want to ask?"
                maxLength={500}
              />
              <span className="auth-label">Options (2–6)</span>
              {pollOptionDrafts.map((opt, i) => (
                <input
                  key={i}
                  className="auth-input chat-poll-option-input"
                  value={opt}
                  onChange={(e) => setPollOptionDrafts((rows) => rows.map((r, j) => (j === i ? e.target.value : r)))}
                  placeholder={`Option ${i + 1}`}
                  maxLength={200}
                />
              ))}
              <div className="chat-poll-modal-row">
                {pollOptionDrafts.length < 6 ? (
                  <button
                    type="button"
                    className="auth-btn-secondary"
                    onClick={() => setPollOptionDrafts((rows) => [...rows, ""])}
                  >
                    + Add option
                  </button>
                ) : null}
                {pollOptionDrafts.length > 2 ? (
                  <button
                    type="button"
                    className="auth-btn-secondary"
                    onClick={() => setPollOptionDrafts((rows) => rows.slice(0, -1))}
                  >
                    Remove last
                  </button>
                ) : null}
              </div>
              <label className="auth-label">Duration</label>
              <select
                className="auth-input"
                value={pollDurationHours}
                onChange={(e) => setPollDurationHours(Number(e.target.value))}
              >
                {POLL_DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="enterprise-task-modal-footer">
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-secondary"
                  onClick={() => {
                    setPollModalOpen(false);
                    setActionErr(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="enterprise-task-modal-btn enterprise-task-modal-btn-primary"
                  disabled={pollSaving}
                  onClick={() => void submitPoll()}
                >
                  {pollSaving ? "Posting…" : "Post poll"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {videoUrl ? (
        <div className="enterprise-task-modal-backdrop" role="presentation" onClick={() => setVideoUrl(null)}>
          <div className="enterprise-video-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="enterprise-task-modal-close" onClick={() => setVideoUrl(null)} aria-label="Close video call">
              ×
            </button>
            <h3 className="enterprise-card-title">{videoTitle || "Virtual meeting"}</h3>
            <iframe
              src={videoUrl}
              className="enterprise-video-iframe"
              allow="camera; microphone; fullscreen; display-capture"
              title={videoTitle || "Virtual meeting"}
            />
          </div>
        </div>
      ) : null}
    </EnterpriseLayout>
  );
}
