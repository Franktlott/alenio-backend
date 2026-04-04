import React, { useState, useRef, useEffect, useCallback } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send, Paperclip, X, Video } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import { pickMedia } from "@/lib/file-picker";
import { ChatMessage } from "@/components/ChatMessage";
import type { Message, Team, MessageReaction } from "@/lib/types";

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

type MessageItem = Message | { type: "date"; label: string; id: string };

function buildMessageList(messages: Message[]): MessageItem[] {
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

export default function TeamChatScreen() {
  const { teamId, teamName } = useLocalSearchParams<{ teamId: string; teamName: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [reactionView, setReactionView] = useState<MessageReaction[] | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; mimeType: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = session?.user?.id ?? "";

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", teamId],
    queryFn: () => api.get<Message[]>(`/api/teams/${teamId}/messages`),
    enabled: !!teamId,
    refetchInterval: 3000,
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });
  const currentUserRole = team?.members?.find((m) => m.userId === currentUserId)?.role;

  const sendMutation = useMutation({
    mutationFn: (payload: { content?: string; mediaUrl?: string; mediaType?: string; replyToId?: string }) =>
      api.post<Message>(`/api/teams/${teamId}/messages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", teamId] });
      setReplyTo(null);
      setMediaPreview(null);
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.post<Message>(`/api/teams/${teamId}/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", teamId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete(`/api/teams/${teamId}/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", teamId] });
      setDeleteTarget(null);
    },
  });

  const canDelete = (msg: Message) =>
    msg.senderId === currentUserId ||
    currentUserRole === "owner" ||
    currentUserRole === "admin";

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

  const handleLongPress = useCallback((msg: Message) => {
    setEmojiTarget(msg);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const items = buildMessageList(messages);

  return (
    <SafeAreaView testID="team-chat-screen" className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3 overflow-hidden">
            {team?.image ? (
              <Image source={{ uri: team.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
            ) : (
              <Text className="text-white font-bold text-base">{(teamName ?? "T")[0].toUpperCase()}</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{teamName ?? "Team Chat"}</Text>
            <Text className="text-white/70 text-xs">Team channel</Text>
          </View>
          <TouchableOpacity
            testID="start-video-call-button"
            onPress={() => router.push({
              pathname: "/video-call",
              params: { roomId: teamId, roomName: `${teamName ?? "Team"} Call` },
            })}
            className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
          >
            <Video size={18} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

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

      {/* Emoji picker modal */}
      <Modal
        visible={!!emojiTarget}
        transparent
        animationType="fade"
        onRequestClose={() => setEmojiTarget(null)}
      >
        <TouchableOpacity
          className="flex-1 bg-black/40 items-center justify-center"
          activeOpacity={1}
          onPress={() => setEmojiTarget(null)}
        >
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-3 shadow-xl">
            <View className="flex-row mb-3" style={{ gap: 8 }}>
              {REACTION_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => {
                    if (emojiTarget) reactionMutation.mutate({ messageId: emojiTarget.id, emoji });
                    setEmojiTarget(null);
                  }}
                  className="w-11 h-11 rounded-full bg-slate-100 dark:bg-slate-700 items-center justify-center"
                >
                  <Text style={{ fontSize: 22 }}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => {
                setReplyTo(emojiTarget);
                setEmojiTarget(null);
              }}
              className="flex-row items-center justify-center py-2 border-t border-slate-100 dark:border-slate-700"
            >
              <Text className="text-indigo-600 font-semibold text-sm">↩ Reply</Text>
            </TouchableOpacity>
            {emojiTarget && canDelete(emojiTarget) ? (
              <TouchableOpacity
                onPress={() => {
                  const target = emojiTarget;
                  setEmojiTarget(null);
                  setDeleteTarget(target);
                }}
                className="flex-row items-center justify-center py-2 border-t border-slate-100 dark:border-slate-700"
              >
                <Text className="text-red-500 font-semibold text-sm">🗑 Delete message</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
          className="flex-1 bg-black/40 items-center justify-center px-8"
          activeOpacity={1}
          onPress={() => setDeleteTarget(null)}
        >
          <TouchableOpacity activeOpacity={1} className="w-full bg-white dark:bg-slate-800 rounded-2xl overflow-hidden">
            <View className="px-5 pt-5 pb-4 items-center">
              <Text className="text-lg font-bold text-slate-900 dark:text-white mb-1">Delete message?</Text>
              <Text className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This message will be permanently removed.
              </Text>
            </View>
            <View className="flex-row border-t border-slate-100 dark:border-slate-700">
              <TouchableOpacity
                onPress={() => setDeleteTarget(null)}
                className="flex-1 py-3.5 items-center border-r border-slate-100 dark:border-slate-700"
              >
                <Text className="text-base font-medium text-slate-600 dark:text-slate-300">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="confirm-delete-button"
                onPress={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); }}
                disabled={deleteMutation.isPending}
                className="flex-1 py-3.5 items-center"
              >
                {deleteMutation.isPending ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <Text className="text-base font-semibold text-red-500">Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1" keyboardVerticalOffset={0}>
        {isLoading ? (
          <View testID="team-chat-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messages.length === 0 ? (
          <View testID="team-chat-empty" className="flex-1 items-center justify-center px-6">
            <Text className="text-4xl mb-3">💬</Text>
            <Text className="text-lg font-semibold text-slate-500">No messages yet</Text>
            <Text className="text-slate-400 text-sm mt-1 text-center">Be the first to say something!</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            testID="team-chat-message-list"
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
              const msg = item as Message;
              return (
                <ChatMessage
                  key={msg.id}
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
                  isOwn={msg.senderId === currentUserId}
                  currentUserId={currentUserId}
                  onLongPress={() => handleLongPress(msg)}
                  onReactionTap={(reactions) => setReactionView(reactions)}
                />
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
            <Text className="flex-1 text-xs text-slate-600 dark:text-slate-400" numberOfLines={1}>{mediaPreview.filename}</Text>
            <TouchableOpacity onPress={() => setMediaPreview(null)}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Input bar */}
        <View testID="team-chat-input-bar" className="flex-row items-end px-3 py-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
          <TouchableOpacity
            onPress={handlePickMedia}
            className="w-10 h-10 rounded-full items-center justify-center mr-2"
            style={{ backgroundColor: "#F1F5F9" }}
          >
            <Paperclip size={18} color="#64748B" />
          </TouchableOpacity>
          <TextInput
            testID="team-chat-text-input"
            className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-2.5 text-base text-slate-900 dark:text-white mr-2"
            placeholder="Message..."
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            style={{ maxHeight: 120 }}
          />
          <TouchableOpacity
            testID="team-chat-send-button"
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
