import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
  Alert,
  ScrollView,
  StyleSheet,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  usePaginatedDmMessages,
  flattenMessagePages,
} from "@/lib/chat-message-pagination";
import { useChatListScroll } from "@/hooks/use-chat-scroll";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Send,
  Plus,
  X,
  Users,
  Video,
  Trash2,
  Download,
  Reply,
  Copy,
  Camera,
  ImageIcon,
  MoreVertical,
  LogOut,
  UserPlus,
  UserMinus,
  Crown,
  Shield,
  Pin,
  ImagePlus,
  ChevronRight,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api, ApiError } from "@/lib/api/api";
import { useStatusClusterInset } from "@/lib/adaptive-layout";
import { useSession } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import {
  uploadMaxBytes,
  uploadSizeLimitMessage,
} from "@/lib/upload-limits";
import { pickMedia, pickImage, takePhoto } from "@/lib/file-picker";
import { toast } from "burnt";
import { ChatMessage } from "@/components/ChatMessage";
import {
  MessageActionSheet,
  type MessageAnchorLayout,
} from "@/components/MessageActionSheet";
import { MessageLongPressRow } from "@/components/MessageLongPressRow";
import { ImageSendPreview } from "@/components/ImageSendPreview";
import { PinnedMessageBar } from "@/components/PinnedMessageBar";
import { MentionPicker } from "@/components/MentionPicker";
import type {
  DirectMessage,
  MessageReaction,
  Conversation,
  GroupParticipantRole,
  PinnedMessageSummary,
} from "@/lib/types";
import * as Clipboard from "expo-clipboard";
import type { InfiniteData } from "@tanstack/react-query";
import type { MessagePage } from "@/lib/chat-message-pagination";
import { realtimeClient } from "@/lib/realtime-client";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  type SharedValue,
} from "react-native-reanimated";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { useUnreadStore } from "@/lib/state/unread-store";
import * as Haptics from "expo-haptics";
import { useMention } from "@/lib/useMention";
import {
  SafeKeyboardAvoidingView,
  useSafeKeyboardVisible,
} from "@/lib/safe-keyboard-controller";
import {
  dmOtherParticipant,
  resolveUserImageUrl,
  userInitials,
} from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { PresenceStatus } from "@/components/PresenceStatus";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { GroupManageModals } from "@/components/GroupManageModals";
import {
  ProfileCard,
  ProfileDivider,
  ProfileMenuRow,
  PROFILE_UI,
} from "@/components/profile/ProfileEnterpriseUI";

