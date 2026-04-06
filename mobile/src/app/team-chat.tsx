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
  ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ArrowLeft, Send, Paperclip, X, Video, Camera, ImageIcon, BarChart2, ListTodo } from "lucide-react-native";
import { BlurView } from "expo-blur";
import { router, useLocalSearchParams } from "expo-router";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useUnreadStore } from "@/lib/state/unread-store";
import { uploadFile } from "@/lib/upload";
import { pickMedia, takePhoto } from "@/lib/file-picker";
import { ChatMessage } from "@/components/ChatMessage";
import type { Message, Team, MessageReaction } from "@/lib/types";
import { useDemoMode, showDemoAlert } from "@/lib/useDemo";

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

type PollType = {
  id: string;
  question: string;
  endsAt: string;
  createdAt: string;
  createdById: string;
  allowLeaderDelete: boolean;
  createdBy: { id: string; name: string; image: string | null };
  options: { id: string; text: string; votes: { userId: string }[] }[];
  votes: { userId: string; optionId: string }[];
  _isPoll: true;
};

type ChatItem = Message | PollType | { type: "date"; label: string; id: string };

function buildChatList(messages: Message[], polls: PollType[]): ChatItem[] {
  const combined: (Message | PollType)[] = [
    ...messages,
    ...polls,
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const result: ChatItem[] = [];
  let lastDate = "";
  for (const item of combined) {
    const label = formatDateLabel(item.createdAt);
    if (label !== lastDate) {
      result.push({ type: "date", label, id: `date-${item.id}` });
      lastDate = label;
    }
    result.push(item);
  }
  return result;
}

function PollCard({
  poll,
  currentUserId,
  teamId,
  onVote,
  onDelete,
  canDelete,
}: {
  poll: PollType;
  currentUserId: string;
  teamId: string;
  onVote: (pollId: string, optionId: string) => void;
  onDelete: (pollId: string) => void;
  canDelete: boolean;
}) {
  const isEnded = new Date() > new Date(poll.endsAt);
  const myVote = poll.votes.find((v) => v.userId === currentUserId);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.votes.length, 0);

  function timeLeft() {
    if (isEnded) return "Poll ended";
    const diff = new Date(poll.endsAt).getTime() - Date.now();
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `${Math.floor(h / 24)}d left`;
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  return (
    <View style={{ marginVertical: 6, marginHorizontal: 4 }}>
      <View style={{
        backgroundColor: "white",
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "#E2E8F0",
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}>
        {/* Header row */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
            <Text style={{ fontSize: 14 }}>📊</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: "#4361EE", textTransform: "uppercase", letterSpacing: 0.5 }}>Poll</Text>
            <Text style={{ fontSize: 10, color: "#94A3B8" }}>{poll.createdBy.name} · {timeLeft()}</Text>
          </View>
          {canDelete ? (
            <TouchableOpacity onPress={() => onDelete(poll.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ fontSize: 16, color: "#CBD5E1" }}>✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Question */}
        <Text style={{ fontSize: 15, fontWeight: "700", color: "#1E293B", marginBottom: 12, lineHeight: 20 }}>
          {poll.question}
        </Text>

        {/* Options */}
        {poll.options.map((option) => {
          const isSelected = myVote?.optionId === option.id;
          const voteCount = option.votes.length;
          const pct = totalVotes > 0 ? (voteCount / totalVotes) * 100 : 0;
          const showResults = !!myVote || isEnded;

          return (
            <TouchableOpacity
              key={option.id}
              testID={`poll-option-${option.id}`}
              onPress={() => { if (!isEnded) onVote(poll.id, option.id); }}
              disabled={isEnded}
              style={{ marginBottom: 8 }}
            >
              <View style={{
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: isSelected ? "#4361EE" : "#E2E8F0",
                backgroundColor: isSelected ? "#EEF2FF" : "#F8FAFC",
                overflow: "hidden",
              }}>
                {showResults ? (
                  <View style={{
                    position: "absolute", left: 0, top: 0, bottom: 0,
                    width: `${pct}%` as any,
                    backgroundColor: isSelected ? "#C7D2FE" : "#F1F5F9",
                    borderRadius: 8,
                  }} />
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 14, fontWeight: isSelected ? "700" : "500", color: isSelected ? "#4361EE" : "#334155", flex: 1 }}>
                    {option.text}
                  </Text>
                  {showResults ? (
                    <Text style={{ fontSize: 12, fontWeight: "600", color: isSelected ? "#4361EE" : "#94A3B8", marginLeft: 8 }}>
                      {Math.round(pct)}%
                    </Text>
                  ) : null}
                  {isSelected ? (
                    <Text style={{ fontSize: 14, marginLeft: 6 }}>✓</Text>
                  ) : null}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Footer */}
        <Text style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          {isEnded ? " · Poll ended" : myVote ? " · Tap to change vote" : " · Tap to vote"}
        </Text>
      </View>
    </View>
  );
}

export default function TeamChatScreen() {
  const { teamId, teamName, topicId, topicName } = useLocalSearchParams<{ teamId: string; teamName: string; topicId?: string; topicName?: string }>();
  const { data: session } = useSession();
  const isDemo = useDemoMode();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [emojiTarget, setEmojiTarget] = useState<Message | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [reactionView, setReactionView] = useState<MessageReaction[] | null>(null);
  const [mediaPreview, setMediaPreview] = useState<{ uri: string; mimeType: string; filename: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState<boolean>(false);
  const [pollQuestion, setPollQuestion] = useState<string>("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollDuration, setPollDuration] = useState<number>(24);
  const [pollAllowLeaderDelete, setPollAllowLeaderDelete] = useState<boolean>(true);
  const [confirmDeletePollId, setConfirmDeletePollId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const currentUserId = session?.user?.id ?? "";
  const prevMsgCountRef = useRef<number>(0);

  const topicKey = topicId ?? "general";

  const markAsRead = useUnreadStore((s) => s.markAsRead);

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ["messages", teamId, topicKey],
    queryFn: () => api.get<Message[]>(`/api/teams/${teamId}/messages?topicId=${topicKey}`),
    enabled: !!teamId,
    refetchInterval: 3000,
  });

  const { data: polls = [] } = useQuery<PollType[]>({
    queryKey: ["polls", teamId],
    queryFn: () => api.get<PollType[]>(`/api/teams/${teamId}/polls`),
    enabled: !!teamId,
    refetchInterval: 5000,
    select: (data) => data.map((p) => ({ ...p, _isPoll: true as const })),
  });

  const { data: team } = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api.get<Team>(`/api/teams/${teamId}`),
    enabled: !!teamId,
  });
  const currentUserRole = team?.members?.find((m) => m.userId === currentUserId)?.role;

  const sendMutation = useMutation({
    mutationFn: (payload: { content?: string; mediaUrl?: string; mediaType?: string; replyToId?: string; topicId?: string }) =>
      api.post<Message>(`/api/teams/${teamId}/messages`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", teamId, topicKey] });
      setReplyTo(null);
      setMediaPreview(null);
    },
  });

  const reactionMutation = useMutation({
    mutationFn: ({ messageId, emoji }: { messageId: string; emoji: string }) =>
      api.post<Message>(`/api/teams/${teamId}/messages/${messageId}/reactions`, { emoji }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", teamId, topicKey] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: string) =>
      api.delete(`/api/teams/${teamId}/messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["messages", teamId, topicKey] });
      setDeleteTarget(null);
    },
  });

  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionId }: { pollId: string; optionId: string }) =>
      api.post(`/api/teams/${teamId}/polls/${pollId}/vote`, { optionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["polls", teamId] }),
  });

  const deletePollMutation = useMutation({
    mutationFn: (pollId: string) => api.delete(`/api/teams/${teamId}/polls/${pollId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["polls", teamId] }),
  });

  const createPollMutation = useMutation({
    mutationFn: (payload: { question: string; options: string[]; durationHours: number; allowLeaderDelete: boolean }) =>
      api.post(`/api/teams/${teamId}/polls`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["polls", teamId] });
      setShowPollModal(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      setPollDuration(24);
      setPollAllowLeaderDelete(true);
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
      topicId: topicId ?? undefined,
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

  const handleLongPress = useCallback((msg: Message) => {
    setEmojiTarget(msg);
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;
    const channelKey = topicId ? `topic:${topicId}` : `team:${teamId}`;
    markAsRead(channelKey, lastMsg.id);
  }, [messages, teamId, topicId, markAsRead]);

  useEffect(() => {
    if (!messages) return;
    const count = messages.length;
    if (count > prevMsgCountRef.current && prevMsgCountRef.current > 0) {
      const newest = messages[messages.length - 1];
      if (newest && newest.senderId !== currentUserId) {
        AsyncStorage.getItem("msg_tone").then(async (toneId) => {
          const id = toneId ?? "chime";
          const URLS: Record<string, string> = {
            chime:   "https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3",
            soft:    "https://assets.mixkit.co/active_storage/sfx/2018/2018-preview.mp3",
            ding:    "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3",
            note:    "https://assets.mixkit.co/active_storage/sfx/2015/2015-preview.mp3",
            glass:   "https://assets.mixkit.co/active_storage/sfx/2308/2308-preview.mp3",
            bloom:   "https://assets.mixkit.co/active_storage/sfx/2017/2017-preview.mp3",
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

  const items = buildChatList(messages, polls);

  return (
    <SafeAreaView testID="team-chat-screen" className="flex-1 bg-slate-50 dark:bg-slate-900" edges={["top"]}>
      <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity onPress={() => router.back()} className="mr-3" testID="back-button">
            <ArrowLeft size={22} color="white" />
          </TouchableOpacity>
          <View className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-3 overflow-hidden">
            {team?.image ? (
              <Image source={{ uri: team.image }} style={{ width: 36, height: 36 }} resizeMode="cover" />
            ) : (
              <Text className="text-white font-bold text-base">{(Array.isArray(teamName) ? teamName[0] : (teamName ?? "T"))[0].toUpperCase()}</Text>
            )}
          </View>
          <View className="flex-1">
            <Text style={{ color: "white", fontSize: 18, fontWeight: "700" }}>{teamName ?? "Team Chat"}</Text>
            <Text className="text-white/70 text-xs">{topicName ? `# ${topicName}` : "Main chat"}</Text>
          </View>
          {!isDemo ? (
            <TouchableOpacity
              testID="create-poll-button"
              onPress={() => setShowPollModal(true)}
              className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2"
            >
              <BarChart2 size={18} color="white" />
            </TouchableOpacity>
          ) : null}
          {!isDemo ? (
            <TouchableOpacity
              testID="start-video-call-button"
              onPress={() => router.push({
                pathname: "/video-call",
                params: { roomId: teamId, roomName: `${teamName ?? "Team"} Call` },
              })}
              className="w-9 h-9 rounded-full bg-white/20 items-center justify-center mr-2"
            >
              <Video size={18} color="white" />
            </TouchableOpacity>
          ) : null}
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
          <BlurView intensity={70} tint="light" style={{ borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: "rgba(255,255,255,0.6)" }}>
            <View style={{ backgroundColor: "rgba(255,255,255,0.5)", padding: 12 }}>
            {(() => {
              const myReaction = emojiTarget
                ? (emojiTarget.reactions ?? []).find((r: any) => r.userId === currentUserId)?.emoji
                : undefined;
              return (
                <>
                  <View className="flex-row mb-3" style={{ gap: 8 }}>
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
                      className="flex-row items-center justify-center py-2 border-t border-slate-100 dark:border-slate-700"
                    >
                      <Text style={{ color: "#EF4444", fontWeight: "600", fontSize: 14 }}>Remove reaction</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              );
            })()}
            <TouchableOpacity
              onPress={() => {
                setReplyTo(emojiTarget);
                setEmojiTarget(null);
              }}
              className="flex-row items-center justify-center py-2 border-t border-slate-100 dark:border-slate-700"
            >
              <Text className="text-indigo-600 font-semibold text-sm">↩ Reply</Text>
            </TouchableOpacity>
            {emojiTarget?.content ? (
              <TouchableOpacity
                onPress={() => {
                  const msgText = emojiTarget.content ?? "";
                  setEmojiTarget(null);
                  router.push({ pathname: "/create-task", params: { prefillTitle: msgText } });
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 10,
                  gap: 7,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(209,250,229,0.8)",
                  backgroundColor: "rgba(13,148,136,0.08)",
                  marginHorizontal: -12,
                  paddingHorizontal: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    backgroundColor: "#0D9488",
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                  }}
                >
                  <ListTodo size={15} color="white" />
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 13, letterSpacing: 0.3 }}>chat2Task</Text>
                </View>
              </TouchableOpacity>
            ) : null}
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
          </BlurView>
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

      {/* Delete poll confirmation modal */}
      <Modal visible={!!confirmDeletePollId} transparent animationType="fade" onRequestClose={() => setConfirmDeletePollId(null)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}
          activeOpacity={1}
          onPress={() => setConfirmDeletePollId(null)}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={{ backgroundColor: "white", borderRadius: 20, padding: 24, width: "100%" }}>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#1E293B", textAlign: "center", marginBottom: 8 }}>Delete Poll?</Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                This poll and all its votes will be permanently removed.
              </Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setConfirmDeletePollId(null)}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#F1F5F9", alignItems: "center" }}
                  testID="cancel-delete-poll"
                >
                  <Text style={{ fontWeight: "600", color: "#64748B", fontSize: 15 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (confirmDeletePollId) deletePollMutation.mutate(confirmDeletePollId);
                    setConfirmDeletePollId(null);
                  }}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center" }}
                  testID="confirm-delete-poll"
                >
                  <Text style={{ fontWeight: "700", color: "white", fontSize: 15 }}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Poll creation modal */}
      <Modal visible={showPollModal} transparent animationType="slide" onRequestClose={() => setShowPollModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
            activeOpacity={1}
            onPress={() => setShowPollModal(false)}
          />
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <ScrollView
              style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {/* Header */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                <Text style={{ fontSize: 18, fontWeight: "700", color: "#1E293B" }}>Create Poll</Text>
                <TouchableOpacity onPress={() => setShowPollModal(false)}>
                  <X size={20} color="#94A3B8" />
                </TouchableOpacity>
              </View>

              {/* Question */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Question</Text>
              <TextInput
                testID="poll-question-input"
                value={pollQuestion}
                onChangeText={setPollQuestion}
                placeholder="Ask a question..."
                placeholderTextColor="#CBD5E1"
                multiline
                style={{
                  backgroundColor: "#F8FAFC",
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 15,
                  color: "#1E293B",
                  marginBottom: 16,
                  maxHeight: 100,
                }}
              />

              {/* Options */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Options</Text>
              {pollOptions.map((opt, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 }}>
                  <TextInput
                    testID={`poll-option-input-${i}`}
                    value={opt}
                    onChangeText={(val) => {
                      const next = [...pollOptions];
                      next[i] = val;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    placeholderTextColor="#CBD5E1"
                    style={{
                      flex: 1,
                      backgroundColor: "#F8FAFC",
                      borderWidth: 1,
                      borderColor: "#E2E8F0",
                      borderRadius: 10,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      fontSize: 14,
                      color: "#1E293B",
                    }}
                  />
                  {pollOptions.length > 2 ? (
                    <TouchableOpacity
                      onPress={() => setPollOptions(pollOptions.filter((_, idx) => idx !== i))}
                      style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center" }}
                    >
                      <X size={14} color="#EF4444" />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))}
              {pollOptions.length < 6 ? (
                <TouchableOpacity
                  onPress={() => setPollOptions([...pollOptions, ""])}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, marginBottom: 16 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 16, color: "#4361EE", lineHeight: 20 }}>+</Text>
                  </View>
                  <Text style={{ fontSize: 14, color: "#4361EE", fontWeight: "600" }}>Add option</Text>
                </TouchableOpacity>
              ) : <View style={{ marginBottom: 16 }} />}

              {/* Duration */}
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#64748B", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
                {[
                  { label: "1h", value: 1 },
                  { label: "6h", value: 6 },
                  { label: "24h", value: 24 },
                  { label: "48h", value: 48 },
                  { label: "3d", value: 72 },
                  { label: "1 week", value: 168 },
                ].map(({ label, value }) => (
                  <TouchableOpacity
                    key={value}
                    testID={`poll-duration-${value}`}
                    onPress={() => setPollDuration(value)}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: pollDuration === value ? "#4361EE" : "#F1F5F9",
                      borderWidth: 1,
                      borderColor: pollDuration === value ? "#4361EE" : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: "600", color: pollDuration === value ? "white" : "#64748B" }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Allow leader delete toggle */}
              <TouchableOpacity
                onPress={() => setPollAllowLeaderDelete((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderTopWidth: 1, borderTopColor: "#F1F5F9", marginBottom: 4 }}
                testID="poll-allow-leader-toggle"
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: "#1E293B" }}>Allow team leaders to delete</Text>
                  <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Owners and team leaders can remove this poll</Text>
                </View>
                <View style={{
                  width: 44, height: 26, borderRadius: 13,
                  backgroundColor: pollAllowLeaderDelete ? "#4361EE" : "#E2E8F0",
                  justifyContent: "center",
                  paddingHorizontal: 2,
                }}>
                  <View style={{
                    width: 22, height: 22, borderRadius: 11, backgroundColor: "white",
                    alignSelf: pollAllowLeaderDelete ? "flex-end" : "flex-start",
                    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }} />
                </View>
              </TouchableOpacity>

              {/* Create button */}
              <TouchableOpacity
                testID="create-poll-submit"
                onPress={() => {
                  const validOptions = pollOptions.filter((o) => o.trim().length > 0);
                  if (!pollQuestion.trim() || validOptions.length < 2) return;
                  createPollMutation.mutate({
                    question: pollQuestion.trim(),
                    options: validOptions,
                    durationHours: pollDuration,
                    allowLeaderDelete: pollAllowLeaderDelete,
                  });
                }}
                disabled={
                  createPollMutation.isPending ||
                  !pollQuestion.trim() ||
                  pollOptions.filter((o) => o.trim()).length < 2
                }
                style={{
                  backgroundColor:
                    !pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2
                      ? "#E2E8F0"
                      : "#4361EE",
                  borderRadius: 14,
                  paddingVertical: 14,
                  alignItems: "center",
                }}
              >
                {createPollMutation.isPending ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>Create Poll</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} className="flex-1" keyboardVerticalOffset={0}>
        {isLoading ? (
          <View testID="team-chat-loading" className="flex-1 items-center justify-center">
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : messages.length === 0 && polls.length === 0 ? (
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
              if ("type" in item && (item as any).type === "date") {
                return (
                  <View className="items-center my-3">
                    <View className="bg-slate-200 dark:bg-slate-700 rounded-full px-3 py-0.5">
                      <Text className="text-xs text-slate-500 dark:text-slate-400">{(item as any).label}</Text>
                    </View>
                  </View>
                );
              }
              // Poll card
              if ("_isPoll" in item) {
                const poll = item as PollType;
                const canDeletePoll =
                  poll.createdById === currentUserId ||
                  (poll.allowLeaderDelete && (currentUserRole === "owner" || currentUserRole === "team_leader" || currentUserRole === "admin"));
                return (
                  <PollCard
                    poll={poll}
                    currentUserId={currentUserId}
                    teamId={teamId}
                    onVote={(pollId, optionId) => voteMutation.mutate({ pollId, optionId })}
                    onDelete={(pollId) => setConfirmDeletePollId(pollId)}
                    canDelete={canDeletePoll}
                  />
                );
              }
              // Regular message
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
            <TouchableOpacity onPress={() => setMediaPreview(null)}>
              <X size={16} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Input bar */}
        <View testID="team-chat-input-bar" className="flex-row items-end px-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700" style={{ paddingTop: 8, paddingBottom: insets.bottom + 8 }}>
          {!isDemo ? (
            <TouchableOpacity
              onPress={() => setShowMediaPicker(true)}
              className="w-10 h-10 rounded-full items-center justify-center mr-2"
              style={{ backgroundColor: "#F1F5F9" }}
            >
              <Paperclip size={18} color="#64748B" />
            </TouchableOpacity>
          ) : null}
          <TextInput
            testID="team-chat-text-input"
            className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-2xl px-4 py-2.5 text-base text-slate-900 dark:text-white mr-2"
            placeholder={isDemo ? "Read-only demo account" : "Message..."}
            placeholderTextColor="#94A3B8"
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            style={{ maxHeight: 120 }}
            editable={!isDemo}
            onPressIn={isDemo ? showDemoAlert : undefined}
          />
          {!isDemo ? (
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
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
