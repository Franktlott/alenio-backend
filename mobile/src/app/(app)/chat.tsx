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
  StyleSheet,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Users, Plus, Pin, Search } from "lucide-react-native";
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
import { dmOtherParticipant, resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { typography } from "@/theme";

const PINNED_DMS_KEY = "pinned_dms";
const MAX_DM_PINS = 5;
type ConversationFilter = "all" | "unread" | "groups" | "direct";

const CONVERSATION_FILTERS: { key: ConversationFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "groups", label: "Groups" },
  { key: "direct", label: "Direct" },
];

const AVATAR = 34;
const PINNED_CIRCLE = 44;
/** Equal slots so at most 5 circles fit across the row. */
const PINNED_SLOT_PCT = 100 / MAX_DM_PINS;

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View
      style={{
        marginHorizontal: 14,
        marginTop: 1,
        marginBottom: 2,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[typography.sectionLabel, { marginBottom: 0, fontSize: 10, lineHeight: 12 }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[typography.sectionSubtitle, { fontSize: 10, lineHeight: 12 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

function ChatEmptyState({
  title,
  body,
  primaryLabel = "Add",
  onPrimary,
  secondaryLabel,
  onSecondary,
  testID,
}: {
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
        flex: 1,
        minHeight: 0,
        width: "100%",
        marginBottom: 4,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <Image
        source={require("@/assets/alenio-empty-chat-bubbles.png")}
        style={{
          width: 132,
          height: 132,
          marginBottom: 2,
          alignSelf: "center",
        }}
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
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [conversationFilter, setConversationFilter] =
    useState<ConversationFilter>("all");

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

  const conversationDisplayName = (conv: Conversation) => {
    if (conv.isGroup) {
      return conv.name ?? conv.participants?.map((p) => p.name ?? "").filter(Boolean).join(", ") ?? "Group";
    }
    const otherUser = avatarUser(dmOtherParticipant(conv, session?.user?.id ?? ""));
    return otherUser?.name?.trim() || otherUser?.email?.trim() || "Direct Message";
  };

  const matchesSearch = (conv: Conversation) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const name = conversationDisplayName(conv).toLowerCase();
    const workspace = (groupWorkspaceLabel(conv.workspaceContext) ?? "").toLowerCase();
    return name.includes(q) || workspace.includes(q);
  };

  const matchesConversationFilter = (conv: Conversation) => {
    if (conversationFilter === "unread") {
      return getDmUnreadCount(dmUnreadCounts, conv.id) > 0;
    }
    if (conversationFilter === "groups") return conv.isGroup;
    if (conversationFilter === "direct") return !conv.isGroup;
    return true;
  };

  const activityTime = (conv: Conversation) =>
    new Date(conv.lastMessage?.createdAt ?? conv.updatedAt).getTime();

  const sortInbox = (list: Conversation[]) =>
    [...list].sort((a, b) => {
      const aUnread = getDmUnreadCount(dmUnreadCounts, a.id) > 0 ? 1 : 0;
      const bUnread = getDmUnreadCount(dmUnreadCounts, b.id) > 0 ? 1 : 0;
      if (aUnread !== bUnread) return bUnread - aUnread;
      return activityTime(b) - activityTime(a);
    });

  const filteredConversations = sortInbox(
    conversations.filter(matchesSearch).filter(matchesConversationFilter),
  );

  const pinnedConversations = pinnedIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => !!c)
    .filter(matchesSearch)
    .filter(matchesConversationFilter)
    .slice(0, MAX_DM_PINS);

  const listConversations = filteredConversations.filter((c) => !pinnedIds.includes(c.id));

  const openDm = (conv: Conversation) => {
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = conversationDisplayName(conv);
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

  const renderPinnedCircle = (conv: Conversation) => {
    const unreadCount = getDmUnreadCount(dmUnreadCounts, conv.id);
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = conversationDisplayName(conv);
    const groupWorkspace = isGroup ? groupWorkspaceLabel(conv.workspaceContext) : null;

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
        <View style={{ width: PINNED_CIRCLE, height: PINNED_CIRCLE, marginBottom: 2 }}>
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
                <Users size={15} color="#7C3AED" />
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
                fontSize={11}
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
              <MessageCircle size={15} color="#4361EE" />
            </View>
          )}
          {unreadCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -1,
                right: -1,
                backgroundColor: "#4361EE",
                borderRadius: 9,
                minWidth: 18,
                height: 18,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
                borderWidth: 2,
                borderColor: "#FFFFFF",
              }}
            >
              <Text style={{ color: "white", fontSize: 9, fontWeight: "700" }}>
                {unreadCount > 9 ? "9+" : unreadCount}
              </Text>
            </View>
          ) : (
            <View
              style={{
                position: "absolute",
                bottom: -1,
                right: -1,
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: "#4338CA",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 2,
                borderColor: "#FFFFFF",
              }}
            >
              <Pin size={7} color="white" fill="white" />
            </View>
          )}
        </View>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "700",
            color: "#0F172A",
            textAlign: "center",
            width: "100%",
            lineHeight: 12,
            marginTop: 1,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {displayName}
        </Text>
        <Text
          style={{
            fontSize: 8,
            fontWeight: "500",
            color: isGroup ? "#6366F1" : "#94A3B8",
            textAlign: "center",
            width: "100%",
            lineHeight: 10,
            marginTop: 0,
          }}
          numberOfLines={1}
        >
          {isGroup ? groupWorkspace || "Group" : "Direct"}
        </Text>
      </Pressable>
    );
  };

  const renderDmCard = (conv: Conversation, isLast: boolean) => {
    const unreadCount = getDmUnreadCount(dmUnreadCounts, conv.id);
    const isGroup = conv.isGroup;
    const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
    const displayName = conversationDisplayName(conv);
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
        style={{
          paddingHorizontal: 14,
          paddingVertical: 8,
          backgroundColor: "#FFFFFF",
          borderBottomWidth: isLast ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: "#EEF2F7",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {isGroup ? (
            resolveUserImageUrl(conv.image) ? (
              <Image
                source={{ uri: resolveUserImageUrl(conv.image)! }}
                style={{ width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, flexShrink: 0 }}
                resizeMode="cover"
              />
            ) : (
              <View
                style={{
                  width: AVATAR,
                  height: AVATAR,
                  borderRadius: AVATAR / 2,
                  backgroundColor: "#F5F3FF",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Users size={16} color="#7C3AED" />
              </View>
            )
          ) : otherUser ? (
            <UserAvatar
              user={otherUser}
              size={AVATAR}
              radius={AVATAR / 2}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={14}
            />
          ) : (
            <View
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: "#EEF2FF",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MessageCircle size={16} color="#4361EE" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: unreadCount > 0 ? "700" : "600",
                  color: "#0F172A",
                  flex: 1,
                  letterSpacing: -0.2,
                }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text style={{ fontSize: 10, color: "#94A3B8", marginLeft: 8, flexShrink: 0 }}>{timeStr}</Text>
            </View>
            {isGroup && groupWorkspace ? (
              <Text style={{ fontSize: 11, fontWeight: "600", color: "#4361EE", marginBottom: 1 }} numberOfLines={1}>
                {groupWorkspace}
              </Text>
            ) : !isGroup ? (
              <Text style={{ fontSize: 11, fontWeight: "500", color: "#94A3B8", marginBottom: 1 }} numberOfLines={1}>
                Direct message
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: "#64748B", flex: 1 }} numberOfLines={1}>
                {lastMsg
                  ? `${lastMsg.sender.id === session?.user?.id ? "You" : (lastMsg.sender.name?.trim().split(/\s+/)[0] || "Someone")}: ${
                      lastMsg.content?.trim() || "Attachment"
                    }`
                  : "No messages yet"}
              </Text>
              {unreadCount > 0 ? (
                <View
                  style={{
                    backgroundColor: "#4361EE",
                    borderRadius: 10,
                    minWidth: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 6,
                    marginLeft: 8,
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveInboxFilter = hasActiveSearch || conversationFilter !== "all";

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Chat"
      subtitle="All conversations in one place"
      testID="chat-screen"
      headerTestID="chat-header"
      rightAction={
        activeTeamId ? (
          <HeaderAddButton
            onPress={() => setShowAddModal(true)}
            accessibilityLabel="Add conversation"
            testID="chat-header-add-button"
          />
        ) : null
      }
      overlays={
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
          title="Message someone"
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
          title="Create group"
          subtitle="Start a group when your team needs one"
          onPress={() => {
            setShowAddModal(false);
            router.push("/create-group");
          }}
          testID="add-modal-new-group"
        />
      </AlenioBottomSheet>
      }
    >
      <View style={styles.chatColumns}>
          <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
            <View style={styles.searchBar}>
              <Search size={13} color="#94A3B8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search conversations"
                placeholderTextColor="#94A3B8"
                style={{ flex: 1, fontSize: 12, color: "#0F172A", padding: 0 }}
                testID="chat-search-input"
                autoCorrect={false}
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.filterRow}>
            {CONVERSATION_FILTERS.map((option) => {
              const selected = conversationFilter === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => setConversationFilter(option.key)}
                  style={[styles.filterChip, selected ? styles.filterChipSelected : null]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  testID={`chat-filter-${option.key}`}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selected ? styles.filterChipTextSelected : null,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {pinnedConversations.length > 0 ? (
            <View style={{ flexShrink: 0, paddingTop: 2, paddingBottom: 2 }} testID="pinned-conversations-section">
              <SectionHeader title="Pinned" subtitle="Hold a circle to unpin" />
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "flex-start",
                  paddingHorizontal: 8,
                  paddingTop: 2,
                  paddingBottom: 4,
                }}
              >
                {pinnedConversations.map((conv) => renderPinnedCircle(conv))}
              </View>
            </View>
          ) : null}

          <View style={{ flex: 1, minHeight: 0, paddingTop: 2 }}>
            <SectionHeader
              title="Messages"
              subtitle={
                conversationsLoading
                  ? "Loading conversations…"
                  : conversationsError
                    ? "Couldn’t load conversations"
                    : listConversations.length === 0 && pinnedConversations.length > 0 && !hasActiveInboxFilter
                      ? "All conversations are pinned above"
                      : conversations.length === 0
                        ? "Direct messages & groups"
                        : `${listConversations.length} conversation${listConversations.length === 1 ? "" : "s"}`
              }
            />
            <ScrollView
              style={{ flex: 1, minHeight: 0 }}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingBottom: 24,
                flexGrow: conversations.length === 0 || listConversations.length === 0 ? 1 : undefined,
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
                  title="Start a conversation"
                  body="Message a teammate or create a group when your team needs one."
                  primaryLabel="New conversation"
                  onPrimary={() => setShowAddModal(true)}
                />
              ) : listConversations.length === 0 ? (
                <ChatEmptyState
                  testID={hasActiveInboxFilter ? "conversations-filter-empty" : "conversations-all-pinned-empty"}
                  title={hasActiveInboxFilter ? "No matches" : "All pinned above"}
                  body={
                    hasActiveInboxFilter
                      ? "Try a different search or filter."
                      : "Your conversations are in Pinned. Tap “+” to start a new one."
                  }
                  primaryLabel={hasActiveInboxFilter ? "Clear filters" : "New conversation"}
                  onPrimary={() => {
                    if (hasActiveInboxFilter) {
                      setSearchQuery("");
                      setConversationFilter("all");
                      return;
                    }
                    setShowAddModal(true);
                  }}
                />
              ) : (
                <View style={{ backgroundColor: "#FFFFFF" }}>
                  {listConversations.map((conv, index) =>
                    renderDmCard(conv, index === listConversations.length - 1),
                  )}
                </View>
              )}
            </ScrollView>
            {conversations.length > 0 ? (
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
                  paddingBottom: 8,
                }}
              >
                Long press a chat or group to pin it to the top
              </Text>
            ) : null}
          </View>
        </View>
    </CurvedTabLayout>
  );
}

const styles = StyleSheet.create({
  chatColumns: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  filterChip: {
    flex: 1,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  filterChipSelected: {
    backgroundColor: "#4361EE",
  },
  filterChipText: {
    color: "#64748B",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
  },
  filterChipTextSelected: {
    color: "#FFFFFF",
  },
});
