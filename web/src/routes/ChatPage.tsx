import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { TeamActivityPanel } from "../components/activity/TeamActivityPanel";
import { useEnterpriseShell } from "../contexts/EnterpriseShellContext";
import { queryKeys } from "../lib/query-keys";
import { CreateChannelModal, CreateGroupModal, NewDmModal } from "../components/ChatCreateModals";
import {
  ChatMessageActionSheet,
  ChatMessageBodyInteractive,
  ChatMessageDeleteConfirm,
  ChatMessageEditModal,
  ChatMessageReactionPills,
  type ChatMessageLike,
} from "../components/ChatMessageActions";
import { ChatMessageMedia } from "../components/ChatMessageMedia";
import { linkifyText } from "../lib/linkify";
import { normalizeMessageList } from "../lib/chat-message-pagination";
import { isRecentFooterEnterpriseWorkspaceSelect } from "../lib/enterprise-selected-team";
import {
  createGroupDm,
  createTeamPoll,
  createTeamTopic,
  deleteTeamTopic,
  createVideoRoom,
  deleteDmMessage,
  deleteDmConversation,
  leaveDmConversation,
  deleteTeamMessage,
  fetchDmConversations,
  fetchDmMessages,
  fetchTeamMessages,
  fetchTeamPolls,
  fetchTeamTopics,
  fetchWebTeam,
  findOrCreateDm,
  patchTeamMessage,
  postDmMessage,
  postTeamMessage,
  toggleDmMessageReaction,
  toggleTeamMessageReaction,
  uploadChatMedia,
  voteTeamPoll,
  type ApiPoll,
  type DmConversation,
  type DirectChatMessage,
  type TeamChatMessage,
  type TeamTopic,
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

function initialsFromUser(user: { name: string | null; email: string | null }): string {
  const n = user.name?.trim() || user.email?.trim() || "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return "?";
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatDateSeparator(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - msgDay.getTime()) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  } catch {
    return "Earlier";
  }
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function renderMessageText(text: string): ReactNode {
  const segments = text.split(/(@[\w.-]+)/g);
  return segments.map((seg, i) => {
    if (/^@[\w.-]+$/.test(seg)) {
      return (
        <span key={`m-${i}`} className="chat-mention">
          {seg}
        </span>
      );
    }
    return <span key={`t-${i}`}>{linkifyText(seg)}</span>;
  });
}

function ChatAvatar({
  user,
  size = "md",
}: {
  user: { name: string | null; email: string | null; image: string | null };
  size?: "sm" | "md";
}) {
  const label = user.name ?? user.email ?? "Member";
  const className = `chat-avatar chat-avatar--${size}`;
  if (user.image) {
    return <img src={user.image} alt={label} className={className} />;
  }
  return <span className={`${className} chat-avatar-fallback`}>{initialsFromUser(user)}</span>;
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconPin() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 17v5M9 3h6l1 7h4l-5 5v3H9v-3L4 10h4L9 3z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.75" />
      <circle cx="12" cy="12" r="1.75" />
      <circle cx="19" cy="12" r="1.75" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
    </svg>
  );
}

