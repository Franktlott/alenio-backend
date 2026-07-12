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
import { MessageCircle, Users, Lock, Plus } from "lucide-react-native";
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
import { WorkspaceTeamAvatar } from "@/components/WorkspaceTeamUI";
import { groupWorkspaceLabel } from "@/lib/group-workspace-label";
import { AppTabHeader } from "@/components/AppTabHeader";
import { AddMemberModal } from "@/components/AddMemberModal";
import { SpacesSection } from "@/components/SpacesSection";
import { inviteMemberByEmail } from "@/lib/team-invites-api";

const PINNED_DMS_KEY = "pinned_dms";
const MAX_DM_PINS = 4; // Team Chat always takes 1 of 5 top pin slots

const cardStyle = {
  marginHorizontal: 14,
  marginBottom: 8,
  backgroundColor: "white",
  borderRadius: 12,
  paddingVertical: 12,
  paddingHorizontal: 14,
  borderWidth: 1,
  borderColor: "#E8ECF1",
  shadowColor: "#0F172A",
  shadowOpacity: 0.04,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

const AVATAR = 40;
const PIN_AVATAR = 48;
const PIN_SLOT_WIDTH = 60;

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
  titleAccent,
  body,
  primaryLabel,
  onPrimary,
  primaryIcon,
  secondaryLabel,
  onSecondary,
  testID,
  compact = false,
}: {
  image: number;
  title: string;
  titleAccent: string;
  body: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryIcon?: React.ReactNode;
  secondaryLabel?: string;
  onSecondary?: () => void;
  testID?: string;
  compact?: boolean;
}) {
  const imageSize = compact ? 72 : 96;
  return (
    <View
      testID={testID}
      style={[
        cardStyle,
        {
          alignItems: "center",
          paddingVertical: compact ? 12 : 14,
          paddingHorizontal: 14,
          marginBottom: compact ? 4 : 8,
          backgroundColor: "#FFFFFF",
        },
      ]}
    >
      <Image
        source={image}
        style={{ width: imageSize, height: imageSize, marginBottom: 4 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
      <Text
        style={{
          fontSize: compact ? 15 : 16,
          fontWeight: "800",
          color: "#0F172A",
          textAlign: "center",
          letterSpacing: -0.3,
          lineHeight: compact ? 20 : 22,
          marginBottom: 4,
          maxWidth: 300,
        }}
      >
        {title} <Text style={{ color: "#7C3AED" }}>{titleAccent}</Text>
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: "#64748B",
          textAlign: "center",
          lineHeight: 17,
          maxWidth: 300,
          marginBottom: primaryLabel || secondaryLabel ? 10 : 0,
        }}
        numberOfLines={2}
      >
        {body}
      </Text>
      {primaryLabel && onPrimary ? (
        <Pressable
          onPress={onPrimary}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            backgroundColor: "#4361EE",
            borderRadius: 10,
            paddingHorizontal: 16,
            paddingVertical: 9,
            width: "100%",
            maxWidth: 260,
            marginBottom: secondaryLabel ? 6 : 0,
          }}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          {primaryIcon}
          <Text style={{ color: "#FFFFFF", fontSize: 13, fontWeight: "700" }}>{primaryLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Pressable onPress={onSecondary} accessibilityRole="button" accessibilityLabel={secondaryLabel} style={{ paddingVertical: 2 }}>
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
  const [showGroupPaywall, setShowGroupPaywall] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PINNED_DMS_KEY).then((val) => {
      if (cancelled) return;
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) {
            setPinnedIds(
              parsed
                .filter((id): id is string => typeof id === "string" && !id.startsWith("team:"))
                .slice(0, MAX_DM_PINS)
            );
          }
        } catch (_) {}
      }
      setPinsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pinsReady) return;
    AsyncStorage.setItem(PINNED_DMS_KEY, JSON.stringify(pinnedIds));
  }, [pinnedIds, pinsReady]);

  const togglePin = async (id: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (pinnedIds.includes(id)) {
      setPinnedIds((prev) => prev.filter((x) => x !== id));
      toast({ title: "Unpinned", preset: "done" });
      return;
    }
    if (pinnedIds.length >= MAX_DM_PINS) {
      toast({ title: "Maximum 5 pins reached", preset: "error" });
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

  const { data: teamUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", activeTeamId, { [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "" }],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${activeTeamId}/messages/unread-counts`, {
      lastReadIds: { [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "" },
    }),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 5000,
    staleTime: 0,
  });
  const teamChatUnreadCount = teamUnreadCounts[`team:${activeTeamId}`] ?? 0;

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
  const myRole = members.find((m) => m.userId === session?.user?.id || m.user.id === session?.user?.id)?.role ?? (teamDetail as Team & { role?: string } | undefined)?.role;
  const canInviteMembers = myRole === "owner" || myRole === "team_leader" || myRole === "admin";

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

  const openTeamChat = () => {
    router.push({
      pathname: "/team-chat",
      params: { teamId: activeTeamId, teamName: teamDetail?.name ?? "" },
    });
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

  const canManageSpaces =
    myRole === "owner" || myRole === "team_leader" || myRole === "admin";

  const spacesBlock = (
    <SpacesSection
      teamId={activeTeamId}
      teamName={teamDetail?.name ?? ""}
      canManage={canManageSpaces}
      cardStyle={cardStyle}
      compactEmpty
      fillHeight
    />
  );

  const shortLabel = (name: string) => {
    const first = name.trim().split(/\s+/)[0] || name;
    return first.length > 9 ? `${first.slice(0, 8)}…` : first;
  };

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

  const renderPinBadge = (count: number) =>
    count > 0 ? (
      <View
        style={{
          position: "absolute",
          top: -2,
          right: -2,
          backgroundColor: "#EF4444",
          borderRadius: 9,
          minWidth: 18,
          height: 18,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 4,
          borderWidth: 2,
          borderColor: "#F8F9FC",
        }}
      >
        <Text style={{ color: "white", fontSize: 10, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
      </View>
    ) : null;

  const renderPinnedRow = () => (
    <View
      testID="pinned-conversations-row"
      style={{
        paddingTop: 8,
        paddingBottom: 6,
        paddingHorizontal: 6,
        flexShrink: 0,
        borderBottomWidth: 1,
        borderBottomColor: "#E8ECF1",
        backgroundColor: "#F8F9FC",
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: "700",
          color: "#94A3B8",
          letterSpacing: 0.7,
          textTransform: "uppercase",
          textAlign: "center",
          marginBottom: 6,
        }}
      >
        Pinned
      </Text>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: 14,
          paddingHorizontal: 8,
        }}
      >
        <Pressable
          key="pin-team"
          testID="pinned-team-chat"
          onPress={openTeamChat}
          style={{ width: PIN_SLOT_WIDTH, alignItems: "center" }}
          accessibilityRole="button"
          accessibilityLabel="Team Chat"
        >
          <View style={{ width: PIN_AVATAR, height: PIN_AVATAR }}>
            <WorkspaceTeamAvatar
              team={{ name: teamDetail?.name ?? "Workspace", image: teamDetail?.image ?? null }}
              size={PIN_AVATAR}
              radius={PIN_AVATAR / 2}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              borderColor="#E0E7FF"
            />
            {renderPinBadge(teamChatUnreadCount)}
          </View>
          <Text style={{ marginTop: 4, fontSize: 11, fontWeight: "600", color: "#0F172A", textAlign: "center" }} numberOfLines={1}>
            Team
          </Text>
        </Pressable>

        {pinnedConversations.map((conv) => {
          const unread = getDmUnreadCount(dmUnreadCounts, conv.id);
          const isGroup = conv.isGroup;
          const otherUser = !isGroup ? avatarUser(dmOtherParticipant(conv, session?.user?.id ?? "")) : null;
          const displayName = isGroup
            ? (conv.name ?? conv.participants?.map((p) => p.name ?? "").filter(Boolean).join(", ") ?? "Group")
            : (otherUser?.name?.trim() || otherUser?.email?.trim() || "Chat");

          return (
            <Pressable
              key={`pin-${conv.id}`}
              testID={`pinned-dm-${conv.id}`}
              onPress={() => openDm(conv)}
              onLongPress={() => togglePin(conv.id)}
              delayLongPress={350}
              style={{ width: PIN_SLOT_WIDTH, alignItems: "center" }}
              accessibilityRole="button"
              accessibilityLabel={`${displayName}. Long press to unpin.`}
            >
              <View style={{ width: PIN_AVATAR, height: PIN_AVATAR }}>
                {isGroup ? (
                  <View
                    style={{
                      width: PIN_AVATAR,
                      height: PIN_AVATAR,
                      borderRadius: PIN_AVATAR / 2,
                      backgroundColor: "#F5F3FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Users size={24} color="#7C3AED" />
                  </View>
                ) : otherUser ? (
                  <UserAvatar
                    user={otherUser}
                    size={PIN_AVATAR}
                    radius={PIN_AVATAR / 2}
                    backgroundColor="#EEF2FF"
                    textColor="#4361EE"
                    fontSize={20}
                  />
                ) : (
                  <View
                    style={{
                      width: PIN_AVATAR,
                      height: PIN_AVATAR,
                      borderRadius: PIN_AVATAR / 2,
                      backgroundColor: "#EEF2FF",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <MessageCircle size={22} color="#4361EE" />
                  </View>
                )}
                {renderPinBadge(unread)}
              </View>
              <Text style={{ marginTop: 4, fontSize: 11, fontWeight: "600", color: "#0F172A", textAlign: "center" }} numberOfLines={1}>
                {shortLabel(displayName)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

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
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: 12, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Users size={18} color="#7C3AED" />
            </View>
          ) : otherUser ? (
            <UserAvatar
              user={otherUser}
              size={AVATAR}
              radius={12}
              backgroundColor="#EEF2FF"
              textColor="#4361EE"
              fontSize={15}
            />
          ) : (
            <View style={{ width: AVATAR, height: AVATAR, borderRadius: 12, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <MessageCircle size={18} color="#4361EE" />
            </View>
          )}

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
              <Text style={{ fontSize: 14, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>{displayName}</Text>
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

      <View style={{ flex: 1, minHeight: 0, paddingBottom: tabBarClearance(insets.bottom, 8) }}>
        {renderPinnedRow()}

        {/* Messages panel — larger share of screen */}
        <View style={{ flex: 3, minHeight: 0, flexBasis: 0 }}>
          <SectionHeader
            title="Messages"
            subtitle={
              conversationsLoading
                ? "Loading conversations…"
                : conversations.length === 0
                  ? "Direct & group conversations"
                  : `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`
            }
          />
          <ScrollView
            style={{ flex: 1, minHeight: 0 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 6, flexGrow: conversations.length === 0 ? 1 : undefined }}
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
                compact
                image={require("@/assets/dm-empty-start.png")}
                title="Start with"
                titleAccent="one conversation."
                body="Message a teammate privately, or open Team Chat from the pin above."
                primaryLabel="New message"
                primaryIcon={<MessageCircle size={15} color="#FFFFFF" strokeWidth={2.4} />}
                onPrimary={() => setShowAddModal(true)}
                secondaryLabel={canInviteMembers ? "Invite a teammate" : undefined}
                onSecondary={canInviteMembers ? openInviteTeamMembers : undefined}
              />
            ) : (
              sortedUnpinnedDms.map((conv) => renderDmCard(conv))
            )}
          </ScrollView>
        </View>

        {/* Spaces panel — smaller share; empty card fills to bottom */}
        <View style={{ flex: 2, minHeight: 0, flexBasis: 0, borderTopWidth: 1, borderTopColor: "#E8ECF1" }}>
          {spacesBlock}
        </View>
      </View>

      {/* Add / New Conversation modal */}
      <Modal visible={showAddModal} transparent animationType="fade" onRequestClose={() => setShowAddModal(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }} onPress={() => setShowAddModal(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: "white", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#E2E8F0", alignSelf: "center", marginBottom: 8 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <Image source={require("@/assets/alenio-icon.png")} style={{ width: 32, height: 32, borderRadius: 8 }} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A" }}>New Conversation</Text>
            </View>
            <Pressable
              testID="add-modal-new-dm"
              onPress={() => { setShowAddModal(false); router.push("/new-dm"); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#EEF2FF", borderRadius: 16, padding: 16 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#4361EE", alignItems: "center", justifyContent: "center" }}>
                <MessageCircle size={22} color="white" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>Direct Message</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Send a private message to a teammate</Text>
              </View>
            </Pressable>
            <Pressable
              testID="add-modal-new-group"
              onPress={() => {
                setShowAddModal(false);
                if (!isPaid) { setShowGroupPaywall(true); } else { router.push("/create-group"); }
              }}
              style={{ flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#F5F3FF", borderRadius: 16, padding: 16 }}
            >
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#7C3AED", alignItems: "center", justifyContent: "center" }}>
                <Users size={22} color="white" />
              </View>
              <View>
                <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A" }}>New Group</Text>
                <Text style={{ fontSize: 12, color: "#94A3B8", marginTop: 2 }}>Create a group conversation</Text>
              </View>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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

      {/* Group chat paywall modal */}
      <Modal visible={showGroupPaywall} transparent animationType="fade" onRequestClose={() => setShowGroupPaywall(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }} onPress={() => setShowGroupPaywall(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" }} testID="group-paywall-modal">
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Lock size={28} color="#4361EE" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>{PAYWALL_TITLE}</Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                {PAYWALL_BODY}
              </Text>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/account-hub"); }}
                testID="group-paywall-view-plan"
                style={{ borderRadius: 14, overflow: "hidden", width: "100%", shadowColor: "#4361EE", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5, marginBottom: 10 }}
              >
                <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>View plan details</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGroupPaywall(false)} style={{ paddingVertical: 10, width: "100%", alignItems: "center" }} testID="group-paywall-dismiss">
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 14 }}>Not now</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
