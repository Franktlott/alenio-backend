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
import { ArrowLeft, Send, Paperclip, X, Users, Video } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { uploadFile } from "@/lib/upload";
import { pickMedia } from "@/lib/file-picker";
import { ChatMessage } from "@/components/ChatMessage";
import type { DirectMessage } from "@/lib/types";

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
  const { conversationId, recipientName, isGroup: isGroupParam } = useLocalSearchParams<{
    conversationId: string;
    recipientName: string;
    isGroup: string;
  }>();
  const isGroup = isGroupParam === "true";
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<DirectMessage | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<DirectMessage | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; mimeType: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = session?.user?.id ?? "";

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

  const handleLongPress = useCallback((msg: DirectMessage) => {
    setEmojiTarget(msg);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const items = buildMessageList(messages);

  return (
    <SafeAreaView testID="dm-chat-screen" className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View className="px-4 pt-2 pb-4 flex-row items-center">
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3">
            {isGroup ? (
              <Users size={18} color="white" />
            ) : (
              <Text className="text-white font-bold">{recipientName?.[0]?.toUpperCase() ?? "?"}</Text>
            )}
          </View>
          <View className="flex-1">
            <Text className="text-white text-lg font-bold">{recipientName}</Text>
            <Text className="text-white/70 text-xs">{isGroup ? "Group chat" : "Direct message"}</Text>
          </View>
          <TouchableOpacity
            testID="start-video-call-button"
            onPress={() => router.push({
              pathname: "/video-call",
              params: { roomId: conversationId, roomName: `${recipientName ?? "Call"}` },
            })}
            className="w-9 h-9 rounded-full bg-white/20 items-center justify-center"
          >
            <Video size={18} color="white" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
          </View>
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
                  onReactionPress={(emoji) => reactionMutation.mutate({ messageId: msg.id, emoji })}
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
        <View testID="dm-chat-input-bar" className="flex-row items-end px-3 py-2 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
          <TouchableOpacity
            onPress={handlePickMedia}
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
