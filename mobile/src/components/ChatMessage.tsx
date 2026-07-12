import React, { useState, useEffect, type RefObject } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  Linking,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { MediaViewer } from "@/components/MediaViewer";
import { Play } from "lucide-react-native";
import * as VideoThumbnails from "expo-video-thumbnails";
import type { MessageReaction } from "@/lib/types";
import { renderMentionText } from "@/lib/renderMentions";
import { useQuery } from "@tanstack/react-query";
import { readJsonSafe } from "@/lib/api/api";
import { getBackendUrl } from "@/lib/backend-url";
import { getAuthHeaders } from "@/lib/auth/auth-client";
import { UserAvatar } from "@/components/UserAvatar";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const MEDIA_PRESS_SPRING = { damping: 18, stiffness: 280, mass: 0.6 };

/** Messenger-style slight enlarge while pressing a chat photo/video thumb. */
function MediaThumbPressable({
  onPress,
  onLongPress,
  delayLongPress = 400,
  children,
  style,
  testID,
}: {
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  children: React.ReactNode;
  style?: object;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={delayLongPress}
      onPressIn={() => {
        scale.value = withSpring(1.045, MEDIA_PRESS_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, MEDIA_PRESS_SPRING);
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function extractFirstUrl(text: string): string | null {
  return text.match(URL_REGEX)?.[0] ?? null;
}

function parseYouTubeVideoId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] ?? "";
      return /^[\w-]{6,}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[\w-]{6,}$/.test(v)) return v;
      const m = url.pathname.match(/\/(?:embed|shorts|live)\/([\w-]{6,})/);
      return m?.[1] ?? null;
    }
  } catch {
    return null;
  }
  return null;
}

