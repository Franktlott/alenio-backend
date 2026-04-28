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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, Lock, Plus, Sparkles } from "lucide-react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Conversation, Team } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { useDemoMode } from "@/lib/useDemo";
import { useSubscriptionStore } from "@/lib/state/subscription-store";
import { restorePurchases, isRevenueCatEnabled } from "@/lib/revenue-cat";

const PINNED_DMS_KEY = "pinned_dms";

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function AvatarStack({ members }: { members: { image: string | null; name: string | null }[] }) {
  const shown = members.slice(0, 3);
  return (
    <View style={{ flexDirection: "row" }}>
      {shown.map((m, i) => (
        <View
          key={i}
          style={{
            width: 28, height: 28, borderRadius: 14,
            backgroundColor: "#4361EE",
            borderWidth: 2, borderColor: "white",
            marginLeft: i === 0 ? 0 : -8,
            alignItems: "center", justifyContent: "center",
            overflow: "hidden", zIndex: shown.length - i,
          }}
        >
          {m.image ? (
            <Image source={{ uri: m.image }} style={{ width: 28, height: 28 }} />
          ) : (
            <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>
              {m.name?.[0]?.toUpperCase() ?? "?"}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();
  const [showGroupPaywall, setShowGroupPaywall] = useState(false);
  const [isRestoringChat, setIsRestoringChat] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedDmIds, setPinnedDmIds] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(PINNED_DMS_KEY).then((val) => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setPinnedDmIds(parsed);
        } catch (_) {}
      }
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(PINNED_DMS_KEY, JSON.stringify(pinnedDmIds));
  }, [pinnedDmIds]);

  const plan = useSubscriptionStore((s) => s.plan);
  const isPaid = plan === "team";

  const { data: teamDetail } = useQuery({
    queryKey: ["team", activeTeamId],
    queryFn: () => api.get<Team>(`/api/teams/${activeTeamId}`),
    enabled: !!activeTeamId,
  });

  const { data: teamGeneralMessages = [] } = useQuery({
    queryKey: ["messages", activeTeamId, "general", "preview"],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/messages?topicId=general&limit=1`),
    enabled: !!activeTeamId,
    refetchInterval: 10000,
  });

  const lastReadIds = useUnreadStore((s) => s.lastReadIds);

  const { data: teamUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", activeTeamId, { [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "" }],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${activeTeamId}/messages/unread-counts`, {
      lastReadIds: { [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "" },
    }),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 10000,
  });
  const teamChatUnreadCount = teamUnreadCounts[`team:${activeTeamId}`] ?? 0;

  // DM conversations
  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ["dms"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    refetchInterval: 10000,
  });

  const dmLastReadIds = Object.fromEntries(
    conversations.map((c) => [`conv:${c.id}`, lastReadIds[`conv:${c.id}`] ?? ""])
  );
  const { data: dmUnreadCounts = {} } = useQuery({
    queryKey: ["dm-unread-counts", dmLastReadIds],
    queryFn: () => api.post<Record<string, number>>("/api/dms/unread-counts", { lastReadIds: dmLastReadIds }),
    enabled: conversations.length > 0 && !!session?.user,
    refetchInterval: 10000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dms"] });
    await queryClient.invalidateQueries({ queryKey: ["team", activeTeamId] });
    setRefreshing(false);
  };

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  const members = teamDetail?.members ?? [];
  const memberCount = members.length;
  const topThreeMembers = members.slice(0, 3).map((m) => ({ image: m.user.image ?? null, name: m.user.name ?? null }));
  const lastGeneralMessage = teamGeneralMessages[0];

  return (
    <SafeAreaView testID="chat-screen" style={{ flex: 1, backgroundColor: "#F2F3F7" }} edges={[]}>
      {/* Header */}
      <LinearGradient
        colors={["#4361EE", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: 16 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: "white", fontSize: 20, fontWeight: "800", flex: 1 }}>Chat</Text>
          <View style={{ position: "absolute", left: 0, right: 0, alignItems: "center" }}>
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 30, width: 104, resizeMode: "contain" }} />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {activeTeamId && !isDemo ? (
              <Pressable
                onPress={() => setShowAddModal(true)}
                style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.22)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }}
                testID="chat-header-add-button"
              >
                <Plus size={13} color="white" />
                <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>Add</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4361EE" />}
      >
        {/* Team Chat card */}
        <Pressable
          testID="team-chat-button"
          onPress={() => router.push({ pathname: "/team-channels", params: { teamId: activeTeamId, teamName: teamDetail?.name ?? "" } })}
          style={{ marginHorizontal: 16, marginTop: 20, borderRadius: 20, overflow: "hidden", shadowColor: "#4361EE", shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 }}
        >
          <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ padding: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              {teamDetail?.image ? (
                <Image source={{ uri: teamDetail.image }} style={{ width: 48, height: 48, borderRadius: 14, borderWidth: 2, borderColor: "rgba(255,255,255,0.3)" }} />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                  <MessageCircle size={22} color="white" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: "white" }}>Team Chat</Text>
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 1 }}>Primary team space</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                {teamChatUnreadCount > 0 ? (
                  <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                    <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{teamChatUnreadCount}</Text>
                  </View>
                ) : null}
                {topThreeMembers.length > 0 ? <AvatarStack members={topThreeMembers} /> : null}
              </View>
            </View>
            <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.15)", marginTop: 14, marginBottom: 10 }} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {memberCount} {memberCount === 1 ? "member" : "members"}
              </Text>
              <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.7)" }}>
                {lastGeneralMessage
                  ? `Last: ${formatTime(lastGeneralMessage.createdAt)}`
                  : "No activity yet"}
              </Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* DMs / Group Messages section */}
        <View style={{ marginHorizontal: 16, marginTop: 28, marginBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ fontSize: 20, fontWeight: "700", color: "#0F172A" }}>Messages</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>Direct & group conversations</Text>
          </View>
        </View>

        {conversationsLoading ? (
          <View style={{ paddingVertical: 24, alignItems: "center" }}>
            <ActivityIndicator color="#4361EE" />
          </View>
        ) : conversations.length === 0 ? (
          <View style={{ alignItems: "center", paddingHorizontal: 20, paddingVertical: 16 }} testID="conversations-empty-state">
            <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: "#E8EEFF", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <MessageCircle size={40} color="#4361EE" strokeWidth={2} />
              <View
                style={{
                  position: "absolute",
                  bottom: 6,
                  right: 6,
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: "#4361EE",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 2,
                  borderColor: "#E8EEFF",
                }}
              >
                <Sparkles size={14} color="white" strokeWidth={2} />
              </View>
            </View>
            <Text style={{ fontSize: 17, fontWeight: "700", color: "#0F172A", marginBottom: 4, textAlign: "center" }}>
              No conversations yet
            </Text>
            <Text style={{ fontSize: 13, color: "#64748B", textAlign: "center", lineHeight: 18, maxWidth: 280 }}>
              Big moments often begin as small hellos. Reach out to a teammate—alignment, ideas, and wins start in threads like these.
            </Text>
          </View>
        ) : (
          conversations.map((conv) => {
            const unreadCount = dmUnreadCounts[`conv:${conv.id}`] ?? 0;
            const isGroup = conv.isGroup;
            const displayName = isGroup
              ? (conv.name ?? conv.participants?.map((p) => p.name ?? "").join(", ") ?? "Group")
              : (conv.recipient?.name ?? "Unknown");
            const avatarImage = isGroup ? null : (conv.recipient?.image ?? null);
            const avatarInitial = displayName[0]?.toUpperCase() ?? "?";
            const lastMsg = conv.lastMessage;
            const timeStr = lastMsg ? formatTime(lastMsg.createdAt) : (conv.updatedAt ? formatTime(conv.updatedAt) : "");

            return (
              <Pressable
                key={conv.id}
                testID={`dm-card-${conv.id}`}
                onPress={() => router.push({ pathname: "/dm-chat", params: { conversationId: conv.id } })}
                style={{ marginHorizontal: 16, marginBottom: 10, backgroundColor: "white", borderRadius: 20, padding: 14, shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  {/* Avatar */}
                  {isGroup ? (
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#F5F3FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Users size={22} color="#7C3AED" />
                    </View>
                  ) : avatarImage ? (
                    <Image source={{ uri: avatarImage }} style={{ width: 48, height: 48, borderRadius: 14 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Text style={{ fontSize: 18, fontWeight: "700", color: "#4361EE" }}>{avatarInitial}</Text>
                    </View>
                  )}

                  {/* Content */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                      <Text style={{ fontSize: 15, fontWeight: "700", color: "#0F172A", flex: 1 }} numberOfLines={1}>{displayName}</Text>
                      <Text style={{ fontSize: 11, color: "#94A3B8", marginLeft: 8, flexShrink: 0 }}>{timeStr}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 13, color: "#6B7280", flex: 1 }} numberOfLines={1}>
                        {lastMsg
                          ? (lastMsg.sender.id === session?.user?.id ? `You: ${lastMsg.content}` : lastMsg.content ?? "Attachment")
                          : "No messages yet"}
                      </Text>
                      {unreadCount > 0 ? (
                        <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginLeft: 8, flexShrink: 0 }}>
                          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{unreadCount}</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>

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

      {/* Group chat paywall modal */}
      <Modal visible={showGroupPaywall} transparent animationType="fade" onRequestClose={() => setShowGroupPaywall(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }} onPress={() => setShowGroupPaywall(false)}>
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" }} testID="group-paywall-modal">
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Lock size={28} color="#4361EE" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>Group Chats</Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                Upgrade to Alenio Team to create group conversations with your team
              </Text>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/subscription"); }}
                testID="group-paywall-upgrade-button"
                style={{ borderRadius: 14, overflow: "hidden", width: "100%", shadowColor: "#4361EE", shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 5, marginBottom: 10 }}
              >
                <LinearGradient colors={["#4361EE", "#7C3AED"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}>
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Upgrade to Team Plan</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowGroupPaywall(false)} style={{ paddingVertical: 10, width: "100%", alignItems: "center" }} testID="group-paywall-dismiss">
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 14 }}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!isRevenueCatEnabled()) return;
                  setIsRestoringChat(true);
                  try {
                    const result = await restorePurchases();
                    setShowGroupPaywall(false);
                    if (result.success && result.isTeam) {
                      queryClient.invalidateQueries({ queryKey: ["subscription"] });
                      toast({ title: "Purchases restored!", preset: "done" });
                    } else {
                      toast({ title: "No active purchases found.", preset: "error" });
                    }
                  } finally {
                    setIsRestoringChat(false);
                  }
                }}
                disabled={isRestoringChat}
                style={{ paddingVertical: 8, width: "100%", alignItems: "center" }} testID="group-paywall-restore">
                {isRestoringChat ? (
                  <ActivityIndicator size="small" color="#CBD5E1" />
                ) : (
                  <Text style={{ color: "#CBD5E1", fontSize: 12 }}>Restore Purchases</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
