import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Users, Plus, Pin } from "lucide-react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore, buildDmLastReadMap, getDmUnreadCount } from "@/lib/state/unread-store";
import type { Conversation, Team } from "@/lib/types";
import { NoWorkspaceRedirect } from "@/components/NoWorkspaceRedirect";
import { tabBarClearance } from "@/lib/tab-bar";
import { dmOtherParticipant, resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { AppTabHeader } from "@/components/AppTabHeader";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { WorkspacesSection } from "@/components/WorkspacesSection";

const PINNED_DMS_KEY = "pinned_dms";
const MAX_DM_PINS = 5;

const cardStyle = {
  marginHorizontal: 12,
  marginBottom: 4,
  backgroundColor: "#FFFFFF",
  borderRadius: 9,
  paddingVertical: 7,
  paddingHorizontal: 10,
  borderWidth: 1,
  borderColor: "#E9EDF2",
} as const;

const AVATAR = 28;
const PINNED_CIRCLE = 42;
/** Equal slots so at most 5 circles fit across the row. */
const PINNED_SLOT_PCT = 100 / MAX_DM_PINS;

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 2,
        marginBottom: 4,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#64748B",
            letterSpacing: 0.7,
            textTransform: "uppercase",
            marginBottom: 1,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 11, color: "#94A3B8", lineHeight: 14 }} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {right}
    </View>
  );
}

