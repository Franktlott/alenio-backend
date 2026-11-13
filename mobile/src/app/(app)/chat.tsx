import React, { useCallback, useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
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
import { MessageCircle, Users, Plus, Pin, Search, X } from "lucide-react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { formatConversationTime } from "@/lib/format-conversation-time";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore, buildDmLastReadMap, getDmUnreadCount } from "@/lib/state/unread-store";
import type { Conversation, Team } from "@/lib/types";
import { dmOtherParticipant, resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { CurvedTabLayout } from "@/components/CurvedTabLayout";
import { DmThread } from "@/app/dm-chat";
import {
  MASTER_PANE_WIDTH,
  PANE_GAP,
  useAdaptiveLayout,
} from "@/lib/adaptive-layout";
import { AlenioHeaderBrand } from "@/components/AlenioHeaderBrand";
import { HeaderAddButton } from "@/components/HeaderAddButton";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { palette, typography } from "@/theme";
import { useTabBarClearanceFn } from "@/lib/tab-bar";

const PINNED_DMS_KEY = "pinned_dms";
const MAX_DM_PINS = 5;

const AVATAR = 44;
const PINNED_CIRCLE = 54;
/** The search dock CurvedTabLayout draws, which the split layout draws itself. */
const SEARCH_DOCK_HEIGHT = 40;
const SEARCH_DOCK_TOP = 12;
const SEARCH_DOCK_BOTTOM = 6;
/** Height of the conversation header the thread pane opens with. */
const THREAD_HEADER_HEIGHT = 54;
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
        marginHorizontal: 16,
        marginTop: 6,
        marginBottom: 5,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={[
            typography.sectionLabel,
            {
              marginBottom: 0,
              fontSize: 11,
              lineHeight: 14,
              letterSpacing: 0.8,
              color: "#7E899A",
            },
          ]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              typography.sectionSubtitle,
              { marginTop: 2, fontSize: 12, lineHeight: 16, color: "#98A2B3" },
            ]}
            numberOfLines={1}
          >
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
  discovery = false,
}: {
  title: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
  discovery?: boolean;
}) {
  if (discovery) {
    return (
      <View testID={testID} style={styles.discoveryEmpty}>
        <ConversationArtwork />

        <Text style={styles.discoveryTitle}>{title}</Text>
        <Text style={styles.discoveryBody}>{body}</Text>
        <View style={styles.discoveryTitleAccent} />
      </View>
    );
  }

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
        paddingHorizontal: discovery ? 28 : 16,
        paddingVertical: discovery ? 20 : 14,
      }}
    >
      <View
        style={[
          styles.emptyIllustration,
          discovery ? styles.emptyDiscoveryIllustration : null,
        ]}
        accessibilityElementsHidden
        testID="chat-empty-illustration"
      >
        <View style={styles.emptyAccentOne} />
        <View style={styles.emptyAccentTwo} />
        <View style={styles.emptyBackBubble}>
          <View style={styles.emptyBackTail} />
          <View style={styles.emptyDots}>
            <View style={[styles.emptyDot, styles.emptyBackDot]} />
            <View style={[styles.emptyDot, styles.emptyBackDot]} />
            <View style={[styles.emptyDot, styles.emptyBackDot]} />
          </View>
        </View>
        <View style={styles.emptyFrontBubble}>
          <View style={styles.emptyFrontTail} />
          <View style={styles.emptyDots}>
            <View style={[styles.emptyDot, styles.emptyFrontDot]} />
            <View style={[styles.emptyDot, styles.emptyFrontDot]} />
            <View style={[styles.emptyDot, styles.emptyFrontDot]} />
          </View>
        </View>
      </View>
      <Text
        style={{
          fontSize: discovery ? 21 : 14,
          lineHeight: discovery ? 25 : 18,
          fontWeight: "700",
          color: "#0F172A",
          textAlign: "center",
          alignSelf: "center",
          letterSpacing: discovery ? -0.5 : -0.2,
          marginBottom: discovery ? 6 : 4,
          width: "100%",
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: discovery ? 12 : 12,
          color: "#64748B",
          textAlign: "center",
          alignSelf: "center",
          lineHeight: discovery ? 17 : 16,
          maxWidth: discovery ? 280 : 260,
          marginBottom: onPrimary ? (discovery ? 20 : 10) : 0,
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
            gap: discovery ? 9 : 4,
            backgroundColor: "#6d28d9",
            borderRadius: discovery ? 10 : 9,
            paddingHorizontal: discovery ? 18 : 14,
            paddingVertical: discovery ? 0 : 8,
            width: discovery ? "100%" : undefined,
            maxWidth: discovery ? 320 : undefined,
            height: discovery ? 46 : undefined,
            minWidth: discovery ? undefined : 120,
          }}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          testID="messages-empty-add"
        >
          {discovery ? (
            <Search size={17} color="#FFFFFF" strokeWidth={2.2} />
          ) : (
            <Plus size={13} color="#FFFFFF" strokeWidth={2.5} />
          )}
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: discovery ? 14 : 13,
              fontWeight: "700",
            }}
          >
            {primaryLabel}
          </Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          style={{ paddingVertical: 8, marginTop: 2 }}
        >
          <Text style={{ color: "#6d28d9", fontSize: 12, fontWeight: "600" }}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function ConversationArtwork() {
  return (
    <View style={styles.discoveryConversationArtSlot}>
      <View
        style={styles.discoveryConversationArt}
        accessibilityElementsHidden
        testID="chat-empty-illustration"
      >
        <View style={styles.chatArtGlow} />
        <View style={styles.chatArtPath} />
        <View style={[styles.chatArtSpark, styles.chatArtSparkTop]} />
        <View style={[styles.chatArtSpark, styles.chatArtSparkBottom]} />

        <View style={[styles.chatArtBubble, styles.chatArtBubbleTop]}>
          <View style={styles.chatArtBubbleDots}>
            <View style={styles.chatArtBubbleDot} />
            <View style={styles.chatArtBubbleDot} />
            <View style={styles.chatArtBubbleDot} />
          </View>
        </View>
        <View style={[styles.chatArtBubble, styles.chatArtBubbleBottom]}>
          <View style={styles.chatArtBubbleDots}>
            <View style={[styles.chatArtBubbleDot, styles.chatArtBubbleDotPurple]} />
            <View style={[styles.chatArtBubbleDot, styles.chatArtBubbleDotPurple]} />
            <View style={[styles.chatArtBubbleDot, styles.chatArtBubbleDotPurple]} />
          </View>
        </View>

        <View style={[styles.chatArtPhotoFrame, styles.chatArtPhotoTop]}>
          <Image
            source={require("../../assets/connection-person-woman-teal.png")}
            style={styles.chatArtPhoto}
          />
        </View>
        <View style={[styles.chatArtPhotoFrame, styles.chatArtPhotoBottom]}>
          <Image
            source={require("../../assets/connection-person-man.png")}
            style={styles.chatArtPhoto}
          />
        </View>
      </View>
    </View>
  );
}

