import React, { useState, useRef, useEffect, useCallback } from "react";
import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Image,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send, Paperclip, X, Users, Video, Trash2, Download, Reply, Copy, Camera, ImageIcon, MoreVertical, LogOut } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import { pickMedia, takePhoto } from "@/lib/file-picker";
import { ChatMessage } from "@/components/ChatMessage";
import type { DirectMessage, MessageReaction } from "@/lib/types";
import * as Clipboard from "expo-clipboard";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import Reanimated, { useAnimatedStyle, interpolate } from "react-native-reanimated";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { useUnreadStore } from "@/lib/state/unread-store";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function DeleteAction({ drag, onDelete }: { drag: Reanimated.SharedValue<number>; onDelete: () => void }) {
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
  const items: MessageItem[] = [];
  let lastDate = "";
  for (const msg of messages) {
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
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<DirectMessage | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectMessage | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [showConvDeleteConfirm, setShowConvDeleteConfirm] = useState(false);
  const [reactionView, setReactionView] = useState<MessageReaction[] | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; mimeType: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = session?.user?.id ?? "";
  const markAsRead = useUnreadStore((s) => s.markAsRead);
  const prevMsgCountRef = useRef<number>(0);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["dm-messages", conversationId],
    queryFn: () => api.get<DirectMessage[]>(`/api/dms/${conversationId}/messages`),
    enabled: !!conversationId,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { content?: string; mediaUrl?: string; mediaType?: string; replyToId?: string }) =>
      api.post<DirectMessage>(`/api/dms/${conversationId}/messages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dm-messages", conversationId] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
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
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const leaveConversationMutation = useMutation({
    mutationFn: () => api.post(`/api/dms/${conversationId}/leave`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace("/(app)/chat");
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: () => api.delete(`/api/dms/${conversationId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      router.replace("/(app)/chat");
    },
  });

  const handleSend = async () => {
    const content = input.trim();
    if (!content && !mediaPreview) return;

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (mediaPreview) {
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
    }

    setInput("");
    sendMutation.mutate({
      content: content || undefined,
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
      const localUri = `${FileSystem.cacheDirectory}download_${Date.now()}.${ext}`;
      const { uri } = await FileSystem.downloadAsync(mediaUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(uri);
      await FileSystem.deleteAsync(uri, { idempotent: true });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast({ title: mediaType === "video" ? "Video saved" : "Photo saved", preset: "done" });
    } catch {
      toast({ title: "Failed to save", preset: "error" });
    }
  }, []);

  const handleLongPress = useCallback((msg: DirectMessage) => {
    setEmojiTarget(msg);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      markAsRead(conversationId, lastMsg.id);
    }
  }, [messages, conversationId, markAsRead]);

  useEffect(() => {
    if (!messages) return;
    const count = messages.length;
    if (count > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      const newest = messages[messages.length - 1];
      if (newest && newest.senderId !== currentUserId) {
        AsyncStorage.getItem("dm_tone").then(async (toneId) => {
          const id = toneId ?? "default";
          const URLS: Record<string, string> = {
            default: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
            chime:   "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
            ping:    "https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3",
            bell:    "https://assets.mixkit.co/active_storage/sfx/1031/1031-preview.mp3",
            bubble:  "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3",
          };
          const url = URLS[id];
          if (url) {
            try {
              const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, volume: 1 });
              sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) sound.unloadAsync(); });
            } catch {}
          }
        });
      }
    }
    prevMsgCountRef.current = count;
  }, [messages, currentUserId]);

  const items = buildMessageList(messages);

  return (
    <SafeAreaView testID="dm-chat-screen" className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3 overflow-hidden">
            {isGroup ? (
              <Users size={18} color="white" />
            ) : recipientImage ? (
              <Image source={{ uri: recipientImage }} style={{ width: 36, height: 36 }} resizeMode="cover" />
            ) : (
              <Text className="text-white font-bold">{recipientName?.[0]?.toUpperCase() ?? "?"}</Text>
            )}
          </View>
          <View className="flex-1">
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{recipientName}</Text>
            <Text className="text-white/70 text-xs">{isGroup ? "Group chat" : "Direct message"}</Text>
          </View>
          <TouchableOpacity
            testID="start-video-call-button"
            onPress={() => router.push({
              pathname: "/video-call",
              params: { roomId: conversationId, roomName: `${recipientName ?? "Call"}` },
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

      {/* Message action sheet */}
      <Modal
        visible={!!emojiTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEmojiTarget(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={() => setEmojiTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ marginHorizontal: 12, marginBottom: 32 }}>
              {/* Reaction row */}
              {(() => {
                const myReaction = emojiTarget
                  ? (emojiTarget.reactions ?? []).find((r: any) => r.userId === currentUserId)?.emoji
                  : undefined;
                return (
                  <BlurView intensity={70} tint="light" style={{ borderRadius: 16, overflow: "hidden", marginBottom: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" }}>
                    <View style={{ backgroundColor: "rgba(255,255,255,0.5)", borderRadius: 16, padding: 12 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
                      {REACTION_EMOJIS.map((emoji) => {
                        const isMine = emoji === myReaction;
                        return (
                          <TouchableOpacity
                            key={emoji}
                            onPress={() => {
                              if (emojiTarget) reactionMutation.mutate({ messageId: emojiTarget.id, emoji });
                              setEmojiTarget(null);
                            }}
                            style={{
                              width: 44, height: 44, borderRadius: 22,
                              backgroundColor: isMine ? "#EEF2FF" : "#F1F5F9",
                              alignItems: "center", justifyContent: "center",
                              borderWidth: isMine ? 1.5 : 0,
                              borderColor: isMine ? "#4361EE" : "transparent",
                            }}
                          >
                            <Text style={{ fontSize: 22 }}>{emoji}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    {myReaction ? (
                      <TouchableOpacity
                        onPress={() => {
                          if (emojiTarget) reactionMutation.mutate({ messageId: emojiTarget.id, emoji: myReaction });
                          setEmojiTarget(null);
                        }}
                        style={{ alignItems: "center", paddingTop: 10, marginTop: 4, borderTopWidth: 0.5, borderTopColor: "#F1F5F9" }}
                      >
                        <Text style={{ fontSize: 14, color: "#EF4444", fontWeight: "600" }}>Remove reaction</Text>
                      </TouchableOpacity>
                    ) : null}
                    </View>
                  </BlurView>
                );
              })()}

              {/* Action list */}
              <View style={{ backgroundColor: "white", borderRadius: 16, overflow: "hidden" }}>
                {/* Reply */}
                <TouchableOpacity
                  onPress={() => { setReplyTo(emojiTarget); setEmojiTarget(null); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0" }}
                >
                  <Text style={{ fontSize: 16, color: "#1E293B" }}>Reply</Text>
                  <Reply size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Copy (text only) */}
                {emojiTarget?.content ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (emojiTarget.content) Clipboard.setStringAsync(emojiTarget.content);
                      setEmojiTarget(null);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: emojiTarget?.mediaUrl ? 0.5 : 0, borderBottomColor: "#E2E8F0" }}
                  >
                    <Text style={{ fontSize: 16, color: "#1E293B" }}>Copy</Text>
                    <Copy size={20} color="#64748B" />
                  </TouchableOpacity>
                ) : null}

                {/* Save Photo / Video */}
                {emojiTarget?.mediaUrl && emojiTarget?.mediaType ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (emojiTarget.mediaUrl && emojiTarget.mediaType) handleSaveMedia(emojiTarget.mediaUrl, emojiTarget.mediaType);
                      setEmojiTarget(null);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: emojiTarget?.senderId === currentUserId ? 0.5 : 0, borderBottomColor: "#E2E8F0" }}
                  >
                    <Text style={{ fontSize: 16, color: "#1E293B" }}>
                      {emojiTarget.mediaType === "video" ? "Save Video" : "Save Photo"}
                    </Text>
                    <Download size={20} color="#64748B" />
                  </TouchableOpacity>
                ) : null}

                {/* Delete (own messages only) */}
                {emojiTarget?.senderId === currentUserId ? (
                  <TouchableOpacity
                    onPress={() => {
                      const target = emojiTarget;
                      setEmojiTarget(null);
                      setDeleteTarget(target);
                    }}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 }}
                  >
                    <Text style={{ fontSize: 16, color: "#EF4444" }}>Delete</Text>
                    <Trash2 size={20} color="#EF4444" />
                  </TouchableOpacity>
                ) : null}
              </View>
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
            <View style={{ backgroundColor: "white", marginHorizontal: 12, marginBottom: 32, borderRadius: 16, overflow: "hidden" }}>
              <View style={{ paddingVertical: 10, alignItems: "center" }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0" }} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.5, paddingHorizontal: 20, paddingBottom: 8 }}>
                {isGroup ? "Group Options" : "Conversation Options"}
              </Text>
              {isGroup ? (
                <TouchableOpacity
                  onPress={() => { setShowOptions(false); setTimeout(() => setShowConvDeleteConfirm(true), 300); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}
                >
                  <Text style={{ fontSize: 16, color: "#EF4444" }}>Delete Group</Text>
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => { setShowOptions(false); setTimeout(() => setShowConvDeleteConfirm(true), 300); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}
                >
                  <Text style={{ fontSize: 16, color: "#EF4444" }}>Delete Conversation</Text>
                  <Trash2 size={20} color="#EF4444" />
                </TouchableOpacity>
              )}
              {isGroup ? (
                <TouchableOpacity
                  onPress={() => { setShowOptions(false); leaveConversationMutation.mutate(); }}
                  style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: "#F1F5F9" }}
                >
                  <Text style={{ fontSize: 16, color: "#F59E0B" }}>Leave Group</Text>
                  <LogOut size={20} color="#F59E0B" />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                onPress={() => setShowOptions(false)}
                style={{ paddingVertical: 16, alignItems: "center", borderTopWidth: 1, borderTopColor: "#F1F5F9" }}
              >
                <Text style={{ fontSize: 16, fontWeight: "600", color: "#64748B" }}>Cancel</Text>
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

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1" keyboardVerticalOffset={0}>
        {isLoading ? (
          <View testID="dm-chat-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messages.length === 0 ? (
          <View testID="dm-chat-empty" className="flex-1 items-center justify-center px-6">
            <View className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center mb-4">
              <Text className="text-2xl font-bold text-indigo-500">
                {recipientName?.[0]?.toUpperCase() ?? "?"}
              </Text>
            </View>
            <Text className="text-lg font-semibold text-slate-700 dark:text-white">{recipientName}</Text>
            <Text className="text-slate-400 text-sm mt-1 text-center">
              This is the beginning of your conversation
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            testID="dm-chat-message-list"
            data={items}
            keyExtractor={(item) => ("type" in item ? item.id : item.id)}
            contentContainerStyle={{ paddingVertical: 12, paddingHorizontal: 12 }}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
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
                  <ChatMessage
                    id={msg.id}
                    content={msg.content}
                    mediaUrl={msg.mediaUrl}
                    mediaType={msg.mediaType}
                    replyTo={msg.replyTo}
                    reactions={msg.reactions ?? []}
                    senderName={msg.sender.name}
                    senderInitial={msg.sender.name?.[0]?.toUpperCase() ?? "?"}
                    senderImage={msg.sender.image}
                    createdAt={msg.createdAt}
                    isOwn={isOwn}
                    currentUserId={currentUserId}
                    onLongPress={() => handleLongPress(msg)}
                    onReactionTap={(reactions) => setReactionView(reactions)}
                  />
                </ReanimatedSwipeable>
              );
            }}
          />
        )}

        {/* Reply preview bar */}
        {replyTo ? (
          <View className="flex-row items-center px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 border-t border-indigo-200 dark:border-indigo-800">
            <View className="flex-1">
              <Text className="text-xs font-semibold text-indigo-600">↩ Replying to {replyTo.sender.name}</Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400" numberOfLines={1}>
                {replyTo.content ?? "📎 Media"}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} className="ml-2">
              <X size={16} color="#6366F1" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Media preview */}
        {mediaPreview ? (
          <View className="flex-row items-center px-3 py-2 bg-slate-100 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
            <Image
              source={{ uri: mediaPreview.uri }}
              style={{ width: 48, height: 48, borderRadius: 8, marginRight: 8 }}
              resizeMode="cover"
            />
            <TouchableOpacity onPress={() => setMediaPreview(null)}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Input bar */}
        <View testID="dm-chat-input-bar" className="flex-row items-end px-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700" style={{ paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
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
            placeholder={`Message ${recipientName ?? ""}...`}
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            style={{ maxHeight: 120 }}
          />
          <TouchableOpacity
            testID="dm-chat-send-button"
            onPress={handleSend}
            disabled={(!input.trim() && !mediaPreview) || sendMutation.isPending || uploading}
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: (input.trim() || mediaPreview) ? "#4361EE" : "#E2E8F0" }}
          >
            {sendMutation.isPending || uploading ? (
              <ActivityIndicator size="small" color={(input.trim() || mediaPreview) ? "white" : "#94A3B8"} />
            ) : (
              <Send size={18} color={(input.trim() || mediaPreview) ? "white" : "#94A3B8"} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
