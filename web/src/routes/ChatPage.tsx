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
import { useEnterprisePaneActive } from "./EnterpriseKeepAliveOutlet";
import { queryKeys } from "../lib/query-keys";
import { CreateGroupModal, NewDmModal } from "../components/ChatCreateModals";
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
import {
  createGroupDm,
  deleteDmMessage,
  deleteDmConversation,
  leaveDmConversation,
  fetchDmConversations,
  fetchDmMessages,
  fetchWebTeam,
  findOrCreateDm,
  postDmMessage,
  toggleDmMessageReaction,
  uploadChatMedia,
  type ApiPoll,
  type DmConversation,
  type DirectChatMessage,
  type TeamChatMessage,
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

function IconCompose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4L16.5 3.5Z" />
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
  const paneActive = useEnterprisePaneActive();
  const { me, teams, selectedTeamId: workspaceTeamId } = useEnterpriseShell();
  const [params, setParams] = useSearchParams();
  const liveTeamId = params.get("teamId")?.trim() ?? "";
  const liveTopicId = params.get("topicId")?.trim() ?? "";
  const liveConversationId = params.get("conversationId")?.trim() ?? "";
  const frozenChatUrl = useRef({
    teamId: liveTeamId,
    topicId: liveTopicId,
    conversationId: liveConversationId,
  });
  const conversationIdFromUrl = paneActive ? liveConversationId : frozenChatUrl.current.conversationId;

  useEffect(() => {
    if (!paneActive) return;
    const hasLiveSelection = Boolean(liveConversationId);
    if (!hasLiveSelection) {
      const frozen = frozenChatUrl.current;
      if (frozen.conversationId) {
        setParams({ conversationId: frozen.conversationId }, { replace: true });
      }
      return;
    }
    frozenChatUrl.current = {
      teamId: liveTeamId,
      topicId: liveTopicId,
      conversationId: liveConversationId,
    };
  }, [paneActive, liveTeamId, liveTopicId, liveConversationId, setParams]);

  const [sendErr, setSendErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [pendingAttachment, setPendingAttachment] = useState<{
    file: File;
    previewUrl: string;
    isVideo: boolean;
  } | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);
  const [conversationDeleteOpen, setConversationDeleteOpen] = useState(false);
  const [conversationDeleteSaving, setConversationDeleteSaving] = useState(false);
  const [leaveGroupOpen, setLeaveGroupOpen] = useState(false);
  const [leaveGroupSaving, setLeaveGroupSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState<ChatMessageLike | null>(null);
  const [editMessage, setEditMessage] = useState<ChatMessageLike | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteMessageTarget, setDeleteMessageTarget] = useState<ChatMessageLike | null>(null);
  const [messageActionSaving, setMessageActionSaving] = useState(false);
  const [conversationFilter, setConversationFilter] = useState("");
  const [messagesDrawerOpen, setMessagesDrawerOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const selectedConversationId = conversationIdFromUrl;
  const isDmMode = Boolean(selectedConversationId);

  const teamDetailQuery = useQuery({
    queryKey: queryKeys.teamDetail(workspaceTeamId),
    queryFn: () => fetchWebTeam(workspaceTeamId),
    enabled: !!workspaceTeamId,
    staleTime: 60_000,
    refetchOnMount: false,
  });

  const threadId = selectedConversationId;

  const conversationsQuery = useQuery({
    queryKey: queryKeys.chatConversations,
    queryFn: () => fetchDmConversations(),
    staleTime: MESSAGE_REFRESH_MS,
    refetchInterval: paneActive ? MESSAGE_REFRESH_MS : false,
    refetchOnMount: false,
  });

  const threadQuery = useQuery({
    queryKey: queryKeys.chatThread("dm", threadId),
    queryFn: async () => ({
      messages: await fetchDmMessages(selectedConversationId),
      polls: [] as ApiPoll[],
    }),
    enabled: !!selectedConversationId,
    refetchInterval: paneActive ? MESSAGE_REFRESH_MS : false,
    staleTime: 15_000,
    refetchOnMount: false,
  });

  const conversations = conversationsQuery.data ?? [];
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
      queryKey: queryKeys.chatThread("dm", threadId),
    });
  }, [queryClient, threadId]);

  useEffect(() => {
    if (!paneActive) return;
    if (liveConversationId) return;
    if (liveTopicId || liveTeamId) {
      setParams({}, { replace: true });
      return;
    }
    if (!conversations.length) return;
    const mostRecent = [...conversations].sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a))[0];
    if (mostRecent) {
      setParams({ conversationId: mostRecent.id }, { replace: true });
    }
  }, [paneActive, liveConversationId, liveTopicId, liveTeamId, conversations, setParams]);

  const canEditMessage = useCallback(
    (m: ChatMessageLike) => {
      if (!me?.id || m.senderId !== me.id || isDmMode) return false;
      if (!m.content?.trim()) return false;
      return Date.now() - new Date(m.createdAt).getTime() < 15 * 60 * 1000;
    },
    [me?.id, isDmMode],
  );

  const canDeleteMessage = useCallback(
    (m: ChatMessageLike) => me?.id != null && m.senderId === me.id,
    [me?.id],
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
      if (!selectedConversationId) return;
      await toggleDmMessageReaction(selectedConversationId, actionMessage.id, emoji);
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
    return;
  };

  const onConfirmDeleteMessage = async () => {
    if (!deleteMessageTarget || !selectedConversationId) return;
    setMessageActionSaving(true);
    setActionErr(null);
    try {
      await deleteDmMessage(selectedConversationId, deleteMessageTarget.id);
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
  }, [selectedConversationId, discardPendingAttachment]);

  const pendingAttachmentRef = useRef(pendingAttachment);
  pendingAttachmentRef.current = pendingAttachment;

  useEffect(() => {
    return () => {
      const p = pendingAttachmentRef.current;
      if (p?.previewUrl) URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  const threadKey = useMemo(() => `dm:${selectedConversationId ?? ""}`, [selectedConversationId]);

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

  const onConversationChange = (conversationId: string) => {
    setParams({ conversationId });
    setSendErr(null);
    setMessagesDrawerOpen(false);
  };

  useEffect(() => {
    if (!messagesDrawerOpen) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setMessagesDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [messagesDrawerOpen]);

  const closeCreateModals = () => {
    setNewDmOpen(false);
    setCreateGroupOpen(false);
    setCreateErr(null);
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

  const onCreateGroup = async (input: { name: string; participantIds: string[]; teamId?: string }) => {
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
      if (!selectedConversationId) return;

      setMediaUploading(true);
      try {
        const uploaded = await uploadChatMedia(pending.file);
        const mt = uploaded.contentType.startsWith("video/") ? "video" : "image";
        await postDmMessage(selectedConversationId, text, { mediaUrl: uploaded.url, mediaType: mt });
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
      if (!selectedConversationId) return;
      await postDmMessage(selectedConversationId, text);
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
    if (sending || mediaUploading || !selectedConversationId) return;
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
  }, [sending, mediaUploading, selectedConversationId]);

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

  const inboxConversations = useMemo(
    () => [...conversations].sort((a, b) => conversationRecencyMs(b) - conversationRecencyMs(a)),
    [conversations],
  );
  const normalizedConversationFilter = conversationFilter.trim().toLowerCase();
  const visibleInboxConversations = useMemo(
    () =>
      inboxConversations.filter((conversation) => {
        if (!normalizedConversationFilter) return true;
        if (conversation.isGroup) {
          return `${conversation.name ?? ""} ${conversation.workspaceContext?.label ?? ""}`
            .toLowerCase()
            .includes(normalizedConversationFilter);
        }
        const user = conversation.recipient ?? conversation.participants[0];
        return `${user?.name ?? ""} ${user?.email ?? ""}`.toLowerCase().includes(normalizedConversationFilter);
      }),
    [inboxConversations, normalizedConversationFilter],
  );
  const activeConversation = selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : null;
  const isLastGroupMember =
    Boolean(activeConversation?.isGroup) && (activeConversation?.participants.length ?? 0) <= 1;
  const conversationLabel = activeConversation
    ? activeConversation.isGroup
      ? activeConversation.name ?? "Group chat"
      : activeConversation.recipient?.name ?? activeConversation.recipient?.email ?? "Direct message"
    : null;

  const exitConversation = () => {
    setParams({});
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

  const channelHeaderTitle = conversationLabel ?? "Messages";
  const channelHeaderKicker = activeConversation?.isGroup
    ? "Group message"
    : activeConversation
      ? "Direct message"
      : "Messages";
  const channelDescription = activeConversation?.isGroup
    ? activeConversation.workspaceContext?.label
      ? `${activeConversation.workspaceContext.label} · ${activeConversation.participants.length} members`
      : `${activeConversation.participants.length} members`
    : activeConversation
      ? "Private conversation"
      : null;
  const memberCount = activeConversation?.participants.length ?? 0;

  const timelineBlocks = useMemo(() => {
    const blocks: Array<
      | { kind: "date"; label: string; key: string }
      | { kind: "message"; message: TeamChatMessage | DirectChatMessage; grouped: boolean }
      | { kind: "poll"; poll: ApiPoll; key: string }
    > = [];
    let lastDate = "";
    let prevSenderId: string | null = null;
    let prevCreatedAt: string | null = null;
    const entries: Array<
      | { kind: "message"; createdAt: string; message: TeamChatMessage | DirectChatMessage }
      | { kind: "poll"; createdAt: string; poll: ApiPoll }
    > = [
      ...messages.map((message) => ({ kind: "message" as const, createdAt: message.createdAt, message })),
      ...polls.map((poll) => ({ kind: "poll" as const, createdAt: poll.createdAt, poll })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    for (const entry of entries) {
      const key = dateKey(entry.createdAt);
      if (key !== lastDate) {
        blocks.push({ kind: "date", label: formatDateSeparator(entry.createdAt), key: `d-${key}` });
        lastDate = key;
        prevSenderId = null;
        prevCreatedAt = null;
      }
      if (entry.kind === "poll") {
        blocks.push({ kind: "poll", poll: entry.poll, key: `p-${entry.poll.id}` });
        prevSenderId = null;
        prevCreatedAt = null;
        continue;
      }
      const m = entry.message;
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
  }, [messages, polls]);

  const composerPlaceholder = selectedConversationId
    ? `Message ${conversationLabel ?? "…"}`
    : "Select a conversation";

  function pollTotalVotes(poll: ApiPoll): number {
    return poll.options.reduce((n, o) => n + o.votes.length, 0);
  }

  function pollEndsLabel(iso: string): string {
    const end = new Date(iso);
    if (Number.isNaN(end.getTime())) return "";
    if (end.getTime() < Date.now()) return "Ended";
    return `Ends ${end.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
  }

  const openCreateMenu = () => {
    setCreateErr(null);
    setNewDmOpen(true);
  };

  return (
    <>
      <div
        className={`chat-app-body chat-app-body-enterprise${messagesDrawerOpen ? " chat-app-body--messages-open" : ""}`}
        data-testid="chat-screen"
      >
            {messagesDrawerOpen ? (
              <button
                type="button"
                className="chat-messages-backdrop"
                aria-label="Close messages"
                onClick={() => setMessagesDrawerOpen(false)}
              />
            ) : null}
            <button
              type="button"
              className={`chat-messages-tab${messagesDrawerOpen ? " chat-messages-tab--open" : ""}`}
              aria-expanded={messagesDrawerOpen}
              aria-controls="chat-messages-drawer"
              title={messagesDrawerOpen ? "Close messages" : "Open messages"}
              onClick={() => setMessagesDrawerOpen((open) => !open)}
            >
              <span className="chat-messages-tab-icon" aria-hidden>
                <IconCompose />
              </span>
              <span className="chat-messages-tab-label">Messages</span>
            </button>
            <aside className="chat-sidebar" id="chat-messages-drawer" aria-label="Messages">
              <div className="chat-sidebar-card">
                <div className="chat-sidebar-top">
                  <h2 className="chat-sidebar-title">Messages</h2>
                  <button
                    type="button"
                    className="chat-sidebar-compose-btn"
                    aria-label="Message someone"
                    title="Message someone"
                    onClick={openCreateMenu}
                  >
                    <IconCompose />
                  </button>
                </div>

                <label className="chat-sidebar-filter">
                  <span className="chat-sidebar-filter-icon" aria-hidden>
                    <IconSearch />
                  </span>
                  <input
                    type="search"
                    value={conversationFilter}
                    onChange={(event) => setConversationFilter(event.target.value)}
                    placeholder="Filter conversations"
                    aria-label="Filter conversations"
                  />
                </label>

                <div className="chat-sidebar-section chat-sidebar-directs">
                  <div className="chat-sidebar-section-head">
                    <span className="chat-channels-label">Conversations</span>
                    <button
                      type="button"
                      className="chat-sidebar-add-btn"
                      aria-label="Create group"
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
                    {visibleInboxConversations.length === 0 ? (
                      <li className="chat-sidebar-empty">No conversations yet</li>
                    ) : null}
                    {visibleInboxConversations.map((conv, index) => {
                      if (conv.isGroup) {
                        return (
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
                            <span className={`chat-group-icon chat-group-icon--${(index % 3) + 1}`} aria-hidden>
                              <IconGroup />
                            </span>
                            <span className="chat-group-item-copy">
                              <span className="chat-group-item-name">{conv.name ?? "Group chat"}</span>
                              {conv.workspaceContext?.label ? (
                                <span className="chat-group-item-workspace">{conv.workspaceContext.label}</span>
                              ) : null}
                              <span className="chat-group-item-meta">
                                {conv.lastMessage?.content || `${conv.participants.length} members`}
                              </span>
                            </span>
                            {conv.lastMessage?.createdAt ? (
                              <time className="chat-dm-item-time" dateTime={conv.lastMessage.createdAt}>
                                {formatMessageTime(conv.lastMessage.createdAt)}
                              </time>
                            ) : null}
                          </li>
                        );
                      }
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
                          <span className="chat-dm-item-copy">
                            <span className="chat-dm-item-name">{label}</span>
                            <span className="chat-dm-item-preview">
                              {conv.lastMessage?.content || "Start a conversation"}
                            </span>
                          </span>
                          {conv.lastMessage?.createdAt ? (
                            <time className="chat-dm-item-time" dateTime={conv.lastMessage.createdAt}>
                              {formatMessageTime(conv.lastMessage.createdAt)}
                            </time>
                          ) : null}
                          <span className="chat-dm-status chat-dm-status--offline" aria-hidden />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </aside>

            <div className="chat-main-column">
              <div className="chat-main-card">
                {selectedConversationId ? (
                <div className="chat-channel-header">
                  <div className="chat-channel-header-main">
                    <p className="chat-channel-header-kicker">{channelHeaderKicker}</p>
                    <div className="chat-channel-header-title-row">
                      <h1 className="chat-channel-header-title">
                        {channelHeaderTitle}
                      </h1>
                      <button type="button" className="chat-channel-favorite" aria-label="Favorite conversation" title="Favorite">
                        ☆
                      </button>
                    </div>
                    {channelDescription ? <p className="chat-channel-header-desc">{channelDescription}</p> : null}
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
                    {activeConversation ? (
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
                          {activeConversation ? (
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
                ) : null}

                {actionErr ? (
                  <p className="enterprise-banner-warn chat-action-banner" role="status">
                    {actionErr}
                  </p>
                ) : null}

                <div className="chat-panel chat-panel-embedded">
                  <div
                    ref={messagesContainerRef}
                    className="chat-messages"
                    data-testid="chat-message-list"
                    onScroll={handleMessagesScroll}
                  >
                    {!selectedConversationId ? (
                      <div className="chat-messages-empty" data-testid="chat-messages-empty">
                        <div className="chat-messages-empty-card">
                          <span className="chat-messages-empty-icon" aria-hidden>
                            ✉
                          </span>
                          <p className="chat-messages-empty-title">Start a conversation</p>
                          <p className="chat-messages-empty-copy">
                            Message a teammate or create a group when your team needs one.
                          </p>
                          <div className="enterprise-modal-actions" style={{ justifyContent: "center", marginTop: 16 }}>
                            <button
                              type="button"
                              className="auth-btn-primary"
                              onClick={() => {
                                setCreateErr(null);
                                setNewDmOpen(true);
                              }}
                              data-testid="chat-add-dm"
                            >
                              Message someone
                            </button>
                            <button
                              type="button"
                              className="auth-btn-secondary"
                              onClick={() => {
                                setCreateErr(null);
                                setCreateGroupOpen(true);
                              }}
                              data-testid="chat-empty-create-group"
                            >
                              Create group
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : messages.length === 0 && polls.length === 0 ? (
                      <div className="chat-messages-empty" data-testid="chat-messages-empty">
                        <div className="chat-messages-empty-card">
                          <span className="chat-messages-empty-icon" aria-hidden>
                            ✉
                          </span>
                          <p className="chat-messages-empty-title">
                            {loadingMeetings ? "Loading conversation…" : "Start the conversation"}
                          </p>
                          <p className="chat-messages-empty-copy">
                            {loadingMeetings
                              ? "Pulling in the latest messages."
                              : "No messages yet. Say hello."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      timelineBlocks.map((block) => {
                        if (block.kind === "date") {
                          return (
                            <div key={block.key} className="chat-date-divider">
                              <span className="chat-date-divider-label">{block.label}</span>
                            </div>
                          );
                        }
                        if (block.kind === "poll") {
                          const poll = block.poll;
                          const ended = new Date(poll.endsAt).getTime() < Date.now();
                          const total = pollTotalVotes(poll);
                          const myVote = me?.id ? poll.votes.find((vote) => vote.userId === me.id)?.optionId : undefined;
                          return (
                            <article key={block.key} className="chat-message-row chat-poll-message-row">
                              <div className="chat-message-gutter">
                                <ChatAvatar
                                  user={{ name: poll.createdBy.name, email: null, image: poll.createdBy.image }}
                                  size="md"
                                />
                              </div>
                              <div className="chat-message-body">
                                <div className="chat-message-head">
                                  <strong className="chat-message-author">{poll.createdBy.name ?? "Member"}</strong>
                                  <span className="chat-message-role">POLL</span>
                                  <time className="chat-message-time" dateTime={poll.createdAt}>
                                    {formatMessageTime(poll.createdAt)}
                                  </time>
                                </div>
                                <div className="chat-poll-card">
                                  <div className="chat-poll-card-head">
                                    <span className="chat-poll-question">{poll.question}</span>
                                    <span className="chat-poll-meta">{pollEndsLabel(poll.endsAt)}</span>
                                  </div>
                                  <ul className="chat-poll-options">
                                    {poll.options.map((option) => {
                                      const count = option.votes.length;
                                      const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                                      const isMine = myVote === option.id;
                                      return (
                                        <li key={option.id}>
                                          <button
                                            type="button"
                                            className={`chat-poll-option ${isMine ? "chat-poll-option-mine" : ""} ${ended ? "chat-poll-option-ended" : ""}`}
                                            disabled={ended}
                                            onClick={() => undefined}
                                          >
                                            <span className="chat-poll-option-bar" style={{ width: `${percentage}%` }} aria-hidden />
                                            <span className="chat-poll-option-label">{option.text}</span>
                                            <span className="chat-poll-option-count">{count}</span>
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                </div>
                              </div>
                            </article>
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
                        const senderRole = teamDetail?.members.find(
                          (member) => member.userId === (m.senderId ?? m.sender.id),
                        )?.role;
                        const senderRoleLabel =
                          senderRole === "owner"
                            ? "OW"
                            : senderRole === "team_leader"
                              ? "TL"
                              : senderRole === "admin"
                                ? "AD"
                                : null;
                        return (
                          <article
                            key={m.id}
                            className={`chat-message-row ${isMine ? "chat-message-row--mine" : "chat-message-row--other"}${grouped ? " chat-message-row--grouped" : ""}`}
                          >
                            <div className="chat-message-gutter">
                              {grouped ? (
                                <time className="chat-message-gutter-time" dateTime={m.createdAt}>
                                  {formatMessageTime(m.createdAt)}
                                </time>
                              ) : (
                                <ChatAvatar user={displayUser} size="md" />
                              )}
                            </div>
                            <ChatMessageBodyInteractive onLongPress={() => openMessageActions(m)}>
                              {!grouped ? (
                                <div className="chat-message-head">
                                  <strong className="chat-message-author">{displayName}</strong>
                                  {senderRoleLabel ? <span className="chat-message-role">{senderRoleLabel}</span> : null}
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
                          </article>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  {selectedConversationId ? (
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
                        disabled={sending || mediaUploading}
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
                          <button type="button" className="chat-composer-tool" aria-label="Emoji picker" title="Emoji picker">
                            ☺
                          </button>
                          <button type="button" className="chat-composer-tool chat-composer-tool--gif" aria-label="GIF picker" title="GIF picker">
                            GIF
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
                              (!draft.trim() && !pendingAttachment)
                            }
                            data-testid="chat-send"
                          >
                            {mediaUploading ? "Sending…" : sending ? "…" : "Send"}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  ) : null}
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
            <TeamActivityPanel
              teams={(teams ?? []).map((t) => ({ id: t.id, name: t.name }))}
              currentUserId={me?.id}
            />
      </div>

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
        teams={(teams ?? []).map((team) => ({ id: team.id, name: team.name }))}
        defaultTeamId={workspaceTeamId}
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
    </>
  );
}
