import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePaginatedDmMessages, flattenMessagePages } from "@/lib/chat-message-pagination";
import { useChatListScroll } from "@/hooks/use-chat-scroll";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send, Paperclip, X, Users, Video, Trash2, Download, Reply, Copy, Camera, ImageIcon, MoreVertical, LogOut, UserPlus, UserMinus, Crown, Shield, Pin } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import { pickMedia, takePhoto } from "@/lib/file-picker";
import { ChatMessage } from "@/components/ChatMessage";
import { MessageActionSheet, type MessageAnchorLayout } from "@/components/MessageActionSheet";
import { MessageLongPressRow } from "@/components/MessageLongPressRow";
import { ImageSendPreview } from "@/components/ImageSendPreview";
import { PinnedMessageBar } from "@/components/PinnedMessageBar";
import { MentionPicker } from "@/components/MentionPicker";
import type { DirectMessage, MessageReaction, Conversation, GroupParticipantRole, PinnedMessageSummary } from "@/lib/types";
import * as Clipboard from "expo-clipboard";
import type { InfiniteData } from "@tanstack/react-query";
import type { MessagePage } from "@/lib/chat-message-pagination";
import { realtimeClient } from "@/lib/realtime-client";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  useSharedValue,
  withRepeat,
  withTiming,
  Easing,
  type SharedValue,
} from "react-native-reanimated";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useUnreadStore } from "@/lib/state/unread-store";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { useMention } from "@/lib/useMention";
import { SafeKeyboardAvoidingView, useSafeKeyboardVisible } from "@/lib/safe-keyboard-controller";
import { dmOtherParticipant, resolveUserImageUrl, userInitials } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { GroupManageModals } from "@/components/GroupManageModals";
import { bottomSheetMenu } from "@/lib/bottom-sheet-menu-styles";

function DmChatEmptyState({
  user,
  isGroup,
}: {
  user: { name?: string | null; email?: string | null; image?: string | null };
  isGroup: boolean;
}) {
  const float = useSharedValue(0);

  useEffect(() => {
    float.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [float]);

  const illustrationStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(float.value, [0, 1], [0, -4]) }],
  }));

  const displayName = user.name?.trim() || (isGroup ? "this group" : "your teammate");

  return (
    <View
      testID="dm-chat-empty"
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 28,
        paddingTop: 16,
        paddingBottom: 24,
        overflow: "hidden",
      }}
    >
      <Reanimated.View style={[{ marginBottom: 4, marginTop: 4 }, illustrationStyle]}>
        <Image
          source={require("@/assets/dm-empty-start.png")}
          style={{ width: 160, height: 160 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Reanimated.View>

      <View style={{ marginBottom: 12, alignItems: "center" }}>
        {isGroup ? (
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: "#EEF2FF",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 6,
            }}
          >
            <Users size={18} color="#4361EE" />
          </View>
        ) : (
          <View style={{ marginBottom: 6 }}>
            <UserAvatar
              user={user}
              size={40}
              radius={20}
              backgroundColor="#E0E7FF"
              textColor="#4361EE"
              fontSize={15}
            />
          </View>
        )}
        <Text
          style={{
            fontSize: 14,
            fontWeight: "700",
            color: "#0F172A",
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {user.name?.trim() || (isGroup ? "Group chat" : "Direct message")}
        </Text>
      </View>

      <Text
        style={{
          fontSize: 17,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: 24,
          marginBottom: 8,
          maxWidth: 300,
        }}
      >
        This is the start of{"\n"}
        <Text style={{ color: "#7C3AED" }}>something great.</Text>
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 19,
          maxWidth: 280,
        }}
      >
        {isGroup
          ? `Say hello and get ${displayName} aligned on updates, questions, and wins.`
          : `Send the first message to ${displayName} — questions, updates, and wins start here.`}
      </Text>
    </View>
  );
}

