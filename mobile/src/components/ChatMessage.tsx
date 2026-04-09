import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { MediaViewer } from "@/components/MediaViewer";
import { Play } from "lucide-react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import type { MessageReaction } from "@/lib/types";
import { renderMentionText } from "@/lib/renderMentions";

interface ChatMessageProps {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: 'image' | 'video' | null;
  replyTo?: { id: string; content?: string | null; mediaUrl?: string | null; mediaType?: string | null; sender: { id: string; name: string } } | null;
  reactions: MessageReaction[];
  senderName: string;
  senderInitial: string;
  senderImage?: string | null;
  createdAt: string;
  editedAt?: string | null;
  isOwn: boolean;
  currentUserId: string;
  onLongPress: () => void;
  onReactionTap: (reactions: MessageReaction[]) => void;
}

function groupReactions(reactions: MessageReaction[]) {
  const map: Record<string, { count: number; userIds: string[]; users: { id: string; name: string }[] }> = {};
  for (const r of reactions) {
    if (!map[r.emoji]) map[r.emoji] = { count: 0, userIds: [], users: [] };
    map[r.emoji].count++;
    map[r.emoji].userIds.push(r.userId);
    map[r.emoji].users.push(r.user);
  }
  return Object.entries(map).map(([emoji, data]) => ({ emoji, ...data }));
}

export function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function ChatMessage({
  content, mediaUrl, mediaType, replyTo, reactions, senderName, senderInitial,
  senderImage, createdAt, editedAt, isOwn, currentUserId, onLongPress, onReactionTap,
}: ChatMessageProps) {
  const grouped = groupReactions(reactions);
  const hasReactions = grouped.length > 0;
  const [viewerVisible, setViewerVisible] = useState(false);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);
  const IMG_WIDTH = 154;
  const [imgHeight, setImgHeight] = useState<number>(IMG_WIDTH);

  useEffect(() => {
    if (mediaType === "image" && mediaUrl) {
      Image.getSize(mediaUrl, (w, h) => {
        if (w > 0) setImgHeight(Math.round((h / w) * IMG_WIDTH));
      }, () => {});
    }
  }, [mediaUrl, mediaType]);

  useEffect(() => {
    if (mediaType === "video" && mediaUrl) {
      VideoThumbnails.getThumbnailAsync(mediaUrl, { time: 0 })
        .then((r) => setVideoThumb(r.uri))
        .catch(() => setVideoThumb(null));
    }
  }, [mediaUrl, mediaType]);

  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .onStart(() => {
      runOnJS(onLongPress)();
    });

  return (
    <GestureDetector gesture={longPressGesture}>
      <View>
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
                  className={`px-3 pt-2.5 pb-1.5 border-l-4 mx-2 mt-2 rounded-lg flex-row items-center gap-2 ${isOwn ? "border-white/40 bg-white/10" : "border-indigo-400 bg-indigo-50"}`}
                  style={{ minWidth: 160 }}
                >
                  <View style={{ flex: 1 }}>
                    <Text className={`text-xs font-semibold mb-0.5 ${isOwn ? "text-white/80" : "text-indigo-600"}`}>
                      {replyTo.sender.name}
                    </Text>
                    <Text
                      className={`text-xs ${isOwn ? "text-white/70" : "text-slate-500"}`}
                      numberOfLines={1}
                    >
                      {replyTo.content ? replyTo.content : replyTo.mediaType === 'video' ? '🎥 Video' : '📷 Photo'}
                    </Text>
                  </View>
                  {replyTo.mediaUrl && replyTo.mediaType === 'image' ? (
                    <Image
                      source={{ uri: replyTo.mediaUrl }}
                      style={{ width: 40, height: 40, borderRadius: 6 }}
                      resizeMode="cover"
                    />
                  ) : replyTo.mediaUrl && replyTo.mediaType === 'video' ? (
                    <View style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' }}>
                      <Play size={14} color="white" fill="white" />
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Media */}
              {mediaUrl ? (
                <Pressable
                  onPress={() => setViewerVisible(true)}
                  className="overflow-hidden"
                  style={{ maxWidth: 154 }}
                  testID="media-thumbnail"
                >
                  {mediaType === 'video' ? (
                    <View style={{ position: 'relative', width: 220, height: 160, backgroundColor: "#0F172A" }}>
                      {videoThumb ? (
                        <Image
                          source={{ uri: videoThumb }}
                          style={{ width: 220, height: 160 }}
                          resizeMode="cover"
                        />
                      ) : null}
                      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                        <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
                          <Play size={20} color="white" fill="white" />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Image
                      source={{ uri: mediaUrl }}
                      style={{ width: IMG_WIDTH, height: imgHeight }}
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
                  {renderMentionText(
                    content,
                    currentUserId,
                    isOwn
                      ? { color: "white", fontSize: 14, lineHeight: 20 }
                      : { color: "#0F172A", fontSize: 14, lineHeight: 20 }
                  )}
                </Text>
              ) : null}
            </View>

            {/* Timestamp */}
            <View className={`flex-row items-center mt-1 mx-1 gap-1 ${isOwn ? "justify-end" : "justify-start"}`}>
              <Text className="text-xs text-slate-400">{formatTime(createdAt)}</Text>
              {editedAt ? <Text className="text-xs text-slate-400">· edited</Text> : null}
            </View>

            {/* Reactions */}
            {hasReactions ? (
              <View className="flex-row flex-wrap mt-1 mx-1" style={{ gap: 4 }}>
                {grouped.map(({ emoji, count, userIds }) => (
                  <TouchableOpacity
                    key={emoji}
                    onPress={() => onReactionTap(reactions)}
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
      </View>
    </GestureDetector>
  );
}
