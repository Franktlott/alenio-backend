import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Pressable,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, Lock, Plus, Pin } from "lucide-react-native";
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
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { PAYWALL_BODY, PAYWALL_TITLE } from "@/lib/plan-access-copy";
import { tabBarClearance } from "@/lib/tab-bar";
import { dmOtherParticipant, resolveUserImageUrl } from "@/lib/user-avatar";
import { UserAvatar } from "@/components/UserAvatar";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { AppTabHeader } from "@/components/AppTabHeader";
import { AddMemberModal } from "@/components/AddMemberModal";
import {
  AlenioBottomSheet,
  AlenioSheetOption,
  alenioSheetStyles,
} from "@/components/AlenioBottomSheet";
import { WorkspacesSection } from "@/components/WorkspacesSection";
import { inviteMemberByEmail } from "@/lib/team-invites-api";
import { isLeaderRole, resolveMyTeamRole } from "@/lib/member-identity";

const PINNED_DMS_KEY = "pinned_dms";
const MAX_DM_PINS = 5;

const cardStyle = {
  marginHorizontal: 14,
  marginBottom: 6,
  backgroundColor: "#FFFFFF",
  borderRadius: 10,
  paddingVertical: 9,
  paddingHorizontal: 12,
  borderWidth: 1,
  borderColor: "#E9EDF2",
} as const;