function IconAttach() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconAt() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGroup() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-3-3.87M9 21v-2a4 4 0 0 1 0-7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM23 21v-2a4 4 0 0 0-2.66-3.76" strokeLinecap="round" />
    </svg>
  );
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
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const teamIdFromUrl = params.get("teamId")?.trim() ?? "";
  const topicIdFromUrl = params.get("topicId")?.trim() ?? "";
  const conversationIdFromUrl = params.get("conversationId")?.trim() ?? "";

  const { me, teams, selectedTeamId, setSelectedTeamId, refreshMeAndTeams } = useEnterpriseShell();
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File;
    previewUrl: string;
    isVideo: boolean;
  } | null>(null);
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
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [deleteChannelTopic, setDeleteChannelTopic] = useState<TeamTopic | null>(null);
  const [deleteChannelSaving, setDeleteChannelSaving] = useState(false);
  const [conversationDeleteOpen, setConversationDeleteOpen] = useState(false);
  const [conversationDeleteSaving, setConversationDeleteSaving] = useState(false);
  const [leaveGroupOpen, setLeaveGroupOpen] = useState(false);
  const [leaveGroupSaving, setLeaveGroupSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessageLike | null>(null);
  const [editMessage, setEditMessage] = useState<ChatMessageLike | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ChatMessageLike | null>(null);
  const [messageActionSaving, setMessageActionSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const selectedTopicId = topicIdFromUrl || "general";
  const selectedConversationId = conversationIdFromUrl;
  const isDmMode = Boolean(selectedConversationId);

  const selectedTeamName = teams?.find((t) => t.id === selectedTeamId)?.name ?? "";
  const threadId = isDmMode ? selectedConversationId : `${selectedTeamId}:${selectedTopicId}`;

  const conversationsQuery = useQuery({
    queryKey: queryKeys.chatConversations,
    queryFn: () => fetchDmConversations(),
  });

  const topicsQuery = useQuery({
    queryKey: queryKeys.chatTopics(selectedTeamId),
    queryFn: () => fetchTeamTopics(selectedTeamId),
    enabled: !!selectedTeamId,
  });

  const teamDetailQuery = useQuery({
    queryKey: queryKeys.teamDetail(selectedTeamId),
    queryFn: () => fetchWebTeam(selectedTeamId),
    enabled: !!selectedTeamId,
  });

  const threadQuery = useQuery({
    queryKey: queryKeys.chatThread(isDmMode ? "dm" : "team", threadId),
    queryFn: async () => {
      if (isDmMode) {
        return {
          messages: await fetchDmMessages(selectedConversationId),
          polls: [] as ApiPoll[],
        };
      }
      const [messages, polls] = await Promise.all([
        fetchTeamMessages(selectedTeamId, selectedTopicId),
        fetchTeamPolls(selectedTeamId, selectedTopicId),
      ]);
      return { messages, polls };
    },
    enabled: isDmMode ? !!selectedConversationId : !!selectedTeamId,
    refetchInterval: MESSAGE_REFRESH_MS,
  });

  const conversations = conversationsQuery.data ?? [];
  const topics = topicsQuery.data ?? [];
  const teamDetail = teamDetailQuery.data ?? null;
  const messages = useMemo(() => {
    const raw = threadQuery.data?.messages;
    const list = normalizeMessageList<TeamChatMessage | DirectChatMessage>(raw);
    return [...list].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return diff !== 0 ? diff : a.id.localeCompare(b.id);
    });
  }, [threadQuery.data?.messages]);
  const polls = threadQuery.data?.polls ?? [];
  const loadErr =
    conversationsQuery.error instanceof Error
      ? conversationsQuery.error.message
      : threadQuery.error instanceof Error
        ? threadQuery.error.message
        : conversationsQuery.isError || threadQuery.isError
          ? "Could not load."
          : null;
  const loadingMeetings = threadQuery.isPending && messages.length === 0;

  const refreshConversations = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
  }, [queryClient]);

  const refreshChat = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: queryKeys.chatThread(isDmMode ? "dm" : "team", threadId),
    });
  }, [queryClient, isDmMode, threadId]);

  useEffect(() => {
    if (!teams?.length) return;
    if (
      teamIdFromUrl &&
      teams.some((t) => t.id === teamIdFromUrl) &&
      teamIdFromUrl !== selectedTeamId &&
      !isRecentFooterEnterpriseWorkspaceSelect()
    ) {
      setSelectedTeamId(teamIdFromUrl);
    }
  }, [teams, teamIdFromUrl, selectedTeamId, setSelectedTeamId]);

  useEffect(() => {
    if (!teams?.length || !selectedTeamId) return;
    if (isDmMode) return;
    if (teamIdFromUrl === selectedTeamId && topicIdFromUrl === selectedTopicId) return;
    setParams({ teamId: selectedTeamId, topicId: selectedTopicId }, { replace: true });
  }, [teams, selectedTeamId, teamIdFromUrl, topicIdFromUrl, selectedTopicId, isDmMode, setParams]);

  const canCreateChannel = teamDetail?.myRole === "owner" || teamDetail?.myRole === "admin";

  const canEditMessage = useCallback(
    (m: ChatMessageLike) => {
      if (!me?.id || m.senderId !== me.id || isDmMode) return false;
      if (!m.content?.trim()) return false;
      return Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000;
    },
    [me?.id, isDmMode],
  );

  const canDeleteMessage = useCallback(
    (m: ChatMessageLike) => {
      if (me?.id && m.senderId === me.id) return true;
      if (isDmMode) return false;
      return teamDetail?.myRole === "owner" || teamDetail?.myRole === "admin";
    },
    [me?.id, isDmMode, teamDetail?.myRole],
  );

  const myReactionForMessage = useCallback(
    (m: ChatMessageLike) => (me?.id ? m.reactions?.find((r) => r.userId === me.id)?.emoji : undefined),
    [me?.id],
  );

  const openMessageActions = useCallback((m: ChatMessageLike) => {
    setActionMessage(m);
    setActionErr(null);
  }, []);

  const onMessageReact = async (emoji: string) => {
    if (!actionMessage) return;
    setMessageActionSaving(true);
    setActionErr(null);
    try {
      if (isDmMode) {
        if (!selectedConversationId) return;
        await toggleDmMessageReaction(selectedConversationId, actionMessage.id, emoji);
      } else if (selectedTeamId) {
        await toggleTeamMessageReaction(selectedTeamId, actionMessage.id, emoji);
      }
      setActionMessage(null);
      await refreshChat();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not update reaction.");
    } finally {
      setMessageActionSaving(false);
    }
  };

  const onRemoveMessageReaction = async () => {
    const emoji = actionMessage ? myReactionForMessage(actionMessage) : undefined;
    if (!emoji) return;
    await onMessageReact(emoji);
  };

  const onConfirmEditMessage = async () => {
    if (!editMessage || !selectedTeamId || isDmMode) return;
    const content = editDraft.trim();
    if (!content) return;
    setMessageActionSaving(true);
    setActionErr(null);
    try {
      await patchTeamMessage(selectedTeamId, editMessage.id, content);
      setEditMessage(null);
      setEditDraft("");
      await refreshChat();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not edit message.");
    } finally {
      setMessageActionSaving(false);
    }
  };

  const onConfirmDeleteMessage = async () => {
    if (!deleteMessageTarget) return;
    setMessageActionSaving(true);
    setActionErr(null);
    try {
      if (isDmMode) {
        if (!selectedConversationId) return;
        await deleteDmMessage(selectedConversationId, deleteMessageTarget.id);
      } else if (selectedTeamId) {
        await deleteTeamMessage(selectedTeamId, deleteMessageTarget.id);
      }
      setDeleteMessageTarget(null);
      await refreshChat();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not delete message.");
    } finally {
      setMessageActionSaving(false);
    }
  };

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

  const threadKey = useMemo(
    () =>
      `${isDmMode ? "dm" : "ch"}:${isDmMode ? selectedConversationId ?? "" : `${selectedTeamId}:${selectedTopicId}`}`,
    [isDmMode, selectedConversationId, selectedTeamId, selectedTopicId],
  );

  const snapMessagesToBottom = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useLayoutEffect(() => {
    stickToBottomRef.current = true;
  }, [threadKey]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  useLayoutEffect(() => {
    if (!stickToBottomRef.current || messages.length === 0) return;
    snapMessagesToBottom();
    requestAnimationFrame(() => requestAnimationFrame(snapMessagesToBottom));
    const timers = [0, 80, 200, 500].map((delay) => window.setTimeout(snapMessagesToBottom, delay));
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [messages, threadKey, snapMessagesToBottom]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) snapMessagesToBottom();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threadKey, snapMessagesToBottom]);

  const onTeamChange = (id: string) => {
    setSelectedTeamId(id);
    setParams({ teamId: id, topicId: "general" });
    setSendErr(null);
  };

  const onTopicChange = (topicId: string) => {
    if (!selectedTeamId) return;
    setParams({ teamId: selectedTeamId, topicId });
    setSendErr(null);
  };

  const onConversationChange = (conversationId: string) => {
    const next: Record<string, string> = { conversationId };
    if (selectedTeamId) next.teamId = selectedTeamId;
    setParams(next);
    setSendErr(null);
  };

  const closeCreateModals = () => {
    setCreateChannelOpen(false);
    setNewDmOpen(false);
    setCreateGroupOpen(false);
    setCreateErr(null);
  };

  const onCreateChannel = async (input: { name: string; description: string; color: string }) => {
    if (!selectedTeamId) return;
    setCreateSaving(true);
    setCreateErr(null);
    try {
      const topic = await createTeamTopic(selectedTeamId, input);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatTopics(selectedTeamId) });
      closeCreateModals();
      onTopicChange(topic.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create channel.");
    } finally {
      setCreateSaving(false);
    }
  };

  const onStartDm = async (recipientId: string) => {
    setCreateSaving(true);
    setCreateErr(null);
    try {
      const conv = await findOrCreateDm(recipientId);
      await refreshConversations();
      closeCreateModals();
      onConversationChange(conv.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not start direct message.");
    } finally {
      setCreateSaving(false);
    }
  };

  const onCreateGroup = async (input: { name: string; participantIds: string[] }) => {
    setCreateSaving(true);
    setCreateErr(null);
    try {
      const conv = await createGroupDm(input);
      await refreshConversations();
      closeCreateModals();
      onConversationChange(conv.id);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : "Could not create group.");
    } finally {
      setCreateSaving(false);
    }
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
        await refreshConversations();
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
      await refreshConversations();
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
    attachFile(file);
  };

  const attachFile = useCallback((file: File) => {
    if (sending || mediaUploading) return;
    if (isDmMode && !selectedConversationId) return;
    if (!isDmMode && !selectedTeamId) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return;

    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        isVideo: file.type.startsWith("video/"),
      };
    });
    setSendErr(null);
  }, [sending, mediaUploading, isDmMode, selectedConversationId, selectedTeamId]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreMenuOpen]);

  const directConversations = useMemo(
    () => conversations.filter((c) => !c.isGroup).sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a)),
    [conversations],
  );
  const groupConversations = useMemo(
    () => conversations.filter((c) => c.isGroup).sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a)),
    [conversations],
  );
  const activeConversation = selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : null;
  const isLastGroupMember =
    Boolean(activeConversation?.isGroup) && (activeConversation?.participants.length ?? 0) <= 1;
  const conversationLabel = activeConversation
    ? activeConversation.isGroup
      ? activeConversation.name ?? "Group chat"
      : activeConversation.recipient?.name ?? activeConversation.recipient?.email ?? "Direct message"
    : null;

  const channelLabel =
    selectedTopicId === "general"
      ? "Team chat"
      : `# ${topics.find((t) => t.id === selectedTopicId)?.name ?? "channel"}`;

  const activeTopic = selectedTopicId === "general" ? null : topics.find((t) => t.id === selectedTopicId);
  const canDeleteCurrentChannel = canCreateChannel && !isDmMode && !!activeTopic;

  const openDeleteChannel = (topic: TeamTopic) => {
    setDeleteChannelTopic(topic);
    setActionErr(null);
  };

  const closeDeleteChannel = () => {
    if (deleteChannelSaving) return;
    setDeleteChannelTopic(null);
    setActionErr(null);
  };

  const onDeleteChannel = async () => {
    if (!selectedTeamId || !deleteChannelTopic) return;
    setDeleteChannelSaving(true);
    setActionErr(null);
    try {
      await deleteTeamTopic(selectedTeamId, deleteChannelTopic.id);
      setDeleteChannelTopic(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatTopics(selectedTeamId) });
      onTopicChange("general");
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not delete channel.");
    } finally {
      setDeleteChannelSaving(false);
    }
  };

  const exitConversation = () => {
    if (selectedTeamId) {
      setParams({ teamId: selectedTeamId, topicId: selectedTopicId || "general" });
    } else {
      setParams({});
    }
    setSendErr(null);
  };

  const closeDeleteConversation = () => {
    if (conversationDeleteSaving) return;
    setConversationDeleteOpen(false);
    setActionErr(null);
  };

  const onDeleteConversation = async () => {
    if (!selectedConversationId) return;
    setConversationDeleteSaving(true);
    setActionErr(null);
    try {
      await deleteDmConversation(selectedConversationId);
      setConversationDeleteOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
      exitConversation();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not delete conversation.");
    } finally {
      setConversationDeleteSaving(false);
    }
  };

  const onLeaveConversation = async () => {
    if (!selectedConversationId) return;
    setLeaveGroupSaving(true);
    setActionErr(null);
    try {
      await leaveDmConversation(selectedConversationId);
      setLeaveGroupOpen(false);
      await queryClient.invalidateQueries({ queryKey: queryKeys.chatConversations });
      exitConversation();
    } catch (e) {
      setActionErr(e instanceof Error ? e.message : "Could not leave group.");
    } finally {
      setLeaveGroupSaving(false);
    }
  };

  const channelHeaderTitle = isDmMode
    ? conversationLabel ?? "Direct message"
    : selectedTopicId === "general"
      ? "Team chat"
      : activeTopic?.name ?? "Team chat";
  const channelHeaderHash = !isDmMode;
  const channelDescription = isDmMode
    ? activeConversation?.isGroup
      ? activeConversation.workspaceContext?.label
        ? `${activeConversation.workspaceContext.label} · ${activeConversation.participants.length} members`
        : `${activeConversation.participants.length} members`
      : "Private conversation"
    : activeTopic?.description?.trim() ||
      (selectedTopicId === "general" ? "General team conversations and updates." : `Messages in ${activeTopic?.name ?? "this channel"}.`);
  const memberCount = isDmMode
    ? activeConversation?.participants.length ?? 0
    : teams?.find((t) => t.id === selectedTeamId)?._count?.members ?? 0;

  const messageBlocks = useMemo(() => {
    const blocks: Array<
      | { kind: "date"; label: string; key: string }
      | { kind: "message"; message: TeamChatMessage | DirectChatMessage; grouped: boolean }
    > = [];
    let lastDate = "";
    let prevSenderId: string | null = null;
    let prevCreatedAt: string | null = null;
    for (const m of messages) {
      const key = dateKey(m.createdAt);
      if (key !== lastDate) {
        blocks.push({ kind: "date", label: formatDateSeparator(m.createdAt), key: `d-${key}` });
        lastDate = key;
        prevSenderId = null;
        prevCreatedAt = null;
      }
      const senderId = m.senderId ?? m.sender.id;
      const grouped =
        prevSenderId === senderId &&
        prevCreatedAt !== null &&
        new Date(m.createdAt).getTime() - new Date(prevCreatedAt).getTime() < 5 * 60 * 1000;
      blocks.push({ kind: "message", message: m, grouped });
      prevSenderId = senderId;
      prevCreatedAt = m.createdAt;
    }
    return blocks;
  }, [messages]);

  const composerPlaceholder = isDmMode
    ? `Message ${conversationLabel ?? "…"}`
    : selectedTopicId === "general"
      ? "Message #team-chat"
      : `Message #${(activeTopic?.name ?? "channel").replace(/\s+/g, "-").toLowerCase()}`;

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
      queryClient.setQueryData(
        queryKeys.chatThread("team", threadId),
        (prev: { messages: Array<TeamChatMessage | DirectChatMessage>; polls: ApiPoll[] } | undefined) =>
          prev
            ? {
                ...prev,
                polls: prev.polls.map((p) => (p.id === pollId ? updated : p)),
              }
            : prev,
      );
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
    <>
      <div className="chat-app-body chat-app-body-enterprise" data-testid="chat-screen">
            <aside className="chat-sidebar" aria-label="Channels">
              <div className="chat-sidebar-card">
                <h2 className="chat-sidebar-title">Chat</h2>

                <div className="chat-sidebar-section">
                  <div className="chat-sidebar-section-head">
                    <span className="chat-channels-label">Channels</span>
                    {canCreateChannel ? (
                      <button
                        type="button"
                        className="chat-sidebar-add-btn"
                        aria-label="Add channel"
                        onClick={() => {
                          setCreateErr(null);
                          setCreateChannelOpen(true);
                        }}
                        data-testid="chat-add-channel"
                      >
                        <IconPlus />
                      </button>
                    ) : null}
                  </div>
                  <ul className="chat-channel-list">
                    <li
                      className={`chat-channel-item ${!isDmMode && selectedTopicId === "general" ? "chat-channel-item-active" : ""}`}
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
                      <span className="chat-channel-item-label">
                        <span className="chat-channel-hash">#</span> Team chat
                      </span>
                    </li>
                    {topics.map((topic) => (
                      <li
                        key={topic.id}
                        className={`chat-channel-item ${!isDmMode && selectedTopicId === topic.id ? "chat-channel-item-active" : ""}`}
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
                        <span className="chat-channel-item-label">
                          <span className="chat-channel-hash">#</span> {topic.name}
                        </span>
                        {!isDmMode && selectedTopicId === topic.id && canCreateChannel ? (
                          <button
                            type="button"
                            className="chat-channel-settings-btn"
                            aria-label={`Delete ${topic.name}`}
                            title="Delete channel"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteChannel(topic);
                            }}
                            data-testid={`chat-delete-channel-${topic.id}`}
                          >
                            <IconGear />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="chat-sidebar-section">
                  <div className="chat-sidebar-section-head">
                    <span className="chat-channels-label">Direct messages</span>
                    <button
                      type="button"
                      className="chat-sidebar-add-btn"
                      aria-label="New direct message"
                      onClick={() => {
                        setCreateErr(null);
                        setNewDmOpen(true);
                      }}
                      data-testid="chat-add-dm"
                    >
                      <IconPlus />
                    </button>
                  </div>
                  <ul className="chat-channel-list">
                    {directConversations.length === 0 ? (
                      <li className="chat-sidebar-empty">No direct messages yet</li>
                    ) : null}
                    {directConversations.map((conv) => {
                      const user = conv.recipient ?? conv.participants[0];
                      const label = user?.name ?? user?.email ?? "Direct message";
                      return (
                        <li
                          key={conv.id}
                          className={`chat-channel-item chat-dm-item ${selectedConversationId === conv.id ? "chat-channel-item-active" : ""}`}
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
                          {user ? <ChatAvatar user={user} size="sm" /> : null}
                          <span className="chat-dm-item-name">{label}</span>
                          <span className="chat-dm-status chat-dm-status--offline" aria-hidden />
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="chat-sidebar-section">
                  <div className="chat-sidebar-section-head">
                    <span className="chat-channels-label">Group messages</span>
                    <button
                      type="button"
                      className="chat-sidebar-add-btn"
                      aria-label="New group message"
                      onClick={() => {
                        setCreateErr(null);
                        setCreateGroupOpen(true);
                      }}
                      data-testid="chat-add-group"
                    >
                      <IconPlus />
                    </button>
                  </div>
                  <ul className="chat-channel-list">
                    {groupConversations.length === 0 ? (
                      <li className="chat-sidebar-empty">No group messages yet</li>
                    ) : null}
                    {groupConversations.map((conv) => (
                      <li
                        key={conv.id}
                        className={`chat-channel-item chat-group-item ${selectedConversationId === conv.id ? "chat-channel-item-active" : ""}`}
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
                        <span className="chat-group-icon" aria-hidden>
                          <IconGroup />
                        </span>
                        <span className="chat-group-item-copy">
                          <span className="chat-group-item-name">{conv.name ?? "Group chat"}</span>
                          {conv.workspaceContext?.label ? (
                            <span className="chat-group-item-workspace">{conv.workspaceContext.label}</span>
                          ) : null}
                          <span className="chat-group-item-meta">{conv.participants.length} members</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </aside>

            <div className="chat-main-column">
              <div className="chat-main-card">
                <div className="chat-channel-header">
                  <div className="chat-channel-header-main">
                    <div className="chat-channel-header-title-row">
                      <h1 className="chat-channel-header-title">
                        {channelHeaderHash ? <span className="chat-channel-hash">#</span> : null}
                        {channelHeaderTitle}
                      </h1>
                      <span className="chat-channel-header-chevron" aria-hidden>
                        ▾
                      </span>
                    </div>
                    <p className="chat-channel-header-desc">{channelDescription}</p>
                  </div>
                  <div className="chat-channel-header-actions">
                    {memberCount > 0 ? (
                      <button type="button" className="chat-header-icon-btn" aria-label={`${memberCount} members`} title={`${memberCount} members`}>
                        <IconUsers />
                        <span className="chat-header-icon-count">{memberCount}</span>
                      </button>
                    ) : null}
                    <button type="button" className="chat-header-icon-btn" aria-label="Pinned messages" title="Pinned messages">
                      <IconPin />
                    </button>
                    <button type="button" className="chat-header-icon-btn" aria-label="Search messages" title="Search messages">
                      <IconSearch />
                    </button>
                    {isDmMode && activeConversation ? (
                      <button
                        type="button"
                        className="chat-header-icon-btn chat-header-icon-btn--danger"
                        aria-label={activeConversation.isGroup ? "Delete group" : "Delete conversation"}
                        title={activeConversation.isGroup ? "Delete group" : "Delete conversation"}
                        data-testid="chat-delete-conversation-header"
                        onClick={() => {
                          setActionErr(null);
                          setConversationDeleteOpen(true);
                        }}
                      >
                        <IconTrash />
                      </button>
                    ) : null}
                    <div className="chat-header-more-wrap" ref={moreMenuRef}>
                      <button
                        type="button"
                        className="chat-header-icon-btn"
                        aria-label="More actions"
                        aria-expanded={moreMenuOpen}
                        onClick={() => setMoreMenuOpen((v) => !v)}
                      >
                        <IconMore />
                      </button>
                      {moreMenuOpen ? (
                        <div className="chat-header-more-menu" role="menu">
                          {!isDmMode ? (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="chat-header-more-item"
                                disabled={videoLoading || !selectedTeamId}
                                onClick={() => {
                                  setMoreMenuOpen(false);
                                  void openChatVideo();
                                }}
                                data-testid="chat-start-meeting"
                              >
                                {videoLoading ? "Starting meeting…" : "Start virtual meeting"}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="chat-header-more-item"
                                disabled={!selectedTeamId}
                                onClick={() => {
                                  setMoreMenuOpen(false);
                                  setActionErr(null);
                                  setPollModalOpen(true);
                                }}
                                data-testid="chat-create-poll"
                              >
                                Create poll
                              </button>
                              {canDeleteCurrentChannel && activeTopic ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="chat-header-more-item chat-header-more-item--danger"
                                  onClick={() => {
                                    setMoreMenuOpen(false);
                                    openDeleteChannel(activeTopic);
                                  }}
                                  data-testid="chat-delete-channel"
                                >
                                  Delete channel
                                </button>
                              ) : null}
                            </>
                          ) : activeConversation ? (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="chat-header-more-item chat-header-more-item--danger"
                                onClick={() => {
                                  setMoreMenuOpen(false);
                                  setActionErr(null);
                                  setConversationDeleteOpen(true);
                                }}
                                data-testid="chat-delete-conversation"
                              >
                                {activeConversation.isGroup ? "Delete group" : "Delete conversation"}
                              </button>
                              {activeConversation.isGroup ? (
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="chat-header-more-item"
                                  onClick={() => {
                                    setMoreMenuOpen(false);
                                    setActionErr(null);
                                    setLeaveGroupOpen(true);
                                  }}
                                  data-testid="chat-leave-group"
                                >
                                  Leave group
                                </button>
                              ) : null}
                            </>
                          ) : (
                            <span className="chat-header-more-muted">No extra actions</span>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
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
                  <div
                    ref={messagesContainerRef}
                    className="chat-messages"
                    data-testid="chat-message-list"
                    onScroll={handleMessagesScroll}
                  >
                    {messages.length === 0 ? (
                      <div className="chat-messages-empty" data-testid="chat-messages-empty">
                        <div className="chat-messages-empty-card">
                          <span className="chat-messages-empty-icon" aria-hidden>
                            #
                          </span>
                          <p className="chat-messages-empty-title">
                            {loadingMeetings ? "Loading conversation…" : "Start the conversation"}
                          </p>
                          <p className="chat-messages-empty-copy">
                            {loadingMeetings
                              ? "Pulling in the latest messages."
                              : `No messages yet. Say hello${selectedTeamName ? ` in ${selectedTeamName}` : ""}.`}
                          </p>
                        </div>
                      </div>
                    ) : (
                      messageBlocks.map((block) => {
                        if (block.kind === "date") {
                          return (
                            <div key={block.key} className="chat-date-divider">
                              <span className="chat-date-divider-label">{block.label}</span>
                            </div>
                          );
                        }
                        const m = block.message;
                        const grouped = block.grouped;
                        const senderName = m.sender.name ?? m.sender.email ?? "Member";
                        const isMine = me?.id === m.senderId || me?.id === m.sender.id;
                        const displayUser = isMine && me ? me : m.sender;
                        const displayName = isMine
                          ? me?.name ?? me?.email ?? "You"
                          : senderName;
                        return (
                          <article
                            key={m.id}
                            className={`chat-message-row ${isMine ? "chat-message-row--mine" : "chat-message-row--other"}${grouped ? " chat-message-row--grouped" : ""}`}
                          >
                            {!isMine ? (
                              <div className="chat-message-gutter">
                                {grouped ? (
                                  <time className="chat-message-gutter-time" dateTime={m.createdAt}>
                                    {formatMessageTime(m.createdAt)}
                                  </time>
                                ) : (
                                  <ChatAvatar user={m.sender} size="md" />
                                )}
                              </div>
                            ) : (
                              <div className="chat-message-gutter chat-message-gutter--mirror" aria-hidden />
                            )}
                            <ChatMessageBodyInteractive onLongPress={() => openMessageActions(m)}>
                              {!grouped ? (
                                <div className={`chat-message-head${isMine ? " chat-message-head--mine" : ""}`}>
                                  <strong className="chat-message-author">{displayName}</strong>
                                  <time className="chat-message-time" dateTime={m.createdAt}>
                                    {formatMessageTime(m.createdAt)}
                                  </time>
                                  {m.editedAt ? <span className="chat-message-edited">edited</span> : null}
                                </div>
                              ) : null}
                              <div className="chat-message-content">
                                {m.content ? <div className="chat-text">{renderMessageText(m.content)}</div> : null}
                                {m.mediaUrl ? <ChatMessageMedia url={m.mediaUrl} mediaType={m.mediaType} /> : null}
                              </div>
                              <ChatMessageReactionPills
                                reactions={m.reactions}
                                currentUserId={me?.id}
                                onOpen={() => openMessageActions(m)}
                              />
                            </ChatMessageBodyInteractive>
                            {isMine ? (
                              <div className="chat-message-gutter">
                                {grouped ? (
                                  <time className="chat-message-gutter-time chat-message-gutter-time--mine" dateTime={m.createdAt}>
                                    {formatMessageTime(m.createdAt)}
                                  </time>
                                ) : (
                                  <ChatAvatar user={displayUser} size="md" />
                                )}
                              </div>
                            ) : (
                              <div className="chat-message-gutter chat-message-gutter--mirror" aria-hidden />
                            )}
                          </article>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="chat-composer chat-composer-v2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,video/*"
                      className="chat-composer-file-input"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) attachFile(file);
                        e.target.value = "";
                      }}
                    />
                    <div className="chat-composer-box">
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
                              <img src={pendingAttachment.previewUrl} alt="Pending attachment preview" className="chat-composer-pending-media" />
                            )}
                          </div>
                          <div className="chat-composer-pending-actions">
                            <span className="chat-composer-pending-label">
                              {pendingAttachment.isVideo ? "Video" : "Photo"} attached
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
                        placeholder={composerPlaceholder}
                        rows={1}
                        disabled={(!selectedTeamId && !isDmMode) || sending || mediaUploading}
                        data-testid="chat-input"
                      />
                      <div className="chat-composer-toolbar">
                        <div className="chat-composer-tools">
                          <button
                            type="button"
                            className="chat-composer-tool"
                            aria-label="Attach file"
                            title="Attach image or video"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <IconAttach />
                          </button>
                          <button
                            type="button"
                            className="chat-composer-tool"
                            aria-label="Mention someone"
                            title="Mention someone"
                            onClick={() => setDraft((d) => (d.endsWith("@") || d.endsWith(" @") ? d : `${d}${d.length ? " " : ""}@`))}
                          >
                            <IconAt />
                          </button>
                        </div>
                        <div className="chat-composer-send-row">
                          <span className="chat-composer-hint">Enter to send · Shift+Enter for new line</span>
                          <button
                            type="button"
                            className="chat-send chat-send-v2"
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
                  </div>
                </div>
              </div>
              {sendErr ? (
                <p className="auth-error" style={{ marginTop: 12 }} data-testid="chat-send-error">
                  {sendErr}
                </p>
              ) : null}
              {loadErr && teams && teams.length > 0 ? (
                <p className="auth-error" style={{ marginTop: 8 }} data-testid="chat-load-error">
                  {loadErr}
                </p>
              ) : null}
            </div>

            <TeamActivityPanel teamId={selectedTeamId} currentUserId={me?.id} />
      </div>

      <CreateChannelModal
        open={createChannelOpen}
        saving={createSaving}
        error={createChannelOpen ? createErr : null}
        onClose={closeCreateModals}
        onSubmit={(input) => void onCreateChannel(input)}
      />
      <NewDmModal
        open={newDmOpen}
        saving={createSaving}
        error={newDmOpen ? createErr : null}
        teamMembers={teamDetail?.members ?? []}
        myUserId={me?.id ?? ""}
        onClose={closeCreateModals}
        onPick={(userId) => void onStartDm(userId)}
      />
      <CreateGroupModal
        open={createGroupOpen}
        saving={createSaving}
        error={createGroupOpen ? createErr : null}
        myUserId={me?.id ?? ""}
        onClose={closeCreateModals}
        onSubmit={(input) => void onCreateGroup(input)}
      />

      <ChatMessageActionSheet
        open={!!actionMessage}
        message={actionMessage}
        myReaction={actionMessage ? myReactionForMessage(actionMessage) : undefined}
        canEdit={actionMessage ? canEditMessage(actionMessage) : false}
        canDelete={actionMessage ? canDeleteMessage(actionMessage) : false}
        saving={messageActionSaving}
        onClose={() => setActionMessage(null)}
        onReact={(emoji) => void onMessageReact(emoji)}
        onRemoveReaction={() => void onRemoveMessageReaction()}
        onEdit={() => {
          if (!actionMessage) return;
          setEditDraft(actionMessage.content ?? "");
          setEditMessage(actionMessage);
          setActionMessage(null);
        }}
        onDelete={() => {
          if (!actionMessage) return;
          setDeleteMessageTarget(actionMessage);
          setActionMessage(null);
        }}
      />
      <ChatMessageEditModal
        open={!!editMessage}
        draft={editDraft}
        saving={messageActionSaving}
        onDraftChange={setEditDraft}
        onClose={() => {
          if (messageActionSaving) return;
          setEditMessage(null);
          setEditDraft("");
        }}
        onSave={() => void onConfirmEditMessage()}
      />
      <ChatMessageDeleteConfirm
        open={!!deleteMessageTarget}
        saving={messageActionSaving}
        onClose={() => {
          if (messageActionSaving) return;
          setDeleteMessageTarget(null);
        }}
        onConfirm={() => void onConfirmDeleteMessage()}
      />

      {deleteChannelTopic ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeDeleteChannel}>
          <div
            className="enterprise-modal-panel chat-delete-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-delete-channel-title"
            onClick={(e) => e.stopPropagation()}
            data-testid="chat-delete-channel-modal"
          >
            <h3 id="chat-delete-channel-title" className="enterprise-modal-title">
              Delete channel?
            </h3>
            <p className="enterprise-muted enterprise-modal-sub">
              Delete <strong>#{deleteChannelTopic.name}</strong>? All messages will be permanently removed.
            </p>
            {actionErr ? (
              <p className="auth-error" role="alert">
                {actionErr}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button type="button" className="auth-btn-secondary" onClick={closeDeleteChannel} disabled={deleteChannelSaving}>
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-team-btn-destructive"
                disabled={deleteChannelSaving}
                onClick={() => void onDeleteChannel()}
                data-testid="confirm-delete-channel"
              >
                {deleteChannelSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {leaveGroupOpen && activeConversation?.isGroup ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={() => setLeaveGroupOpen(false)}>
          <div
            className="enterprise-modal-panel chat-delete-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-leave-group-title"
            onClick={(e) => e.stopPropagation()}
            data-testid="chat-leave-group-modal"
          >
            <h3 id="chat-leave-group-title" className="enterprise-modal-title">
              {isLastGroupMember ? "Delete group?" : "Leave group?"}
            </h3>
            <p className="enterprise-muted enterprise-modal-sub">
              {isLastGroupMember
                ? "You are the last member. Leaving will permanently delete this group and all message history."
                : "You will stop receiving messages from this group. Other members can still chat."}
            </p>
            {actionErr ? (
              <p className="auth-error" role="alert">
                {actionErr}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button
                type="button"
                className="auth-btn-secondary"
                onClick={() => setLeaveGroupOpen(false)}
                disabled={leaveGroupSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className={isLastGroupMember ? "enterprise-team-btn-destructive" : "auth-btn-primary"}
                disabled={leaveGroupSaving}
                onClick={() => void onLeaveConversation()}
                data-testid="confirm-leave-group"
              >
                {leaveGroupSaving ? "Leaving…" : isLastGroupMember ? "Delete group" : "Leave group"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {conversationDeleteOpen && activeConversation ? (
        <div className="enterprise-modal-backdrop" role="presentation" onClick={closeDeleteConversation}>
          <div
            className="enterprise-modal-panel chat-delete-channel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-delete-conversation-title"
            onClick={(e) => e.stopPropagation()}
            data-testid="chat-delete-conversation-modal"
          >
            <h3 id="chat-delete-conversation-title" className="enterprise-modal-title">
              {activeConversation.isGroup ? "Delete group?" : "Delete conversation?"}
            </h3>
            <p className="enterprise-muted enterprise-modal-sub">
              {activeConversation.isGroup
                ? "This will permanently delete the group and all messages for everyone."
                : "This will permanently delete this conversation for both you and the other person."}
            </p>
            {actionErr ? (
              <p className="auth-error" role="alert">
                {actionErr}
              </p>
            ) : null}
            <div className="enterprise-modal-actions">
              <button
                type="button"
                className="auth-btn-secondary"
                onClick={closeDeleteConversation}
                disabled={conversationDeleteSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="enterprise-team-btn-destructive"
                disabled={conversationDeleteSaving}
                onClick={() => void onDeleteConversation()}
                data-testid="confirm-delete-conversation"
              >
                {conversationDeleteSaving ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
    </>
  );
}
