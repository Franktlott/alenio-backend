import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { MediaViewer } from "@/components/MediaViewer";
import { Play } from "lucide-react-native";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import type { MessageReaction } from "@/lib/types";

interface ChatMessageProps {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  replyTo?: { id: string; content?: string | null; sender: { id: string; name: string } } | null;
  reactions: MessageReaction[];
  senderName: string;
  senderInitial: string;
  senderImage?: string | null;
  createdAt: string;
  isOwn: boolean;
  currentUserId: string;
  onLongPress: () => void;
  onReactionPress: (emoji: string) => void;
}

function groupReactions(reactions: MessageReaction[]) {
  const map: Record<string, { count: number; userIds: string[] }> = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, userIds: [] };
    map[r.emoji].count++;
    map[r.emoji].userIds.push(r.userId);
  }
  return Object.entries(map).map(([emoji, data]) => ({ emoji, ...data }));
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function ChatMessage({
  content, mediaUrl, mediaType, replyTo, reactions, senderName, senderInitial,
  senderImage, createdAt, isOwn, currentUserId, onLongPress, onReactionPress,
}: ChatMessageProps) {
  const grouped = groupReactions(reactions);
  const hasReactions = grouped.length > 0;
  const [viewerVisible, setViewerVisible] = useState(false);
  const mediaLongPressed = useRef(false);

  const handleSaveMedia = useCallback(async () => {
    if (!mediaUrl) return;
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
  }, [mediaUrl, mediaType]);

  return (
    <Pressable
      onLongPress={() => {
        if (mediaLongPressed.current) {
          mediaLongPressed.current = false;
          return;
        }
        onLongPress();
      }}
      delayLongPress={300}
    >
      <View className={`flex-row mb-1 ${isOwn ? "justify-end" : "justify-start"}`}>
        {/* Avatar */}
        {!isOwn && (
          <View className="w-8 h-8 rounded-full bg-indigo-500 items-center justify-center mr-2 mt-1 flex-shrink-0 overflow-hidden">
            {senderImage ? (
              <Image source={{ uri: senderImage }} style={{ width: 32, height: 32 }} resizeMode="cover" />
            ) : (
              <Text className="text-white text-xs font-bold">{senderInitial}</Text>
            )}
          </View>
        )}

        <View className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
          {/* Sender name (others only) */}
          {!isOwn && <Text className="text-xs text-slate-500 dark:text-slate-400 mb-1 ml-1">{senderName}</Text>}

          {/* Bubble */}
          <View
            className={`rounded-2xl overflow-hidden ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
            style={{
              backgroundColor: isOwn ? "#4361EE" : "white",
              shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 3,
              shadowOffset: { width: 0, height: 1 }, elevation: 1,
            }}
          >
            {/* Reply preview */}
            {replyTo ? (
              <View
                className={`px-3 pt-2.5 pb-1.5 border-l-4 mx-2 mt-2 rounded-lg ${isOwn ? "border-white/40 bg-white/10" : "border-indigo-400 bg-indigo-50"}`}
              >
                <Text className={`text-xs font-semibold mb-0.5 ${isOwn ? "text-white/80" : "text-indigo-600"}`}>
                  {replyTo.sender.name}
                </Text>
                <Text
                  className={`text-xs ${isOwn ? "text-white/70" : "text-slate-500"}`}
                  numberOfLines={1}
                >
                  {replyTo.content ?? "📎 Media"}
                </Text>
              </View>
            ) : null}

            {/* Media */}
            {mediaUrl ? (
              <Pressable
                onPress={() => setViewerVisible(true)}
                onLongPress={() => {
                  mediaLongPressed.current = true;
                  handleSaveMedia();
                }}
                delayLongPress={400}
                className="overflow-hidden"
                style={{ maxWidth: 220 }}
                testID="media-thumbnail"
              >
                {mediaType === 'video' ? (
                  <View style={{ position: 'relative' }}>
                    <Image
                      source={{ uri: mediaUrl }}
                      style={{ width: 220, height: 160 }}
                      resizeMode="cover"
                    />
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                      <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
                        <Play size={20} color="white" fill="white" />
                      </View>
                    </View>
                  </View>
                ) : (
                  <Image
                    source={{ uri: mediaUrl }}
                    style={{ width: 220, height: 160 }}
                    resizeMode="cover"
                  />
                )}
              </Pressable>
            ) : null}

            {/* Text */}
            {content ? (
              <Text
                className={`text-sm leading-5 px-4 ${replyTo || mediaUrl ? "pt-1.5 pb-2.5" : "py-2.5"} ${isOwn ? "text-white" : "text-slate-900"}`}
              >
                {content}
              </Text>
            ) : null}
          </View>

          {/* Timestamp */}
          <Text className="text-xs text-slate-400 mt-1 mx-1">{formatTime(createdAt)}</Text>

          {/* Reactions */}
          {hasReactions ? (
            <View className="flex-row flex-wrap mt-1 mx-1" style={{ gap: 4 }}>
              {grouped.map(({ emoji, count, userIds }) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => onReactionPress(emoji)}
                  className={`flex-row items-center px-2 py-0.5 rounded-full border ${
                    userIds.includes(currentUserId)
                      ? "bg-indigo-100 border-indigo-300"
                      : "bg-white border-slate-200"
                  }`}
                  style={{ shadowColor: "#000", shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 }}
                >
                  <Text style={{ fontSize: 13 }}>{emoji}</Text>
                  {count > 1 ? (
                    <Text className={`text-xs ml-1 font-semibold ${userIds.includes(currentUserId) ? "text-indigo-600" : "text-slate-600"}`}>
                      {count}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        {/* Own avatar */}
        {isOwn ? (
          <View className="w-8 h-8 rounded-full bg-indigo-500 items-center justify-center ml-2 mt-1 flex-shrink-0 overflow-hidden">
            {senderImage ? (
              <Image source={{ uri: senderImage }} style={{ width: 32, height: 32 }} resizeMode="cover" />
            ) : (
              <Text className="text-white text-xs font-bold">{senderInitial}</Text>
            )}
          </View>
        ) : null}
      </View>
      {mediaUrl && mediaType ? (
        <MediaViewer
          visible={viewerVisible}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          onClose={() => setViewerVisible(false)}
        />
      ) : null}
    </Pressable>
  );
}