const AVATAR = 32;
const PINNED_CIRCLE = 52;
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
        marginHorizontal: 14,
        marginTop: 4,
        marginBottom: 6,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: "700",
            color: "#64748B",
            letterSpacing: 0.8,
            textTransform: "uppercase",
            marginBottom: 2,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: "#94A3B8", lineHeight: 16 }} numberOfLines={1}>
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
        flex: 1,
        marginHorizontal: 14,
        marginBottom: 8,
        minHeight: 220,
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#E9EDF2",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 28,
      }}
    >
      <Image
        source={image}
        style={{ width: 152, height: 152, marginBottom: 12 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: 17,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.2,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 18,
          maxWidth: 280,
          marginBottom: onPrimary ? 16 : 0,
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
            gap: 5,
            backgroundColor: "#4361EE",
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 11,
            minWidth: 148,
          }}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          testID="messages-empty-add"
        >
          <Plus size={15} color="#FFFFFF" strokeWidth={2.5} />
          <Text style={{ color: "#FFFFFF", fontSize: 14, fontWeight: "700" }}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable
          onPress={onSecondary}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          style={{ paddingVertical: 10, marginTop: 4 }}
        >
          <Text style={{ color: "#4361EE", fontSize: 13, fontWeight: "600" }}>{secondaryLabel}</Text>
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
  const [showGroupPaywall, setShowGroupPaywall] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
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

  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const { data: teamDetail } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  // DM conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
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

  const inviteMemberMutation = useMutation({
    mutationFn: (email: string) => inviteMemberByEmail(activeTeamId!, email),
    onSuccess: () => {
      setShowInviteModal(false);
      setInviteError(null);
      queryClient.invalidateQueries({ queryKey: ["team-invites", activeTeamId] });
      queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
      toast({ title: "Invite sent", preset: "done" });
    },
    onError: (err: Error) => {
      setInviteError(err.message || "Could not send invite.");
    },
  });

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <NoWorkspaceRedirect />
      </SafeAreaView>
    );
  }

  const members = teamDetail?.members ?? [];
  const { myRole } = resolveMyTeamRole({
    teamRole: teamDetail?.role,
    members,
    sessionUserId: typeof session?.user?.id === "string" ? session.user.id : "",
    meEmail: typeof session?.user?.email === "string" ? session.user.email : undefined,
  });
  const canInviteMembers = isLeaderRole(myRole);

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

  const openInviteTeamMembers = () => {
    if (canInviteMembers) {
      setInviteError(null);
      setShowInviteModal(true);
      return;
    }
    // Members can share the workspace invite code from the Team tab.
    router.push("/(app)/team");
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
        recipientImage: resolveUserImageUrl(otherUser?.image) ?? "",
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
        <View style={{ width: PINNED_CIRCLE, height: PINNED_CIRCLE, marginBottom: 5 }}>
          {isGroup ? (
            <View
              style={{
                width: PINNED_CIRCLE,
                height: PINNED_CIRCLE,
                borderRadius: PINNED_CIRCLE / 2,
                backgroundColor: "#F5F3FF",
                borderWidth: 2,
                borderColor: "#C4B5FD",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Users size={22} color="#7C3AED" />
            </View>
          ) : otherUser ? (
            <View
              style={{
                borderRadius: PINNED_CIRCLE / 2,
                borderWidth: 2,
                borderColor: "#A5B4FC",
                overflow: "hidden",
              }}
            >
              <UserAvatar
                user={otherUser}
                size={PINNED_CIRCLE - 4}
                radius={(PINNED_CIRCLE - 4) / 2}
                backgroundColor="#EEF2FF"
                textColor="#4361EE"
                fontSize={16}
              />
            </View>
          ) : (
            <View
              style={{
                width: PINNED_CIRCLE,
                height: PINNED_CIRCLE,
                borderRadius: PINNED_CIRCLE / 2,
                backgroundColor: "#EEF2FF",
                borderWidth: 2,
                borderColor: "#A5B4FC",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MessageCircle size={22} color="#4361EE" />
            </View>
          )}
          {unreadCount > 0 ? (
            <View
              style={{
                position: "absolute",
                top: -1,
                right: -1,
                backgroundColor: "#EF4444",
                borderRadius: 8,
                minWidth: 16,
                height: 16,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 4,
                borderWidth: 1.5,
                borderColor: "#F8F9FC",
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
                width: 18,
                height: 18,
                borderRadius: 9,
                backgroundColor: "#4338CA",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1.5,
                borderColor: "#F8F9FC",
              }}
            >
              <Pin size={9} color="white" fill="white" />
            </View>
          )}
        </View>
        <Text
          style={{ fontSize: 11, fontWeight: "600", color: "#334155", textAlign: "center", width: "100%" }}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          {isGroup ? (
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: 9, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={16} color="#7C3AED" />
            </View>
          ) : otherUser ? (
            <UserAvatar
              user={otherUser}
              size={AVATAR}
              radius={9}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={13}
            />
          ) : (
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: 9, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MessageCircle size={16} color="#4361EE" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "600", color: "#0F172A", flex: 1 }} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={{ fontSize: 10, color: "#94A3B8", marginLeft: 8, flexShrink: 0 }}>{timeStr}</Text>
            </View>
            {groupWorkspace ? (
              <Text style={{ fontSize: 10, fontWeight: "600", color: "#6366F1", marginBottom: 2 }} numberOfLines={1}>
                {groupWorkspace}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: "#6B7280", flex: 1 }} numberOfLines={1}>
                {lastMsg
                  ? `${lastMsg.sender.id === session?.user?.id ? "You" : (lastMsg.sender.name?.trim().split(/\s+/)[0] || "Someone")}: ${
                      lastMsg.content?.trim() || "Attachment"
                    }`
                  : "No messages yet"}
              </Text>
              {unreadCount > 0 ? (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 9, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, marginLeft: 8, flexShrink: 0 }}>
                  <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>{unreadCount}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView testID="chat-screen" style={{ flex: 1, backgroundColor: "#F8F9FC" }} edges={[]}>
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
        {/* Pinned — up to 5 avatar circles with name underneath */}
        {pinnedConversations.length > 0 ? (
          <View style={{ flexShrink: 0, paddingBottom: 4 }} testID="pinned-conversations-section">
            <SectionHeader
              title="Pinned"
              subtitle="Hold a circle to unpin"
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                paddingHorizontal: 10,
                paddingTop: 2,
                paddingBottom: 6,
              }}
            >
              {pinnedConversations.map((conv) => renderPinnedCircle(conv))}
            </View>
          </View>
        ) : null}

        {/* Workspaces panel — team chats + channels for every workspace */}
        <View style={{ flex: 2, minHeight: 0, flexBasis: 0 }}>
          <WorkspacesSection
            activeTeamId={activeTeamId}
            onSelectTeam={setActiveTeamId}
            cardStyle={cardStyle}
          />
        </View>

        {/* Messages panel — unpinned direct messages + groups */}
        <View style={{ flex: 3, minHeight: 0, flexBasis: 0, borderTopWidth: 1, borderTopColor: "#E8ECF1" }}>
          <SectionHeader
            title="Messages"
            subtitle={
              conversationsLoading
                ? "Loading conversations…"
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
              flexGrow:
                conversationsLoading || conversations.length === 0 || sortedUnpinnedDms.length === 0
                  ? 1
                  : undefined,
              justifyContent:
                !conversationsLoading &&
                (conversations.length === 0 || sortedUnpinnedDms.length === 0)
                  ? ("center" as const)
                  : undefined,
            }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" />}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {conversationsLoading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : conversations.length === 0 ? (
              <ChatEmptyState
                testID="conversations-empty-state"
                image={require("@/assets/dm-empty-start.png")}
                title="No messages yet"
                body={'No conversations yet. Tap “+ Add” to message a teammate.'}
                primaryLabel="Add"
                onPrimary={() => setShowAddModal(true)}
                secondaryLabel={canInviteMembers ? "Invite a teammate" : undefined}
                onSecondary={canInviteMembers ? openInviteTeamMembers : undefined}
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
        </View>
        </View>

        <Text
          testID="pin-hint-footer"
          style={{
            flexShrink: 0,
            textAlign: "center",
            fontSize: 11,
            lineHeight: 15,
            color: "#94A3B8",
            paddingHorizontal: 24,
            paddingTop: 6,
            paddingBottom: 8,
          }}
        >
          Hold and press a conversation to pin up to {MAX_DM_PINS} to the top
        </Text>
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
            if (!isPaid) {
              setShowGroupPaywall(true);
            } else {
              router.push("/create-group");
            }
          }}
          testID="add-modal-new-group"
        />
      </AlenioBottomSheet>

      <AddMemberModal
        visible={showInviteModal}
        teamId={activeTeamId ?? ""}
        teamName={teamDetail?.name ?? "Team"}
        confirming={inviteMemberMutation.isPending}
        error={inviteError}
        onClose={() => {
          setInviteError(null);
          setShowInviteModal(false);
        }}
        onClearError={() => setInviteError(null)}
        onConfirm={(email) => inviteMemberMutation.mutate(email)}
      />

      {/* Group chat paywall — same slide-up sheet motion */}
      <Modal visible={showGroupPaywall} transparent animationType="slide" onRequestClose={() => setShowGroupPaywall(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }} onPress={() => setShowGroupPaywall(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View
              style={{
                backgroundColor: "white",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingHorizontal: 20,
                paddingTop: 12,
                paddingBottom: 28,
                width: "100%",
                alignItems: "center",
              }}
              testID="group-paywall-modal"
            >
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 14 }} />
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                <Lock size={24} color="#4361EE" />
              </View>
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 6 }}>{PAYWALL_TITLE}</Text>
              <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", marginBottom: 18, lineHeight: 18 }}>
                {PAYWALL_BODY}
              </Text>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/account-hub"); }}
                testID="group-paywall-view-plan"
                style={{ borderRadius: 12, overflow: "hidden", width: "100%", shadowColor: "#4361EE", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5, marginBottom: 8 }}
              >
                <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 14 }}>View plan details</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 14 }}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGroupPaywall(false)} style={alenioSheetStyles.cancelButton} testID="group-paywall-dismiss">
                <Text style={alenioSheetStyles.cancelButtonText}>Not now</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