function ChatEmptyState({
  image,
  title,
  body,
  primaryLabel = "Add",
  onPrimary,
  secondaryLabel,
  onSecondary,
  testID,
}: {
  image: number;
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        width: "100%",
        marginBottom: 4,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Image
        source={image}
        style={{ width: 72, height: 72, marginBottom: 8, alignSelf: "center" }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: 14,
          fontWeight: "700",
          color: "#0F172A",
          textAlign: "center",
          alignSelf: "center",
          letterSpacing: -0.2,
          marginBottom: 4,
          width: "100%",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: "#64748B",
          textAlign: "center",
          alignSelf: "center",
          lineHeight: 16,
          maxWidth: 260,
          marginBottom: onPrimary ? 10 : 0,
          width: "100%",
        }}
      >
        {body}
      </Text>
      {onPrimary ? (
        <Pressable
          onPress={onPrimary}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            gap: 4,
            backgroundColor: "#4361EE",
            borderRadius: 9,
            paddingHorizontal: 14,
            paddingVertical: 8,
            minWidth: 120,
          }}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          testID="messages-empty-add"
        >
          <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          style={{ paddingVertical: 8, marginTop: 2 }}
        >
          <Text style={{ color: "#4361EE", fontSize: 12, fontWeight: "600" }}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const setActiveTeamId = useTeamStore((s) => s.setActiveTeamId);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const val = await AsyncStorage.getItem(PINNED_DMS_KEY);
        if (cancelled) return;
        if (val) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              setPinnedIds(
                parsed
                  .filter((id): id is string => typeof id === "string" && !id.startsWith("team:"))
                  .slice(0, MAX_DM_PINS),
              );
            }
          } catch {
            // ignore corrupt pin cache
          }
        }
      } finally {
        if (!cancelled) setPinsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pinsReady) return;
    void AsyncStorage.setItem(PINNED_DMS_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds, pinsReady]);

  const togglePin = async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (pinnedIds.includes(id)) {
      setPinnedIds((prev) => prev.filter((x) => x !== id));
      toast({ title: "Unpinned", preset: "done" });
      return;
    }
    if (pinnedIds.length >= MAX_DM_PINS) {
      toast({ title: `Maximum ${MAX_DM_PINS} pins reached`, preset: "error" });
      return;
    }
    setPinnedIds((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_DM_PINS));
    toast({ title: "Pinned to top", preset: "done" });
  };

  const { data: teamDetail } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  // DM conversations
  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    isError: conversationsError,
    error: conversationsLoadError,
    refetch: refetchConversations,
  } = useQuery<Conversation[]>({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    refetchInterval: 5000,
  });

  const dmLastReadIds = buildDmLastReadMap(conversations, lastReadIds);
  const { data: dmUnreadCounts = {} } = useQuery({
    queryKey: ["dm-unread-counts", dmLastReadIds],
    queryFn: () => api.post<Record<string, number>>("/api/dms/unread-counts", { lastReadIds: dmLastReadIds }),
    enabled: conversations.length > 0 && !!session?.user,
    refetchInterval: 5000,
    staleTime: 0,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dms"] });
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    await queryClient.invalidateQueries({ queryKey: ["topics", activeTeamId] });
    setRefreshing(false);
  };

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "transparent" }} edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  const members = teamDetail?.members ?? [];
  const avatarUser = (
    user: { id?: string; name?: string | null; email?: string | null; image?: string | null } | null | undefined,
  ) => {
    if (!user) return null;
    const fromTeam = user.id
      ? members.find((m) => m.user.id === user.id || m.userId === user.id)?.user
      : null;
    return {
      ...user,
      image: resolveUserImageUrl(user.image) ?? resolveUserImageUrl(fromTeam?.image) ?? user.image ?? fromTeam?.image ?? null,
    };
  };

  const sortedUnpinnedDms = [...conversations]
    .filter((c) => !pinnedIds.includes(c.id))
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.updatedAt;
      const bTime = b.lastMessage?.createdAt ?? b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  const pinnedConversations = pinnedIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => !!c)
    .slice(0, MAX_DM_PINS);

  const openDm = (conv: Conversation) => {
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = isGroup
      ? (conv.name ?? conv.participants?.map((p) => p.name ?? "").filter(Boolean).join(", ") ?? "Group")
      : (otherUser?.name?.trim() || otherUser?.email?.trim() || "Direct Message");
    router.push({
      pathname: "/dm-chat",
      params: {
        conversationId: conv.id,
        recipientName: displayName,
        recipientImage: isGroup
          ? (resolveUserImageUrl(conv.image) ?? "")
          : (resolveUserImageUrl(otherUser?.image) ?? ""),
        isGroup: isGroup ? "true" : "false",
      },
    });
  };

  const shortName = (name: string) => {
    const first = name.trim().split(/\s+/)[0];
    return first || name;
  };

  const renderPinnedCircle = (conv: Conversation) => {
    const unreadCount = getDmUnreadCount(dmUnreadCounts, conv.id);
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = isGroup
      ? (conv.name ?? conv.participants?.map((p) => p.name ?? "").filter(Boolean).join(", ") ?? "Group")
      : (otherUser?.name?.trim() || otherUser?.email?.trim() || "Chat");
    const label = shortName(displayName);

    return (
      <Pressable
        key={conv.id}
        testID={`pinned-dm-${conv.id}`}
        onPress={() => openDm(conv)}
        onLongPress={() => togglePin(conv.id)}
        delayLongPress={350}
        style={{
          width: `${PINNED_SLOT_PCT}%`,
          alignItems: "center",
          paddingHorizontal: 2,
        }}
      >
        <View style={{ width: PINNED_CIRCLE, height: PINNED_CIRCLE, marginBottom: 3 }}>
          {isGroup ? (
            resolveUserImageUrl(conv.image) ? (
              <View
                style={{
                  width: PINNED_CIRCLE,
                  height: PINNED_CIRCLE,
                  borderRadius: PINNED_CIRCLE / 2,
                  borderWidth: 1.5,
                  borderColor: "#C4B5FD",
                  overflow: "hidden",
                }}
              >
                <Image
                  source={{ uri: resolveUserImageUrl(conv.image)! }}
                  style={{ width: PINNED_CIRCLE - 3, height: PINNED_CIRCLE - 3 }}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View
                style={{
                  width: PINNED_CIRCLE,
                  height: PINNED_CIRCLE,
                  borderRadius: PINNED_CIRCLE / 2,
                  backgroundColor: "#F5F3FF",
                  borderWidth: 1.5,
                  borderColor: "#C4B5FD",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Users size={17} color="#7C3AED" />
              </View>
            )
          ) : otherUser ? (
            <View
              style={{
                borderRadius: PINNED_CIRCLE / 2,
                borderWidth: 1.5,
                borderColor: "#A5B4FC",
                overflow: "hidden",
              }}
            >
              <UserAvatar
                user={otherUser}
                size={PINNED_CIRCLE - 3}
                radius={(PINNED_CIRCLE - 3) / 2}
                backgroundColor="#EEF2FF"
                textColor="#4361EE"
                fontSize={13}
              />
            </View>
          ) : (
            <View
              style={{
                width: PINNED_CIRCLE,
                height: PINNED_CIRCLE,
                borderRadius: PINNED_CIRCLE / 2,
                backgroundColor: "#EEF2FF",
                borderWidth: 1.5,
                borderColor: "#A5B4FC",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MessageCircle size={17} color="#4361EE" />
            </View>
          )}
          {unreadCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -1,
                right: -1,
                backgroundColor: "#EF4444",
                borderRadius: 7,
                minWidth: 14,
                height: 14,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 3,
                borderWidth: 1.5,
                borderColor: "#F8F9FC",
              }}
            >
              <Text style={{ color: "white", fontSize: 8, fontWeight: "700" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : (
            <View
              style={{
                position: "absolute",
                bottom: -1,
                right: -1,
                width: 15,
                height: 15,
                borderRadius: 8,
                backgroundColor: "#4338CA",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#F8F9FC",
              }}
            >
              <Pin size={7} color="white" fill="white" />
            </View>
          )}
        </View>
        <Text
          style={{ fontSize: 10, fontWeight: "600", color: "#334155", textAlign: "center", width: "100%" }}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    );
  };

  const renderDmCard = (conv: Conversation) => {
    const unreadCount = getDmUnreadCount(dmUnreadCounts, conv.id);
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = isGroup
      ? (conv.name ?? conv.participants?.map((p) => p.name ?? "").filter(Boolean).join(", ") ?? "Group")
      : (otherUser?.name?.trim() || otherUser?.email?.trim() || "Direct Message");
    const groupWorkspace = isGroup ? groupWorkspaceLabel(conv.workspaceContext) : null;
    const lastMsg = conv.lastMessage;
    const timeStr = lastMsg ? formatTime(lastMsg.createdAt) : (conv.updatedAt ? formatTime(conv.updatedAt) : "");

    return (
      <Pressable
        key={conv.id}
        testID={`dm-card-${conv.id}`}
        onPress={() => openDm(conv)}
        onLongPress={() => togglePin(conv.id)}
        delayLongPress={350}
        style={cardStyle}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isGroup ? (
            resolveUserImageUrl(conv.image) ? (
              <Image
                source={{ uri: resolveUserImageUrl(conv.image)! }}
                style={{ width: AVATAR, height: AVATAR, borderRadius: 8, flexShrink: 0 }}
                resizeMode="cover"
              />
            ) : (
              <View style={{ width: AVATAR, height: AVATAR, borderRadius: 8, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Users size={14} color="#7C3AED" />
              </View>
            )
          ) : otherUser ? (
            <UserAvatar
              user={otherUser}
              size={AVATAR}
              radius={8}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={12}
            />
          ) : (
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: 8, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MessageCircle size={14} color="#4361EE" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#0F172A", flex: 1 }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={{ fontSize: 9, color: "#94A3B8", marginLeft: 6, flexShrink: 0 }}>{timeStr}</Text>
            </View>
            {groupWorkspace ? (
              <Text style={{ fontSize: 9, fontWeight: "600", color: "#6366F1", marginBottom: 1 }} numberOfLines={1}>
                {groupWorkspace}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 11, color: "#6B7280", flex: 1 }} numberOfLines={1}>
                {lastMsg
                  ? `${lastMsg.sender.id === session?.user?.id ? "You" : (lastMsg.sender.name?.trim().split(/\s+/)[0] || "Someone")}: ${
                      lastMsg.content?.trim() || "Attachment"
                    }`
                  : "No messages yet"}
              </Text>
              {unreadCount > 0 ? (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 8, minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, marginLeft: 6, flexShrink: 0 }}>
                  <Text style={{ color: "white", fontSize: 9, fontWeight: "700" }}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView testID="chat-screen" style={{ flex: 1, backgroundColor: "transparent" }} edges={[]}>
      <AppTabHeader
        topInset={insets.top}
        testID="chat-header"
        rightAction={
          activeTeamId ? (
            <Pressable
              onPress={() => setShowAddModal(true)}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}
              testID="chat-header-add-button"
            >
              <Plus size={13} color="white" />
              <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Add</Text>
            </Pressable>
          ) : null
        }
      />

      <View style={{ flex: 1, minHeight: 0, paddingBottom: tabBarClearance(insets.bottom, 0) }}>
        <View style={{ flex: 1, minHeight: 0 }}>
        {/* Pinned — always above Messages; empty hint or avatar circles */}
        <View style={{ flexShrink: 0, paddingTop: 6, paddingBottom: 2 }} testID="pinned-conversations-section">
          <SectionHeader
            title="Pinned"
            subtitle={
              pinnedConversations.length > 0
                ? "Hold a circle to unpin"
                : "Quick access at the top"
            }
          />
          {pinnedConversations.length > 0 ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                paddingHorizontal: 8,
                paddingTop: 1,
                paddingBottom: 4,
              }}
            >
              {pinnedConversations.map((conv) => renderPinnedCircle(conv))}
            </View>
          ) : (
            <View
              style={{
                marginHorizontal: 12,
                marginBottom: 2,
                backgroundColor: "#FFFFFF",
                borderRadius: 9,
                borderWidth: 1,
                borderColor: "#E9EDF2",
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 8,
                gap: 9,
              }}
              testID="pinned-conversations-empty"
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 7,
                  backgroundColor: "#F3E8FF",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Pin size={13} color="#7C3AED" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color: "#0F172A",
                    letterSpacing: -0.1,
                    marginBottom: 1,
                  }}
                >
                  No pinned conversations
                </Text>
                <Text style={{ fontSize: 11, color: "#64748B", lineHeight: 14 }} numberOfLines={2}>
                  Pin conversations for quick access at the top of your list.
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Messages panel — unpinned direct messages + groups */}
        <View style={{ flex: 3, minHeight: 0, flexBasis: 0, paddingTop: 4 }}>
          <SectionHeader
            title="Messages"
            subtitle={
              conversationsLoading
                ? "Loading conversations…"
                : conversationsError
                  ? "Couldn’t load conversations"
                : sortedUnpinnedDms.length === 0 && pinnedConversations.length > 0
                  ? "All conversations are pinned above"
                  : conversations.length === 0
                    ? "Direct & group conversations"
                    : `${sortedUnpinnedDms.length} conversation${sortedUnpinnedDms.length === 1 ? "" : "s"}`
            }
          />
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingBottom: 6,
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" />}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {conversationsLoading ? (
              <View style={{ paddingVertical: 16, alignItems: "center" }}>
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : conversationsError ? (
              <View
                style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 20 }}
                testID="conversations-error-state"
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#64748B", textAlign: "center" }}>
                  Couldn&apos;t load conversations
                </Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 6, textAlign: "center" }}>
                  {conversationsLoadError instanceof Error
                    ? conversationsLoadError.message
                    : "Please try again."}
                </Text>
                <TouchableOpacity
                  onPress={() => void refetchConversations()}
                  testID="conversations-error-retry"
                  style={{
                    marginTop: 12,
                    backgroundColor: "#4361EE",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 13 }}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : conversations.length === 0 ? (
              <ChatEmptyState
                testID="conversations-empty-state"
                image={require("@/assets/dm-empty-start.png")}
                title="No messages yet"
                body={'No conversations yet. Tap “+ Add” to message a teammate.'}
                primaryLabel="Add"
                onPrimary={() => setShowAddModal(true)}
              />
            ) : sortedUnpinnedDms.length === 0 ? (
              <ChatEmptyState
                testID="conversations-all-pinned-empty"
                image={require("@/assets/dm-empty-start.png")}
                title="All pinned above"
                body="Your conversations are in Pinned. Tap “+ Add” to start a new one."
                primaryLabel="Add"
                onPrimary={() => setShowAddModal(true)}
              />
            ) : (
              sortedUnpinnedDms.map((conv) => renderDmCard(conv))
            )}
          </ScrollView>
          <Text
            testID="pin-hint-footer"
            style={{
              flexShrink: 0,
              textAlign: "center",
              fontSize: 10,
              lineHeight: 13,
              color: "#94A3B8",
              paddingHorizontal: 20,
              paddingTop: 2,
              paddingBottom: 4,
            }}
          >
            Hold a conversation to pin up to {MAX_DM_PINS} at the top
          </Text>
        </View>

        {/* Workspaces panel — team chats + channels for every workspace */}
        <View style={{ flex: 2, minHeight: 0, flexBasis: 0, borderTopWidth: 1, borderTopColor: "#E8ECF1" }}>
          <WorkspacesSection
            activeTeamId={activeTeamId}
            onSelectTeam={setActiveTeamId}
            cardStyle={cardStyle}
          />
        </View>
        </View>

      </View>

      {/* Add / New Conversation modal */}
      <AlenioBottomSheet
        visible={showAddModal}
        title="New Conversation"
        onClose={() => setShowAddModal(false)}
        compact
        testID="chat-new-conversation-sheet"
        footer={
          <Pressable onPress={() => setShowAddModal(false)} style={alenioSheetStyles.cancelButton}>
            <Text style={alenioSheetStyles.cancelButtonText}>Cancel</Text>
          </Pressable>
        }
      >
        <AlenioSheetOption
          icon={<MessageCircle size={16} color="white" />}
          title="Direct Message"
          subtitle="Send a private message to a teammate"
          onPress={() => {
            setShowAddModal(false);
            router.push("/new-dm");
          }}
          testID="add-modal-new-dm"
        />
        <AlenioSheetOption
          icon={<Users size={16} color="white" />}
          iconColor="#7C3AED"
          tint="purple"
          title="New Group"
          subtitle="Create a group conversation"
          onPress={() => {
            setShowAddModal(false);
            router.push("/create-group");
          }}
          testID="add-modal-new-group"
        />
      </AlenioBottomSheet>
    </SafeAreaView>
  );
}