function DmChatEmptyState({
  user,
  isGroup,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  isGroup: boolean;
}) {
  const displayName =
    user.name?.trim() || (isGroup ? "this group" : "your teammate");
  const groupImageUri = isGroup ? resolveUserImageUrl(user.image) : null;

  return (
    <View
      testID="dm-chat-empty"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        paddingTop: 8,
        paddingBottom: 32,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 330,
          alignItems: "center",
          paddingHorizontal: 24,
          paddingVertical: 28,
          borderRadius: 28,
          backgroundColor: "rgba(255,255,255,0.92)",
          borderWidth: 1,
          borderColor: "rgba(91,66,243,0.10)",
          shadowColor: "#312E81",
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 10 },
          elevation: 3,
          overflow: "hidden",
        }}
      >
        <Text
          style={{
            marginBottom: 18,
            fontSize: 9,
            fontWeight: "800",
            letterSpacing: 1.25,
            color: "#7567C8",
          }}
        >
          {isGroup ? "NEW GROUP CONVERSATION" : "PRIVATE CONVERSATION"}
        </Text>

        <View style={{ marginBottom: 18 }}>
          <LinearGradient
            colors={["#6D5DFB", "#4361EE"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              width: 94,
              height: 94,
              borderRadius: 47,
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#5B42F3",
              shadowOpacity: 0.2,
              shadowRadius: 16,
              shadowOffset: { width: 0, height: 8 },
              elevation: 5,
            }}
          >
            <View
              style={{
                width: 86,
                height: 86,
                borderRadius: 43,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#FFFFFF",
              }}
            >
              {isGroup ? (
                groupImageUri ? (
                  <Image
                    source={{ uri: groupImageUri }}
                    style={{ width: 78, height: 78, borderRadius: 39 }}
                    resizeMode="cover"
                  />
                ) : (
                  <View
                    style={{
                      width: 78,
                      height: 78,
                      borderRadius: 39,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Users size={30} color="#536DFE" strokeWidth={2} />
                  </View>
                )
              ) : (
                <UserAvatar
                  user={user}
                  size={78}
                  radius={39}
                  backgroundColor="#EEF2FF"
                  textColor="#536DFE"
                  fontSize={24}
                />
              )}
            </View>
          </LinearGradient>
          <LinearGradient
            colors={["#7C3AED", "#4361EE"]}
            style={{
              position: "absolute",
              right: -2,
              bottom: 0,
              width: 30,
              height: 30,
              borderRadius: 15,
              borderWidth: 3,
              borderColor: "#FFFFFF",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={12} color="#FFFFFF" strokeWidth={2.4} />
          </LinearGradient>
        </View>

        <Text
          style={{
            fontSize: 21,
            fontWeight: "800",
            color: "#111827",
            textAlign: "center",
            letterSpacing: -0.45,
            lineHeight: 27,
          }}
        >
          Start a conversation
        </Text>
        <Text
          style={{
            marginTop: 9,
            fontSize: 13,
            color: "#667085",
            textAlign: "center",
            lineHeight: 19,
            maxWidth: 275,
          }}
        >
          {isGroup
            ? `Bring ${displayName} together for updates, questions, and ideas.`
            : `A private space for you and ${displayName}. Share an update, ask a question, or simply say hello.`}
        </Text>

        <View
          style={{
            marginTop: 19,
            minHeight: 34,
            paddingHorizontal: 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            borderRadius: 17,
            backgroundColor: "#F5F3FF",
          }}
        >
          <Shield size={13} color="#6D5DFB" strokeWidth={2.1} />
          <Text style={{ fontSize: 10.5, fontWeight: "600", color: "#61558F" }}>
            {isGroup
              ? "Visible only to participants"
              : "Private between you both"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function DeleteAction({
  drag,
  onDelete,
}: {
  drag: SharedValue<number>;
  onDelete: () => void;
}) {
  const styleAnimation = useAnimatedStyle(() => ({
    opacity: interpolate(drag.value, [-80, -40], [1, 0], "clamp"),
    transform: [
      { scale: interpolate(drag.value, [-80, -40], [1, 0.7], "clamp") },
    ],
  }));
  return (
    <Reanimated.View
      style={[
        { width: 72, justifyContent: "center", alignItems: "center" },
        styleAnimation,
      ]}
    >
      <TouchableOpacity
        onPress={onDelete}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: "#EF4444",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Trash2 size={18} color="white" />
      </TouchableOpacity>
    </Reanimated.View>
  );
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MessageItem = DirectMessage | { type: "date"; label: string; id: string };

function buildMessageList(messages: DirectMessage[]): MessageItem[] {
  const sorted = [...messages].sort((a, b) => {
    const diff =
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
  const items: MessageItem[] = [];
  let lastDate = "";
  for (const msg of sorted) {
    const label = formatDateLabel(msg.createdAt);
    if (label !== lastDate) {
      items.push({ type: "date", label, id: `date-${msg.id}` });
      lastDate = label;
    }
    items.push(msg);
  }
  return items;
}

type SendMessagePayload = {
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  replyToId?: string;
  mentionedUserIds?: string[];
};

type SendMessageVariables = SendMessagePayload & {
  localMessageId: string;
  mediaDraft?: {
    uri: string;
    filename: string;
    mimeType: string;
  };
};

type LocalOutgoingMessage = DirectMessage & {
  outboxPayload: SendMessagePayload;
  mediaDraft?: SendMessageVariables["mediaDraft"];
};

const dmOutboxKey = (userId: string, conversationId: string) =>
  `alenio:dm-outbox:v1:${userId}:${conversationId}`;

export type DmThreadProps = {
  conversationId: string;
  /** Shown until the `dms` query fills in the real name and photo. */
  recipientName?: string;
  recipientImage?: string;
  isGroup?: boolean;
  /**
   * Split layouts render the thread beside the inbox rather than pushing it, so
   * leaving a conversation clears the selection instead of popping a route.
   */
  onClose?: () => void;
};

/**
 * One conversation. Rendered full screen by the route below on phones and
 * portrait, and inline in the inbox's second pane on wide landscape screens.
 */
export function DmThread({
  conversationId,
  recipientName,
  recipientImage,
  isGroup = false,
  onClose,
}: DmThreadProps) {
  /** A pane has no route to pop, and no back arrow either. */
  const embedded = !!onClose;
  const close = onClose ?? (() => router.back());
  const exitToInbox = onClose ?? (() => router.replace("/(app)/chat"));
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const cluster = useStatusClusterInset({ fullScreen: !embedded });
  const keyboardVisible = useSafeKeyboardVisible();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [localOutgoingMessages, setLocalOutgoingMessages] = useState<
    LocalOutgoingMessage[]
  >([]);
  const [outboxHydrated, setOutboxHydrated] = useState(false);
  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<{
    message: DirectMessage;
    layout: MessageAnchorLayout;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectMessage | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showConvDeleteConfirm, setShowConvDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [groupManageMode, setGroupManageMode] = useState<
    "add" | "remove" | "transfer" | "admins" | "members" | null
  >(null);
  const [reactionView, setReactionView] = useState<MessageReaction[] | null>(
    null,
  );
  const [mediaPreview, setMediaPreview] = useState<{
    uri: string;
    mimeType: string;
    filename: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<
    string | null
  >(null);
  const [jumpingToPin, setJumpingToPin] = useState(false);
  const currentUserId = session?.user?.id ?? "";
  const markAsRead = useUnreadStore((s) => s.markAsRead);
  const prevMsgCountRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);
  const activeOutboxIdsRef = useRef(new Set<string>());
  const networkConnectedRef = useRef<boolean | null>(null);

  useEffect(() => {
    void NetInfo.fetch().then((state) => {
      const connected = state.isConnected !== false;
      networkConnectedRef.current = connected;
      setNetworkConnected(connected);
    });
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected !== false;
      networkConnectedRef.current = connected;
      setNetworkConnected(connected);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!currentUserId || !conversationId) return;
    let cancelled = false;
    setOutboxHydrated(false);
    void AsyncStorage.getItem(dmOutboxKey(currentUserId, conversationId))
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setLocalOutgoingMessages([]);
          return;
        }
        const parsed = JSON.parse(raw) as LocalOutgoingMessage[];
        setLocalOutgoingMessages(
          Array.isArray(parsed)
            ? parsed.map((message) => ({
                ...message,
                deliveryStatus:
                  message.deliveryStatus === "queued" ? "queued" : "failed",
              }))
            : [],
        );
      })
      .catch(() => {
        if (!cancelled) setLocalOutgoingMessages([]);
      })
      .finally(() => {
        if (!cancelled) setOutboxHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId, currentUserId]);

  useEffect(() => {
    if (!outboxHydrated || !currentUserId || !conversationId) return;
    const key = dmOutboxKey(currentUserId, conversationId);
    if (localOutgoingMessages.length === 0) {
      void AsyncStorage.removeItem(key);
      return;
    }
    void AsyncStorage.setItem(key, JSON.stringify(localOutgoingMessages));
  }, [
    conversationId,
    currentUserId,
    localOutgoingMessages,
    outboxHydrated,
  ]);

  const {
    mentionedUserIds,
    mentionQuery,
    onTextChange: onMentionTextChange,
    selectMention,
    resetMentions,
  } = useMention();

  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!conversationId,
  });

  const currentConversation = conversations.find(
    (c) => c.id === conversationId,
  );
  const messagingStatus = isGroup
    ? "available"
    : (currentConversation?.messagingStatus ?? "loading");
  const messagingDisabled = messagingStatus !== "available";
  useEffect(() => {
    if (!messagingDisabled || messagingStatus === "loading") return;
    setMessageMenu(null);
    setReactionView(null);
    setShowMediaPicker(false);
  }, [messagingDisabled, messagingStatus]);
  const groupParticipants = currentConversation?.participants ?? [];
  const groupParticipantCount = groupParticipants.length;
  const myGroupRole: GroupParticipantRole =
    currentConversation?.myRole ??
    groupParticipants.find((p) => p.id === currentUserId)?.role ??
    "member";
  const canManageGroupMembers =
    myGroupRole === "owner" || myGroupRole === "admin";
  const canDeleteGroup = myGroupRole === "owner";
  const canManageGroupAdmins = myGroupRole === "owner";
  const canLeaveGroup = !isGroup || myGroupRole !== "owner";
  const groupWorkspace = isGroup
    ? groupWorkspaceLabel(currentConversation?.workspaceContext)
    : null;
  const isLastGroupMember = isGroup && groupParticipantCount <= 1;
  const headerUser = useMemo(() => {
    if (isGroup) {
      return {
        id: null as string | null,
        name: currentConversation?.name ?? recipientName ?? "Group",
        email: null as string | null,
        image: currentConversation?.image ?? (recipientImage?.trim() || null),
        isWorkplaceConnected: false,
        activeNow: false,
      };
    }
    const other = currentConversation
      ? dmOtherParticipant(currentConversation, currentUserId)
      : null;
    return {
      id: other?.id ?? null,
      name:
        other?.name?.trim() ||
        other?.email?.trim() ||
        recipientName?.trim() ||
        "Direct Message",
      email: other?.email ?? null,
      image: other?.image ?? (recipientImage?.trim() || null),
      isWorkplaceConnected: other?.isWorkplaceConnected ?? false,
      activeNow: other?.activeNow ?? false,
    };
  }, [
    currentConversation,
    currentUserId,
    isGroup,
    recipientImage,
    recipientName,
  ]);
  const groupImageUri = isGroup ? resolveUserImageUrl(headerUser.image) : null;
  const mentionableUsers = (currentConversation?.participants ?? [])
    .filter((p) => p.id !== currentUserId)
    // A mention is typed as "@name", so anyone without one falls back to the
    // handle in their email rather than showing up blank in the picker.
    .map((p) => ({
      id: p.id,
      name: p.name?.trim() || p.email?.split("@")[0] || "member",
      image: p.image ?? null,
    }));

  const {
    messages,
    isLoading,
    isError: messagesError,
    error: messagesLoadError,
    refetch: refetchMessages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePaginatedDmMessages<DirectMessage>(conversationId);

  const visibleMessages = useMemo(
    () => [...messages, ...localOutgoingMessages],
    [localOutgoingMessages, messages],
  );
  const items = useMemo(
    () => buildMessageList(visibleMessages),
    [visibleMessages],
  );
  const listData = useMemo(() => [...items].reverse(), [items]);

  const {
    listRef: flatListRef,
    handleScroll,
    handleContentSizeChange,
    followLatestIfNearBottom,
    scrollToIndex,
    handleScrollToIndexFailed,
    contentContainerStyle,
    maintainVisibleContentPosition,
    readyForOlderLoad,
  } = useChatListScroll(conversationId, listData.length);

  const pinQueryKey = ["pinned-messages", "dm", conversationId] as const;
  const { data: pinnedMessages = [] } = useQuery<PinnedMessageSummary[]>({
    queryKey: [...pinQueryKey],
    queryFn: async () => {
      const data = await api.get<PinnedMessageSummary[] | null>(
        `/api/dms/${conversationId}/messages/pin`,
      );
      return Array.isArray(data) ? data : [];
    },
    enabled: !!conversationId,
  });
  const pinnedIds = useMemo(
    () => new Set(pinnedMessages.map((p) => p.messageId)),
    [pinnedMessages],
  );

  useEffect(() => {
    if (!conversationId) return;
    const off = realtimeClient.onPinUpdated((event) => {
      if (event.channel !== "dm" || event.conversationId !== conversationId)
        return;
      queryClient.setQueryData(
        [...pinQueryKey],
        Array.isArray(event.pinnedMessages) ? event.pinnedMessages : [],
      );
    });
    return () => {
      off();
    };
  }, [conversationId, queryClient]);

  const pinMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.put<PinnedMessageSummary[]>(
        `/api/dms/${conversationId}/messages/pin`,
        { messageId },
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(
        [...pinQueryKey],
        Array.isArray(data) ? data : [],
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const unpinMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete<PinnedMessageSummary[]>(
        `/api/dms/${conversationId}/messages/pin?messageId=${encodeURIComponent(messageId)}`,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(
        [...pinQueryKey],
        Array.isArray(data) ? data : [],
      );
    },
  });

  const jumpToPinnedMessage = useCallback(
    async (messageId: string) => {
      if (!messageId || jumpingToPin) return;
      setJumpingToPin(true);
      try {
        let guard = 0;
        let pages =
          queryClient.getQueryData<InfiniteData<MessagePage<DirectMessage>>>([
            "dm-messages",
            conversationId,
          ])?.pages ?? [];
        let loaded = flattenMessagePages<DirectMessage>(pages);
        while (!loaded.some((m) => m.id === messageId) && guard < 40) {
          guard += 1;
          const result = await fetchNextPage();
          pages =
            (result.data?.pages as MessagePage<DirectMessage>[] | undefined) ??
            pages;
          loaded = flattenMessagePages<DirectMessage>(pages);
          if (!result.hasNextPage) break;
        }
        const nextList = [...buildMessageList(loaded)].reverse();
        const index = nextList.findIndex(
          (item) =>
            !("type" in item) && (item as DirectMessage).id === messageId,
        );
        if (index < 0) return;
        requestAnimationFrame(() => {
          scrollToIndex(index, true);
          setHighlightedMessageId(messageId);
          setTimeout(() => setHighlightedMessageId(null), 1800);
        });
      } finally {
        setJumpingToPin(false);
      }
    },
    [jumpingToPin, queryClient, conversationId, fetchNextPage, scrollToIndex],
  );

  const sendMutation = useMutation({
    mutationFn: async ({
      localMessageId,
      mediaDraft,
      ...payload
    }: SendMessageVariables) => {
      let nextPayload = payload;
      if (mediaDraft && !payload.mediaUrl) {
        setUploading(true);
        try {
          const uploaded = await uploadFile(
            mediaDraft.uri,
            mediaDraft.filename,
            mediaDraft.mimeType,
          );
          nextPayload = {
            ...payload,
            mediaUrl: uploaded.url,
            mediaType: mediaDraft.mimeType.startsWith("video")
              ? "video"
              : "image",
          };
          setLocalOutgoingMessages((current) =>
            current.map((message) =>
              message.id === localMessageId
                ? {
                    ...message,
                    mediaUrl: uploaded.url,
                    outboxPayload: nextPayload,
                  }
                : message,
            ),
          );
        } finally {
          setUploading(false);
        }
      }
      return api.post<DirectMessage>(
        `/api/dms/${conversationId}/messages`,
        nextPayload,
      );
    },
    onSuccess: (_message, variables) => {
      setLocalOutgoingMessages((current) =>
        current.filter((message) => message.id !== variables.localMessageId),
      );
      queryClient.invalidateQueries({
        queryKey: ["dm-messages", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      setReplyTo(null);
      setMediaPreview(null);
    },
    onError: (error, variables) => {
      setLocalOutgoingMessages((current) =>
        current.map((message) =>
          message.id === variables.localMessageId
            ? {
                ...message,
                deliveryStatus:
                  networkConnectedRef.current === false ? "queued" : "failed",
              }
            : message,
        ),
      );
      if (
        error instanceof ApiError &&
        error.body?.error?.code === "MESSAGING_BLOCKED"
      ) {
        void queryClient.invalidateQueries({ queryKey: ["dms"] });
      }
      toast({ title: "Message not delivered", preset: "error" });
    },
    onSettled: (_data, _error, variables) => {
      activeOutboxIdsRef.current.delete(variables.localMessageId);
    },
  });

  const attemptOutboxMessage = (message: LocalOutgoingMessage) => {
    if (messagingDisabled || activeOutboxIdsRef.current.has(message.id)) return;
    if (networkConnectedRef.current === false) {
      setLocalOutgoingMessages((current) =>
        current.map((item) =>
          item.id === message.id
            ? { ...item, deliveryStatus: "queued" }
            : item,
        ),
      );
      return;
    }
    activeOutboxIdsRef.current.add(message.id);
    setLocalOutgoingMessages((current) =>
      current.map((item) =>
        item.id === message.id ? { ...item, deliveryStatus: "sending" } : item,
      ),
    );
    sendMutation.mutate({
      ...message.outboxPayload,
      localMessageId: message.id,
      mediaDraft: message.mediaDraft,
    });
  };

  useEffect(() => {
    if (!outboxHydrated || networkConnected !== true || messagingDisabled) return;
    for (const message of localOutgoingMessages) {
      if (message.deliveryStatus === "queued") attemptOutboxMessage(message);
    }
  }, [
    localOutgoingMessages,
    messagingDisabled,
    networkConnected,
    outboxHydrated,
  ]);

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.post(`/api/dms/${conversationId}/messages/${messageId}/reactions`, {
        emoji,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["dm-messages", conversationId],
      }),
    onError: (error) => {
      if (
        error instanceof ApiError &&
        error.body?.error?.code === "MESSAGING_BLOCKED"
      ) {
        void queryClient.invalidateQueries({ queryKey: ["dms"] });
      }
      toast({ title: "Reaction not added", preset: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete(`/api/dms/${conversationId}/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["dm-messages", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["dms"] });
    },
  });

  const leaveConversationMutation = useMutation({
    mutationFn: () => api.post(`/api/dms/${conversationId}/leave`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      queryClient.removeQueries({ queryKey: ["dm-messages", conversationId] });
      exitToInbox();
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not leave group", preset: "error" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: () => api.delete(`/api/dms/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      exitToInbox();
    },
    onError: (err: Error) => {
      toast({
        title: err.message || "Could not delete group",
        preset: "error",
      });
    },
  });

  const updateGroupPhotoMutation = useMutation({
    mutationFn: async (image: string | null) => {
      return api.patch<Conversation>(`/api/dms/${conversationId}`, { image });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<Conversation[]>(["dms"], (prev) =>
        prev?.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                image: updated.image ?? null,
                name: updated.name ?? c.name,
              }
            : c,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      toast({ title: "Group photo updated", preset: "done" });
    },
    onError: (err: Error) => {
      Alert.alert(
        "Could not update group photo",
        err.message || "Something went wrong. Try again.",
      );
    },
  });

  const openGroupPhotoPicker = () => {
    setShowOptions(false);
    const hasPhoto = !!currentConversation?.image;
    const buttons: {
      text: string;
      style?: "cancel" | "destructive";
      onPress?: () => void;
    }[] = [
      {
        text: "Choose from library",
        onPress: () => {
          void (async () => {
            try {
              const file = await pickImage();
              if (!file) return;
              const uploaded = await uploadFile(
                file.uri,
                file.filename,
                file.mimeType,
              );
              updateGroupPhotoMutation.mutate(uploaded.url);
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Something went wrong. Try again.";
              if (message !== "cancelled") {
                Alert.alert("Could not update group photo", message);
              }
            }
          })();
        },
      },
      {
        text: "Take photo",
        onPress: () => {
          void (async () => {
            try {
              const file = await takePhoto();
              if (!file) return;
              const uploaded = await uploadFile(
                file.uri,
                file.filename,
                file.mimeType,
              );
              updateGroupPhotoMutation.mutate(uploaded.url);
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : "Something went wrong. Try again.";
              if (message !== "cancelled") {
                Alert.alert("Could not update group photo", message);
              }
            }
          })();
        },
      },
    ];
    if (hasPhoto) {
      buttons.push({
        text: "Remove photo",
        style: "destructive",
        onPress: () => updateGroupPhotoMutation.mutate(null),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    setTimeout(() => {
      Alert.alert("Group Photo", "Choose a photo for this group.", buttons);
    }, 300);
  };

  const openGroupManage = (
    mode: "add" | "remove" | "transfer" | "admins" | "members",
  ) => {
    setShowOptions(false);
    setTimeout(() => setGroupManageMode(mode), 300);
  };

  const sendWithLocalState = (
    payload: SendMessagePayload,
    mediaDraft?: SendMessageVariables["mediaDraft"],
  ) => {
    const localMessageId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const localMessage: LocalOutgoingMessage = {
      id: localMessageId,
      content: payload.content ?? null,
      mediaUrl: payload.mediaUrl ?? mediaDraft?.uri ?? null,
      mediaType: payload.mediaUrl || mediaDraft
        ? (payload.mediaType ?? mediaDraft?.mimeType)?.startsWith("video")
          ? "video"
          : "image"
        : null,
      replyToId: payload.replyToId ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            content: replyTo.content,
            mediaUrl: replyTo.mediaUrl,
            mediaType: replyTo.mediaType,
            sender: {
              id: replyTo.sender.id,
              name: replyTo.sender.name ?? "Member",
            },
          }
        : null,
      reactions: [],
      createdAt: new Date().toISOString(),
      conversationId,
      senderId: currentUserId,
      sender: {
        id: currentUserId,
        name: session?.user?.name ?? "You",
        email: session?.user?.email ?? "",
        image: session?.user?.image ?? null,
      },
      deliveryStatus:
        networkConnectedRef.current === false ? "queued" : "sending",
      outboxPayload: payload,
      mediaDraft,
    };
    setLocalOutgoingMessages((current) => [...current, localMessage]);
    if (networkConnectedRef.current !== false) {
      activeOutboxIdsRef.current.add(localMessageId);
      sendMutation.mutate({ ...payload, localMessageId, mediaDraft });
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || messagingDisabled) return;
    setInput("");
    sendWithLocalState({
      content,
      replyToId: replyTo?.id,
      mentionedUserIds:
        mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    });
    resetMentions();
  };

  const handleSendMedia = async (caption: string) => {
    if (!mediaPreview || messagingDisabled) return;
    const draft = mediaPreview;
    setMediaPreview(null);
    sendWithLocalState(
      {
        content: caption || undefined,
        mediaType: draft.mimeType.startsWith("video") ? "video" : "image",
        replyToId: replyTo?.id,
      },
      draft,
    );
  };

  const handlePickMedia = async () => {
    try {
      const file = await pickMedia();
      if (!file) return;
      if (
        typeof file.sizeBytes === "number" &&
        file.sizeBytes > uploadMaxBytes(file.mimeType)
      ) {
        toast({
          title: uploadSizeLimitMessage(file.mimeType),
          preset: "error",
        });
        return;
      }
      setMediaPreview(file);
    } catch (error) {
      console.warn("[dm-chat] Unable to load selected media", error);
      toast({
        title:
          error instanceof Error &&
          /must be \d+ MB or smaller/i.test(error.message)
            ? error.message
            : "Video couldn’t be loaded. Open it in Photos, then try again.",
        preset: "error",
      });
    }
  };

  const handleTakePhoto = async () => {
    try {
      const file = await takePhoto();
      if (file) setMediaPreview(file);
    } catch (error) {
      console.warn("[dm-chat] Unable to capture photo", error);
      toast({ title: "Photo couldn’t be added", preset: "error" });
    }
  };

  const { mutate: deleteMessage } = deleteMutation;

  const handleSaveMedia = useCallback(
    async (mediaUrl: string, mediaType: string) => {
      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const { status } = await MediaLibrary.requestPermissionsAsync();
        if (status !== "granted") {
          toast({ title: "Permission denied", preset: "error" });
          return;
        }
        const ext = mediaType === "video" ? "mp4" : "jpg";
        const baseDir =
          FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
        if (!baseDir) {
          toast({
            title: "Storage not available on this device",
            preset: "error",
          });
          return;
        }
        const localUri = `${baseDir}download_${Date.now()}.${ext}`;
        const { uri } = await FileSystem.downloadAsync(mediaUrl, localUri);
        await MediaLibrary.saveToLibraryAsync(uri);
        await FileSystem.deleteAsync(uri, { idempotent: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast({
          title: mediaType === "video" ? "Video saved" : "Photo saved",
          preset: "done",
        });
      } catch {
        toast({ title: "Failed to save", preset: "error" });
      }
    },
    [],
  );

  const handleLongPress = useCallback(
    (msg: DirectMessage, layout: MessageAnchorLayout) => {
      setMessageMenu({ message: msg, layout });
    },
    [],
  );

  const handleLoadOlder = useCallback(() => {
    if (!readyForOlderLoad) return;
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, readyForOlderLoad]);

  useEffect(() => {
    lastMessageIdRef.current = null;
  }, [conversationId]);

  useEffect(() => {
    const lastMsg = visibleMessages[visibleMessages.length - 1];
    if (!lastMsg) return;
    const prevId = lastMessageIdRef.current;
    lastMessageIdRef.current = lastMsg.id;
    if (prevId !== lastMsg.id) {
      followLatestIfNearBottom(false);
      setTimeout(() => followLatestIfNearBottom(false), 40);
    }
  }, [visibleMessages, followLatestIfNearBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      markAsRead(conversationId, lastMsg.id);
      void queryClient.invalidateQueries({ queryKey: ["dm-unread-counts"] });
    }
  }, [messages, conversationId, markAsRead, queryClient]);

  useEffect(() => {
    prevMsgCountRef.current = visibleMessages.length;
  }, [visibleMessages]);

  return (
    <SafeAreaView
      testID="dm-chat-screen"
      className="flex-1"
      style={{
        backgroundColor: "#FFFFFF",
        paddingLeft: cluster.left,
        paddingRight: cluster.right,
      }}
      /** In a pane the tab layout has already cleared the status bar. */
      edges={embedded ? [] : ["top"]}
    >
      <View
        style={{
          zIndex: 2,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: "#E8ECF2",
        }}
      >
        <View
          style={{
            minHeight: 54,
            paddingHorizontal: 10,
            paddingVertical: 7,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {embedded ? null : (
            <TouchableOpacity
              onPress={close}
              style={{
                width: 32,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 4,
              }}
              testID="back-button"
            >
              <ArrowLeft size={20} color="#172033" strokeWidth={2.2} />
            </TouchableOpacity>
          )}
          <Pressable
            disabled={isGroup || !headerUser.id}
            onPress={() => {
              if (!isGroup && headerUser.id) {
                router.push({
                  pathname: "/person",
                  params: { userId: headerUser.id },
                });
              }
            }}
            accessibilityRole={!isGroup && headerUser.id ? "button" : undefined}
            accessibilityLabel={
              !isGroup && headerUser.id
                ? `Open ${headerUser.name}'s profile`
                : undefined
            }
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
            }}
            testID="dm-header-profile"
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8,
                backgroundColor: "#F2F4F8",
                overflow: "hidden",
              }}
            >
              {isGroup ? (
                groupImageUri ? (
                  <Image
                    source={{ uri: groupImageUri }}
                    style={{ width: 34, height: 34, borderRadius: 17 }}
                    resizeMode="cover"
                  />
                ) : (
                  <Users size={17} color="#526079" />
                )
              ) : (
                <UserAvatar
                  user={headerUser}
                  size={34}
                  radius={17}
                  backgroundColor="#EEF2FF"
                  textColor="#4361EE"
                  fontSize={13}
                />
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: "#172033", fontSize: 15, lineHeight: 19, fontWeight: "700" }}
              >
                {headerUser.name}
              </Text>
              {!isGroup && headerUser.activeNow ? (
                <PresenceStatus
                  activeNow
                  color="#22A06B"
                  textStyle={{ fontSize: 11, lineHeight: 14, color: "#22A06B" }}
                  testID="dm-header-presence"
                />
              ) : (
                <Text style={{ color: "#8994A6", fontSize: 11, lineHeight: 14 }}>
                  {isGroup
                    ? (groupWorkspace ?? "Group chat")
                    : "Direct message"}
                </Text>
              )}
            </View>
          </Pressable>
          <TouchableOpacity
            testID="start-video-call-button"
            disabled={messagingDisabled}
            onPress={() =>
              router.push({
                pathname: "/video-call",
                params: {
                  roomId: conversationId,
                  roomName: `${headerUser.name ?? "Call"}`,
                },
              })
            }
            style={{
              width: 34,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
              opacity: messagingDisabled ? 0.42 : 1,
            }}
          >
            <Video size={21} color="#344054" strokeWidth={2.1} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="conversation-options-button"
            onPress={() => setShowOptions(true)}
            style={{
              width: 34,
              height: 34,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreVertical size={21} color="#344054" strokeWidth={2.1} />
          </TouchableOpacity>
        </View>
      </View>

      {pinnedMessages.length > 0 ? (
        <PinnedMessageBar
          pins={pinnedMessages}
          onPressPin={(pin) => {
            void jumpToPinnedMessage(pin.messageId);
          }}
          onLongPressPin={(pin) => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            unpinMutation.mutate(pin.messageId);
          }}
        />
      ) : null}

      {/* Media picker sheet */}
      <Modal
        visible={showMediaPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowMediaPicker(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setShowMediaPicker(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View
              style={{
                backgroundColor: "white",
                marginHorizontal: 12,
                marginBottom: 32,
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  setShowMediaPicker(false);
                  setTimeout(handleTakePhoto, 300);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                  borderBottomWidth: 0.5,
                  borderBottomColor: "#F1F5F9",
                }}
              >
                <Camera size={20} color="#4361EE" style={{ marginRight: 14 }} />
                <Text
                  style={{ fontSize: 16, color: "#1E293B", fontWeight: "500" }}
                >
                  Take Photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowMediaPicker(false);
                  setTimeout(handlePickMedia, 300);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 20,
                  paddingVertical: 18,
                }}
              >
                <ImageIcon
                  size={20}
                  color="#4361EE"
                  style={{ marginRight: 14 }}
                />
                <Text
                  style={{ fontSize: 16, color: "#1E293B", fontWeight: "500" }}
                >
                  Photo Library
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Who reacted modal */}
      <Modal
        visible={!!reactionView}
        transparent
        animationType="slide"
        onRequestClose={() => setReactionView(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-end",
          }}
          activeOpacity={1}
          onPress={() => setReactionView(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View
              style={{
                backgroundColor: "white",
                marginHorizontal: 12,
                marginBottom: 32,
                borderRadius: 16,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 20,
                  paddingVertical: 14,
                  borderBottomWidth: 0.5,
                  borderBottomColor: "#E2E8F0",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}
                >
                  Reactions
                </Text>
              </View>
              {reactionView?.map((r) => (
                <View
                  key={r.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 20,
                    paddingVertical: 14,
                    borderBottomWidth: 0.5,
                    borderBottomColor: "#F1F5F9",
                  }}
                >
                  <Text style={{ fontSize: 22, marginRight: 14 }}>
                    {r.emoji}
                  </Text>
                  <View
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      backgroundColor: "#4361EE",
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 10,
                    }}
                  >
                    <Text
                      style={{
                        color: "white",
                        fontWeight: "700",
                        fontSize: 13,
                      }}
                    >
                      {r.user.name?.[0]?.toUpperCase() ?? "?"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 15,
                      color: "#1E293B",
                      fontWeight: "500",
                    }}
                  >
                    {r.user.name}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        visible={!!deleteTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
          activeOpacity={1}
          onPress={() => setDeleteTarget(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "100%",
              backgroundColor: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#0F172A",
                  marginBottom: 4,
                }}
              >
                Delete message?
              </Text>
              <Text
                style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}
              >
                This message will be permanently removed.
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
              }}
            >
              <TouchableOpacity
                onPress={() => setDeleteTarget(null)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderRightWidth: 1,
                  borderRightColor: "#F1F5F9",
                }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-delete-button"
                onPress={() => {
                  if (deleteTarget) {
                    deleteMessage(deleteTarget.id);
                    setDeleteTarget(null);
                  }
                }}
                disabled={deleteMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#EF4444",
                    }}
                  >
                    Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Conversation options sheet */}
      <Modal
        visible={showOptions}
        transparent
        animationType="slide"
        onRequestClose={() => setShowOptions(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(15,23,42,0.45)",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            style={{
              position: "absolute",
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
            }}
            onPress={() => setShowOptions(false)}
          />
          <View
            style={{
              backgroundColor: "#F8FAFC",
              marginHorizontal: 10,
              marginBottom: 28,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#E2E8F0",
              overflow: "hidden",
              maxHeight: "82%",
            }}
          >
            <View
              style={{ paddingTop: 10, paddingBottom: 4, alignItems: "center" }}
            >
              <View
                style={{
                  width: 36,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#CBD5E1",
                }}
              />
            </View>

            <ScrollView
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingBottom: 14,
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={PROFILE_UI.sectionLabel}>
                    {isGroup ? "Manage group" : "Conversation"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "700",
                      color: "#0F172A",
                    }}
                    numberOfLines={1}
                  >
                    {isGroup
                      ? (currentConversation?.name ?? headerUser.name)
                      : headerUser.name}
                  </Text>
                  {isGroup ? (
                    <Text style={{ fontSize: 12, color: "#64748B" }}>
                      {groupParticipantCount}{" "}
                      {groupParticipantCount === 1 ? "member" : "members"}
                      {" · "}
                      {myGroupRole === "owner"
                        ? "Owner"
                        : myGroupRole === "admin"
                          ? "Admin"
                          : "Member"}
                      {groupWorkspace ? ` · ${groupWorkspace}` : ""}
                    </Text>
                  ) : (
                    <Text style={{ fontSize: 12, color: "#64748B" }}>
                      Direct message settings
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={() => setShowOptions(false)}
                  hitSlop={8}
                  style={({ pressed }) => ({
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: pressed ? "#E2E8F0" : "#FFFFFF",
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    marginTop: 2,
                  })}
                  accessibilityLabel="Close"
                >
                  <X size={16} color="#64748B" strokeWidth={2.2} />
                </Pressable>
              </View>

              <View
                style={{ paddingHorizontal: 12, paddingBottom: 16, gap: 12 }}
              >
                {isGroup ? (
                  <>
                    <View>
                      <Text
                        style={[
                          PROFILE_UI.sectionLabel,
                          { marginBottom: 6, paddingHorizontal: 2 },
                        ]}
                      >
                        People
                      </Text>
                      <ProfileCard>
                        <ProfileMenuRow
                          icon={Users}
                          title="Members"
                          subtitle="View everyone in this group"
                          trailing={
                            <View
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: "600",
                                  color: "#64748B",
                                }}
                              >
                                {groupParticipantCount}
                              </Text>
                              <ChevronRight size={16} color="#94A3B8" />
                            </View>
                          }
                          showChevron={false}
                          onPress={() => openGroupManage("members")}
                        />
                        {canManageGroupMembers ? (
                          <>
                            <ProfileDivider inset />
                            <ProfileMenuRow
                              icon={UserPlus}
                              title="Add members"
                              subtitle="Invite people from your workspaces"
                              onPress={() => openGroupManage("add")}
                            />
                            <ProfileDivider inset />
                            <ProfileMenuRow
                              icon={UserMinus}
                              title="Remove members"
                              subtitle="Remove people from this group"
                              onPress={() => openGroupManage("remove")}
                            />
                          </>
                        ) : null}
                      </ProfileCard>
                    </View>

                    {canManageGroupMembers ||
                    canManageGroupAdmins ||
                    canDeleteGroup ? (
                      <View>
                        <Text
                          style={[
                            PROFILE_UI.sectionLabel,
                            { marginBottom: 6, paddingHorizontal: 2 },
                          ]}
                        >
                          Administration
                        </Text>
                        <ProfileCard>
                          {canManageGroupMembers ? (
                            <ProfileMenuRow
                              icon={ImagePlus}
                              title={
                                currentConversation?.image
                                  ? "Change group photo"
                                  : "Group photo"
                              }
                              subtitle={
                                updateGroupPhotoMutation.isPending
                                  ? "Uploading…"
                                  : "Update the group image"
                              }
                              trailing={
                                updateGroupPhotoMutation.isPending ? (
                                  <ActivityIndicator
                                    size="small"
                                    color="#64748B"
                                  />
                                ) : undefined
                              }
                              showChevron={!updateGroupPhotoMutation.isPending}
                              onPress={
                                updateGroupPhotoMutation.isPending
                                  ? undefined
                                  : openGroupPhotoPicker
                              }
                            />
                          ) : null}
                          {canManageGroupMembers && canManageGroupAdmins ? (
                            <ProfileDivider inset />
                          ) : null}
                          {canManageGroupAdmins ? (
                            <ProfileMenuRow
                              icon={Shield}
                              title="Manage admins"
                              subtitle="Grant or revoke admin access"
                              onPress={() => openGroupManage("admins")}
                            />
                          ) : null}
                          {canManageGroupAdmins && canDeleteGroup ? (
                            <ProfileDivider inset />
                          ) : null}
                          {canDeleteGroup ? (
                            <ProfileMenuRow
                              icon={Crown}
                              title="Transfer ownership"
                              subtitle="Make someone else the group owner"
                              onPress={() => openGroupManage("transfer")}
                            />
                          ) : null}
                        </ProfileCard>
                      </View>
                    ) : null}

                    {canDeleteGroup || canLeaveGroup ? (
                      <View>
                        <Text
                          style={[
                            PROFILE_UI.sectionLabel,
                            { marginBottom: 6, paddingHorizontal: 2 },
                          ]}
                        >
                          Danger zone
                        </Text>
                        <ProfileCard>
                          {canLeaveGroup ? (
                            <ProfileMenuRow
                              icon={LogOut}
                              title="Leave group"
                              subtitle="You will lose access to this conversation"
                              onPress={() => {
                                setShowOptions(false);
                                setTimeout(
                                  () => setShowLeaveConfirm(true),
                                  300,
                                );
                              }}
                            />
                          ) : null}
                          {canLeaveGroup && canDeleteGroup ? (
                            <ProfileDivider inset />
                          ) : null}
                          {canDeleteGroup ? (
                            <ProfileMenuRow
                              icon={Trash2}
                              title="Delete group"
                              subtitle="Permanently delete for everyone"
                              destructive
                              onPress={() => {
                                setShowOptions(false);
                                setTimeout(
                                  () => setShowConvDeleteConfirm(true),
                                  300,
                                );
                              }}
                            />
                          ) : null}
                        </ProfileCard>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View>
                    <Text
                      style={[
                        PROFILE_UI.sectionLabel,
                        { marginBottom: 6, paddingHorizontal: 2 },
                      ]}
                    >
                      Danger zone
                    </Text>
                    <ProfileCard>
                      <ProfileMenuRow
                        icon={Trash2}
                        title="Delete conversation"
                        subtitle="Remove this chat for everyone"
                        destructive
                        onPress={() => {
                          setShowOptions(false);
                          setTimeout(() => setShowConvDeleteConfirm(true), 300);
                        }}
                      />
                    </ProfileCard>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {isGroup ? (
        <GroupManageModals
          conversationId={conversationId}
          participants={groupParticipants}
          currentUserId={currentUserId}
          myRole={myGroupRole}
          mode={groupManageMode}
          onClose={() => setGroupManageMode(null)}
        />
      ) : null}

      {/* Leave group confirmation */}
      <Modal
        visible={showLeaveConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLeaveConfirm(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
          activeOpacity={1}
          onPress={() => setShowLeaveConfirm(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "100%",
              backgroundColor: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#0F172A",
                  marginBottom: 4,
                }}
              >
                {isLastGroupMember ? "Delete Group?" : "Leave Group?"}
              </Text>
              <Text
                style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}
              >
                {isLastGroupMember
                  ? "You are the last member. Leaving will permanently delete this group and all message history."
                  : "You will stop receiving messages from this group. Other members can still chat."}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
              }}
            >
              <TouchableOpacity
                onPress={() => setShowLeaveConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderRightWidth: 1,
                  borderRightColor: "#F1F5F9",
                }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowLeaveConfirm(false);
                  leaveConversationMutation.mutate();
                }}
                disabled={leaveConversationMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                {leaveConversationMutation.isPending ? (
                  <ActivityIndicator
                    size="small"
                    color={isLastGroupMember ? "#EF4444" : "#F59E0B"}
                  />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: isLastGroupMember ? "#EF4444" : "#F59E0B",
                    }}
                  >
                    {isLastGroupMember ? "Delete Group" : "Leave"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete conversation confirmation */}
      <Modal
        visible={showConvDeleteConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConvDeleteConfirm(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.4)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
          }}
          activeOpacity={1}
          onPress={() => setShowConvDeleteConfirm(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "100%",
              backgroundColor: "white",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: 20,
                paddingTop: 20,
                paddingBottom: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 17,
                  fontWeight: "700",
                  color: "#0F172A",
                  marginBottom: 4,
                }}
              >
                {isGroup ? "Delete Group?" : "Delete Conversation?"}
              </Text>
              <Text
                style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}
              >
                {isGroup
                  ? "This will permanently delete the group and all messages for everyone."
                  : "This will permanently delete this conversation for both you and the other person."}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                borderTopWidth: 1,
                borderTopColor: "#F1F5F9",
              }}
            >
              <TouchableOpacity
                onPress={() => setShowConvDeleteConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  alignItems: "center",
                  borderRightWidth: 1,
                  borderRightColor: "#F1F5F9",
                }}
              >
                <Text
                  style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteConversationMutation.mutate()}
                disabled={deleteConversationMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                {deleteConversationMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "700",
                      color: "#EF4444",
                    }}
                  >
                    Delete
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <SafeKeyboardAvoidingView
        style={{ flex: 1, backgroundColor: "#FFFFFF" }}
        // Header sits above this view — avoid additive automaticOffset under-lift on iOS.
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {isLoading ? (
          <View
            testID="dm-chat-loading"
            className="flex-1 items-center justify-center"
          >
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messagesError && visibleMessages.length === 0 ? (
          <View
            testID="dm-chat-error"
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 40,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: "#64748B",
                textAlign: "center",
              }}
            >
              Couldn&apos;t load messages
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: "#94A3B8",
                marginTop: 8,
                textAlign: "center",
              }}
            >
              {messagesLoadError instanceof Error
                ? messagesLoadError.message
                : "Please try again."}
            </Text>
            <TouchableOpacity
              onPress={() => void refetchMessages()}
              testID="dm-chat-error-retry"
              style={{
                marginTop: 16,
                backgroundColor: "#4361EE",
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 10,
              }}
            >
              <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>
                Retry
              </Text>
            </TouchableOpacity>
          </View>
        ) : visibleMessages.length === 0 ? (
          <DmChatEmptyState user={headerUser} isGroup={isGroup} />
        ) : (
          <View style={{ flex: 1, overflow: "hidden", backgroundColor: "#FFFFFF" }}>
            <FlatList
              key={conversationId}
              ref={flatListRef}
              style={{ flex: 1, backgroundColor: "#FFFFFF" }}
              testID="dm-chat-message-list"
              data={listData}
              inverted
              keyExtractor={(item) => ("type" in item ? item.id : item.id)}
              contentContainerStyle={contentContainerStyle}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
              onScroll={handleScroll}
              scrollEventThrottle={16}
              onContentSizeChange={handleContentSizeChange}
              onEndReached={handleLoadOlder}
              onEndReachedThreshold={0.2}
              onScrollToIndexFailed={handleScrollToIndexFailed}
              maintainVisibleContentPosition={maintainVisibleContentPosition}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={{ paddingVertical: 12, alignItems: "center" }}>
                    <ActivityIndicator color="#4361EE" size="small" />
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                if ("type" in item && item.type === "date") {
                  return (
                    <View className="items-center my-3">
                      <View className="bg-slate-200 dark:bg-slate-700 rounded-full px-3.5 py-1">
                        <Text className="text-[13px] text-slate-500 dark:text-slate-400">
                          {item.label}
                        </Text>
                      </View>
                    </View>
                  );
                }
                const msg = item as DirectMessage;
                const isOwn = msg.senderId === currentUserId;
                return (
                  <ReanimatedSwipeable
                    key={msg.id}
                    enabled={isOwn && !msg.deliveryStatus}
                    renderRightActions={(_prog, drag) => (
                      <DeleteAction
                        drag={drag}
                        onDelete={() => deleteMessage(msg.id)}
                      />
                    )}
                    rightThreshold={40}
                    overshootRight={false}
                  >
                    <MessageLongPressRow
                      alignRight={isOwn}
                      onOpenMenu={(layout) => {
                      if (!msg.deliveryStatus && !messagingDisabled) {
                        handleLongPress(msg, layout);
                      }
                      }}
                    >
                      <ChatMessage
                        id={msg.id}
                        content={msg.content}
                        mediaUrl={msg.mediaUrl}
                        mediaType={msg.mediaType}
                        replyTo={msg.replyTo}
                        reactions={msg.reactions ?? []}
                        senderName={
                          msg.sender.name ?? msg.sender.email ?? "Member"
                        }
                        senderInitial={userInitials(msg.sender)}
                        senderImage={resolveUserImageUrl(msg.sender.image)}
                        onSenderPress={() =>
                          router.push({
                            pathname: "/person",
                            params: { userId: msg.sender.id },
                          })
                        }
                        createdAt={msg.createdAt}
                        deliveryStatus={msg.deliveryStatus}
                        onDeliveryStatusPress={
                          msg.deliveryStatus === "failed" && !messagingDisabled
                            ? () => {
                                const localMessage =
                                  localOutgoingMessages.find(
                                    (message) => message.id === msg.id,
                                  );
                                if (localMessage) {
                                  attemptOutboxMessage(localMessage);
                                }
                              }
                            : undefined
                        }
                        isOwn={isOwn}
                        currentUserId={currentUserId}
                        interactive={false}
                        onReactionTap={(reactions) =>
                          setReactionView(reactions)
                        }
                        hideBubble={messageMenu?.message.id === msg.id}
                        highlighted={highlightedMessageId === msg.id}
                      />
                    </MessageLongPressRow>
                  </ReanimatedSwipeable>
                );
              }}
            />
          </View>
        )}

        {/* Mention picker */}
        {mentionQuery !== null && mentionableUsers.length > 0 ? (
          <MentionPicker
            users={mentionableUsers}
            query={mentionQuery}
            onSelect={(user) => {
              const newText = selectMention(input, user);
              setInput(newText);
            }}
          />
        ) : null}

        {!isGroup &&
        messagingStatus !== "available" &&
        messagingStatus !== "loading" ? (
          <Pressable
            disabled={
              (messagingStatus !== "blocked_by_me" &&
                messagingStatus !== "connection_required") ||
              !headerUser.id
            }
            onPress={() => {
              if (headerUser.id) {
                router.push({
                  pathname: "/person",
                  params: { userId: headerUser.id },
                });
              }
            }}
            testID="dm-messaging-unavailable"
            style={{
              marginHorizontal: 12,
              marginBottom: 8,
              borderRadius: 16,
              shadowColor: "#342768",
              shadowOpacity: 0.055,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 2,
            }}
          >
            <LinearGradient
              colors={["#FFFFFF", "#F8F7FF"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                minHeight: 52,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: "#E7E3F6",
                flexDirection: "row",
                alignItems: "center",
                gap: 9,
              }}
            >
              <LinearGradient
                colors={["#F0EDFF", "#E5E1FA"]}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: "rgba(105,84,191,0.10)",
                }}
              >
                <Shield size={14} color="#6854B5" strokeWidth={2} />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 12.5,
                    lineHeight: 16,
                    fontWeight: "700",
                    color: "#29283B",
                  }}
                >
                  {messagingStatus === "blocked_by_me"
                    ? "You blocked this person"
                    : messagingStatus === "connection_required"
                      ? "You’re no longer connected"
                    : "Messaging is unavailable"}
                </Text>
                <Text
                  style={{
                    marginTop: 1,
                    fontSize: 10,
                    lineHeight: 13,
                    color: "#7B8192",
                  }}
                >
                  {messagingStatus === "blocked_by_me"
                    ? "Manage this from their profile."
                    : messagingStatus === "connection_required"
                      ? "Reconnect to message, react, or start a video call."
                    : "New messages cannot be sent here."}
                </Text>
              </View>
              {messagingStatus === "blocked_by_me" ||
              messagingStatus === "connection_required" ? (
                <View
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F0EEFA",
                    borderWidth: 1,
                    borderColor: "#E2DDF5",
                  }}
                >
                  <ChevronRight size={13} color="#6E5AAE" strokeWidth={2.1} />
                </View>
              ) : null}
            </LinearGradient>
          </Pressable>
        ) : null}

        {/* Reply preview bar */}
        {replyTo ? (
          <View className="flex-row items-center px-3 py-2 bg-indigo-50 border-t border-indigo-200">
            <View className="flex-1 flex-row items-center gap-2">
              <View style={{ flex: 1 }}>
                <Text className="text-[13px] font-semibold text-indigo-600">
                  ↩ Replying to {replyTo.sender.name}
                </Text>
                <Text className="text-[13px] text-slate-500" numberOfLines={1}>
                  {replyTo.content
                    ? replyTo.content
                    : replyTo.mediaType === "video"
                      ? "🎥 Video"
                      : "📷 Photo"}
                </Text>
              </View>
              {replyTo.mediaUrl && replyTo.mediaType === "image" ? (
                <Image
                  source={{ uri: replyTo.mediaUrl }}
                  style={{ width: 36, height: 36, borderRadius: 6 }}
                  resizeMode="cover"
                />
              ) : null}
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} className="ml-2">
              <X size={16} color="#6366F1" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Input bar — solid sibling below the clipped list so messages can never draw underneath */}
        <View
          testID="dm-chat-input-bar"
          className="flex-row items-end border-t"
          style={{
            paddingHorizontal: 8,
            paddingTop: 6,
            // Extra space while keyboard is open so Send clears the suggestion bar.
            paddingBottom: keyboardVisible ? 10 : insets.bottom + 6,
            backgroundColor: "#FFFFFF",
            borderTopColor: "#F4F5F8",
            zIndex: 2,
            elevation: 6,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowMediaPicker(true)}
            disabled={messagingDisabled}
            style={{
              width: 36,
              height: 36,
              marginRight: 6.7,
              borderRadius: 18,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "#F3F4F7",
              opacity: messagingDisabled ? 0.45 : 1,
            }}
          >
            <Plus size={19.1} color="#596579" strokeWidth={2} />
          </TouchableOpacity>
          <TextInput
            testID="dm-chat-text-input"
            placeholder={
              messagingDisabled
                ? "Messaging unavailable"
                : `Message ${headerUser.name ?? ""}...`
            }
            placeholderTextColor="#94A3B8"
            editable={!messagingDisabled}
            value={input}
            onChangeText={(text) => {
              setInput(text);
              onMentionTextChange(text);
            }}
            multiline
            maxLength={2000}
            blurOnSubmit={false}
            style={{
              flex: 1,
              minHeight: 36,
              maxHeight: 101,
              marginRight: 6.7,
              paddingHorizontal: 12.4,
              paddingTop: 7.4,
              paddingBottom: 6.3,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: "#E7EAF0",
              /** Reads as a field on the white sheet, not just a hairline. */
              backgroundColor: "#F4F6FA",
              color: "#172033",
              fontSize: 13.4,
              lineHeight: 18,
            }}
          />
          <TouchableOpacity
            testID="dm-chat-send-button"
            onPress={handleSend}
            disabled={
              messagingDisabled ||
              !input.trim() ||
              sendMutation.isPending ||
              uploading
            }
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={
                input.trim() && !messagingDisabled
                  ? ["#4361EE", "#7C3AED"]
                  : ["#E7EAF0", "#DDE2E9"]
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: 36,
                height: 36,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {sendMutation.isPending || uploading ? (
                <ActivityIndicator
                  size="small"
                  color={input.trim() && !messagingDisabled ? "white" : "#94A3B8"}
                />
              ) : (
                <Send
                  size={16.8}
                  color={input.trim() && !messagingDisabled ? "white" : "#94A3B8"}
                  strokeWidth={2.2}
                />
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </SafeKeyboardAvoidingView>
      <ImageSendPreview
        visible={!!mediaPreview}
        mediaUri={mediaPreview?.uri ?? null}
        isVideo={mediaPreview?.mimeType.startsWith("video") ?? false}
        onCancel={() => setMediaPreview(null)}
        onSend={handleSendMedia}
        isSending={uploading || sendMutation.isPending}
      />

      <MessageActionSheet
        visible={!!messageMenu}
        layout={messageMenu?.layout ?? null}
        alignRight={messageMenu?.message.senderId === currentUserId}
        onClose={() => setMessageMenu(null)}
        myReaction={
          messageMenu
            ? (messageMenu.message.reactions ?? []).find(
                (r) => r.userId === currentUserId,
              )?.emoji
            : undefined
        }
        reactionsDisabled={messagingDisabled}
        onReaction={(emoji) => {
          if (!messageMenu || messagingDisabled) return;
          reactionMutation.mutate({ messageId: messageMenu.message.id, emoji });
        }}
        actions={[
          {
            id: "reply",
            label: "Reply",
            icon: Reply,
            hidden: messagingDisabled,
            onPress: () => {
              if (messageMenu) setReplyTo(messageMenu.message);
            },
          },
          {
            id: "copy",
            label: "Copy",
            icon: Copy,
            hidden: !messageMenu?.message.content,
            onPress: () => {
              if (messageMenu?.message.content)
                void Clipboard.setStringAsync(messageMenu.message.content);
            },
          },
          {
            id: "pin",
            label:
              messageMenu && pinnedIds.has(messageMenu.message.id)
                ? "Unpin"
                : "Pin",
            icon: Pin,
            hidden:
              !!messageMenu &&
              !pinnedIds.has(messageMenu.message.id) &&
              pinnedMessages.length >= 5,
            onPress: () => {
              if (!messageMenu) return;
              if (pinnedIds.has(messageMenu.message.id)) {
                unpinMutation.mutate(messageMenu.message.id);
              } else {
                pinMutation.mutate(messageMenu.message.id);
              }
            },
          },
          {
            id: "save-media",
            label:
              messageMenu?.message.mediaType === "video"
                ? "Save video"
                : "Save photo",
            icon: Download,
            hidden:
              !messageMenu?.message.mediaUrl || !messageMenu?.message.mediaType,
            onPress: () => {
              if (
                messageMenu?.message.mediaUrl &&
                messageMenu?.message.mediaType
              ) {
                handleSaveMedia(
                  messageMenu.message.mediaUrl,
                  messageMenu.message.mediaType,
                );
              }
            },
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            hidden: !(
              !!messageMenu &&
              !!currentUserId &&
              (messageMenu.message.senderId === currentUserId ||
                (isGroup &&
                  (myGroupRole === "owner" || myGroupRole === "admin")))
            ),
            onPress: () => {
              if (messageMenu) setDeleteTarget(messageMenu.message);
            },
          },
        ]}
      >
        {messageMenu ? (
          <ChatMessage
            variant="overlay"
            anchorHeight={messageMenu.layout.height}
            id={messageMenu.message.id}
            content={messageMenu.message.content}
            mediaUrl={messageMenu.message.mediaUrl}
            mediaType={messageMenu.message.mediaType}
            replyTo={messageMenu.message.replyTo}
            reactions={[]}
            senderName={
              messageMenu.message.sender.name ??
              messageMenu.message.sender.email ??
              "Member"
            }
            senderInitial={userInitials(messageMenu.message.sender)}
            senderImage={resolveUserImageUrl(messageMenu.message.sender.image)}
            onSenderPress={() => {
              setMessageMenu(null);
              router.push({
                pathname: "/person",
                params: { userId: messageMenu.message.sender.id },
              });
            }}
            createdAt={messageMenu.message.createdAt}
            isOwn={messageMenu.message.senderId === currentUserId}
            currentUserId={currentUserId}
            interactive={false}
            onReactionTap={() => {}}
          />
        ) : null}
      </MessageActionSheet>
    </SafeAreaView>
  );
}

/**
 * The pushed route. Notifications and deep links can arrive with nothing but a
 * conversation id, so every display param stays optional.
 */
export default function DMChatScreen() {
  const { conversationId, recipientName, recipientImage, isGroup } =
    useLocalSearchParams<{
      conversationId: string;
      recipientName: string;
      recipientImage: string;
      isGroup: string;
    }>();
  return (
    <DmThread
      conversationId={conversationId}
      recipientName={recipientName}
      recipientImage={recipientImage}
      isGroup={isGroup === "true"}
    />
  );
}
