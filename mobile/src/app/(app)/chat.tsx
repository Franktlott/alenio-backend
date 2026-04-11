import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Pressable,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { MessageCircle, Users, ChevronRight, Lock, Plus, Pin } from "lucide-react-native";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { toast } from "burnt";
import { api } from "@/lib/api/api";
import { useSession } from "@/lib/auth/use-session";
import { useTeamStore } from "@/lib/state/team-store";
import { useUnreadStore } from "@/lib/state/unread-store";
import type { Conversation } from "@/lib/types";
import { NoTeamPlaceholder } from "@/components/NoTeamPlaceholder";
import { useDemoMode } from "@/lib/useDemo";

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

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { data: session } = useSession();
  const activeTeamId = useTeamStore((s) => s.activeTeamId);
  const queryClient = useQueryClient();
  const isDemo = useDemoMode();
  const [fabOpen, setFabOpen] = useState(false);
  const [showGroupPaywall, setShowGroupPaywall] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pinnedDmIds, setPinnedDmIds] = useState<string[]>([]);

  // Load pinned DMs from AsyncStorage on mount
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

  // Persist pinned DMs whenever they change
  useEffect(() => {
    AsyncStorage.setItem(PINNED_DMS_KEY, JSON.stringify(pinnedDmIds));
  }, [pinnedDmIds]);

  const handleLongPressDm = async (convId: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (pinnedDmIds.includes(convId)) {
      setPinnedDmIds((prev) => prev.filter((id) => id !== convId));
      toast({ title: "Unpinned", preset: "done" });
    } else {
      if (pinnedDmIds.length >= 5) {
        toast({ title: "Maximum 5 pins reached", preset: "error" });
        return;
      }
      setPinnedDmIds((prev) => [convId, ...prev]);
      toast({ title: "Pinned", preset: "done" });
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    setRefreshing(false);
  };

  const { data: teams } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<any[]>("/api/teams"),
    enabled: !!session?.user,
  });

  const { data: subscription } = useQuery({
    queryKey: ["subscription", activeTeamId],
    queryFn: () => api.get<{ plan: string; status: string }>(`/api/teams/${activeTeamId}/subscription`),
    enabled: !!activeTeamId,
  });
  const isPro = subscription?.plan === "pro";

  const { data: conversations = [], isLoading: dmsLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.get<Conversation[]>("/api/dms"),
    enabled: !!session?.user,
    refetchInterval: 5000,
  });

  const { data: topics = [] } = useQuery({
    queryKey: ["topics", activeTeamId],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/topics`),
    enabled: !!activeTeamId,
    refetchInterval: 10000,
  });

  const { data: teamGeneralMessages = [] } = useQuery({
    queryKey: ["messages", activeTeamId, "general", "preview"],
    queryFn: () => api.get<any[]>(`/api/teams/${activeTeamId}/messages?topicId=general&limit=1`),
    enabled: !!activeTeamId,
    refetchInterval: 10000,
  });

  const currentTeam = teams?.find((t: any) => t.id === activeTeamId);
  const lastReadIds = useUnreadStore((s) => s.lastReadIds);
  const currentUserId = session?.user?.id ?? "";

  const dmUnreadLastReadIds = Object.fromEntries(
    conversations.map((conv) => [conv.id, lastReadIds[conv.id] ?? ""])
  );
  const { data: dmUnreadCounts = {} } = useQuery({
    queryKey: ["dm-unread-counts", dmUnreadLastReadIds],
    queryFn: () => api.post<Record<string, number>>("/api/dms/unread-counts", { lastReadIds: dmUnreadLastReadIds }),
    enabled: !!session?.user && conversations.length > 0,
    refetchInterval: 5000,
  });

  const teamChannelLastReadIds: Record<string, string> = {
    [`team:${activeTeamId}`]: lastReadIds[`team:${activeTeamId}`] ?? "",
    ...Object.fromEntries(topics.map((t: any) => [`topic:${t.id}`, lastReadIds[`topic:${t.id}`] ?? ""])),
  };
  const { data: teamUnreadCounts = {} } = useQuery({
    queryKey: ["team-unread-counts", activeTeamId, teamChannelLastReadIds],
    queryFn: () => api.post<Record<string, number>>(`/api/teams/${activeTeamId}/messages/unread-counts`, { lastReadIds: teamChannelLastReadIds }),
    enabled: !!activeTeamId && !!session?.user,
    refetchInterval: 10000,
  });
  const teamUnreadCount = Object.values(teamUnreadCounts).reduce((a, b) => a + b, 0);

  // Sort and split conversations into pinned/unpinned
  const sortedUnpinned = [...conversations]
    .filter((c) => !pinnedDmIds.includes(c.id))
    .sort((a, b) => {
      const aTime = a.lastMessage?.createdAt ?? a.updatedAt;
      const bTime = b.lastMessage?.createdAt ?? b.updatedAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });

  // Pinned DMs ordered by pin order (front of pinnedDmIds = most recently pinned = shown first)
  const pinnedConversations = pinnedDmIds
    .map((id) => conversations.find((c) => c.id === id))
    .filter((c): c is Conversation => !!c);

  const sortedDms = [...pinnedConversations, ...sortedUnpinned];

  if (!activeTeamId) {
    return (
      <SafeAreaView className="flex-1 bg-slate-50" edges={["top"]}>
        <NoTeamPlaceholder />
      </SafeAreaView>
    );
  }

  const renderDmRow = (conv: Conversation, isPinned: boolean) => (
    <TouchableOpacity
      key={conv.id}
      testID={`dm-conversation-${conv.id}`}
      onPress={() =>
        router.push({
          pathname: "/dm-chat",
          params: {
            conversationId: conv.id,
            recipientName: conv.isGroup
              ? (conv.name ?? "Group")
              : (conv.recipient?.name ?? "Direct Message"),
            recipientImage: conv.isGroup ? "" : (conv.recipient?.image ?? ""),
            isGroup: conv.isGroup ? "true" : "false",
          },
        })
      }
      onLongPress={() => handleLongPressDm(conv.id)}
      className="mx-4 mb-2 bg-white dark:bg-slate-800 rounded-2xl p-4 flex-row items-center"
      style={{
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
        elevation: 1,
      }}
    >
      <View className="w-12 h-12 rounded-full bg-indigo-500 items-center justify-center mr-3 overflow-hidden">
        {conv.isGroup ? (
          <Users size={22} color="white" />
        ) : conv.recipient?.image ? (
          <Image source={{ uri: conv.recipient.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
        ) : (
          <Text className="text-white font-bold text-lg">
            {conv.recipient?.name?.[0]?.toUpperCase() ?? "?"}
          </Text>
        )}
      </View>
      <View className="flex-1">
        <Text className="font-semibold text-slate-900 dark:text-white">
          {conv.isGroup ? (conv.name ?? "Group") : (conv.recipient?.name ?? "Unknown")}
        </Text>
        {conv.lastMessage ? (
          <Text
            className="text-sm text-slate-500 dark:text-slate-400"
            numberOfLines={1}
          >
            {conv.lastMessage.sender.id === session?.user?.id ? "You: " : null}
            {conv.lastMessage.content}
          </Text>
        ) : (
          <Text className="text-sm text-slate-400 italic">No messages yet</Text>
        )}
      </View>
      <View className="items-end" style={{ gap: 4 }}>
        {conv.lastMessage ? (
          <Text className="text-xs text-slate-400">
            {formatTime(conv.lastMessage.createdAt)}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {isPinned ? (
            <Pin size={12} color="#4361EE" />
          ) : null}
          {(dmUnreadCounts[conv.id] ?? 0) > 0 ? (
            <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
              <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{dmUnreadCounts[conv.id]}</Text>
            </View>
          ) : (
            !isPinned ? <ChevronRight size={16} color="#94A3B8" /> : null
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView
      testID="chat-screen"
      style={{ flex: 1, backgroundColor: "#F8FAFC" }}
      edges={[]}
    >
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
            <Image source={require("@/assets/alenio-logo-white.png")} style={{ height: 26, width: 90, resizeMode: "contain" }} />
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

      <FlatList
        data={[]}
        contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
        ListHeaderComponent={
          <View>
            {/* Team Chat section */}
            <Text className="px-4 pt-4 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              Team Chat
            </Text>
            <TouchableOpacity
              testID="team-chat-button"
              onPress={() =>
                router.push({
                  pathname: "/team-channels",
                  params: { teamId: activeTeamId ?? "", teamName: currentTeam?.name ?? "" },
                })
              }
              className="mx-4 mb-1 bg-white dark:bg-slate-800 rounded-2xl p-4 flex-row items-center"
              style={{
                shadowColor: "#000",
                shadowOpacity: 0.05,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 1 },
                elevation: 1,
              }}
            >
              <View className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900 items-center justify-center mr-3 overflow-hidden">
                {currentTeam?.image ? (
                  <Image source={{ uri: currentTeam.image }} style={{ width: 48, height: 48 }} resizeMode="cover" />
                ) : (
                  <Users size={22} color="#4361EE" />
                )}
              </View>
              <View className="flex-1">
                <Text className="font-semibold text-slate-900 dark:text-white">
                  {currentTeam?.name ?? "Team Chat"}
                </Text>
                <Text className="text-sm text-slate-500 dark:text-slate-400">
                  Channels
                </Text>
              </View>
              {teamUnreadCount > 0 ? (
                <View style={{ backgroundColor: "#4361EE", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 }}>
                  <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>{teamUnreadCount}</Text>
                </View>
              ) : (
                <ChevronRight size={18} color="#94A3B8" />
              )}
            </TouchableOpacity>

            {/* DMs section */}
            <View className="flex-row items-center px-4 pt-5 pb-2">
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                Direct Messages
              </Text>
            </View>

            {dmsLoading ? (
              <View className="py-8 items-center" testID="dms-loading">
                <ActivityIndicator color="#4361EE" />
              </View>
            ) : null}

            {!dmsLoading && conversations.length === 0 && (
              <View className="mx-4 bg-white dark:bg-slate-800 rounded-2xl p-5 items-center" testID="dms-empty">
                <MessageCircle size={32} color="#94A3B8" />
                <Text className="text-slate-500 text-sm mt-2 text-center">
                  {"No direct messages yet.\nGo to the Team tab to message a member."}
                </Text>
              </View>
            )}
          </View>
        }
        renderItem={null}
        ListFooterComponent={
          <View>
            {/* Pinned DMs */}
            {pinnedConversations.length > 0 ? (
              <View>
                <Text style={{ marginHorizontal: 16, marginBottom: 4, marginTop: 12, fontSize: 11, color: "#94A3B8", fontWeight: "600", textTransform: "uppercase", letterSpacing: 1 }}>
                  Pinned
                </Text>
                {pinnedConversations.map((conv) => renderDmRow(conv, true))}
              </View>
            ) : null}

            {/* Unpinned DMs */}
            {sortedUnpinned.map((conv) => renderDmRow(conv, false))}

            <View style={{ height: 24 }} />
          </View>
        }
        showsVerticalScrollIndicator={false}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />

      {/* Add / New Conversation choice modal */}
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
                if (!isPro) { setShowGroupPaywall(true); } else { router.push("/create-group"); }
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
      <Modal
        visible={showGroupPaywall}
        transparent
        animationType="fade"
        onRequestClose={() => setShowGroupPaywall(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}
          onPress={() => setShowGroupPaywall(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={{ backgroundColor: "white", borderRadius: 24, padding: 28, width: "100%", alignItems: "center" }} testID="group-paywall-modal">
              <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <Lock size={28} color="#4361EE" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: "700", color: "#0F172A", textAlign: "center", marginBottom: 8 }}>
                Group Chats
              </Text>
              <Text style={{ fontSize: 14, color: "#64748B", textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
                Upgrade to Alenio Pro to create group conversations with your team
              </Text>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/subscription"); }}
                testID="group-paywall-upgrade-button"
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  width: "100%",
                  shadowColor: "#4361EE",
                  shadowOpacity: 0.35,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                  elevation: 5,
                  marginBottom: 10,
                }}
              >
                <LinearGradient
                  colors={["#4361EE", "#7C3AED"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
                >
                  <Text style={{ color: "white", fontWeight: "700", fontSize: 15 }}>Upgrade to Pro</Text>
                  <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 15 }}>→</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowGroupPaywall(false)}
                style={{ paddingVertical: 10, width: "100%", alignItems: "center" }}
                testID="group-paywall-dismiss"
              >
                <Text style={{ color: "#94A3B8", fontWeight: "600", fontSize: 14 }}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setShowGroupPaywall(false); router.push("/subscription"); }}
                style={{ paddingVertical: 8, width: "100%", alignItems: "center" }}
                testID="group-paywall-restore"
              >
                <Text style={{ color: "#CBD5E1", fontSize: 12 }}>Restore Purchases</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