function DeleteAction({ drag, onDelete }: { drag: SharedValue<number>; onDelete: () => void }) {
  const styleAnimation = useAnimatedStyle(() => ({
    opacity: interpolate(drag.value, [-80, -40], [1, 0], "clamp"),
    transform: [{ scale: interpolate(drag.value, [-80, -40], [1, 0.7], "clamp") }],
  }));
  return (
    <Reanimated.View style={[{ width: 72, justifyContent: "center", alignItems: "center" }, styleAnimation]}>
      <TouchableOpacity
        onPress={onDelete}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EF4444", justifyContent: "center", alignItems: "center" }}
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
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
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

export default function DMChatScreen() {
  const { conversationId, recipientName, recipientImage, isGroup: isGroupParam } = useLocalSearchParams<{
    conversationId: string;
    recipientName: string;
    recipientImage: string;
    isGroup: string;
  }>();
  const isGroup = isGroupParam === "true";
  const { data: session } = useSession();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useSafeKeyboardVisible();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [messageMenu, setMessageMenu] = useState<{ message: DirectMessage; layout: MessageAnchorLayout } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectMessage | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showConvDeleteConfirm, setShowConvDeleteConfirm] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [groupManageMode, setGroupManageMode] = useState<"add" | "remove" | "transfer" | "admins" | "members" | null>(null);
  const [reactionView, setReactionView] = useState<MessageReaction[] | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; mimeType: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [jumpingToPin, setJumpingToPin] = useState(false);
  const currentUserId = session?.user?.id ?? "";
  const markAsRead = useUnreadStore((s) => s.markAsRead);
  const prevMsgCountRef = useRef<number>(0);
  const lastMessageIdRef = useRef<string | null>(null);

  const { mentionedUserIds, mentionQuery, onTextChange: onMentionTextChange, selectMention, resetMentions } = useMention();

  const { data: conversations = [] } = useQuery({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!conversationId,
  });

  const currentConversation = conversations.find((c) => c.id === conversationId);
  const groupParticipants = currentConversation?.participants ?? [];
  const groupParticipantCount = groupParticipants.length;
  const myGroupRole: GroupParticipantRole = currentConversation?.myRole ?? groupParticipants.find((p) => p.id === currentUserId)?.role ?? "member";
  const canManageGroupMembers = myGroupRole === "owner";
  const canDeleteGroup = myGroupRole === "owner";
  const canManageGroupAdmins = myGroupRole === "owner";
  const canLeaveGroup = !isGroup || myGroupRole !== "owner";
  const groupWorkspace = isGroup ? groupWorkspaceLabel(currentConversation?.workspaceContext) : null;
  const isLastGroupMember = isGroup && groupParticipantCount <= 1;
  const headerUser = useMemo(() => {
    if (isGroup) {
      return {
        name: currentConversation?.name ?? recipientName ?? "Group",
        email: null as string | null,
        image: null as string | null,
      };
    }
    const other = currentConversation ? dmOtherParticipant(currentConversation, currentUserId) : null;
    return {
      name: recipientName?.trim() || other?.name?.trim() || other?.email?.trim() || "Direct Message",
      email: other?.email ?? null,
      image: recipientImage?.trim() || other?.image || null,
    };
  }, [currentConversation, currentUserId, isGroup, recipientImage, recipientName]);
  const mentionableUsers = (currentConversation?.participants ?? [])
    .filter((p) => p.id !== currentUserId)
    .map((p) => ({ id: p.id, name: p.name, image: p.image ?? null }));

  const {
    messages,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePaginatedDmMessages<DirectMessage>(conversationId);

  const items = useMemo(() => buildMessageList(messages), [messages]);
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

  const pinQueryKey = ["pinned-message", "dm", conversationId] as const;
  const { data: pinnedMessage = null } = useQuery<PinnedMessageSummary | null>({
    queryKey: [...pinQueryKey],
    queryFn: () =>
      api.get<PinnedMessageSummary | null>(`/api/dms/${conversationId}/messages/pin`),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversationId) return;
    const off = realtimeClient.onPinUpdated((event) => {
      if (event.channel !== "dm" || event.conversationId !== conversationId) return;
      queryClient.setQueryData([...pinQueryKey], event.pinnedMessage ?? null);
    });
    return () => {
      off();
    };
  }, [conversationId, queryClient]);

  const pinMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.put<PinnedMessageSummary>(`/api/dms/${conversationId}/messages/pin`, { messageId }),
    onSuccess: (data) => {
      queryClient.setQueryData([...pinQueryKey], data);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const unpinMutation = useMutation({
    mutationFn: () => api.delete(`/api/dms/${conversationId}/messages/pin`),
    onSuccess: () => {
      queryClient.setQueryData([...pinQueryKey], null);
    },
  });

  const jumpToPinnedMessage = useCallback(async () => {
    if (!pinnedMessage?.messageId || jumpingToPin) return;
    setJumpingToPin(true);
    try {
      let guard = 0;
      let pages =
        queryClient.getQueryData<InfiniteData<MessagePage<DirectMessage>>>([
          "dm-messages",
          conversationId,
        ])?.pages ?? [];
      let loaded = flattenMessagePages<DirectMessage>(pages);
      while (!loaded.some((m) => m.id === pinnedMessage.messageId) && guard < 40) {
        guard += 1;
        const result = await fetchNextPage();
        pages = result.data?.pages ?? pages;
        loaded = flattenMessagePages<DirectMessage>(pages);
        if (!result.hasNextPage) break;
      }
      const nextList = [...buildMessageList(loaded)].reverse();
      const index = nextList.findIndex(
        (item) => !("type" in item) && (item as DirectMessage).id === pinnedMessage.messageId,
      );
      if (index < 0) return;
      requestAnimationFrame(() => {
        scrollToIndex(index, true);
        setHighlightedMessageId(pinnedMessage.messageId);
        setTimeout(() => setHighlightedMessageId(null), 1800);
      });
    } finally {
      setJumpingToPin(false);
    }
  }, [
    pinnedMessage?.messageId,
    jumpingToPin,
    queryClient,
    conversationId,
    fetchNextPage,
    scrollToIndex,
  ]);

  const sendMutation = useMutation({
    mutationFn: (payload: { content?: string; mediaUrl?: string; mediaType?: string; replyToId?: string; mentionedUserIds?: string[] }) =>
      api.post<DirectMessage>(`/api/dms/${conversationId}/messages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      setReplyTo(null);
      setMediaPreview(null);
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.post(`/api/dms/${conversationId}/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete(`/api/dms/${conversationId}/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["dms"] });
    },
  });

  const leaveConversationMutation = useMutation({
    mutationFn: () => api.post(`/api/dms/${conversationId}/leave`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      queryClient.removeQueries({ queryKey: ["dm-messages", conversationId] });
      router.replace("/(app)/chat");
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not leave group", preset: "error" });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: () => api.delete(`/api/dms/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dms"] });
      router.replace("/(app)/chat");
    },
    onError: (err: Error) => {
      toast({ title: err.message || "Could not delete group", preset: "error" });
    },
  });

  const openGroupManage = (mode: "add" | "remove" | "transfer" | "admins" | "members") => {
    setShowOptions(false);
    setTimeout(() => setGroupManageMode(mode), 300);
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    sendMutation.mutate({
      content,
      replyToId: replyTo?.id,
      mentionedUserIds: mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    });
    resetMentions();
  };

  const handleSendMedia = async (caption: string) => {
    if (!mediaPreview) return;
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    setUploading(true);
    try {
      const uploaded = await uploadFile(mediaPreview.uri, mediaPreview.filename, mediaPreview.mimeType);
      mediaUrl = uploaded.url;
      mediaType = mediaPreview.mimeType.startsWith('video') ? 'video' : 'image';
    } catch {
      setUploading(false);
      return;
    }
    setUploading(false);
    setMediaPreview(null);
    sendMutation.mutate({
      content: caption || undefined,
      mediaUrl,
      mediaType,
      replyToId: replyTo?.id,
    });
  };

  const handlePickMedia = async () => {
    const file = await pickMedia();
    if (file) setMediaPreview(file);
  };

  const handleTakePhoto = async () => {
    const file = await takePhoto();
    if (file) setMediaPreview(file);
  };

  const { mutate: deleteMessage } = deleteMutation;

  const handleSaveMedia = useCallback(async (mediaUrl: string, mediaType: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        toast({ title: "Permission denied", preset: "error" });
        return;
      }
      const ext = mediaType === "video" ? "mp4" : "jpg";
      const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!baseDir) {
        toast({ title: "Storage not available on this device", preset: "error" });
        return;
      }
      const localUri = `${baseDir}download_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(mediaUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast({ title: mediaType === "video" ? "Video saved" : "Photo saved", preset: "done" });
    } catch {
      toast({ title: "Failed to save", preset: "error" });
    }
  }, []);

  const handleLongPress = useCallback((msg: DirectMessage, layout: MessageAnchorLayout) => {
    setMessageMenu({ message: msg, layout });
  }, []);

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
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const prevId = lastMessageIdRef.current;
    lastMessageIdRef.current = lastMsg.id;
    if (prevId !== lastMsg.id) {
      followLatestIfNearBottom(false);
      setTimeout(() => followLatestIfNearBottom(false), 40);
    }
  }, [messages, followLatestIfNearBottom]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      markAsRead(conversationId, lastMsg.id);
      void queryClient.invalidateQueries({ queryKey: ["dm-unread-counts"] });
    }
  }, [messages, conversationId, markAsRead, queryClient]);

  useEffect(() => {
    if (!messages) return;
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  return (
    <SafeAreaView testID="dm-chat-screen" className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ zIndex: 2, elevation: 4 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3 overflow-hidden">
            {isGroup ? (
              <Users size={18} color="white" />
            ) : (
              <UserAvatar
                user={headerUser}
                size={36}
                radius={18}
                backgroundColor="rgba(255,255,255,0.2)"
                textColor="#FFFFFF"
                fontSize={14}
              />
            )}
          </View>
          <View className="flex-1">
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{headerUser.name}</Text>
            <Text className="text-white/70 text-xs">
              {isGroup ? (groupWorkspace ?? "Group chat") : "Direct message"}
            </Text>
          </View>
          <TouchableOpacity
            testID="start-video-call-button"
            onPress={() => router.push({
              pathname: "/video-call",
              params: { roomId: conversationId, roomName: `${headerUser.name ?? "Call"}` },
            })}
            className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2"
          >
            <Video size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            testID="conversation-options-button"
            onPress={() => setShowOptions(true)}
            className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2"
          >
            <MoreVertical size={18} color="white" />
          </TouchableOpacity>
          <Image source={require("@/assets/alenio-icon.png")} style={{ width: 30, height: 30, borderRadius: 6 }} />
        </View>
      </LinearGradient>

      {pinnedMessage ? (
        <PinnedMessageBar
          pinned={pinnedMessage}
          onPress={() => {
            void jumpToPinnedMessage();
          }}
          onLongPress={() => {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            unpinMutation.mutate();
          }}
        />
      ) : null}

      {/* Media picker sheet */}
      <Modal visible={showMediaPicker} transparent animationType="slide" onRequestClose={() => setShowMediaPicker(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setShowMediaPicker(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: "white", marginHorizontal: 12, marginBottom: 32, borderRadius: 16, overflow: "hidden" }}>
              <TouchableOpacity
                onPress={() => { setShowMediaPicker(false); setTimeout(handleTakePhoto, 300); }}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}
              >
                <Camera size={20} color="#4361EE" style={{ marginRight: 14 }} />
                <Text style={{ fontSize: 16, color: "#1E293B", fontWeight: "500" }}>Take Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowMediaPicker(false); setTimeout(handlePickMedia, 300); }}
                style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 18 }}
              >
                <ImageIcon size={20} color="#4361EE" style={{ marginRight: 14 }} />
                <Text style={{ fontSize: 16, color: "#1E293B", fontWeight: "500" }}>Photo Library</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Who reacted modal */}
      <Modal visible={!!reactionView} transparent animationType="fade" onRequestClose={() => setReactionView(null)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setReactionView(null)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: "white", marginHorizontal: 12, marginBottom: 32, borderRadius: 16, overflow: "hidden" }}>
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", alignItems: "center" }}>
                <Text style={{ fontSize: 15, fontWeight: "600", color: "#1E293B" }}>Reactions</Text>
              </View>
              {reactionView?.map((r) => (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "#F1F5F9" }}>
                  <Text style={{ fontSize: 22, marginRight: 14 }}>{r.emoji}</Text>
                  <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", marginRight: 10 }}>
                    <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>{r.user.name?.[0]?.toUpperCase() ?? "?"}</Text>
                  </View>
                  <Text style={{ fontSize: 15, color: "#1E293B", fontWeight: "500" }}>{r.user.name}</Text>
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
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          activeOpacity={1}
          onPress={() => setDeleteTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} style={{ width: "100%", backgroundColor: "white", borderRadius: 16, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>Delete message?</Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                This message will be permanently removed.
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <TouchableOpacity
                onPress={() => setDeleteTarget(null)}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }}
              >
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-delete-button"
                onPress={() => { if (deleteTarget) { deleteMessage(deleteTarget.id); setDeleteTarget(null); } }}
                disabled={deleteMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#EF4444" }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Conversation options sheet */}
      <Modal visible={showOptions} transparent animationType="slide" onRequestClose={() => setShowOptions(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }} activeOpacity={1} onPress={() => setShowOptions(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={bottomSheetMenu.sheet}>
              <View style={bottomSheetMenu.handleWrap}>
                <View style={bottomSheetMenu.handle} />
              </View>
              <Text style={bottomSheetMenu.sectionLabel}>
                {isGroup ? "Group Options" : "Conversation Options"}
              </Text>
              {isGroup ? (
                <TouchableOpacity
                  onPress={() => openGroupManage("members")}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabel}>Members</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={bottomSheetMenu.rowMeta}>{groupParticipantCount}</Text>
                    <Users size={bottomSheetMenu.iconSize} color="#4361EE" />
                  </View>
                </TouchableOpacity>
              ) : null}
              {isGroup && canManageGroupMembers ? (
                <TouchableOpacity
                  onPress={() => openGroupManage("add")}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabel}>Add Members</Text>
                  <UserPlus size={bottomSheetMenu.iconSize} color="#4361EE" />
                </TouchableOpacity>
              ) : null}
              {isGroup && canManageGroupMembers ? (
                <TouchableOpacity
                  onPress={() => openGroupManage("remove")}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabel}>Remove Members</Text>
                  <UserMinus size={bottomSheetMenu.iconSize} color="#EF4444" />
                </TouchableOpacity>
              ) : null}
              {isGroup && canManageGroupAdmins ? (
                <TouchableOpacity
                  onPress={() => openGroupManage("admins")}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabel}>Manage Admins</Text>
                  <Shield size={bottomSheetMenu.iconSize} color="#4361EE" />
                </TouchableOpacity>
              ) : null}
              {isGroup && canDeleteGroup ? (
                <TouchableOpacity
                  onPress={() => openGroupManage("transfer")}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabel}>Transfer Ownership</Text>
                  <Crown size={bottomSheetMenu.iconSize} color="#F59E0B" />
                </TouchableOpacity>
              ) : null}
              {isGroup && canDeleteGroup ? (
                <TouchableOpacity
                  onPress={() => { setShowOptions(false); setTimeout(() => setShowConvDeleteConfirm(true), 300); }}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabelDestructive}>Delete Group</Text>
                  <Trash2 size={bottomSheetMenu.iconSize} color="#EF4444" />
                </TouchableOpacity>
              ) : null}
              {!isGroup ? (
                <TouchableOpacity
                  onPress={() => { setShowOptions(false); setTimeout(() => setShowConvDeleteConfirm(true), 300); }}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabelDestructive}>Delete Conversation</Text>
                  <Trash2 size={bottomSheetMenu.iconSize} color="#EF4444" />
                </TouchableOpacity>
              ) : null}
              {isGroup && canLeaveGroup ? (
                <TouchableOpacity
                  onPress={() => {
                    setShowOptions(false);
                    setTimeout(() => setShowLeaveConfirm(true), 300);
                  }}
                  style={bottomSheetMenu.row}
                >
                  <Text style={bottomSheetMenu.rowLabelWarning}>Leave Group</Text>
                  <LogOut size={bottomSheetMenu.iconSize} color="#F59E0B" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setShowOptions(false)}
                style={bottomSheetMenu.footer}
              >
                <Text style={bottomSheetMenu.footerText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {isGroup ? (
        <GroupManageModals
          conversationId={conversationId}
          participants={groupParticipants}
          currentUserId={currentUserId}
          mode={groupManageMode}
          onClose={() => setGroupManageMode(null)}
        />
      ) : null}

      {/* Leave group confirmation */}
      <Modal visible={showLeaveConfirm} transparent animationType="fade" onRequestClose={() => setShowLeaveConfirm(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} activeOpacity={1} onPress={() => setShowLeaveConfirm(false)}>
          <TouchableOpacity activeOpacity={1} style={{ width: "100%", backgroundColor: "white", borderRadius: 16, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>
                {isLastGroupMember ? "Delete Group?" : "Leave Group?"}
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                {isLastGroupMember
                  ? "You are the last member. Leaving will permanently delete this group and all message history."
                  : "You will stop receiving messages from this group. Other members can still chat."}
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <TouchableOpacity onPress={() => setShowLeaveConfirm(false)} style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
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
                  <ActivityIndicator size="small" color={isLastGroupMember ? "#EF4444" : "#F59E0B"} />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: isLastGroupMember ? "#EF4444" : "#F59E0B" }}>
                    {isLastGroupMember ? "Delete Group" : "Leave"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Delete conversation confirmation */}
      <Modal visible={showConvDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowConvDeleteConfirm(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }} activeOpacity={1} onPress={() => setShowConvDeleteConfirm(false)}>
          <TouchableOpacity activeOpacity={1} style={{ width: "100%", backgroundColor: "white", borderRadius: 16, overflow: "hidden" }}>
            <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, alignItems: "center" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4 }}>
                {isGroup ? "Delete Group?" : "Delete Conversation?"}
              </Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center" }}>
                {isGroup ? "This will permanently delete the group and all messages for everyone." : "This will permanently delete this conversation for both you and the other person."}
              </Text>
            </View>
            <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}>
              <TouchableOpacity onPress={() => setShowConvDeleteConfirm(false)} style={{ flex: 1, paddingVertical: 14, alignItems: "center", borderRightWidth: 1, borderRightColor: "#F1F5F9" }}>
                <Text style={{ fontSize: 15, fontWeight: "500", color: "#64748B" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => deleteConversationMutation.mutate()}
                disabled={deleteConversationMutation.isPending}
                style={{ flex: 1, paddingVertical: 14, alignItems: "center" }}
              >
                {deleteConversationMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: "#EF4444" }}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <SafeKeyboardAvoidingView
        className="flex-1"
        automaticOffset
        // Expo Go (RN KAV) still needs header compensation; native path zeros this when automaticOffset is on.
        keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 64 : 0}
      >
        {isLoading ? (
          <View testID="dm-chat-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messages.length === 0 ? (
          <DmChatEmptyState user={headerUser} isGroup={isGroup} />
        ) : (
          <View style={{ flex: 1, overflow: "hidden" }}>
            <FlatList
              key={conversationId}
              ref={flatListRef}
              style={{ flex: 1 }}
              testID="dm-chat-message-list"
              data={listData}
              inverted
              keyExtractor={(item) => ("type" in item ? item.id : item.id)}
              contentContainerStyle={contentContainerStyle}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
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
                    <View className="bg-slate-200 dark:bg-slate-700 rounded-full px-3 py-0.5">
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{item.label}</Text>
                    </View>
                  </View>
                );
              }
              const msg = item as DirectMessage;
              const isOwn = msg.senderId === currentUserId;
              return (
                <ReanimatedSwipeable
                  key={msg.id}
                  enabled={isOwn}
                  renderRightActions={(_prog, drag) => (
                    <DeleteAction drag={drag} onDelete={() => deleteMessage(msg.id)} />
                  )}
                  rightThreshold={40}
                  overshootRight={false}
                >
                  <MessageLongPressRow
                    alignRight={isOwn}
                    onOpenMenu={(layout) => handleLongPress(msg, layout)}
                  >
                    <ChatMessage
                      id={msg.id}
                      content={msg.content}
                      mediaUrl={msg.mediaUrl}
                      mediaType={msg.mediaType}
                      replyTo={msg.replyTo}
                      reactions={msg.reactions ?? []}
                      senderName={msg.sender.name ?? msg.sender.email ?? "Member"}
                      senderInitial={userInitials(msg.sender)}
                      senderImage={resolveUserImageUrl(msg.sender.image)}
                      createdAt={msg.createdAt}
                      isOwn={isOwn}
                      currentUserId={currentUserId}
                      interactive={false}
                      onReactionTap={(reactions) => setReactionView(reactions)}
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

        {/* Reply preview bar */}
        {replyTo ? (
          <View className="flex-row items-center px-3 py-2 bg-indigo-50 border-t border-indigo-200">
            <View className="flex-1 flex-row items-center gap-2">
              <View style={{ flex: 1 }}>
                <Text className="text-xs font-semibold text-indigo-600">↩ Replying to {replyTo.sender.name}</Text>
                <Text className="text-xs text-slate-500" numberOfLines={1}>
                  {replyTo.content ? replyTo.content : replyTo.mediaType === 'video' ? '🎥 Video' : '📷 Photo'}
                </Text>
              </View>
              {replyTo.mediaUrl && replyTo.mediaType === 'image' ? (
                <Image source={{ uri: replyTo.mediaUrl }} style={{ width: 36, height: 36, borderRadius: 6 }} resizeMode="cover" />
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
          className="flex-row items-end px-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700"
          style={{
            paddingTop: 8,
            // Drop home-indicator inset while keyboard is open — KAV already lifts to the keyboard.
            paddingBottom: keyboardVisible ? 8 : insets.bottom + 8,
            zIndex: 2,
            elevation: 4,
          }}
        >
          <TouchableOpacity
            onPress={() => setShowMediaPicker(true)}
            className="w-10 h-10 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: "#F1F5F9" }}
          >
            <Paperclip size={18} color="#64748B" />
          </TouchableOpacity>
          <TextInput
            testID="dm-chat-text-input"
            className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-2.5 text-base text-slate-900 dark:text-white mr-2"
            placeholder={`Message ${headerUser.name ?? ""}...`}
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={(text) => {
              setInput(text);
              onMentionTextChange(text);
            }}
            multiline
            maxLength={2000}
            style={{ maxHeight: 120 }}
          />
          <TouchableOpacity
            testID="dm-chat-send-button"
            onPress={handleSend}
            disabled={!input.trim() || sendMutation.isPending || uploading}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: input.trim() ? "#4361EE" : "#E2E8F0" }}
          >
            {sendMutation.isPending || uploading ? (
              <ActivityIndicator size="small" color={input.trim() ? "white" : "#94A3B8"} />
            ) : (
              <Send size={18} color={input.trim() ? "white" : "#94A3B8"} />
            )}
          </TouchableOpacity>
        </View>
      </SafeKeyboardAvoidingView>
      <ImageSendPreview
        visible={!!mediaPreview}
        mediaUri={mediaPreview?.uri ?? null}
        isVideo={mediaPreview?.mimeType.startsWith('video') ?? false}
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
            ? (messageMenu.message.reactions ?? []).find((r) => r.userId === currentUserId)?.emoji
            : undefined
        }
        onReaction={(emoji) => {
          if (!messageMenu) return;
          reactionMutation.mutate({ messageId: messageMenu.message.id, emoji });
        }}
        actions={[
          {
            id: "reply",
            label: "Reply",
            icon: Reply,
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
              if (messageMenu?.message.content) void Clipboard.setStringAsync(messageMenu.message.content);
            },
          },
          {
            id: "pin",
            label: pinnedMessage?.messageId === messageMenu?.message.id ? "Unpin" : "Pin",
            icon: Pin,
            onPress: () => {
              if (!messageMenu) return;
              if (pinnedMessage?.messageId === messageMenu.message.id) {
                unpinMutation.mutate();
              } else {
                pinMutation.mutate(messageMenu.message.id);
              }
            },
          },
          {
            id: "save-media",
            label: messageMenu?.message.mediaType === "video" ? "Save video" : "Save photo",
            icon: Download,
            hidden: !messageMenu?.message.mediaUrl || !messageMenu?.message.mediaType,
            onPress: () => {
              if (messageMenu?.message.mediaUrl && messageMenu?.message.mediaType) {
                handleSaveMedia(messageMenu.message.mediaUrl, messageMenu.message.mediaType);
              }
            },
          },
          {
            id: "delete",
            label: "Delete",
            icon: Trash2,
            destructive: true,
            separatorBefore: true,
            hidden: messageMenu?.message.senderId !== currentUserId,
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
            senderName={messageMenu.message.sender.name ?? messageMenu.message.sender.email ?? "Member"}
            senderInitial={userInitials(messageMenu.message.sender)}
            senderImage={resolveUserImageUrl(messageMenu.message.sender.image)}
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