/** Remove the previewed URL from message text when a rich preview is shown. */
function stripPreviewUrl(text: string, url: string): string {
  const idx = text.indexOf(url);
  const without =
    idx >= 0 ? `${text.slice(0, idx)} ${text.slice(idx + url.length)}` : text;
  return without
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function domainFromUrl(raw: string): string {
  try {
    return new URL(raw).hostname.replace(/^www\./, "");
  } catch {
    return "Link";
  }
}

type OgData = {
  title: string | null;
  image: string | null;
  favicon?: string | null;
  description?: string | null;
  domain: string | null;
  url: string;
  provider?: string;
  videoId?: string;
};

function LinkPreview({
  url,
  isOwn,
  compact,
  onLongPress,
}: {
  url: string;
  isOwn: boolean;
  /** When true, card sits inside the bubble (no extra top margin). */
  compact?: boolean;
  onLongPress?: () => void;
}) {
  const youtubeId = parseYouTubeVideoId(url);
  const fallbackDomain = domainFromUrl(url);
  const { data } = useQuery<OgData>({
    queryKey: ["og-preview", url],
    queryFn: async () => {
      const authHeaders = await getAuthHeaders();
      const res = await fetch(
        `${getBackendUrl()}/api/og-preview?url=${encodeURIComponent(url)}`,
        { headers: { ...authHeaders } },
      );
      const json = await readJsonSafe<{ data: OgData }>(res);
      return json?.data as OgData;
    },
    staleTime: Infinity,
    retry: 1,
  });

  const isYouTube = Boolean(youtubeId || data?.provider === "youtube");
  const videoId = data?.videoId || youtubeId;
  const image =
    data?.image ||
    (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
  const domain = data?.domain || (isYouTube ? "youtube.com" : fallbackDomain);
  const favicon =
    data?.favicon ||
    (domain
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
      : null);
  const title =
    data?.title && data.title !== url
      ? data.title
      : isYouTube
        ? "YouTube video"
        : data?.title || fallbackDomain;
  const description =
    !isYouTube && data?.description && data.description !== title ? data.description : null;

  const cardWidth = isYouTube || image ? 260 : 240;
  const imageHeight = isYouTube ? 146 : 120;
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        marginTop: compact ? 0 : 6,
        borderRadius: compact ? 0 : 12,
        overflow: "hidden",
        backgroundColor: isOwn ? "#E0E7FF" : "#F8FAFC",
        borderWidth: compact ? 0 : 1,
        borderColor: isOwn ? "#C7D2FE" : "#E2E8F0",
        width: cardWidth,
      }}
      accessibilityRole="link"
      accessibilityLabel={isYouTube ? `Open YouTube video: ${title}` : `Open link: ${title}`}
    >
      {image ? (
        <View style={{ width: cardWidth, height: imageHeight, backgroundColor: "#0F172A" }}>
          <Image source={{ uri: image }} style={{ width: cardWidth, height: imageHeight }} resizeMode="cover" />
          {isYouTube ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: "rgba(15, 23, 42, 0.72)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Play size={22} color="#FFFFFF" fill="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          padding: 10,
          gap: 4,
          flexDirection: !image && !isYouTube ? "row" : "column",
          alignItems: !image && !isYouTube ? "center" : "stretch",
        }}
      >
        {!image && !isYouTube ? (
          <View
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              backgroundColor: isOwn ? "#EEF2FF" : "#FFFFFF",
              borderWidth: 1,
              borderColor: isOwn ? "#C7D2FE" : "#E2E8F0",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {favicon && !logoFailed ? (
              <Image
                source={{ uri: favicon }}
                style={{ width: 28, height: 28 }}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
              />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: "800", color: "#4361EE" }}>
                {(domain?.[0] ?? "L").toUpperCase()}
              </Text>
            )}
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {image && !isYouTube && favicon && !logoFailed ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <Image
                source={{ uri: favicon }}
                style={{ width: 14, height: 14, borderRadius: 3 }}
                resizeMode="contain"
                onError={() => setLogoFailed(true)}
              />
              <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "600" }} numberOfLines={1}>
                {domain}
              </Text>
            </View>
          ) : null}
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#0F172A" }} numberOfLines={2}>
            {title}
          </Text>
          {description ? (
            <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 15 }} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
          <Text style={{ fontSize: 11, color: "#64748B", fontWeight: "500" }}>
            {isYouTube ? "Tap to watch on YouTube" : `Tap to open · ${domain}`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

interface ChatMessageProps {
  id: string;
  content?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  replyTo?: {
    id: string;
    content?: string | null;
    mediaUrl?: string | null;
    mediaType?: string | null;
    sender: { id: string; name: string };
  } | null;
  reactions: MessageReaction[];
  senderName: string;
  senderInitial: string;
  senderImage?: string | null;
  createdAt: string;
  editedAt?: string | null;
  isOwn: boolean;
  currentUserId: string;
  onLongPress?: () => void;
  onReactionTap: (reactions: MessageReaction[]) => void;
  interactive?: boolean;
  bubbleRef?: RefObject<View | null>;
  hideBubble?: boolean;
  variant?: "default" | "overlay";
  anchorHeight?: number;
  /** Brief highlight after jumping to a pinned message. */
  highlighted?: boolean;
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
  content,
  mediaUrl,
  mediaType,
  replyTo,
  reactions,
  senderName,
  senderInitial,
  senderImage,
  createdAt,
  editedAt,
  isOwn,
  currentUserId,
  onReactionTap,
  onLongPress,
  interactive = true,
  bubbleRef,
  hideBubble = false,
  variant = "default",
  anchorHeight,
  highlighted = false,
}: ChatMessageProps) {
  const grouped = groupReactions(reactions);
  const hasReactions = grouped.length > 0;
  const [viewerVisible, setViewerVisible] = useState(false);
  const [videoThumb, setVideoThumb] = useState<string | null>(null);
  const { width: screenWidth } = useWindowDimensions();
  /** Stable bubble media width — avoid subpixel churn when layout settles. */
  const IMG_WIDTH = Math.min(Math.round(screenWidth * 0.62), 280);
  const MAX_IMG_HEIGHT = 320;
  /** Fixed 16:9 frame so videos don’t jump when the thumb loads or the menu opens. */
  const VIDEO_HEIGHT = Math.round((IMG_WIDTH * 9) / 16);
  /** Fixed 4:3 cover frame so photos don’t jump after measuring. */
  const PHOTO_HEIGHT = Math.round((IMG_WIDTH * 3) / 4);
  const firstUrl = content ? extractFirstUrl(content) : null;
  const displayContent = firstUrl && content ? stripPreviewUrl(content, firstUrl) : content;
  const showText = Boolean(displayContent?.trim());
  const linkPreviewCompact = Boolean(firstUrl) && !showText && !mediaUrl && !replyTo;
  const overlayTextBlockHeight = (showText ? 36 : 0) + (replyTo ? 52 : 0);
  const anchoredMediaHeight =
    anchorHeight && mediaUrl
      ? Math.min(MAX_IMG_HEIGHT, Math.max(PHOTO_HEIGHT, anchorHeight - overlayTextBlockHeight))
      : null;
  const imageFrameHeight =
    mediaType === "image" && anchoredMediaHeight ? anchoredMediaHeight : PHOTO_HEIGHT;
  const videoFrameHeight =
    mediaType === "video" && anchoredMediaHeight ? anchoredMediaHeight : VIDEO_HEIGHT;

  useEffect(() => {
    if (mediaType !== "video" || !mediaUrl) {
      setVideoThumb(null);
      return;
    }
    let cancelled = false;
    VideoThumbnails.getThumbnailAsync(mediaUrl, { time: 0 })
      .then((r) => {
        if (!cancelled) setVideoThumb(r.uri);
      })
      .catch(() => {
        if (!cancelled) setVideoThumb(null);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaUrl, mediaType]);

  const bubbleStyle = {
    backgroundColor: highlighted
      ? isOwn
        ? "#C7D2FE"
        : "#DBEAFE"
      : isOwn
        ? "#EEF2FF"
        : "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: highlighted ? 0.12 : 0.06,
    shadowRadius: highlighted ? 6 : 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: highlighted ? 3 : 1,
  } as const;

  const bubbleBody = (
    <>
      {replyTo ? (
        <View
          className={`px-3 pt-2.5 pb-1.5 border-l-4 mx-2 mt-2 rounded-lg flex-row items-center gap-2 ${isOwn ? "border-indigo-300 bg-indigo-100/60" : "border-blue-400 bg-blue-50"}`}
          style={{ minWidth: 160 }}
        >
          <View style={{ flex: 1 }}>
            <Text className={`text-xs font-semibold mb-0.5 ${isOwn ? "text-indigo-600" : "text-blue-600"}`}>
              {replyTo.sender.name}
            </Text>
            <Text className="text-xs text-slate-500" numberOfLines={1}>
              {replyTo.content ? replyTo.content : replyTo.mediaType === "video" ? "🎥 Video" : "📷 Photo"}
            </Text>
          </View>
          {replyTo.mediaUrl && replyTo.mediaType === "image" ? (
            <Image
              source={{ uri: replyTo.mediaUrl }}
              style={{ width: 40, height: 40, borderRadius: 6 }}
              resizeMode="cover"
            />
          ) : replyTo.mediaUrl && replyTo.mediaType === "video" ? (
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                backgroundColor: "#0F172A",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Play size={14} color="white" fill="white" />
            </View>
          ) : null}
        </View>
      ) : null}

      {mediaUrl ? (
        variant === "default" ? (
          <MediaThumbPressable
            onPress={() => setViewerVisible(true)}
            onLongPress={onLongPress}
            delayLongPress={400}
            style={{ maxWidth: IMG_WIDTH, overflow: "hidden", borderRadius: 12 }}
            testID="media-thumbnail"
          >
            {mediaType === "video" ? (
              <View
                style={{
                  position: "relative",
                  width: IMG_WIDTH,
                  height: videoFrameHeight,
                  backgroundColor: "#0F172A",
                }}
              >
                {videoThumb ? (
                  <Image
                    source={{ uri: videoThumb }}
                    style={{ width: IMG_WIDTH, height: videoFrameHeight }}
                    resizeMode="cover"
                  />
                ) : null}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
                    <Play size={20} color="white" fill="white" />
                  </View>
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: mediaUrl }}
                style={{ width: IMG_WIDTH, height: imageFrameHeight }}
                resizeMode="cover"
              />
            )}
          </MediaThumbPressable>
        ) : (
          <View className="overflow-hidden" style={{ maxWidth: IMG_WIDTH, borderRadius: 12 }}>
            {mediaType === "video" ? (
              <View
                style={{
                  position: "relative",
                  width: IMG_WIDTH,
                  height: videoFrameHeight,
                  backgroundColor: "#0F172A",
                }}
              >
                {videoThumb ? (
                  <Image
                    source={{ uri: videoThumb }}
                    style={{ width: IMG_WIDTH, height: videoFrameHeight }}
                    resizeMode="cover"
                  />
                ) : null}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <View className="w-12 h-12 rounded-full bg-black/50 items-center justify-center">
                    <Play size={20} color="white" fill="white" />
                  </View>
                </View>
              </View>
            ) : (
              <Image
                source={{ uri: mediaUrl }}
                style={{ width: IMG_WIDTH, height: imageFrameHeight }}
                resizeMode="cover"
              />
            )}
          </View>
        )
      ) : null}

      {showText ? (
        <Text
          className={`text-sm leading-5 px-4 ${replyTo || mediaUrl || firstUrl ? "pt-1.5 pb-2.5" : "py-2.5"} text-slate-900`}
        >
          {renderMentionText(
            displayContent!,
            currentUserId,
            { color: "#0F172A", fontSize: 14, lineHeight: 20 },
            isOwn
          )}
        </Text>
      ) : null}

      {firstUrl ? (
        <LinkPreview url={firstUrl} isOwn={isOwn} compact={linkPreviewCompact} onLongPress={onLongPress} />
      ) : null}
    </>
  );

  if (variant === "overlay") {
    return (
      <View
        collapsable={false}
        className={`rounded-2xl overflow-hidden ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
        style={{
          ...bubbleStyle,
          shadowOpacity: 0.12,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {bubbleBody}
      </View>
    );
  }

  return (
    <View>
      <View className={`flex-row mb-1 ${isOwn ? "justify-end" : "justify-start"}`}>
      {!isOwn && (
        <View className="mr-2 mt-1 flex-shrink-0">
          <UserAvatar
            user={{ name: senderName, image: senderImage }}
            size={32}
            radius={16}
            fontSize={12}
          />
        </View>
      )}

      <View className={`max-w-[75%] ${isOwn ? "items-end" : "items-start"}`}>
        <View
          className={`flex-row items-center mb-1 mx-1 gap-2 ${isOwn ? "justify-end" : "justify-start"}`}
          style={{ maxWidth: "100%" }}
        >
          {!isOwn ? (
            <Text className="text-xs text-slate-500 dark:text-slate-400 flex-shrink" numberOfLines={1}>
              {senderName}
            </Text>
          ) : null}
          <Text className="text-xs text-slate-400 flex-shrink-0">{formatTime(createdAt)}</Text>
          {editedAt ? <Text className="text-xs text-slate-400 flex-shrink-0">· edited</Text> : null}
        </View>

        <View
          style={{
            position: "relative",
            marginBottom: hasReactions ? 8 : 0,
            alignSelf: isOwn ? "flex-end" : "flex-start",
            maxWidth: "100%",
          }}
        >
          <View
            ref={bubbleRef}
            collapsable={false}
            style={hideBubble ? { opacity: 0 } : undefined}
          >
            {onLongPress ? (
              <Pressable
                onLongPress={onLongPress}
                delayLongPress={400}
                className={`rounded-2xl overflow-hidden ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                style={bubbleStyle}
              >
                {bubbleBody}
              </Pressable>
            ) : (
              <View
                className={`rounded-2xl overflow-hidden ${isOwn ? "rounded-tr-sm" : "rounded-tl-sm"}`}
                style={bubbleStyle}
              >
                {bubbleBody}
              </View>
            )}
          </View>

          {hasReactions ? (
            <View
              style={{
                position: "absolute",
                bottom: -9,
                right: isOwn ? 2 : 0,
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 3,
                zIndex: 2,
              }}
            >
              {grouped.map(({ emoji, count, userIds }) => (
                <TouchableOpacity
                  key={emoji}
                  onPress={() => onReactionTap(reactions)}
                  className={`flex-row items-center justify-center rounded-full border ${
                    userIds.includes(currentUserId)
                      ? "bg-indigo-100 border-indigo-300"
                      : "bg-white border-slate-200"
                  }`}
                  style={{
                    minWidth: count > 1 ? 24 : 20,
                    height: 20,
                    paddingHorizontal: count > 1 ? 4 : 0,
                    shadowColor: "#000",
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    shadowOffset: { width: 0, height: 1 },
                    elevation: 2,
                  }}
                >
                  <Text style={{ fontSize: 11, lineHeight: 13 }}>{emoji}</Text>
                  {count > 1 ? (
                    <Text
                      className={`text-[10px] ml-0.5 font-semibold ${userIds.includes(currentUserId) ? "text-indigo-600" : "text-slate-600"}`}
                    >
                      {count}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

      </View>

      {isOwn ? (
        <View className="ml-2 mt-1 flex-shrink-0">
          <UserAvatar
            user={{ name: senderName, image: senderImage }}
            size={32}
            radius={16}
            fontSize={12}
          />
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
  );
}