function InboxEmptyState() {
  return (
    <View style={styles.inboxEmpty} testID="conversations-empty-state">
      <View style={styles.inboxEmptyIcon}>
        <MessageCircle size={17} color="#25314D" strokeWidth={2} />
      </View>
      <Text style={styles.inboxEmptyTitle}>No conversations yet</Text>
      <Text style={styles.inboxEmptyBody}>New messages will appear here.</Text>
    </View>
  );
}

function ChatWelcomeState({
  onFindPeople,
  testID = "chat-welcome-empty-state",
}: {
  onFindPeople: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.chatWelcome} testID={testID}>
      <ConversationArtwork />
      <Text style={styles.discoveryTitle}>Start a conversation</Text>
      <Text style={styles.discoveryBody}>
        Find someone you know on Alenio and say hello.
      </Text>
      <Pressable
        onPress={onFindPeople}
        style={styles.chatWelcomeButton}
        accessibilityRole="button"
        accessibilityLabel="Find people"
        testID="chat-welcome-find-people"
      >
        <Search size={16} color="#FFFFFF" strokeWidth={2.2} />
        <Text style={styles.chatWelcomeButtonText}>Find people</Text>
      </Pressable>
      <Text style={styles.chatWelcomePrivacy}>
        You choose who to start a conversation with.
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const tabClearance = useTabBarClearanceFn();
  const adaptive = useAdaptiveLayout();
  /** Wide and landscape-shaped: room for the inbox and a conversation at once. */
  const splitChat = adaptive.isSplit;
  const inboxPaneWidth = MASTER_PANE_WIDTH;
  const [openConversationId, setOpenConversationId] = useState<string | null>(
    null,
  );
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

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

  const unreadConversationCount = conversations.reduce(
    (total, conv) => total + (getDmUnreadCount(dmUnreadCounts, conv.id) > 0 ? 1 : 0),
    0,
  );

  // Reading the last unread thread would otherwise strand the user on an empty filtered list.
  useEffect(() => {
    if (unreadOnly && unreadConversationCount === 0) setUnreadOnly(false);
  }, [unreadOnly, unreadConversationCount]);

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dms"] });
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    setRefreshing(false);
  };

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

  const matchesConversationFilter = (conv: Conversation) =>
    !unreadOnly || getDmUnreadCount(dmUnreadCounts, conv.id) > 0;

  const activityTime = (conv: Conversation) =>
    new Date(conv.lastMessage?.createdAt ?? conv.updatedAt).getTime();

  /**
   * Newest activity first, the way every other messaging app orders an inbox.
   * Unread threads stay where they happened rather than jumping the queue; the
   * badge and bold styling are what draw the eye to them.
   */
  const sortInbox = (list: Conversation[]) =>
    [...list].sort((a, b) => activityTime(b) - activityTime(a));

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
    if (splitChat) {
      setOpenConversationId(conv.id);
      return;
    }
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

  const openConversation = openConversationId
    ? (conversations.find((conv) => conv.id === openConversationId) ?? null)
    : null;

  /**
   * Narrowing to one column hands the open thread to the pushed route, so
   * rotating an iPad to portrait keeps the reader where they were. A thread that
   * has since been left or deleted just closes.
   */
  useEffect(() => {
    if (!openConversationId) return;
    /** An empty list means loading or a failed refetch, not a vanished thread. */
    if (splitChat && (openConversation || conversations.length === 0)) return;
    setOpenConversationId(null);
    if (!splitChat && openConversation) openDm(openConversation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitChat, openConversationId, openConversation]);

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
                <Users size={18} color="#7C3AED" />
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
                backgroundColor="#EFE9FF"
                textColor="#6d28d9"
                fontSize={13}
              />
            </View>
          ) : (
            <View
              style={{
                width: PINNED_CIRCLE,
                height: PINNED_CIRCLE,
                borderRadius: PINNED_CIRCLE / 2,
                backgroundColor: "#EFE9FF",
                borderWidth: 1.5,
                borderColor: "#A5B4FC",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MessageCircle size={18} color="#6d28d9" />
            </View>
          )}
          {unreadCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -1,
                right: -1,
                backgroundColor: "#6d28d9",
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
              <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>
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
        {/* Two lines so a full name wraps instead of truncating in a 20% slot.
            Height stays automatic so a one-line name keeps its label close. */}
        <Text
          style={{
            fontSize: 11.5,
            fontWeight: "700",
            color: "#0F172A",
            textAlign: "center",
            width: "100%",
            lineHeight: 14,
            marginTop: 2,
          }}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {displayName}
        </Text>
        <Text
          style={{
            fontSize: 10,
            fontWeight: "500",
            color: isGroup ? "#6366F1" : "#94A3B8",
            textAlign: "center",
            width: "100%",
            lineHeight: 13,
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
    const timeStr = lastMsg
      ? formatConversationTime(lastMsg.createdAt)
      : conv.updatedAt
        ? formatConversationTime(conv.updatedAt)
        : "";
    const messagePreview = lastMsg
      ? `${lastMsg.sender.id === session?.user?.id ? "You" : (lastMsg.sender.name?.trim().split(/\s+/)[0] || "Someone")}: ${
          lastMsg.content?.trim() || "Attachment"
        }`
      : "No messages yet";
    const rowPreview =
      isGroup && groupWorkspace
        ? `${groupWorkspace} · ${messagePreview}`
        : messagePreview;

    const isOpen = conv.id === openConversationId;

    return (
      <Pressable
        key={conv.id}
        testID={`dm-card-${conv.id}`}
        onPress={() => openDm(conv)}
        onLongPress={() => togglePin(conv.id)}
        delayLongPress={350}
        style={[
          styles.dmRow,
          isOpen ? styles.dmRowOpen : null,
          isLast ? styles.dmRowLast : null,
        ]}
      >
        {/**
         * Accent stays the same width when unselected so open rows never
         * shift sideways — same pattern as the Members list.
         */}
        <View
          style={[
            styles.dmRowAccent,
            !isOpen ? styles.dmRowAccentHidden : null,
          ]}
        />
        <View style={styles.dmRowMain}>
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
                <Users size={19} color="#7C3AED" />
              </View>
            )
          ) : otherUser ? (
            <Pressable
              onPress={(event) => {
                event.stopPropagation();
                router.push({ pathname: "/person", params: { userId: otherUser.id } });
              }}
              accessibilityRole="button"
              accessibilityLabel={`Open ${displayName}'s profile`}
              hitSlop={6}
              testID={`dm-avatar-profile-${otherUser.id}`}
            >
              <UserAvatar
                user={otherUser}
                size={AVATAR}
                radius={AVATAR / 2}
                backgroundColor="#EFE9FF"
                textColor="#6d28d9"
                fontSize={16}
              />
            </Pressable>
          ) : (
            <View
              style={{
                width: AVATAR,
                height: AVATAR,
                borderRadius: AVATAR / 2,
                backgroundColor: "#EFE9FF",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <MessageCircle size={19} color="#6d28d9" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text
                style={{
                  fontSize: 14,
                  lineHeight: 18,
                  fontWeight: unreadCount > 0 ? "800" : "700",
                  color: "#20283C",
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: unreadCount > 0 ? "700" : "500",
                  color: unreadCount > 0 ? "#5B45FF" : "#98A2B3",
                  marginLeft: 8,
                  flexShrink: 0,
                }}
              >
                {timeStr}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <Text
                style={{
                  fontSize: 12,
                  lineHeight: 15,
                  fontWeight: unreadCount > 0 ? "600" : "400",
                  color: unreadCount > 0 ? "#475467" : "#8490A4",
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {rowPreview}
              </Text>
              {unreadCount > 0 ? (
                <View
                  style={{
                    backgroundColor: "#6d28d9",
                    borderRadius: 9,
                    minWidth: 18,
                    height: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 6,
                    marginLeft: 8,
                    flexShrink: 0,
                  }}
                >
                  <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const hasActiveSearch = searchQuery.trim().length > 0;
  const hasActiveInboxFilter = hasActiveSearch || unreadOnly;

  const searchField =
    conversations.length === 0 ? (
      <Pressable
        onPress={() => router.push("/new-dm")}
        style={styles.searchBar}
        accessibilityRole="button"
        accessibilityLabel="Search people on Alenio"
        testID="chat-search-people"
      >
        <Search size={15} color="#94A3B8" />
        <Text style={[styles.searchInput, styles.searchPlaceholder]}>Search Alenio</Text>
      </Pressable>
    ) : (
      <View style={styles.searchBar}>
        <Search size={15} color="#94A3B8" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search conversations"
          placeholderTextColor="#94A3B8"
          style={styles.searchInput}
          testID="chat-search-input"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searchQuery.length > 0 ? (
          <Pressable
            onPress={() => setSearchQuery("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear conversation search"
            testID="chat-search-clear"
          >
            <X size={15} color="#8A95A7" strokeWidth={2.2} />
          </Pressable>
        ) : null}
      </View>
    );

  const threadPane = openConversation ? (
    <DmThread
      /** A fresh thread per conversation: no draft or scroll position carries over. */
      key={openConversation.id}
      conversationId={openConversation.id}
      recipientName={conversationDisplayName(openConversation)}
      recipientImage={
        (openConversation.isGroup
          ? resolveUserImageUrl(openConversation.image)
          : resolveUserImageUrl(
              avatarUser(dmOtherParticipant(openConversation, session?.user?.id ?? ""))?.image,
            )) ?? ""
      }
      isGroup={openConversation.isGroup}
      onClose={() => setOpenConversationId(null)}
    />
  ) : !conversationsLoading && !conversationsError && conversations.length === 0 ? (
    <ChatWelcomeState onFindPeople={() => router.push("/new-dm")} />
  ) : (
    <View style={styles.threadPlaceholder} testID="chat-thread-placeholder">
      <View style={styles.threadPlaceholderIcon}>
        <MessageCircle size={22} color="#6d28d9" strokeWidth={2.1} />
      </View>
      <Text style={styles.threadPlaceholderTitle}>Pick a conversation</Text>
      <Text style={styles.threadPlaceholderBody}>
        Choose someone on the left to read and reply here.
      </Text>
    </View>
  );

  return (
    <CurvedTabLayout
      topInset={insets.top}
      title="Chat"
      leftAction={<AlenioHeaderBrand tone="dark" />}
      band
      sheetColor="#FFFFFF"
      testID="chat-screen"
      headerTestID="chat-header"
      /**
       * The split layout docks the field inside the inbox pane instead, so the
       * conversation header lines up with it rather than starting below it.
       */
      searchSlot={splitChat ? undefined : searchField}
      rightAction={
        <HeaderAddButton
          onPress={() => setShowAddModal(true)}
          accessibilityLabel="Start a conversation"
          testID="chat-header-add-button"
          tone="brand"
        />
      }
      overlays={
        <AlenioBottomSheet
        visible={showAddModal}
        title="Start a conversation"
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
          subtitle="Send a private message to anyone on Alenio"
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
          subtitle="Start a group chat with the people you choose"
          onPress={() => {
            setShowAddModal(false);
            router.push("/create-group");
          }}
          testID="add-modal-new-group"
        />
      </AlenioBottomSheet>
      }
    >
      <View
        style={[
          styles.chatBody,
          splitChat
            ? {
                flexDirection: "row",
                /**
                 * Only the split layout places its own panes, and it pads each
                 * edge separately because the Duo's system bar makes the
                 * horizontal insets asymmetric.
                 */
                paddingLeft: adaptive.contentPadLeft,
                paddingRight: adaptive.contentPadRight,
              }
            : null,
        ]}
      >
      <View
        style={[
          styles.chatColumns,
          splitChat
            ? [styles.inboxPane, { width: inboxPaneWidth }]
            : null,
        ]}
        testID={splitChat ? "chat-inbox-pane" : undefined}
      >
          {splitChat ? (
            <View style={styles.inboxSearchDock}>
              {searchField}
              <HeaderAddButton
                onPress={() => setShowAddModal(true)}
                accessibilityLabel="Start a conversation"
                testID="chat-inbox-add-button"
                tone="light"
                size="default"
              />
            </View>
          ) : null}
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
            {conversations.length > 0 ? (
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
            ) : null}
            <FlatList
              style={{ flex: 1, minHeight: 0 }}
              data={
                conversationsLoading || conversationsError
                  ? []
                  : listConversations
              }
              keyExtractor={(conversation) => conversation.id}
              renderItem={({ item, index }) =>
                renderDmCard(
                  item,
                  index === listConversations.length - 1,
                )
              }
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{
                paddingTop: 2,
                paddingHorizontal: 6,
                paddingBottom:
                  conversations.length === 0
                    ? tabClearance(8)
                    : tabClearance(44),
                flexGrow: 1,
              }}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#5B45FF"
                />
              }
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              ListEmptyComponent={
                conversationsLoading ? (
                  <View
                    style={{
                      flex: 1,
                      paddingVertical: 20,
                      alignItems: "center",
                    }}
                  >
                    <ActivityIndicator color="#5B45FF" />
                  </View>
                ) : conversationsError ? (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingHorizontal: 32,
                      paddingVertical: 20,
                    }}
                    testID="conversations-error-state"
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: "#64748B",
                        textAlign: "center",
                      }}
                    >
                      Couldn&apos;t load conversations
                    </Text>
                    <Text
                      style={{
                        fontSize: 12,
                        color: "#94A3B8",
                        marginTop: 6,
                        textAlign: "center",
                      }}
                    >
                      {conversationsLoadError instanceof Error
                        ? conversationsLoadError.message
                        : "Please try again."}
                    </Text>
                    <TouchableOpacity
                      onPress={() => void refetchConversations()}
                      testID="conversations-error-retry"
                      style={{
                        marginTop: 12,
                        backgroundColor: "#5B45FF",
                        borderRadius: 10,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontWeight: "700",
                          fontSize: 13,
                        }}
                      >
                        Retry
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : conversations.length === 0 ? (
                  splitChat ? (
                    <InboxEmptyState />
                  ) : (
                    <ChatWelcomeState
                      testID="conversations-empty-state"
                      onFindPeople={() => router.push("/new-dm")}
                    />
                  )
                ) : (
                  <ChatEmptyState
                    testID={
                      hasActiveInboxFilter
                        ? "conversations-filter-empty"
                        : "conversations-all-pinned-empty"
                    }
                    title={hasActiveInboxFilter ? "No matches" : "All pinned above"}
                    body={
                      hasActiveInboxFilter
                        ? "Try a different search or filter."
                        : "Your conversations are in Pinned. Tap “+” to start a new one."
                    }
                    primaryLabel={
                      hasActiveInboxFilter
                        ? "Clear filters"
                        : "Start a conversation"
                    }
                    onPrimary={() => {
                      if (hasActiveInboxFilter) {
                        setSearchQuery("");
                        setUnreadOnly(false);
                        return;
                      }
                      setShowAddModal(true);
                    }}
                  />
                )
              }
              testID="chat-conversation-list"
            />
            {!conversationsLoading &&
            !conversationsError &&
            conversations.length > 0 ? (
              <View
                pointerEvents="none"
                style={[
                  styles.pinHint,
                  { bottom: tabClearance(10) },
                ]}
              >
                <Pin size={12} color="#94A3B8" strokeWidth={2} />
                <Text style={styles.pinHintText}>
                  Press and hold a conversation to pin it. Pin up to 5.
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        {splitChat ? (
          <View style={styles.threadPane} testID="chat-thread-pane">
            {threadPane}
          </View>
        ) : null}
      </View>
    </CurvedTabLayout>
  );
}

const styles = StyleSheet.create({
  chatBody: {
    flex: 1,
    minHeight: 0,
  },
  dmRow: {
    minHeight: 62,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F2F4F7",
    backgroundColor: "#FFFFFF",
  },
  dmRowOpen: {
    backgroundColor: "#EEF2FF",
    borderBottomColor: "transparent",
    borderRadius: 10,
  },
  dmRowLast: {
    borderBottomWidth: 0,
  },
  dmRowAccent: {
    width: 3,
    alignSelf: "stretch",
    marginVertical: 6,
    borderRadius: 2,
    backgroundColor: "#6d28d9",
  },
  dmRowAccentHidden: {
    backgroundColor: "transparent",
  },
  dmRowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  chatColumns: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
    backgroundColor: "#FFFFFF",
  },
  inboxPane: {
    flex: 0,
    // Width is the compact master column.
    backgroundColor: "#F7F8FA",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: "#E7EAF0",
  },
  /** The dock CurvedTabLayout would have drawn, moved inside the pane. */
  inboxSearchDock: {
    height: SEARCH_DOCK_HEIGHT,
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: SEARCH_DOCK_TOP,
    marginHorizontal: 20,
    marginBottom: SEARCH_DOCK_BOTTOM,
  },
  threadPane: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    paddingLeft: PANE_GAP,
    /**
     * Drops the conversation header so its underline lands level with the
     * bottom of the search dock, where the inbox list starts.
     */
    paddingTop:
      SEARCH_DOCK_TOP +
      SEARCH_DOCK_HEIGHT +
      SEARCH_DOCK_BOTTOM -
      THREAD_HEADER_HEIGHT,
  },
  threadPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 6,
  },
  threadPlaceholderIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EFE9FF",
    marginBottom: 4,
  },
  threadPlaceholderTitle: {
    ...typography.sectionSubtitle,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
    color: "#101828",
  },
  threadPlaceholderBody: {
    fontSize: 12.5,
    lineHeight: 17,
    color: "#8290A4",
    textAlign: "center",
  },
  inboxEmpty: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  inboxEmptyIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
    backgroundColor: "#F5F7FA",
    borderWidth: 1,
    borderColor: "#E7EAF0",
  },
  inboxEmptyTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
  },
  inboxEmptyBody: {
    maxWidth: 220,
    marginTop: 6,
    fontSize: 12.5,
    lineHeight: 18,
    color: "#7D899D",
    textAlign: "center",
  },
  chatWelcome: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 44,
  },
  chatWelcomeButton: {
    minWidth: 196,
    height: 44,
    marginTop: 20,
    paddingHorizontal: 24,
    borderRadius: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#4B63EE",
    shadowColor: "#4B63EE",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 3,
  },
  chatWelcomeButtonText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  chatWelcomePrivacy: {
    marginTop: 12,
    fontSize: 11.5,
    lineHeight: 16,
    color: "#8995A8",
    textAlign: "center",
  },
  pinHint: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  pinHintText: {
    fontSize: 10,
    lineHeight: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    backgroundColor: "#FFFFFF",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: palette.cardBorder,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "400",
    letterSpacing: 0,
    color: "#0F172A",
    padding: 0,
  },
  searchPlaceholder: {
    color: "#94A3B8",
  },
  discoveryEmpty: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 18,
    paddingHorizontal: 8,
    paddingBottom: 12,
  },
  discoveryConversationArtSlot: {
    width: 220,
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  discoveryHero: {
    width: "100%",
    minHeight: 220,
    flexDirection: "row",
    alignItems: "center",
  },
  discoveryCopy: {
    width: "49%",
    zIndex: 2,
  },
  discoveryConversationArt: {
    position: "relative",
    width: 260,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ scale: 0.76 }],
  },
  chatArtGlow: {
    position: "absolute",
    top: 22,
    width: 172,
    height: 172,
    borderRadius: 86,
    backgroundColor: "#F1EFFF",
  },
  chatArtPath: {
    position: "absolute",
    left: 35,
    top: 56,
    width: 174,
    height: 100,
    borderWidth: 1.2,
    borderColor: "#A9A7F7",
    borderStyle: "dashed",
    borderRadius: 50,
    backgroundColor: "transparent",
    transform: [{ rotate: "-8deg" }],
  },
  chatArtSpark: {
    position: "absolute",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#735DFF",
  },
  chatArtSparkTop: { top: 16, right: 28 },
  chatArtSparkBottom: { bottom: 30, left: 35, backgroundColor: "#27C6B4" },
  chatArtBubble: {
    position: "absolute",
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  chatArtBubbleTop: {
    top: 49,
    left: 93,
    width: 108,
    backgroundColor: "#FFFFFF",
  },
  chatArtBubbleBottom: {
    left: 59,
    bottom: 37,
    width: 112,
    backgroundColor: "#E8E2FF",
  },
  chatArtBubbleDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chatArtBubbleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#CBD2E3",
  },
  chatArtBubbleDotPurple: {
    backgroundColor: "#B8A7FF",
  },
  chatArtPhotoFrame: {
    position: "absolute",
    width: 55,
    height: 55,
    borderRadius: 28,
    overflow: "hidden",
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    backgroundColor: "#FFFFFF",
    shadowColor: "#475569",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  chatArtPhotoTop: {
    top: 24,
    left: 50,
  },
  chatArtPhotoBottom: {
    right: 39,
    bottom: 20,
  },
  chatArtPhoto: {
    width: "100%",
    height: "100%",
  },
  chatArtMessage: {
    position: "absolute",
    width: 119,
    minHeight: 52,
    paddingHorizontal: 9,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E1E4F2",
    backgroundColor: "#FFFFFF",
    shadowColor: "#52618B",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.09,
    shadowRadius: 10,
    elevation: 2,
  },
  chatArtMessageLeft: {
    top: 38,
    right: 4,
    borderRadius: 14,
    borderBottomRightRadius: 5,
    transform: [{ rotate: "2deg" }],
  },
  chatArtMessageRight: {
    left: 15,
    bottom: 40,
    borderRadius: 14,
    borderBottomLeftRadius: 5,
    transform: [{ rotate: "-2deg" }],
  },
  chatArtAvatar: {
    width: 28,
    height: 28,
    marginRight: 7,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chatArtAvatarIndigo: { backgroundColor: "#665EF2" },
  chatArtAvatarPurple: { backgroundColor: "#42C6B5" },
  chatArtAvatarText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  chatArtMessageCopy: {
    flex: 1,
    gap: 5,
  },
  chatArtLine: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "#DDE3F5",
  },
  chatArtLineLong: { width: "92%" },
  chatArtLineMedium: { width: "78%" },
  chatArtLineShort: { width: "62%", backgroundColor: "#EDF0F8" },
  chatArtLineTiny: { width: "45%", backgroundColor: "#EDF0F8" },
  chatArtTyping: {
    position: "absolute",
    right: -1,
    top: 93,
    width: 35,
    height: 24,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    backgroundColor: "#635BEB",
    shadowColor: "#635BEB",
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  chatArtTypingDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#FFFFFF",
  },
  chatArtSend: {
    position: "absolute",
    top: 20,
    left: 5,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#665EF2",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  discoveryTitle: {
    maxWidth: 260,
    marginTop: 7,
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "800",
    color: "#172033",
    textAlign: "center",
    letterSpacing: -0.65,
  },
  discoveryBody: {
    maxWidth: 255,
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "400",
    color: "#71809A",
    textAlign: "center",
  },
  discoveryTitleAccent: {
    width: 24,
    height: 2,
    marginTop: 15,
    borderRadius: 1,
    backgroundColor: "#C5B9FF",
  },
  discoveryPrimary: {
    width: "100%",
    height: 36,
    marginTop: 17,
    paddingHorizontal: 11,
    borderRadius: 18,
    backgroundColor: "#ECEBFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  discoveryPrimaryText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: "700",
    color: "#5965D8",
  },
  emptyIllustration: {
    width: 142,
    height: 126,
    marginBottom: 10,
    alignSelf: "center",
  },
  emptyDiscoveryIllustration: {
    transform: [{ scale: 0.9 }],
    marginTop: -7,
    marginBottom: -1,
  },
  emptyFlightPath: {
    position: "absolute",
    top: 12,
    right: 19,
    width: 52,
    height: 34,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderColor: "#7B8FFF",
    borderStyle: "dashed",
    borderRadius: 22,
    transform: [{ rotate: "-12deg" }],
  },
  emptySendIcon: {
    position: "absolute",
    top: 1,
    right: 2,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-8deg" }],
  },
  emptyAccentOne: {
    position: "absolute",
    top: 14,
    left: 23,
    width: 4,
    height: 13,
    borderRadius: 2,
    backgroundColor: "#7892FF",
    transform: [{ rotate: "-38deg" }],
  },
  emptyAccentTwo: {
    position: "absolute",
    top: 5,
    left: 38,
    width: 4,
    height: 15,
    borderRadius: 2,
    backgroundColor: "#7892FF",
    transform: [{ rotate: "6deg" }],
  },
  emptyBackBubble: {
    position: "absolute",
    right: 9,
    bottom: 14,
    width: 75,
    height: 55,
    borderRadius: 28,
    backgroundColor: "#E1E6EE",
    borderWidth: 1,
    borderColor: "#D7DDE8",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBackTail: {
    position: "absolute",
    right: 12,
    bottom: 0,
    width: 18,
    height: 18,
    borderRadius: 3,
    backgroundColor: "#E1E6EE",
    transform: [{ rotate: "35deg" }],
  },
  emptyFrontBubble: {
    position: "absolute",
    left: 13,
    top: 28,
    width: 88,
    height: 67,
    borderRadius: 34,
    backgroundColor: "#C5CEFF",
    borderWidth: 1,
    borderColor: "#AFBCFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6378E9",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyFrontTail: {
    position: "absolute",
    left: 14,
    bottom: -2,
    width: 21,
    height: 21,
    borderRadius: 4,
    backgroundColor: "#C5CEFF",
    transform: [{ rotate: "40deg" }],
  },
  emptyDots: {
    flexDirection: "row",
    gap: 6,
    zIndex: 1,
  },
  emptyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  emptyFrontDot: {
    backgroundColor: "#4059C7",
  },
  emptyBackDot: {
    backgroundColor: "#8D99A9",
  },
});
